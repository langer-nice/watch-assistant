import { cleanStage,extractionSummary,groundingSummary,contractSummary } from './clean-create-trace.js';
import { validateCreateSemanticExtraction, isExactSemanticUrl, semanticError } from './create-semantic-extraction.js';

const fail = reason => {throw semanticError(reason);};
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
// Exact decimal string normalization; no floating point or inferred unit.
const decimal = text => {
  const [whole,fraction='']=text.replace(',','.').split('.');
  const integer=whole.replace(/^0+(?=\d)/u,''),tail=fraction.replace(/0+$/u,'');
  return tail?`${integer}.${tail}`:integer;
};
const identity = value => {
  // This bounded vocabulary cannot disambiguate coordination/extra clauses.
  if(!value||/[;,<>]/u.test(value)||/\b(?:and|or|versus|vs|only|excluding|including|from|after|before|until|when|unless|not)\b/iu.test(value)){
    throw semanticError('ambiguous_subject',true);
  }
};

// The schema supplies plain claims/spans, not typed alternatives. Never treat
// mere substring membership as proof of ambiguity. Request uncertainty is
// conservative: all claims remain blocking when such evidence is present.
export function isGroundedCreateAmbiguity(request,claim) {
  if(typeof request!=='string'||typeof claim!=='string'||!claim)return true;
  if(isExactSemanticUrl(request))return false;
  if(/\b(?:and|or|either|versus|vs|whether|unsure|uncertain|unclear|maybe|perhaps)\b|\bnot sure\b/iu.test(request))return true;
  if(/(?:\babout|^Tell me when|^Monitor)\s+(?:it|they|them|he|she|him|her|this|that|these|those|the former|the latter|the company|the team|the player)(?=[\s.,;!?]|$)/iu.test(request))return true;
  if(/\b(?:above|at least)\b/iu.test(request)&&/\b(?:below|at most)\b/iu.test(request))return true;
  if(new Set(request.match(/\bQ[1-4] \d{4}\b/gu)||[]).size>1)return true;
  // Only complete, already-supported grammatical forms can disprove a claim.
  // Unknown/literal requests retain uncertainty rather than guessing a meaning.
  return !/^(?:(?:Tell me when there are|Keep me updated on) (?:important new developments|new developments|news|updates) about .+|Tell me when .+ (?:publishes|releases|announces) its Q[1-4] \d{4} earnings (?:results|report)|Tell me when (?:GBP\/EUR|EUR\/GBP) goes (?:above|at least|below) \d{1,12}(?:[.,]\d{1,12})?)\.$/u.test(request);
}

