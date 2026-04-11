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
    // Accept any Host header. Vite 5.4+ added server.allowedHosts as a
    // DNS-rebinding mitigation and rejects requests whose Host header
    // isn't in its allowlist (returning 403 Forbidden). In our docker
    // deployment, requests arrive with Host: <vps-ip>:14000 (from the
    // proxy container forwarding) or Host: client:3000 (from intra-docker
    // probes), neither of which is in the default allowlist. Since this
    // dev server only ever receives traffic from our own trusted reverse
    // proxy inside the docker network, disabling the check is safe.
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
