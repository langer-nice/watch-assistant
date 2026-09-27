// Used only by watch-resilience-preview.mjs; no real session, API, OTP or cron.
import { configureAccountStorage } from '../account-storage.js';
import { configureCompanyWatchServerStore, hydrateServerCompanyWatches } from '../company-watch-server-store.js';
import { configureMediaWatchServerStore, synchronizeMediaWatches, prepareMediaWatch, getMediaServerWatches } from '../media-watch-server-store.js';
import { initializeLanguage, setLanguage } from '../i18n.js';
import { initTopNavigation } from '../top-navigation.js';
import { updateWatch } from '../watch-storage.js';
import { initApp } from '../navigation.js';
const params=new URLSearchParams(location.search);
const scenario=params.get('scenario')||'normal';
let mode=['cached','sync-failure'].includes(scenario)?'normal':scenario;
const memory={};
Object.defineProperties(memory,{getItem:{value:k=>memory[k]??null},setItem:{value:(k,v)=>{memory[k]=String(v);}},removeItem:{value:k=>{delete memory[k];}}});
Object.defineProperty(window,'localStorage',{value:memory});
localStorage.setItem('watchAssistant.onboardingCompleted','true');
const auth={getState:()=>({status:'authenticated',session:{user:{id:'fixture-owner'},access_token:'synthetic-no-network-token'}}),subscribe:()=>()=>{}};
const id='00000000-0000-4000-8000-000000000001';
const media={id,title:'Fixture media Watch',watch_definition:{inputType:'text',request:'Tell me when Fixture is mentioned in the media.',category:'news',mediaMention:{subjects:['Fixture'],matchMode:'all'}},monitoring_source:{type:'feed',url:'https://fixture.example/rss'},monitoring_state:params.has('paused')?'paused':'monitoring',current_status:'watching',created_at:'2026-09-20T10:00:00Z',media_revision:1,last_checked_at:'2026-09-25T08:00:00Z'};
const company={id:'fixture-company',title:'Fixture Company',inputType:'company',category:'general',status:'watching',createdAt:'2026-09-20T10:00:00Z',company:{siren:'123456789',name:'Fixture Company'},updates:[]};
const metrics=[];
window.fetch=async(path,options={})=>{
  if(!['/api/company-watches','/api/media-watches'].includes(path))throw new Error('Fixture blocked unexpected network');
  const started=performance.now();
  try{
    if(mode==='timeout')await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
    await new Promise(r=>setTimeout(r,50));
    if(['500','503'].includes(mode))return Response.json({code:'DATABASE_ERROR'},{status:Number(mode)});
    if(mode==='malformed')return Response.json({watches:[{}]});
    if(options.method==='POST')return Response.json({watch:{media_revision:2}});
    return Response.json({watches:mode==='empty'?[]:path.includes('company')?[company]:[media]});
  } finally {metrics.push({path,method:options.method||'GET',durationMs:Math.round(performance.now()-started)});}
};
configureAccountStorage(auth);
initializeLanguage();setLanguage(params.get('lang')||'en');initTopNavigation();
const started=performance.now();
const ready=Promise.all([configureCompanyWatchServerStore(auth),configureMediaWatchServerStore(auth)]);
initApp();
const shellMs=Math.round(performance.now()-started);
await ready;
if(scenario==='cached'){mode='503';await Promise.allSettled([hydrateServerCompanyWatches(),synchronizeMediaWatches()]);}
if(scenario==='sync-failure'){mode='503';const w=getMediaServerWatches()[0];updateWatch(w.id,{title:'Edited fixture'});await new Promise(r=>setTimeout(r,150));}
const diagnostics=document.createElement('pre');diagnostics.id='fixtureDiagnostics';
diagnostics.textContent=JSON.stringify({scenario,shellMs,metrics,bodyRendered:document.querySelector('main').textContent.trim().length>0},null,2);
document.body.append(diagnostics);
