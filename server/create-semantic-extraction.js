// Offline model boundary only. No transport, old interpretation schema or graph.
const text = { type:'string', minLength:1, maxLength:500 };
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const nullableText = {anyOf:[text,{type:'null'}]};
const numeric = object({kind:{type:'string',enum:['numeric']},comparator:{type:'string',enum:['gt','gte','lt','lte','eq']},
  value:{...text,pattern:'^\\d{1,12}(?:[.,]\\d{1,12})?$'}});
const topic = object({kind:{type:'string',enum:['topic']},value:text,role:{type:'string',enum:['required','focus','excluded']}});
const freeze = value => {
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;
};
export const createSemanticExtractionSchema = freeze(object({
  subject:nullableText,trigger:nullableText,
  constraints:{type:'array',maxItems:8,items:{anyOf:[numeric,topic]}},
  time_scope:{type:'array',maxItems:4,items:{...text,pattern:'^Q[1-4] \\d{4}$'}},
  source_preference:nullableText,
  ambiguity:{type:'array',maxItems:4,items:text},
}));

export const semanticError = (reason, ambiguity=false) => Object.assign(new Error('Invalid Create semantics'),{
  code:ambiguity?'CREATE_SEMANTIC_AMBIGUITY':'INVALID_CREATE_SEMANTICS',reason,
});
const fail = reason => {throw semanticError(reason);};
const isText = value => typeof value==='string'&&value.length>0&&value.length<=500&&value.trim()===value
  &&!/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const shape = (value,keys) => value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));

export function validateCreateSemanticExtraction(value,{requiresSubject=true}={}) {
  if(Array.isArray(value?.subject)&&value.subject.length>1)throw semanticError('multiple_subjects',true);
  if(!shape(value,['subject','trigger','constraints','time_scope','source_preference','ambiguity']))fail('shape');
  for(const field of ['subject','trigger','source_preference'])if(value[field]!==null&&!isText(value[field]))fail(field);
  if(!Array.isArray(value.constraints)||value.constraints.length>8)fail('constraints');
  for(const c of value.constraints){
    if(c?.kind==='numeric'){
      if(!shape(c,['kind','comparator','value'])||!['gt','gte','lt','lte','eq'].includes(c.comparator)
        ||typeof c.value!=='string'||!/^\d{1,12}(?:[.,]\d{1,12})?$/u.test(c.value))fail('numeric_constraint');
    }else if(c?.kind==='topic'){
      if(!shape(c,['kind','value','role'])||!isText(c.value)||!['required','focus','excluded'].includes(c.role))fail('topic_constraint');
    }else fail('constraint_kind');
  }
  if(!Array.isArray(value.time_scope)||value.time_scope.length>4
    ||value.time_scope.some(v=>!isText(v)||!/^Q[1-4] \d{4}$/u.test(v)))fail('time_scope');
  if(!Array.isArray(value.ambiguity)||value.ambiguity.length>4||value.ambiguity.some(v=>!isText(v)))fail('ambiguity');
  if(requiresSubject&&value.subject===null&&!value.ambiguity.length)fail('subject_required');
  return structuredClone(value);
}

export function isExactSemanticUrl(request) {
  if(typeof request!=='string'||!isText(request)||/\s/u.test(request))return false;
  try{const u=new URL(request);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}
}
export function createExactUrlSemanticExtraction(request) {
  if(!isExactSemanticUrl(request))fail('url');
  return {subject:null,trigger:null,constraints:[],time_scope:[],source_preference:request,ambiguity:[]};
}
