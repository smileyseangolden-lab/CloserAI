import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // 700kB before warning — the charts chunk legitimately sits just above
    // 500kB after gzip. We still split the obvious heavy vendors below.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // recharts pulls in d3-* and is by far the heaviest vendor. Give
          // it its own chunk so pages without charts don't pay the cost.
          if (id.includes('/recharts/') || id.includes('/d3-')) {
            return 'charts';
          }
          // Radix primitives + cmdk + sonner + lucide are the UI primitive
          // surface and change together — group them so the main app
          // chunk is mostly CloserAI code.
          if (
            id.includes('/@radix-ui/') ||
            id.includes('/cmdk/') ||
            id.includes('/sonner/') ||
            id.includes('/lucide-react/')
          ) {
            return 'ui';
          }
          if (
            id.includes('/react-hook-form/') ||
            id.includes('/@hookform/') ||
            id.includes('/zod/')
          ) {
            return 'forms';
          }
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router/') ||
            id.includes('/scheduler/')
          ) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      // Inside Docker the API is reachable as http://server:4000 (the compose
      // service name). Outside Docker (local npm run dev) VITE_API_PROXY can
      // be set to http://localhost:4000 to match.
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://server:4000',
        changeOrigin: true,
      },
    },
  },
});
