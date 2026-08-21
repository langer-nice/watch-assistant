const parseUsableTimestamp = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date : null;
};

const collectWatchTimestamps = (watch) => [
  watch?.lastChecked,
  watch?.monitoringSnapshot?.checkedAt,
  watch?.lastCheckAttempt?.status === 'succeeded'
    ? watch.lastCheckAttempt.attemptedAt
    : null,
];

export const resolveHomeReportTimestamp = ({ report = null, watches = [] } = {}) => {
  const candidates = [
    report?.completedAt,
    ...(Array.isArray(report?.entries)
      ? report.entries.map((entry) => entry?.checkedAt)
      : []),
    ...(Array.isArray(watches) ? watches.flatMap(collectWatchTimestamps) : []),
  ];

  const latest = candidates.reduce((current, value) => {
    const date = parseUsableTimestamp(value);
    return date && (!current || date > current) ? date : current;
  }, null);

  return latest?.toISOString() || null;
};

export const formatHomeReportTimestamp = (value, language = 'en') => {
  const date = parseUsableTimestamp(value);
  if (!date) return null;
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const dateParts = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(date);
  const getPart = (type) => dateParts.find((part) => part.type === type)?.value || '';
  const dateText = `${getPart('weekday')} ${getPart('day')} ${getPart('month')}`;
  const timeText = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${dateText} · ${timeText}`;
};
