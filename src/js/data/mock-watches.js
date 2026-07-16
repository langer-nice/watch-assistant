export const mockWatches = [
  {
    id: 'watch-001',
    titleKey: 'watchData.watch-001.title',
    requestKey: 'watchData.watch-001.request',
    category: 'travel',
    status: 'attention',
    monitoringSummaryKey: 'watchData.watch-001.monitoringSummary',
    latestChangeKey: 'watchData.watch-001.latestChange',
    latestChangeAtKey: 'watchData.watch-001.latestChangeAt',
    currentSituationKey: 'watchData.watch-001.currentSituation',
    recommendationKey: 'watchData.watch-001.recommendation',
    whyTodayKey: 'watchData.watch-001.whyToday',
    lastCheckedKey: 'watchData.watch-001.lastChecked',
    requiresAttention: true,
    sources: [
      { labelKey: 'watchData.watch-001.sourceOne' },
      { labelKey: 'watchData.watch-001.sourceTwo' },
      { labelKey: 'watchData.watch-001.sourceThree' },
    ],
    confidence: '96%',
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
    category: 'entertainment',
    status: 'updated',
    monitoringSummaryKey: 'watchData.watch-002.monitoringSummary',
    latestChangeKey: 'watchData.watch-002.latestChange',
    latestChangeAtKey: 'watchData.watch-002.latestChangeAt',
    currentSituationKey: 'watchData.watch-002.currentSituation',
    recommendationKey: 'watchData.watch-002.recommendation',
    whyTodayKey: 'watchData.watch-002.whyToday',
    lastCheckedKey: 'watchData.watch-002.lastChecked',
    requiresAttention: false,
    sources: [{ labelKey: 'watchData.watch-002.sourceOne' }],
    confidence: '88%',
    timeline: [
      {
        labelKey: 'watchData.watch-002.timelineOne',
      },
      {
        labelKey: 'watchData.watch-002.timelineTwo',
      },
      {
        labelKey: 'watchData.watch-002.timelineThree',
        state: 'latest',
      },
    ],
    externalActions: [{
      labelKey: 'watchData.watch-002.externalActionOne',
      url: 'https://www.netflix.com',
    }],
  },
  {
    id: 'watch-003',
    titleKey: 'watchData.watch-003.title',
    requestKey: 'watchData.watch-003.request',
    category: 'property',
    status: 'updated',
    monitoringSummaryKey: 'watchData.watch-003.monitoringSummary',
    latestChangeKey: 'watchData.watch-003.latestChange',
    latestChangeAtKey: 'watchData.watch-003.latestChangeAt',
    currentSituationKey: 'watchData.watch-003.currentSituation',
    recommendationKey: 'watchData.watch-003.recommendation',
    whyTodayKey: 'watchData.watch-003.whyToday',
    lastCheckedKey: 'watchData.watch-003.lastChecked',
    requiresAttention: false,
    sources: [{ labelKey: 'watchData.watch-003.sourceOne' }],
    confidence: '93%',
    timeline: [
      {
        labelKey: 'watchData.watch-003.timelineOne',
      },
      {
        labelKey: 'watchData.watch-003.timelineTwo',
      },
      {
        labelKey: 'watchData.watch-003.timelineThree',
        state: 'latest',
      },
    ],
    externalActions: [{
      labelKey: 'watchData.watch-003.externalActionOne',
      url: 'https://www.seloger.com',
    }],
  },
];
