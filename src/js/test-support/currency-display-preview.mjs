// Local-only display fixtures: no production API middleware or external calls.
import { createServer } from 'vite';
import { normalizeCurrencyWatch, applyCurrencyCheckResult } from '../currency-watch.js';
const checkedAt='2026-10-01T10:00:00Z';
const make=(id,rate)=>{
 let w=normalizeCurrencyWatch({id,title:'La livre atteint 1,17 euro',request:'The pound reaches 1.17 to the euro',inputType:'text',category:'finance',status:'watching',createdAt:checkedAt});
 w={...w,...applyCurrencyCheckResult(w,{criteria:w.currencyCriteria,checkedAt,observation:{base:'EUR',quote:'GBP',rate,date:'2026-09-30'}}).changes};
 // Actual PR47 storage shape: English strings plus structured rawMonitoringResult.
 for(const u of w.updates){u.sourceTitle=u.summary='Target reached: 1 GBP ≈ 1.170097001041 EUR; target ≥ 1.17. ECB daily reference rate, 2026-09-30.';}
 return w;
};
const news={id:'news-fixture',title:'Elon Musk media mentions',request:'Tell me whenever Elon Musk is mentioned in the media.',inputType:'text',category:'news',status:'updated',currentStatus:'updated',createdAt:checkedAt,storyProfile:{storySummary:'Tell me whenever Elon Musk is mentioned in the media.'},updates:[{id:'news',timestamp:checkedAt,sourceTitle:'Original publisher headline in English',summary:'Original publisher headline in English',sourceUrl:'https://example.test/article',status:'new'}]};
news.localizedCopy=Object.fromEntries(['fr','en'].map(l=>[l,{sourceTitle:news.title,sourceSummary:'',title:l==='fr'?'Elon Musk dans les médias':news.title,summary:''}]));
const watches=[make('currency-fixture','0.85463'),make('below-fixture','0.854701'),news];
let forbidden=0;
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:5198,strictPort:true},plugins:[{
 name:'display-fixtures',enforce:'pre',
 transform(source,id){if(id.endsWith('/src/js/supabase-client.js'))return `export { createSupabaseBrowserClient } from '/src/js/test-support/synthetic-auth-client.js';`;},
 transformIndexHtml(html){return html.replace('<head>',`<head><script>
 const seed=${JSON.stringify(watches)};
 localStorage.setItem('synthetic-preview-account','A');
 if(!sessionStorage.getItem('display-seeded')){sessionStorage.setItem('display-seeded','true');localStorage.setItem('watchAssistant.language','fr');localStorage.setItem('watchAssistant.watches.v2.account.synthetic-user-a',JSON.stringify(seed));}
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
}]});await server.listen();console.log('Display fixtures: http://127.0.0.1:5198/watches.html');
