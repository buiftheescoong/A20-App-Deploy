import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

const connectionString = config.databaseUrl;

// postgres.js connection with pooling
const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

export const db = drizzle(sql, { schema });

/** Health check — run a simple query to verify DB connectivity */
export async function checkDbHealth(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Gracefully close DB connections */
export async function closeDb(): Promise<void> {
  await sql.end();
}
