const clientEnv = import.meta.env;

function readEnv(viteKey: string, legacyKey?: string): string {
  return String(clientEnv[viteKey] ?? (legacyKey ? clientEnv[legacyKey] : '') ?? '');
}

export const env = {
  apiBaseUrl: readEnv('VITE_API_BASE_URL', 'NEXT_PUBLIC_API_BASE_URL') || 'http://localhost:3001',
  useMock: readEnv('VITE_USE_MOCK', 'NEXT_PUBLIC_USE_MOCK') === 'true',
  supabaseUrl: readEnv('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: readEnv('VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
};
