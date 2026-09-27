// Local-only synthetic validation server. It never loads server API middleware.
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
const root = process.cwd();
const vite = await createServer({configFile:false,root,cacheDir:'/private/tmp/watch-incident-vite-cache',server:{host:'127.0.0.1',port:4189},plugins:[{
  name:'resilience-fixtures', configureServer(server) {
    server.middlewares.use(async(req,res,next)=>{
      const path=new URL(req.url,'http://localhost').pathname;
      if(path.startsWith('/api/')){res.statusCode=503;res.end('Fixture only');return;}
      if(!['/index.html','/watches.html','/watch-detail.html','/'].includes(path))return next();
      let html=await readFile(root+(path==='/'?'/index.html':path),'utf8');
      html=html.replace('src="src/js/main.js"','src="/src/js/test-support/watch-resilience-fixture.js"');
      res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,html));
    });
  },
}]});
await vite.listen();console.log('Synthetic-only preview http://127.0.0.1:4189');
