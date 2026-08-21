import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { createUrlWatchMiddleware } from './server/url-watch-api.js';
import { createRequestClarificationMiddleware } from './server/request-clarification-api.js';
import { createCheckWatchMiddleware } from './server/check-watch-api.js';
import { createMonitoringSourceMiddleware } from './server/monitoring-source-api.js';
import { createCheckCompanyMiddleware } from './server/bodacc-api.js';
import { createPlanWatchMiddleware } from './server/plan-watch-api.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('VITE_SUPABASE_SERVICE_ROLE_KEY is forbidden because VITE_ variables are bundled for browsers.');
  }
  const middleware = createUrlWatchMiddleware({
    apiKey: process.env.OPENAI_API_KEY || env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || env.OPENAI_MODEL || 'gpt-5.6-luna',
  });
  const clarificationMiddleware = createRequestClarificationMiddleware({
    apiKey: process.env.OPENAI_API_KEY || env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || env.OPENAI_MODEL || 'gpt-5.6-luna',
  });
  const checkWatchMiddleware = createCheckWatchMiddleware();
  const monitoringSourceMiddleware = createMonitoringSourceMiddleware();
  const checkCompanyMiddleware = createCheckCompanyMiddleware();
  const planWatchMiddleware = createPlanWatchMiddleware();
  const urlWatchPlugin = {
    name: 'url-watch-prototype-api',
    configureServer(server) {
      server.middlewares.use(middleware);
      server.middlewares.use(clarificationMiddleware);
      server.middlewares.use(checkWatchMiddleware);
      server.middlewares.use(monitoringSourceMiddleware);
      server.middlewares.use(checkCompanyMiddleware);
      server.middlewares.use(planWatchMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
      server.middlewares.use(clarificationMiddleware);
      server.middlewares.use(checkWatchMiddleware);
      server.middlewares.use(monitoringSourceMiddleware);
      server.middlewares.use(checkCompanyMiddleware);
      server.middlewares.use(planWatchMiddleware);
    },
  };

  return {
    root: '.',
    publicDir: 'public',
    plugins: [urlWatchPlugin],
    define: {
      'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV || ''),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          watches: resolve(__dirname, 'watches.html'),
          watchDetail: resolve(__dirname, 'watch-detail.html'),
          newWatch: resolve(__dirname, 'new-watch.html'),
          followStory: resolve(__dirname, 'follow-story.html'),
          dashboard: resolve(__dirname, 'dashboard.html'),
          flow2: resolve(__dirname, 'flow-2.html'),
          flow3: resolve(__dirname, 'flow-3.html'),
        },
      },
    },
  };
});
