import { createClient } from '@supabase/supabase-js';

export class SupabaseAuthError extends Error {
  constructor(code, statusCode, message) {
    super(message);
    this.name = 'SupabaseAuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const getServerConfig = (env = process.env) => {
  const url = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new SupabaseAuthError('SERVER_NOT_CONFIGURED', 503, 'Server persistence is unavailable.');
  }
  try {
    if (new URL(url).protocol !== 'https:') throw new Error('invalid protocol');
  } catch {
    throw new SupabaseAuthError('SERVER_NOT_CONFIGURED', 503, 'Server persistence is unavailable.');
  }
  return { url, anonKey };
};

const getBearerToken = (request) => {
  const authorization = request.headers?.authorization || request.headers?.Authorization || '';
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/u.exec(authorization);
  if (!match) throw new SupabaseAuthError('AUTH_REQUIRED', 401, 'Authentication is required.');
  return match[1];
};

export const authenticateSupabaseRequest = async (request, {
  env = process.env,
  createClientImpl = createClient,
} = {}) => {
  const token = getBearerToken(request);
  const { url, anonKey } = getServerConfig(env);
  const authClient = createClientImpl(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new SupabaseAuthError('INVALID_SESSION', 401, 'The session is invalid or expired.');
  }
  const client = createClientImpl(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { client, user: data.user, token };
};
