import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { randomUUID } from 'crypto';
import { config } from './config';
import authPlugin from './plugins/auth';
import errorHandlerPlugin from './plugins/error-handler';
import rateLimitPlugin from './plugins/rate-limit';
import { checkDbHealth } from './db/client';
import planRoutes from './routes/plans';
import resourceRoutes from './routes/resources';
import systemResourceRoutes from './routes/system-resources';
import chatRoutes from './routes/chat';
import streamRoutes from './routes/stream';

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'info' : 'warn',
      transport: config.nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
    },
    genReqId: () => randomUUID(),
  });

  await fastify.register(cors, {
    origin: config.frontendOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  await fastify.register(errorHandlerPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(authPlugin);

  fastify.addHook('onRequest', async (request) => {
    const requestId = request.headers['x-request-id'] as string || request.id;
    request.log = request.log.child({ requestId });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    reply.header('x-request-id', request.id);
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: Math.round(reply.elapsedTime),
    }, 'request completed');
  });

  fastify.get('/health', async () => {
    const dbHealthy = await checkDbHealth();
    return {
      status: dbHealthy ? 'ok' : 'degraded',
      service: 'api-gateway',
      version: '2.0.0',
      database: dbHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  });

  await fastify.register(planRoutes);
  await fastify.register(resourceRoutes);
  await fastify.register(systemResourceRoutes);
  await fastify.register(chatRoutes);
  await fastify.register(streamRoutes);

  return fastify;
}
