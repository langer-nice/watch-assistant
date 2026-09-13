import { SUPPORTED_WATCH_CATEGORIES } from './watch-category.js';
// Only the fields used by feed discovery and matching cross the persistence boundary.
const text = (value, limit) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('INVALID_MEDIA_DEFINITION');
  return value.trim();
};
const list = (value, limit = 8) => {
  if (!Array.isArray(value) || value.length > limit) throw new Error('INVALID_MEDIA_DEFINITION');
  return value.map((item) => text(item, 200));
};
export const isMediaWatch = (watch) => Boolean(
  (watch?.inputType === 'text' && watch.mediaMention)
  || (watch?.inputType === 'url' && watch.isStory === true && watch.storyProfile),
);
export const mediaWatchDefinition = (watch) => {
  if (!isMediaWatch(watch) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(watch.id)) throw new Error('INVALID_MEDIA_DEFINITION');
  const url = new URL(text(watch.monitoringSource?.url, 2048));
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('INVALID_MEDIA_DEFINITION');
  const category = watch.category || 'news';
  if (!SUPPORTED_WATCH_CATEGORIES.includes(category)) throw new Error('INVALID_MEDIA_DEFINITION');
  const definition = { inputType: watch.inputType, request: text(watch.request, 500), category };
  if (watch.inputType === 'text') {
    const subjects = list(watch.mediaMention.subjects);
    if (!subjects.length || watch.mediaMention.matchMode !== 'all') throw new Error('INVALID_MEDIA_DEFINITION');
    definition.mediaMention = { subjects, matchMode: 'all' };
  } else {
    const profile = watch.storyProfile;
    if (!Array.isArray(profile.concepts) || !profile.concepts.length || profile.concepts.length > 8) throw new Error('INVALID_MEDIA_DEFINITION');
    definition.storyProfile = {
      concepts: profile.concepts.map(({ label, type }) => ({ label: text(label, 200), type: (() => { if (!['person','organization','work','product_service','location','event','condition','symptom','phenomenon','relationship','manual'].includes(type)) throw new Error('INVALID_MEDIA_DEFINITION'); return type; })() })),
      userAddedConcepts: list(profile.userAddedConcepts || []),
    };
  }
  return {
    id: watch.id,
    title: text(watch.title, 200),
    monitoring_source: { type: 'feed', url: url.href, ...(watch.monitoringSource.query ? { query: text(watch.monitoringSource.query, 500) } : {}) },
    watch_definition: definition,
    monitoring_state: ['paused', 'completed'].includes(watch.status) ? 'paused' : 'monitoring',
  };
};
