import {mediaWatchDefinition} from './media-watch-definition.js';

export const isV3MediaIdentity = value => ['wa-v3-evidence-refs.v1', 'wa-v3-evidence-refs-pilot.v1'].includes(value?.v3Engine);
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const sameV3Definition = (left, right) => stable(left) === stable(right);
const identity = definition => {
  const {monitoring_state, ...rest} = definition;
  return rest;
};
export const v3ServerDefinition = row => structuredClone({id:row.id, title:row.title,
  watch_definition:row.watch_definition, monitoring_source:row.monitoring_source, monitoring_state:row.monitoring_state});
export const v3ClientProjection = row => mediaWatchDefinition({...row.watch_definition, id:row.id, title:row.title,
  isStory:row.watch_definition.inputType === 'url', monitoringSource:row.monitoring_source,
  status:row.monitoring_state === 'paused' ? 'paused' : 'watching'});
const labels = definition => {
  const copy = structuredClone(identity(definition));
  for (const concept of copy.watch_definition?.storyProfile?.concepts || []) {
    concept.label = concept.label.replace(/\s+/g, ' ').trim().replace(/[.,;:!?]+$/g, '').trim();
  }
  return copy;
};
// Only the known label formatting artifact is equivalent. No request, title,
// source, concept type/selection or other identity edit can pass this test.
export const sameV3ClientIdentity = (candidate, row) => {
  try { return stable(labels(candidate)) === stable(labels(v3ClientProjection(row))); }
  catch { return false; }
};
export const isV3FormattingJob = (job, row, user) => Boolean(row && isV3MediaIdentity(row)
  && row.user_id === user && !row.deleted_at && !row.clientReadOnly
  && job?.pending && !job.deleted && !job.conflict && !job.localOnly && !job.baseMutation
  && Number(row.media_revision) === job.revision
  && job.definition?.monitoring_state === row.monitoring_state
  && sameV3ClientIdentity(job.definition, row)
  && stable(identity(job.definition)) !== stable(identity(v3ClientProjection(row))));
export const rejectedV3History = job => job?.terminalIdentity
  ? [...(job.rejectedMutations || []), Object.fromEntries(Object.entries(job).filter(([key]) => key !== 'rejectedMutations'))]
  : job?.rejectedMutations || [];
