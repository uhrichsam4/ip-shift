import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the bundle works when served from ipshift://app/ inside the native WKWebView.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    target: 'safari17',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
