import { authorizationError } from './structured-watch-authorization.js';

export const structuredCreationEnabled = env => env.STRUCTURED_WATCH_CREATION_ENABLED === 'true'
  && env.STRUCTURED_WATCH_BACKEND_ENABLED === 'true' && env.VERCEL_ENV !== 'production';
export const requireStructuredCreationAccess = (user, env) => {
  if (!structuredCreationEnabled(env)) throw authorizationError('STRUCTURED_FEATURE_UNAVAILABLE',404);
  if (!user?.id) throw authorizationError('AUTH_REQUIRED',401);
  const ids = String(env.STRUCTURED_WATCH_TEST_USER_IDS || '').split(',').map(id => id.trim())
    .filter(id => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id));
  if (!ids.includes(user.id)) throw authorizationError('STRUCTURED_FEATURE_UNAVAILABLE',403);
};
