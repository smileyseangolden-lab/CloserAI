import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
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
