// A readable source or a browser copy is never evidence of durable activation.
// Use the same decision for Home, lists and creation confirmations.
export const watchCreationState = (watch) => {
  if (!watch) return 'local';
  if (watch.monitoringAvailability && watch.monitoringAvailability !== 'saved') return 'local';
  if (watch.lastCheckAttempt?.status === 'failed' || watch.monitoringState === 'needs-attention') return 'failed';
  if (watch.monitoringAvailability === 'saved' && !watch.lastChecked && watch.lastCheckAttempt?.status !== 'succeeded') return 'pending';
  if (watch.monitoringState === 'preparing' || watch.monitoringState === 'saving') return 'pending';
  return 'active';
};
export const creationConfirmationKey = (watch) => ({
  local: 'detail.savedLocallyCopy', failed: 'detail.activationFailedCopy',
  pending: 'detail.activationPendingCopy', active: 'detail.createdCopy',
})[watchCreationState(watch)];
