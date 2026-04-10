import pino from 'pino';
import { env } from '../config/env.js';

// Keep the logger dependency-free so it works identically in dev, test,
// Docker containers, and production. If you want human-readable logs
// locally, pipe the server's stdout through pino-pretty from your shell:
//   npm run dev | npx pino-pretty
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'closerai-server' },
});
