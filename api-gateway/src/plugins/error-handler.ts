import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod/v4';

/**
 * Standardized error response format:
 * {
 *   "error": "ERROR_CODE",
 *   "message": "Human-readable description",
 *   "details": [{ "field": "grade", "message": "Must be 6-12" }]
 * }
 */

/** Custom error class for application errors with a specific code */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Array<{ field?: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    // ── Zod validation errors → 400 ──
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details,
      });
    }

    // ── Custom AppError ──
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    // ── Fastify errors with statusCode ──
    const fastifyError = error as FastifyError;
    const statusCode = fastifyError.statusCode || 500;

    // 400 — Bad Request (Fastify built-in validation, malformed JSON, etc.)
    if (statusCode === 400) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: fastifyError.message || 'Bad request',
      });
    }

    // 401 — Unauthorized
    if (statusCode === 401) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: fastifyError.message || 'Unauthorized',
      });
    }

    // 403 — Forbidden
    if (statusCode === 403) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: fastifyError.message || 'Forbidden',
      });
    }

    // 404 — Not Found
    if (statusCode === 404) {
      return reply.code(404).send({
        error: 'NOT_FOUND',
        message: fastifyError.message || 'Resource not found',
      });
    }

    // 413 — Payload Too Large (file upload)
    if (statusCode === 413) {
      return reply.code(413).send({
        error: 'PAYLOAD_TOO_LARGE',
        message: 'File size exceeds the allowed limit',
      });
    }

    // 429 — Rate Limited
    if (statusCode === 429) {
      return reply.code(429).send({
        error: 'RATE_LIMITED',
        message: fastifyError.message || 'Too many requests. Please try again later.',
      });
    }

    // ── AI Service errors → 502 ──
    if (
      error.message?.includes('AI Service') ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('fetch failed')
    ) {
      request.log.error({ err: error }, 'AI Service communication error');
      return reply.code(502).send({
        error: 'AI_SERVICE_ERROR',
        message: 'AI Service is unavailable. Please try again later.',
      });
    }

    // ── Database errors → 503 ──
    if (
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('connection refused') ||
      error.message?.includes('too many clients')
    ) {
      request.log.error({ err: error }, 'Database connection error');
      return reply.code(503).send({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable. Please try again later.',
      });
    }

    // ── Unknown errors → 500 ──
    request.log.error({ err: error, stack: (error as Error).stack }, 'Unhandled error');
    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development'
        ? error.message
        : 'Internal server error',
    });
  });

  // ── 404 handler for unknown routes ──
  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(404).send({
      error: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });
}

export default fp(errorHandlerPlugin, { name: 'error-handler' });
