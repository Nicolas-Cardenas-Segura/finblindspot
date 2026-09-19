import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',
  build: { outDir: '../mastra/public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:4111' } },
});
