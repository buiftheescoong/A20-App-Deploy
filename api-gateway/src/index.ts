import { buildApp } from './app';
import { config, validateConfig } from './config';
import { closeDb } from './db/client';

async function main() {
  validateConfig();
  const fastify = await buildApp();

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      fastify.log.info(`Received ${signal}, shutting down...`);
      await fastify.close();
      await closeDb();
      process.exit(0);
    });
  }

  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    fastify.log.info(`API Gateway running at http://localhost:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

void main();
