import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

/**
 * Rate limiting plugin — protects against abuse.
 *
 * Limits:
 *   - Global: 1000 req/min per IP
 *   - Plans create: 10/hour per user (expensive AI generation)
 *   - Chat messages: 100/hour per user
 *   - Embed/Extract: 60/min per user
 */
async function rateLimitPlugin(fastify: FastifyInstance) {
  // ── Global rate limit: 1000 req/min per IP ──
  await fastify.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise fall back to IP
      return request.user?.id || request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      error: 'RATE_LIMITED',
      message: `Too many requests. Please try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    }),
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });
}

/**
 * Per-route rate limit configurations.
 * Apply these via Fastify route-level config.
 */

/** 10 plans per hour per user */
export const planCreateRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 hour',
      keyGenerator: (request: FastifyRequest) => `plan-create:${request.user?.id || request.ip}`,
      errorResponseBuilder: () => ({
        error: 'RATE_LIMITED',
        message: 'You can create at most 10 lesson plans per hour. Please wait before creating another.',
      }),
    },
  },
};

/** 100 chat messages per hour per user */
export const chatRateLimit = {
  config: {
    rateLimit: {
      max: 100,
      timeWindow: '1 hour',
      keyGenerator: (request: FastifyRequest) => `chat:${request.user?.id || request.ip}`,
      errorResponseBuilder: () => ({
        error: 'RATE_LIMITED',
        message: 'You can send at most 100 messages per hour. Please wait before sending another.',
      }),
    },
  },
};

/** 60 embed/extract requests per minute per user */
export const embedRateLimit = {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest) => `embed:${request.user?.id || request.ip}`,
      errorResponseBuilder: () => ({
        error: 'RATE_LIMITED',
        message: 'Too many embedding requests. Please wait before trying again.',
      }),
    },
  },
};

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  dependencies: ['error-handler'],
});
