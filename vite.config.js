import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
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
});
