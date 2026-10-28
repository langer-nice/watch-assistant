// Model transport fixtures for the clean Create route; no interpretation graph.
export const cleanCreateRequests=[
  'Tell me when there are important new developments about Manchester City.',
  'Tell me when Microsoft publishes its Q3 2026 earnings results.',
  'Tell me when there are important new developments about Jannik Sinner.',
  'Tell me when GBP/EUR goes above 1.17.',
  'https://www.bbc.com/news/topics/c6vgy427vxklt',
];
export function cleanCreateExtraction(index,run=1){
  if(index===4)return null; // URL intake never consumes model output.
  const subject=['Manchester City','Microsoft','Jannik Sinner','GBP/EUR'][index];
  let v={subject,trigger:index===1?'publishes earnings results':index===3?'threshold crossing':'important new developments',
    constraints:index===3?[{kind:'numeric',comparator:'gt',value:'1.17'}]:[],
    time_scope:index===1?['Q3 2026']:[],source_preference:null,ambiguity:[]};
  if(run===2){
    if(index===1)v.trigger='publishes its Q3 2026 earnings results';
    if(index===3)v.trigger='goes above 1.17';
  }
  if(run===3){
    if(index===3)v.constraints=[{value:'1.1700',comparator:'gt',kind:'numeric'}];
    v=Object.fromEntries(Object.entries(v).reverse());
  }
  return v;
}
