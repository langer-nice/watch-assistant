// Isolated UI regression harness: synthetic auth, controlled ECB fixture, no email or production traffic.
import { createPlanWatchMiddleware } from '../../../server/plan-watch-api.js';
import { createServer } from 'vite';
import { createCheckWatchMiddleware } from '../../../server/check-watch-api.js';
const check = createCheckWatchMiddleware({ now: () => new Date('2026-10-01T09:43:00Z'),
  fetchImpl: async () => new Response('<Envelope><Cube><Cube time="2026-09-30"><Cube currency="GBP" rate="0.8547"/></Cube></Cube></Envelope>') });
const server = await createServer({ configFile: false, root: process.cwd(),
  define: { 'import.meta.env.VITE_AUTH_MODE': JSON.stringify('otp') },
  server: { host: '127.0.0.1', port: 5198, strictPort: true, hmr: false },
  plugins: [{ name: 'synthetic-currency-check', enforce: 'pre', transform(_source, id) {
    if (id.endsWith('/src/js/supabase-client.js')) return `export { createSupabaseBrowserClient } from '/src/js/test-support/synthetic-auth-client.js';`;
  }, configureServer(server) {
    server.middlewares.use(check);
    server.middlewares.use(createPlanWatchMiddleware());
    server.middlewares.use((req, res, next) => {
      if (req.url === '/favicon.ico') { res.statusCode=204; return res.end(); }
      if (!req.url.startsWith('/api/')) return next();
      res.setHeader('Content-Type','application/json');
      if (req.url.startsWith('/api/watch-translation')) {
        let body=''; req.on('data', chunk=>{body+=chunk;}); req.on('end',()=>{
          const input=JSON.parse(body); res.end(JSON.stringify({title:input.title,summary:input.summary}));
        }); return;
      }
      if (req.url.startsWith('/api/media-watches') && req.method === 'POST') {
        let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => {
          const job = JSON.parse(body); res.end(JSON.stringify({ watch: { media_revision: job.revision + 1 } }));
        }); return;
      }
      if (req.method === 'GET') return res.end(JSON.stringify({ watches: [], emailEnabled: false }));
      // Summary/clarification requests safely use the app's local fallback.
      res.statusCode = 503; res.end(JSON.stringify({ code: 'FIXTURE_UNAVAILABLE' }));
    });
  } }],
});
await server.listen();
console.log('Currency fixture ready: http://127.0.0.1:5198');
