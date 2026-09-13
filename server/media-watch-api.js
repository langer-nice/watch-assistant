import { getMediaWatchEmailConfig } from './media-watch-email.js';
import { authenticateSupabaseRequest } from './supabase-user.js';
import { mediaWatchDefinition } from '../src/js/media-watch-definition.js';

export const createMediaWatchMiddleware = ({ authenticate = authenticateSupabaseRequest, ...options } = {}) => async (request, response, next) => {
  if (new URL(request.url || '/', 'http://localhost').pathname !== '/api/media-watches') return next?.();
  const send = (status, body) => {
    response.statusCode = status;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
  };
  try {
    const { client, user } = await authenticate(request, options);
    if (request.method === 'GET') {
      const watches = [];
      for (let start = 0; ; start += 100) {
        const { data, error } = await client.from('watches')
          .select('id,title,watch_definition,monitoring_source,monitoring_state,current_status,created_at,deleted_at,media_revision,media_mutation_id,last_checked_at,media_last_change_detected_at,last_change_item_id,last_change_title,last_change_url,last_change_summary,last_change_published_at')
          .eq('user_id', user.id).eq('type', 'media_news').order('id').range(start, start + 99);
        if (error) throw new Error('DATABASE_ERROR');
        watches.push(...data);
        if (data.length < 100) break;
      }
      return send(200, { watches, emailEnabled: Boolean(getMediaWatchEmailConfig(options.env || process.env)) });
    }
    if (request.method !== 'POST') return send(405, { code: 'METHOD_NOT_ALLOWED' });
    let raw = request.body;
    if (raw === undefined) {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 12000) return send(413, { code: 'INVALID_BODY' });
      }
      raw = JSON.parse(body);
    }
    if (!raw || Buffer.byteLength(JSON.stringify(raw)) > 12000 || !Number.isSafeInteger(raw.revision) || raw.revision < 0
      || typeof raw.deleted !== 'boolean' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.mutation)) return send(400, { code: 'INVALID_BODY' });
    const input = raw.definition;
    if (!['monitoring', 'paused'].includes(input?.monitoring_state)) return send(400, { code: 'INVALID_MEDIA_DEFINITION' });
    let definition;
    try {
      definition = mediaWatchDefinition({
        ...input?.watch_definition, id: input?.id, title: input?.title,
        isStory: input?.watch_definition?.inputType === 'url',
        monitoringSource: input?.monitoring_source,
        status: input?.monitoring_state === 'paused' ? 'paused' : 'watching',
      });
    } catch { return send(400, { code: 'INVALID_MEDIA_DEFINITION' }); }
    const { data, error } = await client.rpc('persist_media_watch', {
      p_id: definition.id, p_title: definition.title, p_source: definition.monitoring_source,
      p_definition: definition.watch_definition, p_state: definition.monitoring_state,
      p_revision: raw.revision, p_mutation: raw.mutation, p_deleted: raw.deleted,
    });
    if (error) {
      if (error.code === '40001') return send(409, { code: 'MEDIA_CONFLICT' });
      throw new Error('DATABASE_ERROR');
    }
    return send(200, { watch: data });
  } catch (error) {
    if (error instanceof SyntaxError) return send(400, { code: 'INVALID_BODY' });
    return send(error.statusCode || 503, { code: error.code || 'PERSISTENCE_UNAVAILABLE', error: 'Media Watch persistence is unavailable.' });
  }
};
