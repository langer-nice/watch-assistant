export const PREVIEW_FIXTURE_PREFIX = 'preview-test-';

export const isPreviewTestLoaderAvailable = (env = import.meta.env) => (
  env?.DEV === true || env?.VITE_VERCEL_ENV === 'preview'
);

const relativeIso = (now, hoursAgo) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();

export const createPreviewTestWatches = (now = new Date()) => {
  const timestamp = (hoursAgo) => relativeIso(now, hoursAgo);
  const feed = (title, query) => ({
    type: 'feed',
    title,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}`,
    discovery: 'automatic',
    query,
  });
  const snapshot = (checkedAt, itemIds) => ({ checkedAt, itemIds });

  return [
    {
      id: `${PREVIEW_FIXTURE_PREFIX}updated`,
      title: '[TEST] EU AI Act implementation',
      request: 'Track material implementation updates for the EU AI Act',
      inputType: 'text', category: 'news', categorySource: 'manual', status: 'watching',
      createdAt: timestamp(240), monitoringState: 'monitoring',
      monitoringSource: feed('EU policy news', 'EU AI Act implementation'),
      monitoringSnapshot: snapshot(timestamp(2), ['ai-baseline', 'ai-guidance']),
      lastChecked: timestamp(2), lastCheckAttempt: { status: 'succeeded', attemptedAt: timestamp(2), outcome: 'new-items' },
      latestChange: 'The Commission published new implementation guidance for general-purpose AI providers.',
      latestChangeAt: timestamp(2),
      updates: [{
        id: 'preview-ai-guidance', status: 'new',
        sourceTitle: 'Commission publishes implementation guidance',
        summary: 'New guidance clarifies implementation milestones for general-purpose AI providers.',
        url: 'https://example.com/test/eu-ai-guidance',
        publishedAt: timestamp(3), detectedAt: timestamp(2), timestamp: timestamp(2),
        source: 'EU policy news',
      }],
    },
    {
      id: `${PREVIEW_FIXTURE_PREFIX}unchanged`,
      title: '[TEST] City rail extension opening',
      request: 'Watch for an official opening date for the city rail extension',
      inputType: 'text', category: 'event', categorySource: 'manual', status: 'watching',
      createdAt: timestamp(336), monitoringState: 'monitoring',
      monitoringSource: feed('Transport authority updates', 'city rail extension opening'),
      monitoringSnapshot: snapshot(timestamp(5), ['rail-baseline']),
      lastChecked: timestamp(5), lastCheckAttempt: { status: 'succeeded', attemptedAt: timestamp(5), outcome: 'no-new-items' },
      currentSituation: 'No official opening date has been announced.', updates: [],
    },
    {
      id: `${PREVIEW_FIXTURE_PREFIX}attention`,
      title: '[TEST] Regional flood alerts',
      request: 'Monitor regional flood alerts',
      inputType: 'text', category: 'news', categorySource: 'manual', status: 'attention',
      actionRequired: true, requiresAttention: true, attentionReason: 'source-review-required',
      userActionReason: 'source-review-required', createdAt: timestamp(168), monitoringState: 'monitoring',
      monitoringSource: feed('Regional alert feed', 'regional flood alerts'),
      monitoringSnapshot: snapshot(timestamp(30), ['flood-baseline']), lastChecked: timestamp(30),
      lastCheckAttempt: { status: 'failed', attemptedAt: timestamp(1), code: 'SOURCE_UNAVAILABLE' },
      updates: [],
    },
    {
      id: `${PREVIEW_FIXTURE_PREFIX}media-story`,
      title: '[TEST] Museum restoration investigation',
      request: 'Follow the museum restoration funding investigation story',
      whyFollowing: 'I follow this investigation for the next editorial review.',
      inputType: 'url', category: 'news', categorySource: 'manual', status: 'watching',
      createdAt: timestamp(120), sourceUrl: 'https://example.com/test/museum-investigation',
      sourceTitle: 'Questions raised over museum restoration funding', sourceName: 'Example Newsroom',
      pageType: 'article', isStory: true, monitoringState: 'monitoring',
      monitoringSource: feed('Museum investigation coverage', 'museum restoration funding investigation'),
      storyFingerprint: [
        { label: 'museum restoration funding', type: 'topic' },
        { label: 'funding investigation', type: 'event' },
      ],
      storyProfile: {
        storySummary: 'An investigation is examining the award of restoration funding.',
        sourceArticle: { title: 'Questions raised over museum restoration funding', url: 'https://example.com/test/museum-investigation', publication: 'Example Newsroom', publishedAt: timestamp(144) },
        extractedAt: timestamp(120),
      },
      monitoringSnapshot: snapshot(timestamp(4), ['museum-baseline', 'museum-audit']),
      lastChecked: timestamp(4), lastCheckAttempt: { status: 'succeeded', attemptedAt: timestamp(4), outcome: 'new-items' },
      updates: [{
        id: 'preview-museum-audit', status: 'new', sourceTitle: 'Auditors open formal review',
        summary: 'Auditors opened a formal review of the restoration grant award.',
        url: 'https://example.com/test/museum-audit', source: 'Example Newsroom',
        publishedAt: timestamp(5), detectedAt: timestamp(4), timestamp: timestamp(4),
      }],
    },
    {
      id: `${PREVIEW_FIXTURE_PREFIX}company-cemex`,
      title: '[TEST] CEMEX GRANULATS — Company Watch',
      request: 'Monitor CEMEX GRANULATS SIREN 552005969',
      whyFollowing: 'This Watch will follow relevant future reporting, including major developments and significant follow-up reporting.',
      inputType: 'company', category: 'general', categorySource: 'manual', status: 'watching',
      createdAt: timestamp(720), monitoringState: 'monitoring',
      company: { siren: '552005969', name: 'CEMEX GRANULATS', administrativeStatus: 'active', status: 'active' },
      monitoringSource: { type: 'bodacc', provider: 'dila', siren: '552005969', title: 'BODACC', discovery: 'official-company' },
      monitoringSnapshot: snapshot(timestamp(8), ['bodacc-baseline-1']),
      lastChecked: timestamp(8), lastCheckAttempt: { status: 'succeeded', attemptedAt: timestamp(8), outcome: 'no-new-items' },
      currentSituation: 'No new BODACC event has been published since the baseline check.', updates: [],
    },
    {
      id: `${PREVIEW_FIXTURE_PREFIX}company-orange`,
      title: 'ORANGE',
      request: 'Monitor ORANGE SIREN 380129866',
      whyFollowing: 'This Watch will follow future reporting directly related to Enterprise SIREN 380129866., including major developments and significant follow-up reporting.',
      inputType: 'company', category: 'general', categorySource: 'manual', status: 'watching',
      createdAt: timestamp(744), monitoringState: 'monitoring',
      company: { siren: '380129866', name: 'ORANGE', administrativeStatus: 'active', status: 'active' },
      monitoringSource: { type: 'bodacc', provider: 'dila', siren: '380129866', title: 'BODACC', discovery: 'official-company' },
      monitoringSnapshot: snapshot(timestamp(10), ['bodacc-orange-baseline-1']),
      lastChecked: timestamp(10), lastCheckAttempt: { status: 'succeeded', attemptedAt: timestamp(10), outcome: 'no-new-items' },
      currentSituation: 'No new BODACC event has been published since the baseline check.', updates: [],
    },
  ];
};