/** Pure Slice A handoff. Slice B alone may pass result.candidate to normalizer. */
export function groundCreateSemantics(request,extraction,trace) {
  return cleanStage(trace,'grounding',()=>{
  if(typeof request!=='string'||!request||request.length>500||request.trim()!==request
    ||/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(request))fail('request');
  const url=isExactSemanticUrl(request);
  const e=cleanStage(trace,'semantic_validation',()=>validateCreateSemanticExtraction(extraction,{requiresSubject:!url}),extractionSummary);
  const groundedAmbiguity=e.ambiguity.filter(claim=>isGroundedCreateAmbiguity(request,claim));
  if(groundedAmbiguity.length){
    trace?.ambiguity?.(e.ambiguity.length,groundedAmbiguity.length,0);
    throw semanticError('explicit_ambiguity',true);
  }
  // No claim is discarded until ALL unchanged semantic/role checks pass.
  // Unsupported/mismatched semantics still reject; never repair or replace them.
  const handoff=()=>{
    trace?.ambiguity?.(e.ambiguity.length,0,e.ambiguity.length);
    return cleanStage(trace,'watch_contract',()=>({candidate,ambiguity:[]}),v=>contractSummary(v.candidate));
  };
  const evidence=[];
  const anchor=(field,start,end)=>{
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>request.length)fail('span');
    evidence.push({field,source_id:'request',start,end,text:request.slice(start,end)});
  };
  const group=(match,name,field)=>anchor(field,...match.indices.groups[name]);
  const candidate={user_intent_text:request,subject:[],trigger:null,constraints:[],time_scope:[],
    source_preference:{policy:'any',urls:[],official:false},
    input_source:{kind:url?'url':'text',submitted_url:url?request:null,metadata_ref:null},evidence};
  if(url){
    if((e.subject!==null&&e.subject!==request)||e.trigger!==null||e.constraints.length||e.time_scope.length
      ||(e.source_preference!==null&&e.source_preference!==request))fail('url_semantics');
    candidate.subject=[{kind:'resource',value:request}];
    candidate.trigger={kind:'resource_change',target:request,comparison:null};
    candidate.source_preference={policy:'only',urls:[request],official:false};
    for(const field of ['subject/0','trigger','source_preference','input_source'])anchor(field,0,request.length);
    return handoff();
  }

  const development=/^(?:Tell me when there are|Keep me updated on) (?<trigger>important new developments|new developments|news|updates) about (?<subject>.+?)\.$/du.exec(request);
  const publication=/^Tell me when (?<subject>.+?) (?<trigger>(?<verb>publishes|releases|announces) its (?<period>Q[1-4] \d{4}) earnings (?<report>results|report))\.$/du.exec(request);
  const rate=/^Tell me when (?<subject>GBP\/EUR|EUR\/GBP) (?<trigger>goes (?<direction>above|at least|below) (?<amount>\d{1,12}(?:[.,]\d{1,12})?))\.$/du.exec(request);
  const sourceClause=' from official sources only';
  const official=request.endsWith(`${sourceClause}.`);
  const literalRequest=official?request.slice(0,-sourceClause.length-1)+'.':request;
  const literal=/^Monitor (?<trigger>.+?) about (?<subject>[^,]+?)(?<rest>(?:, .+)?)\.$/du.exec(literalRequest);
  const match=development||publication||rate||literal;
  if(!match)fail('unsupported_clause');
  if(e.subject!==match.groups.subject)fail('subject_mismatch');
  identity(e.subject);
  candidate.subject=[{kind:rate?'instrument':'entity',value:e.subject}];
  group(match,'subject','subject/0');

  let expectedConstraints=[],expectedPeriods=[],expectedSource=null;
  if(development){
    if(e.trigger!==match.groups.trigger)fail('trigger_mismatch');
    candidate.trigger={kind:'development',target:match.groups.trigger,comparison:null};
    group(match,'trigger','trigger');
  }else if(publication){
    const semanticPhrase=`${match.groups.verb} earnings ${match.groups.report}`;
    if(![match.groups.trigger,semanticPhrase].includes(e.trigger))fail('trigger_mismatch');
    candidate.trigger={kind:'publication',target:`earnings ${match.groups.report}`,comparison:null};
    expectedPeriods=[match.groups.period];
    candidate.time_scope=[{kind:'period',value:match.groups.period,basis:'unspecified'}];
    group(match,'trigger','trigger');group(match,'period','time_scope/0');
  }else if(rate){
    if(![match.groups.trigger,'threshold crossing'].includes(e.trigger))fail('trigger_mismatch');
    const comparator={above:'gt','at least':'gte',below:'lt'}[match.groups.direction];
    const value=decimal(match.groups.amount);
    expectedConstraints=[{kind:'numeric',comparator,value}];
    candidate.trigger={kind:'threshold_crossing',target:'exchange_rate',comparison:{comparator,value,unit:e.subject.split('/')[1]}};
    group(match,'trigger','trigger');group(match,'amount','trigger/comparison');
  }else{
    if((literalRequest.match(/ about /gu)||[]).length!==1)throw semanticError('ambiguous_binding',true);
    if(e.trigger!==match.groups.trigger)fail('trigger_mismatch');
    candidate.trigger={kind:'other',target:match.groups.trigger,comparison:null};
    group(match,'trigger','trigger');
    const rest=match.groups.rest,base=match.indices.groups.rest[0];
    let consumed=0;
    for(const part of rest.matchAll(/, (?<cue>only|excluding|including) (?<value>[^,]+)/dgu)){
      if(part.index!==consumed)fail('constraint_clause');
      consumed+=part[0].length;
      const role={only:'required',excluding:'excluded',including:'focus'}[part.groups.cue];
      expectedConstraints.push({kind:'topic',value:part.groups.value,role});
      candidate.constraints.push({kind:role==='excluded'?'exclude':'topic',value:part.groups.value,role});
      const [start,end]=part.indices.groups.value;anchor(`constraints/${expectedConstraints.length-1}`,base+start,base+end);
    }
    if(consumed!==rest.length)fail('constraint_clause');
    if(official){
      expectedSource='from official sources only';
      candidate.source_preference={policy:'only',urls:[],official:true};
      anchor('source_preference',request.length-sourceClause.length-1+1,request.length-1);
    }
  }
  const actualConstraints=e.constraints.map(c=>c.kind==='numeric'
    ?{kind:'numeric',comparator:c.comparator,value:decimal(c.value)}:{kind:'topic',value:c.value,role:c.role});
  if(!same(actualConstraints,expectedConstraints))fail('constraint_mismatch');
  if(!same(e.time_scope,expectedPeriods))fail('period_mismatch');
  if(e.source_preference!==expectedSource)fail('source_preference_mismatch');
  return handoff();
  },groundingSummary);
}
