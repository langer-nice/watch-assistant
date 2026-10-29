import { createRoleSource,createExactUrlRoleContract } from '../create-role-contract.js';
import { frameRequests } from './create-frame-fixtures.js';
export const roleRequests={
  news:frameRequests[0],microsoft:frameRequests[1],sinner:frameRequests[2],threshold:frameRequests[3],url:frameRequests[4],
  multi:'Keep me informed about new products from Gucci and Chanel.',
  exclusion:'Tell me about new products from Gucci, but not perfumes.',
  condition:'Tell me when product X is released, but only if it is available in France.',
};
// Fixture assembly only, never a production recognizer or semantic oracle.
export function selectionFor(request,value,occurrence=0){
  let start=-1;for(let i=0;i<=occurrence;i++)start=request.indexOf(value,start+1);
  if(start<0)throw Error('Absent fixture literal');
  const tokens=createRoleSource(request).tokens,end=start+value.length;
  const first=tokens.find(t=>t.start===start)?.index,last=tokens.find(t=>t.end===end)?.index;
  if(first===undefined||last===undefined)throw Error('Unaligned fixture literal');
  return {first,last};
}
export const roleLiteral=(request,role,value,extra={})=>({role,value,selection:selectionFor(request,value),...extra});
export function roleNews(request,subject){
  return {subjects:[roleLiteral(request,'subject',subject,{kind:'named_entity'})],monitoring_goal:'ongoing_developments',
    target:null,event:null,conditions:[],exclusions:[],constraints:[],comparison:null,time_scope:[],source_preference:null,ambiguity:[],unrepresented_requirements:[]};
}
export function roleFrozen(index){
  const r=frameRequests[index];if(index===4)return createExactUrlRoleContract(r);
  const c=roleNews(r,['Manchester City','Microsoft','Jannik Sinner','GBP/EUR'][index]);
  if(index===1){c.monitoring_goal='event_occurrence';c.event=roleLiteral(r,'event','earnings results',{kind:'publication'});
    c.time_scope=[roleLiteral(r,'time_scope','Q3 2026',{kind:'quarter'})];}
  if(index===3){c.subjects[0].kind='metric_pair';c.monitoring_goal='threshold_crossing';
    c.comparison=roleLiteral(r,'comparison','1.17',{operator:'gt',relation:roleLiteral(r,'direction','above')});}
  return c;
}
export function roleComplex(which){
  const r=roleRequests[which],c=roleNews(r,which==='condition'?'product X':'Gucci');
  if(which==='multi')c.subjects.push(roleLiteral(r,'subject','Chanel',{kind:'named_entity'}));
  if(which==='multi'||which==='exclusion')c.target=roleLiteral(r,'target','new products',{relation:'from'});
  if(which==='exclusion')c.exclusions=[roleLiteral(r,'exclusion','perfumes')];
  if(which==='condition'){c.monitoring_goal='event_occurrence';c.event=roleLiteral(r,'event','released',{kind:'occurrence'});
    c.conditions=[roleLiteral(r,'condition','available in France',{relation:'prerequisite'})];}
  return c;
}
export const fidelityPass=()=>({verdict:'PASS',reasons:[]});
export const fidelityFail=reason=>({verdict:'FAIL',reasons:[reason]});
export function fidelityNegativeFixtures(){
  const make=(name,which,mutate,reason)=>{const request=typeof which==='number'?frameRequests[which]:roleRequests[which];
    const candidate=typeof which==='number'?roleFrozen(which):roleComplex(which);mutate(candidate,request);
    return {name,request,candidate,verdict:fidelityFail(reason),reason};};
  const rows=[
    make('omitted subject','multi',c=>c.subjects.pop(),'MISSING_REQUIREMENT'),
    make('omitted exclusion','exclusion',c=>c.exclusions=[],'MISSING_REQUIREMENT'),
    make('omitted condition','condition',c=>c.conditions=[],'MISSING_REQUIREMENT'),
    make('omitted period',1,c=>c.time_scope=[],'MISSING_REQUIREMENT'),
    make('omitted event',1,c=>{c.event=null;c.monitoring_goal='ongoing_developments';},'MISSING_REQUIREMENT'),
    make('subject placed as target','multi',c=>{const s=c.subjects.shift();c.target={...s,role:'target',relation:'from'};delete c.target.kind;},'WRONG_ROLE'),
    make('event placed as condition',1,c=>{const e=c.event;c.event=null;c.monitoring_goal='ongoing_developments';c.conditions=[{role:'condition',value:e.value,selection:e.selection,relation:'prerequisite'}];},'WRONG_ROLE'),
    make('invented source restriction',0,(c,r)=>{c.source_preference=roleLiteral(r,'source_preference',r,{policy:'only',official:true});},'INVENTED_REQUIREMENT'),
    make('invented focus',0,(c,r)=>{c.constraints=[roleLiteral(r,'constraint','important new developments',{kind:'focus'})];},'INVENTED_REQUIREMENT'),
    make('false ambiguity',0,(c,r)=>{c.ambiguity=[roleLiteral(r,'ambiguity',r,{reason:'unresolved_reference'})];},'INVENTED_REQUIREMENT'),
  ];
  const request='News about Alpha or Beta.';
  rows.push({name:'genuine ambiguity omitted',request,candidate:roleNews(request,'Alpha'),verdict:fidelityFail('UNRESOLVED_AMBIGUITY'),reason:'UNRESOLVED_AMBIGUITY'});
  // Prior unsafe contrasts, with source-present values and well-formed shapes.
  for(const [name,r,subject,reason]of [
    ['wrong-role contrast','News about Alpha rather than Beta.','Beta','WRONG_ROLE'],
    ['omitted exclusion contrast','News about Alpha, omit mergers.','Alpha','MISSING_REQUIREMENT'],
    ['omitted event contrast','Tell me when Alpha publishes earnings results.','Alpha','MISSING_REQUIREMENT'],
    ['omitted condition contrast','News about Alpha provided the report mentions acquisitions.','Alpha','MISSING_REQUIREMENT'],
  ])rows.push({name,request:r,candidate:roleNews(r,subject),verdict:fidelityFail(reason),reason});
  return rows;
}
