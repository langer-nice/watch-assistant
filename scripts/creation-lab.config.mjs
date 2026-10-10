// Explicit local-only fault harness. Never part of the production build/config.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import appConfig from '../vite.config.js';
const env = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
if (env.SUPABASE_URL !== 'http://127.0.0.1:54321' || env.VITE_SUPABASE_URL !== env.SUPABASE_URL
  || env.MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED !== 'false' || env.WATCH_EMAIL_NOTIFICATIONS_ENABLED !== 'false'
  || env.SUPABASE_LOCAL_TEST !== 'true' || process.env.VERCEL_ENV || process.env.RESEND_API_KEY) throw new Error('Local isolation required');
export default context => {
  const config = appConfig(context);
  const fault = { name: 'local-creation-faults', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url.startsWith('/api/cron/')) { res.statusCode = 403; res.end(); return; }
      let mode = ''; try { mode = readFileSync('/tmp/wa-creation-fault', 'utf8').trim(); } catch {}
      const save = req.method === 'POST' && req.url === '/api/media-watches';
      const check = req.method === 'POST' && req.url === '/api/media-watches?action=check';
      if ((save && mode === 'reject-save') || (check && mode === 'reject-check')) {
        res.statusCode = 503; res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({code:'PERSISTENCE_UNAVAILABLE',error:'Controlled local failure'})); return;
      }
      if (save && mode === 'lose-save-response') {
        const end = res.end.bind(res);
        res.end = (...args) => { if (res.statusCode === 200) { res.destroy(); return res; } return end(...args); };
      }
      next();
    });
  }};
  return { ...config, plugins: [fault, ...config.plugins], server: {host:'127.0.0.1',port:5199,strictPort:true} };
};
