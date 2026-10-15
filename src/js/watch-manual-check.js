import { hasDefinitionVersion } from './watch-definition.js';
import { canExecuteStructuredMedia } from './structured-media-execution.js';

// UI availability only: the authenticated endpoint still enforces Staging,
// feature gates, allowlist, ownership and the authoritative saved definition.
export const canManuallyCheckWatch = (watch, {
  inProgress = false, preparing = false, canCheckStoredWatch = () => false,
} = {}) => {
  if (!watch || inProgress || preparing) return false;
  if (!hasDefinitionVersion(watch)) return !watch.serverReadOnly;
  return !watch.structuredExecutionDisabled
    && Number.isSafeInteger(watch.mediaPersistence?.revision) && watch.mediaPersistence.revision > 0
    && canExecuteStructuredMedia(watch) && canCheckStoredWatch(watch);
};
