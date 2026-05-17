import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

/** Routes that skip auth */
const PUBLIC_ROUTES = [
  'GET /api/resources/system',
  'GET /health',
];

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('user', undefined);

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const routeKey = `${request.method} ${request.url.split('?')[0]}`;
    if (PUBLIC_ROUTES.includes(routeKey)) return;
    // Also allow health without auth
    if (request.url.startsWith('/health')) return;

    // Support token via query param for SSE (EventSource can't set headers)
    const queryToken = (request.query as Record<string, string>)?.token;
    const authHeader = request.headers.authorization;

    let token: string;
    if (queryToken) {
      token = queryToken;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '');
    } else {
      request.log.warn({ authHeader, queryToken }, 'Missing auth header');
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
      });
    }

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        request.log.warn({ error, data }, 'Supabase auth getUser failed');
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        });
      }

      request.user = {
        id: data.user.id,
        email: data.user.email || '',
      };
    } catch (err) {
      request.log.error({ err }, 'Auth verification failed');
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Token verification failed',
      });
    }
  });
}

export default fp(authPlugin, { name: 'auth' });
