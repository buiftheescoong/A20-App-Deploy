import dotenv from 'dotenv';
dotenv.config();

function parseOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  frontendUrl,
  frontendOrigins: parseOrigins(process.env.FRONTEND_ORIGINS || frontendUrl),
  aiServiceSecret: process.env.AI_SERVICE_SECRET || '',
} as const;

export function validateConfig(): void {
  const required = ['databaseUrl', 'supabaseUrl', 'supabaseServiceKey', 'supabaseAnonKey'] as const;
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required env var: ${key}. Check .env file.`);
    }
  }
}
