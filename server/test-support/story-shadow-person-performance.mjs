// Local-only benchmark: frozen inputs, no application jobs or external services.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const fixture=JSON.parse(readFileSync(new URL('./story-shadow-person-parity.json',import.meta.url)));
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const watch={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',interpretation:{schemaVersion:'interpretation.v1',domain:'media_news',subjects:[{id:'p',kind:'individual',type:'person',label:'Jannik Sinner'}],topics:[],conditions:[],geographic:[],exclusions:[]}};
const env={VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/story-following-shadow-staging',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STORY_FOLLOWING_SHADOW_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner};
const items=fixture.inputs.map((r,n)=>({...r,id:String(n)}));
if(process.argv[2]==='child'){
 const importStart=performance.now();
 const {evaluateStoryShadow,storyShadowContext}=await import('../story-following-shadow-matcher.js');
 const {observeStoryShadow}=await import('../story-following-shadow.js');
 const moduleMs=performance.now()-importStart;
 let observerRows=[];
 const observer=()=>{observerRows=[];observeStoryShadow({env,ownerId:owner,watch,items,matchingItems:[],record:r=>observerRows.push(r),...(process.argv[3]==='observerFull'?{now:()=>0}:{})});};
 const direct=()=>{const context=storyShadowContext(watch);return items.map(item=>evaluateStoryShadow({item,context}));};
 const run=process.argv[3].startsWith('observer')?observer:direct;
 const start=performance.now();run();const cold=performance.now()-start;
 const completed=observerRows.filter(r=>!r.shadow_error).length;
 const samples=[];for(let n=0;n<60;n++){const start=performance.now();run();samples.push(performance.now()-start);}
 samples.sort((a,b)=>a-b);
 console.log(JSON.stringify({moduleMs,cold,completed,warm:samples[0],p50:samples[29],p95:samples[56],warmCompleted:observerRows.filter(r=>!r.shadow_error).length}));
}else{
 const report={node:process.version,budgetMs:8,batchSize:20,samplesPerProcess:60,coldProcesses:8};
 for(const mode of ['direct','observer','observerFull']){
  const samples=[];
  for(let n=0;n<8;n++){
   const r=spawnSync(process.execPath,['--no-maglev',new URL(import.meta.url).pathname,'child',mode],{encoding:'utf8'});
   if(r.status!==0)throw Error(r.stderr);samples.push(JSON.parse(r.stdout));
  }
  report[mode]=samples;
 }
 console.log(JSON.stringify(report,null,2));
}
