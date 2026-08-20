import { createClient } from '@supabase/supabase-js';

const REQUIRED_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

const isValidSupabaseUrl = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export const getSupabaseBrowserConfig = (env = import.meta.env) => {
  const exposedServiceKey = env?.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (exposedServiceKey) {
    throw new Error('VITE_SUPABASE_SERVICE_ROLE_KEY must never be exposed to the browser.');
  }

  const url = env?.VITE_SUPABASE_URL?.trim();
  const anonKey = env?.VITE_SUPABASE_ANON_KEY?.trim();
  const missing = REQUIRED_KEYS.filter((key) => !env?.[key]?.trim());

  if (missing.length > 0) {
    return { enabled: false, reason: 'missing-config', missing };
  }

  if (!isValidSupabaseUrl(url)) {
    return { enabled: false, reason: 'invalid-url', missing: [] };
  }

  return { enabled: true, url, anonKey, missing: [] };
};

export const createSupabaseBrowserClient = ({
  env = import.meta.env,
  createClientImpl = createClient,
} = {}) => {
  const config = getSupabaseBrowserConfig(env);
  if (!config.enabled) return { client: null, config };

  const client = createClientImpl(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  return { client, config };
};
