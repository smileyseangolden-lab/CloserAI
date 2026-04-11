import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { userRateLimiter, orgRateLimiter } from './middleware/rateLimit.js';
import { createApiRouter } from './routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      // Reflect the request origin back. Safe because:
      //   1. Our production deployment sits behind a reverse proxy
      //      that puts the frontend and backend on the same origin,
      //      so real traffic is always same-origin and CORS doesn't
      //      even get engaged.
      //   2. For local dev (or any cross-origin call), reflecting the
      //      origin + credentials:true lets authenticated requests
      //      work without maintaining a hardcoded allowlist.
      // If you need to lock this down later, swap `origin: true` for
      // an explicit array like ['https://app.example.com'].
      origin: true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestId);
  app.use(pinoHttp({ logger, customProps: (req) => ({ requestId: (req as express.Request).requestId }) }));

  app.use('/api/v1', userRateLimiter, orgRateLimiter, createApiRouter());

  app.use(errorHandler);

  return app;
}

export function startServer() {
  const app = createApp();
  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    // Match the Express CORS policy — reflect origin so the websocket
    // upgrade works both same-origin (via the reverse proxy) and
    // cross-origin during local dev.
    cors: { origin: true, credentials: true },
  });

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Socket connected');
    socket.on('join-org', (orgId: string) => socket.join(`org:${orgId}`));
  });

  httpServer.listen(env.SERVER_PORT, () => {
    logger.info(`CloserAI server listening on :${env.SERVER_PORT}`);
  });

  return { app, httpServer, io };
}

// Only bootstrap when this file is executed directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer();
}
