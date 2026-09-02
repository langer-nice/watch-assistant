import { createClient } from '@supabase/supabase-js';

const required = (env, name) => {
  const value = env?.[name];
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error(`Missing required server configuration: ${name}.`);
    error.code = 'SERVER_CONFIGURATION_ERROR';
    throw error;
  }
  return value.trim();
};

export const createSupabaseServiceClient = ({ env = process.env, createClientImpl = createClient } = {}) => (
  createClientImpl(
    required(env, 'SUPABASE_URL'),
    required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
);

export const requireCronSecret = (env = process.env) => required(env, 'CRON_SECRET');
