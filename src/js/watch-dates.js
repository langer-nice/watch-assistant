const LEGACY_CREATION_FIELDS = [
  'created_at',
  'created',
  'createdDate',
  'dateCreated',
  'creationDate',
];

const parseDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getCreatedTimelineDate = (watch) => {
  if (!Array.isArray(watch.timeline)) return null;
  const createdEvent = watch.timeline.find((event) => (
    event?.type === 'created'
    || event?.labelKey === 'watchData.created'
    || /^(watch created|watch créée)$/i.test(String(event?.label || '').trim())
  ));
  if (!createdEvent) return null;
  return parseDate(createdEvent.date)
    || parseDate(createdEvent.createdAt)
    || parseDate(createdEvent.timestamp);
};

export const getWatchCreationDate = (watch) => {
  const currentDate = parseDate(watch?.createdAt);
  if (currentDate) return currentDate;
  for (const field of LEGACY_CREATION_FIELDS) {
    const legacyDate = parseDate(watch?.[field]);
    if (legacyDate) return legacyDate;
  }
  return getCreatedTimelineDate(watch);
};

export const normalizeWatchCreationDate = (watch) => {
  const creationDate = getWatchCreationDate(watch);
  if (!creationDate) return { watch, migrated: false, valid: false };
  const createdAt = creationDate.toISOString();
  if (watch.createdAt === createdAt) return { watch, migrated: false, valid: true };
  return {
    watch: { ...watch, createdAt },
    migrated: true,
    valid: true,
  };
};

const startOfLocalDay = (date) => new Date(
  date.getFullYear(),
  date.getMonth(),
  date.getDate(),
);

const startOfLocalWeek = (date) => {
  const start = startOfLocalDay(date);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
};

const getLocale = (language) => (language === 'fr' ? 'fr-FR' : 'en-GB');

const formatTime = (date, locale) => new Intl.DateTimeFormat(locale, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(date);

export const formatWatchCreationTime = (date, { language = 'en' } = {}) => {
  const creationDate = parseDate(date);
  return creationDate ? formatTime(creationDate, getLocale(language)) : '';
};

export const formatWatchCreationMetadata = (date, {
  groupType,
  language = 'en',
  now = new Date(),
} = {}) => {
  const creationDate = parseDate(date);
  if (!creationDate) return '';
  const locale = getLocale(language);
  const time = formatTime(creationDate, locale);

  const creationDay = startOfLocalDay(creationDate);
  const today = startOfLocalDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  let dateLabel;
  if (creationDay.getTime() === yesterday.getTime()) {
    dateLabel = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day');
  } else if (
    groupType === 'last7Days'
    && creationDay >= startOfLocalWeek(today)
  ) {
    dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(creationDate);
  } else {
    dateLabel = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
    }).format(creationDate);
  }
  return `${dateLabel.charAt(0).toLocaleUpperCase(locale)}${dateLabel.slice(1)} · ${time}`;
};

export const getLocalDateBoundaries = (now = new Date()) => {
  const today = startOfLocalDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const last7Days = new Date(today);
  last7Days.setDate(last7Days.getDate() - 7);
  return { today, tomorrow, last7Days };
};
