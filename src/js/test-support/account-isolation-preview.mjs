// Local-only synthetic auth adapter. Not a production Vite entry or auth bypass.
// Run: node src/js/test-support/account-isolation-preview.mjs
import { createServer } from 'vite';
const server = await createServer({
  configFile: false,
  server: { host: '127.0.0.1', port: 4178, strictPort: true },
  plugins: [{
    name: 'synthetic-account-isolation',
    enforce: 'pre',
    transform(_source, id) {
      if (id.endsWith('/src/js/supabase-client.js')) {
        return `export { createSupabaseBrowserClient } from '/src/js/test-support/synthetic-auth-client.js';`;
      }
    },
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET' && ['/api/company-watches', '/api/media-watches'].includes(req.url)) {
          res.end(JSON.stringify({ watches: [], emailEnabled: false }));
        } else {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: 'Synthetic preview blocks all API operations.' }));
        }
      });
    },
  }],
});
await server.listen();
console.log('Synthetic preview ready at http://127.0.0.1:4178/index.html');
