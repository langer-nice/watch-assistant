// Opt-in loopback harness, never used by Vercel build or deployed API routes.
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import {createMediaWatchMiddleware} from '../server/media-watch-api.js';
import {parseCurrencyRequest} from '../src/js/currency-watch.js';
const env=parseEnv(await readFile(process.argv[2],'utf8'));
assert.equal(env.SUPABASE_URL,'https://tseexvbwhrtofcsrvcqc.supabase.co');
assert.equal(env.VITE_SUPABASE_URL,env.SUPABASE_URL);
assert.equal(env.MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED,'false');
const fixtures=JSON.parse(await readFile('/tmp/watch-recurring-staging/fixtures.json','utf8'));
const middleware=createMediaWatchMiddleware({env,fetchCurrency:async request=>({criteria:parseCurrencyRequest(request),checkedAt:'2026-09-28T17:00:00Z',observation:{base:'GBP',quote:'EUR',rate:'1.20',date:'2026-09-28'}})});
const root=process.cwd();
const vite=await createServer({configFile:false,root,cacheDir:'/tmp/watch-recurring-staging/vite-cache',server:{host:'127.0.0.1',port:5198,strictPort:true},plugins:[{name:'staging-fixtures',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://127.0.0.1:5198');
 if(url.pathname==='/fixture-bootstrap'){
   if(req.headers.host!=='127.0.0.1:5198'||req.headers['sec-fetch-site']!=='same-origin'){res.statusCode=403;res.end();return;}
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({session:fixtures.users[url.searchParams.get('account')==='1'?1:0].session}));return;
 }
 if(url.pathname==='/api/media-watches')return middleware(req,res,next);
 if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({watches:[]}));return;}
 if(!['/','/index.html','/watches.html','/watch-detail.html'].includes(url.pathname))return next();
 const html=(await readFile(root+(url.pathname==='/'?'/index.html':url.pathname),'utf8')).replace('src="src/js/main.js"','src="/src/js/test-support/recurring-staging-browser.js"');
 res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,html));
});}}]});
await vite.listen();console.log(`Staging fixture preview: http://127.0.0.1:5198/watch-detail.html?id=${fixtures.watchIds[0]}`);
