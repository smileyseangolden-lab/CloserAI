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
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        // Preserve the raw body so inbound webhooks can verify HMAC signatures
        // against the bytes the provider actually sent.
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  // Raw MIME ingestion for /api/v1/inbound/email/mime.
  app.use('/api/v1/inbound/email/mime', express.text({ type: '*/*', limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
    cors: { origin: env.CLIENT_URL, credentials: true },
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
