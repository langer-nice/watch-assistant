import { hasDefinitionVersion } from './watch-definition.js';
import { canExecuteStructuredMedia } from './structured-media-execution.js';

// UI availability only; the authenticated endpoint remains authoritative.
export const manualCheckIssue = (watch, {
  inProgress = false, preparing = false, canCheckStoredWatch = () => false,
} = {}) => {
  if (inProgress) return 'CHECK_IN_PROGRESS';
  if (!watch) return 'WATCH_NOT_FOUND';
  if (preparing) return 'STALE_CHECK';
  if (!hasDefinitionVersion(watch)) return watch.serverReadOnly ? 'UNSUPPORTED_WATCH_VERSION' : null;
  if (typeof watch.id !== 'string' || !watch.id) return 'WATCH_NOT_FOUND';
  if (!canCheckStoredWatch(watch)) return 'AUTH_REQUIRED';
  if (!Number.isSafeInteger(watch.mediaPersistence?.revision) || watch.mediaPersistence.revision < 1) return 'STALE_CHECK';
  if (watch.structuredExecutionDisabled || !canExecuteStructuredMedia(watch)) return 'INVALID_WATCH_DEFINITION';
  return null;
};
export const canManuallyCheckWatch = (watch, options) => manualCheckIssue(watch, options) === null;
