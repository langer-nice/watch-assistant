const pending = new Set();
const failed = new Set();

export const getLocalizedWatchCopy = (watch, language, field) => {
  const copy = watch.localizedCopy?.[language];
  if (copy?.sourceTitle !== watch.title || copy.sourceSummary !== (watch.monitoringSummary || '')) return null;
  return field === 'title' ? copy.title : copy.summary;
};

export const translateStoredWatchCopy = async (watch, language, { fetchImpl = fetch, update } = {}) => {
  if (watch.inputType !== 'text' || !watch.title || watch.titleKey || getLocalizedWatchCopy(watch, language, 'title')) return;
  const sourceTitle = watch.title;
  const sourceSummary = watch.monitoringSummary || '';
  const key = JSON.stringify([watch.id, language, sourceTitle, sourceSummary]);
  if (pending.has(key) || failed.has(key)) return;
  pending.add(key);
  try {
    const response = await fetchImpl('/api/watch-translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: sourceTitle, summary: sourceSummary, language }),
    });
    if (!response.ok) throw new Error(`Translation failed: ${response.status}`);
    const copy = await response.json();
    if (!copy.title?.trim() || typeof copy.summary !== 'string') throw new Error('Invalid translation');
    await update(watch.id, language, {
      sourceTitle, sourceSummary, title: copy.title.trim(), summary: copy.summary.trim(),
    });
  } catch (error) {
    failed.add(key);
    console.warn('Could not translate Watch copy.', error);
  } finally {
    pending.delete(key);
  }
};
