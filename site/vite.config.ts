import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    cssMinify: true,
    minify: 'esbuild',
    assetsInlineLimit: 8192,
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
