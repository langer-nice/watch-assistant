// Bounded adapter only: never drop a role to obtain an executable old plan.
// Server-authored v1 support fields are a compatibility detail; the model
// never authors them or the downstream technical graph.
import { normalizeSemanticWatchContract } from './semantic-watch-contract.js';

export function handoffCreateRoleContract(grounded,context={}){
  const c=grounded.semantic;
  if(c.subjects.length!==1||c.target||c.conditions.length||c.exclusions.length||c.constraints.length||c.source_preference
    ||c.ambiguity.length||c.unrepresented_requirements.length)return null;
  const frame={subject:{kind:c.subjects[0].kind,value:c.subjects[0].value},
    monitoring_goal:{kind:c.monitoring_goal,support:grounded.request,event:c.event?{kind:c.event.kind,value:c.event.value}:null},
    comparison:c.comparison?{operator:c.comparison.operator,value:c.comparison.value,support:grounded.request}:null,
    constraints:[],time_scope:c.time_scope.map(t=>({kind:t.kind,value:t.value,support:t.value})),source_preference:null,ambiguity:[],unrepresented_requirements:[]};
  return normalizeSemanticWatchContract({version:'create-frame.v1',request:grounded.request,frame},context);
}
