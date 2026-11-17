import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const raiz = import.meta.dirname;

export default defineConfig({
  base: '/app/',
  resolve: {
    alias: {
      '@broquel/cripto': resolve(raiz, '../packages/cripto/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(raiz, '../servidor/public/app'),
    emptyOutDir: true,
    assetsDir: 'ativos',
    sourcemap: false,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 0,
  },
  server: {
    proxy: {
      '/v1': 'http://127.0.0.1:8000',
    },
  },
});
