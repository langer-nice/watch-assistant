export const mockWatches = [
  {
    id: 'watch-001',
    titleKey: 'watchData.watch-001.title',
    requestKey: 'watchData.watch-001.request',
    category: 'travel',
    status: 'attention',
    summaryKey: 'watchData.watch-001.summary',
    currentSituationKey: 'watchData.watch-001.currentSituation',
    recommendationKey: 'watchData.watch-001.recommendation',
    latestUpdateKey: 'watchData.watch-001.latestUpdate',
    lastCheckedKey: 'watchData.watch-001.lastChecked',
    requiresAttention: true,
    sources: [
      { labelKey: 'watchData.watch-001.sourceOne' },
      { labelKey: 'watchData.watch-001.sourceTwo' },
      { labelKey: 'watchData.watch-001.sourceThree' },
    ],
    confidence: '96%',
    assistantContextKey: 'watchData.watch-001.assistantContext',
    whyFollowingKey: 'watchData.watch-001.whyFollowing',
    timeline: [
      {
        dateKey: 'watchData.watch-001.timelineDateOne',
        labelKey: 'watchData.watch-001.timelineOne',
      },
      {
        dateKey: 'watchData.watch-001.timelineDateTwo',
        labelKey: 'watchData.watch-001.timelineTwo',
      },
      {
        dateKey: 'watchData.watch-001.timelineDateThree',
        labelKey: 'watchData.watch-001.timelineThree',
        state: 'latest',
      },
    ],
    externalActions: [
      {
        labelKey: 'watchData.watch-001.externalActionOne',
        url: 'https://www.easyjet.com',
      },
      {
        labelKey: 'watchData.watch-001.externalActionTwo',
        url: 'https://www.google.com/travel/flights',
      },
      {
        labelKey: 'watchData.watch-001.externalActionThree',
        url: 'https://www.skyscanner.com',
      },
    ],
  },
  {
    id: 'watch-002',
    titleKey: 'watchData.watch-002.title',
    requestKey: 'watchData.watch-002.request',
    category: 'price',
    status: 'watching',
    summaryKey: 'watchData.watch-002.summary',
    currentSituationKey: 'watchData.watch-002.currentSituation',
    recommendationKey: 'watchData.watch-002.recommendation',
    latestUpdateKey: 'watchData.watch-002.latestUpdate',
    lastCheckedKey: 'watchData.watch-002.lastChecked',
    requiresAttention: false,
    sources: [{ labelKey: 'watchData.watch-002.sourceOne' }],
    confidence: '88%',
    assistantContextKey: 'watchData.watch-002.assistantContext',
    whyFollowingKey: 'watchData.watch-002.whyFollowing',
    timeline: [
      {
        dateKey: 'watchData.watch-002.timelineDateOne',
        labelKey: 'watchData.watch-002.timelineOne',
      },
      {
        dateKey: 'watchData.watch-002.timelineDateTwo',
        labelKey: 'watchData.watch-002.timelineTwo',
        state: 'latest',
      },
    ],
    externalActions: [{
      labelKey: 'watchData.watch-002.externalActionOne',
      url: 'https://www.amazon.com',
    }],
  },
  {
    id: 'watch-003',
    titleKey: 'watchData.watch-003.title',
    requestKey: 'watchData.watch-003.request',
    category: 'news',
    status: 'stable',
    summaryKey: 'watchData.watch-003.summary',
    currentSituationKey: 'watchData.watch-003.currentSituation',
    recommendationKey: 'watchData.watch-003.recommendation',
    latestUpdateKey: 'watchData.watch-003.latestUpdate',
    lastCheckedKey: 'watchData.watch-003.lastChecked',
    requiresAttention: false,
    sources: [
      { labelKey: 'watchData.watch-003.sourceOne' },
      { labelKey: 'watchData.watch-003.sourceTwo' },
    ],
    confidence: '93%',
    assistantContextKey: 'watchData.watch-003.assistantContext',
    whyFollowingKey: 'watchData.watch-003.whyFollowing',
    timeline: [
      {
        dateKey: 'watchData.watch-003.timelineDateOne',
        labelKey: 'watchData.watch-003.timelineOne',
      },
      {
        dateKey: 'watchData.watch-003.timelineDateTwo',
        labelKey: 'watchData.watch-003.timelineTwo',
        state: 'latest',
      },
    ],
    externalActions: [{
      labelKey: 'watchData.watch-003.externalActionOne',
      url: 'https://example.com/news',
    }],
  },
];
