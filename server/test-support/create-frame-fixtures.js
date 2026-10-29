export const frameRequests=[
  'Tell me when there are important new developments about Manchester City.',
  'Tell me when Microsoft publishes its Q3 2026 earnings results.',
  'Tell me when there are important new developments about Jannik Sinner.',
  'Tell me when GBP/EUR goes above 1.17.',
  'https://www.bbc.com/news/topics/c6vgy427vxklt',
];
export const newsFrame=(subject,request)=>({subject:{kind:'named_entity',value:subject},
  monitoring_goal:{kind:'ongoing_developments',support:request,event:null},comparison:null,
  constraints:[],time_scope:[],source_preference:null,ambiguity:[],unrepresented_requirements:[]});
export function createFrameFixture(index,run=1){
  const request=frameRequests[index];
  if(index===4)return null;
  const f=newsFrame(['Manchester City','Microsoft','Jannik Sinner','GBP/EUR'][index],request);
  if(index===1){f.monitoring_goal={kind:'event_occurrence',support:request,event:{kind:'publication',value:'earnings results'}};
    f.time_scope=[{kind:'quarter',value:'Q3 2026',support:'Q3 2026'}];}
  if(index===3){f.subject.kind='metric_pair';f.monitoring_goal.kind='threshold_crossing';f.comparison={operator:'gt',value:'1.17',support:'above 1.17'};}
  return run===3?Object.fromEntries(Object.entries(f).reverse()):f;
}
