// Local presentation only. All API writes and all external fetches are blocked.
import {createServer} from 'vite';
import {mediaWatchDefinition} from '../media-watch-definition.js';
import {detailUxFixtures} from './watch-detail-ux-fixtures.js';
const fixtureRows=detailUxFixtures.map(watch=>({...mediaWatchDefinition(watch),user_id:'synthetic-user-a',media_revision:1,media_mutation_id:watch.mediaPersistence?.mutation||'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',current_status:'updated',created_at:watch.createdAt,last_checked_at:watch.lastChecked,last_change_item_id:watch.updates[0]?.id,last_change_title:watch.updates[0]?.sourceTitle,last_change_summary:watch.updates[0]?.summary,media_last_change_detected_at:watch.updates[0]?.timestamp,media_watch_snapshots:{checked_at:watch.lastChecked,initial_items:watch.initialContext?.items||[],baseline_at:watch.initialContext?.checkedAt,items:[],item_ids:[]}}));
const server=await createServer({configFile:false,define:{'import.meta.env.VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED':JSON.stringify('true')},server:{host:'127.0.0.1',port:5198,strictPort:true},plugins:[{
 name:'detail-ux-fixtures',enforce:'pre',
 transform(source,id){
  if(id.endsWith('/src/js/supabase-client.js'))return `export {createSupabaseBrowserClient} from '/src/js/test-support/synthetic-auth-client.js';`;
  if(id.endsWith('/src/js/test-support/synthetic-auth-client.js'))return source+`\nclient.rpc=async(name,args)=>name==='get_media_watch_email_policy'?{data:{mode:'daily_digest',enabled:args.p_watch_id.startsWith('1111'),version:'daily-digest.v1'}}:{data:false};`;
 },
 transformIndexHtml(html){return html.replace('<head>',`<head><script>
 for(const key of Object.keys(localStorage))if(key.startsWith('watchAssistant.mediaSync.synthetic-user-a.')||key.includes('watchAssistant.request.media.v1.account.synthetic-user-a'))localStorage.removeItem(key);
 localStorage.setItem('watchAssistant.server.media.v1.account.synthetic-user-a',JSON.stringify({owner:'synthetic-user-a',rows:${JSON.stringify(fixtureRows)}}));
 localStorage.setItem('synthetic-preview-account','A');
 localStorage.setItem('watchAssistant.watches.v2.account.synthetic-user-a',JSON.stringify(${JSON.stringify(detailUxFixtures)}));
 localStorage.setItem('watchAssistant.language',new URLSearchParams(location.search).get('lang')||'fr');
 const original=window.fetch;window.fetch=(input,options)=>{const u=new URL(typeof input==='string'?input:input.url,location.href);if(u.origin!==location.origin)return Promise.reject(Error('External network disabled'));return original(input,options);};
 </script>`);},
 configureServer(vite){vite.middlewares.use((req,res,next)=>{
  if(!req.url.startsWith('/api/'))return next();res.setHeader('Content-Type','application/json');
  if(req.method==='GET'&&['/api/media-watches','/api/company-watches'].includes(req.url))res.end(JSON.stringify({watches:req.url==='/api/media-watches'?fixtureRows:[],emailEnabled:false}));
  else if(req.method==='GET'&&req.url==='/api/structured-watches')res.end(JSON.stringify({enabled:false}));
  else{res.statusCode=403;res.end(JSON.stringify({code:'FIXTURE_API_DISABLED'}));}
 });}
}]});await server.listen();console.log('Local detail UX fixtures at http://127.0.0.1:5198/watch-detail.html?id='+detailUxFixtures[0].id);
