import { planMediaQuery, validateMediaQuery } from './media-provider-query.js';
import { mediaWatchDefinition } from './media-watch-definition.js';

// Pure review proposal. Ownership and server absence are checked again at commit.
// Nothing here uploads a local baseline or sends a monitoring request.
export const planLocalMediaRecovery = (watch, { language = 'en' } = {}) => {
  if (watch?.inputType !== 'text' || watch.mediaPersistence?.ownerId) throw new Error('LOCAL_RECOVERY_UNAVAILABLE');
  const createdAt = new Date(watch.createdAt);
  if (!Number.isFinite(createdAt.getTime()) || createdAt.getTime() > Date.now()) throw new Error('INVALID_CREATION_DATE');
  const plan = planMediaQuery(watch.request, { language });
  const recovered = { ...watch, ...plan, feedUrl: plan.monitoringSource.url,
    localCreatedAt: createdAt.toISOString(),
    localRecoveryHistory: watch.localRecoveryHistory || structuredClone(Object.fromEntries(
      ['createdAt','request','monitoringSource','monitoringSnapshot','initialContext','seenMonitoringItemIds','seenMonitoringItemKeys','updates','timeline','lastChecked','lastCheckAttempt']
        .filter(key => watch[key] !== undefined).map(key => [key, watch[key]]))),
  };
  const definition = mediaWatchDefinition(recovered);
  validateMediaQuery(definition.watch_definition, definition.monitoring_source);
  return recovered;
};
