// Local-only display fixtures: no production API middleware or external calls.
import { createServer } from 'vite';
import { applyFeedCheckResult } from '../watch-monitoring.js';
const checkedAt='2026-10-03T14:00:00Z';
const old={id:'agreement',title:'Royal Caribbean Group and Sandals: fixture initial article',url:'https://example.test/agreement',publishedAt:'2026-09-23T09:00:00Z',source:'Fixture News'};
const fresh={id:'future',title:'Royal Caribbean Group: fixture subsequent development',url:'https://example.test/future',publishedAt:'2026-10-03T15:00:00Z',source:'Fixture News'};
const base={title:'Royal Caribbean Cruises news',request:'Monitoring there is new information about Royal Caribbean Cruises.',inputType:'text',category:'news',status:'watching',createdAt:checkedAt,mediaMention:{subjects:['Royal Caribbean Cruises'],matchMode:'all'},monitoringSource:{type:'feed',url:'https://example.test/rss'}};
const make=(id,items)=>{const watch={...base,id};return {...watch,...applyFeedCheckResult(watch,{checkedAt,items}).changes};};
const initial=make('initial-fixture',[old]);
const empty=make('empty-fixture',[{id:'unrelated',title:'Carnival itinerary',url:'https://example.test/other'}]);
const subsequent={...initial,id:'subsequent-fixture',...applyFeedCheckResult(initial,{checkedAt:'2026-10-03T16:00:00Z',items:[fresh,old]}).changes};
const failed={...initial,id:'failed-fixture',lastCheckAttempt:{status:'failed',attemptedAt:'2026-10-03T16:00:00Z',code:'FETCH_TIMEOUT'}};
const watches=[initial,empty,subsequent,failed];
let forbidden=0;
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:5199,strictPort:true},plugins:[{
 name:'display-fixtures',enforce:'pre',
 transform(source,id){if(id.endsWith('/src/js/supabase-client.js'))return `export { createSupabaseBrowserClient } from '/src/js/test-support/synthetic-auth-client.js';`;},
 transformIndexHtml(html){return html.replace('<head>',`<head><script>
 const seed=${JSON.stringify(watches)};
 localStorage.setItem('synthetic-preview-account','A');
 if(!sessionStorage.getItem('news-context-seeded')){sessionStorage.setItem('news-context-seeded','true');localStorage.setItem('watchAssistant.language','en');localStorage.setItem('watchAssistant.watches.v2.account.synthetic-user-a',JSON.stringify(seed));}
 document.addEventListener('i18n:languageChanged',()=>{
   if(document.readyState==='loading')return;
   const key='watchAssistant.watches.v2.account.synthetic-user-a';const before=localStorage.getItem(key);
   queueMicrotask(()=>{let result=document.getElementById('fixture-language-proof');if(!result){result=document.createElement('p');result.id='fixture-language-proof';document.body.append(result);}result.textContent='Fixture language switch: '+(before===localStorage.getItem(key)?'Watch data unchanged':'Watch data changed');});
 },true);
 const nativeFetch=window.fetch;
 window.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==location.origin)return Promise.reject(new Error('External network disabled'));return nativeFetch(input,options);};
 </script>`);},
 configureServer(vite){vite.middlewares.use((req,res,next)=>{
 if(req.url==='/fixture-status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({forbidden}));return;}
 if(!req.url.startsWith('/api/'))return next();
 res.setHeader('Content-Type','application/json');
 if(req.method==='GET'&&['/api/media-watches','/api/company-watches'].includes(req.url))res.end(JSON.stringify({watches:[],emailEnabled:false}));
 else {forbidden++;res.statusCode=403;res.end(JSON.stringify({code:'FIXTURE_API_DISABLED'}));}
 });}
}]});await server.listen();console.log('Display fixtures: http://127.0.0.1:5199/watch-detail.html?id=initial-fixture');
