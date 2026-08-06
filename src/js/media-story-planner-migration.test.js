import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Planner is the only decision gate for supported Media Story URLs', async () => {
  const navigation = await read('./navigation.js');
  const submitFlow = navigation.match(
    /form\.addEventListener\('submit',[\s\S]*?clarificationActions\?\.addEventListener/,
  )?.[0] || '';
  const plannerIndex = submitFlow.indexOf('requestWatchPlan(request)');
  const mediaRouteIndex = submitFlow.indexOf('getMediaStoryPlanRoute(request, watchPlan)');
  const genericUrlIndex = submitFlow.indexOf('if (isUrl(request))');

  assert.ok(plannerIndex >= 0 && plannerIndex < mediaRouteIndex);
  assert.ok(mediaRouteIndex < genericUrlIndex);
  assert.match(
    submitFlow,
    /MEDIA_STORY_PLAN_ROUTES\.REVIEW[\s\S]*?continueExistingUrlWatchFlow\(\)/,
  );
  assert.match(
    submitFlow,
    /MEDIA_STORY_PLAN_ROUTES\.GUIDANCE[\s\S]*?mediaStoryPlanningUnavailable[\s\S]*?return/,
  );
  assert.doesNotMatch(
    submitFlow.slice(0, plannerIndex),
    /getMediaStoryPlanRoute|parseMediaStoryRequest|startUrlAnalysis/,
  );
});

test('planned media and legacy generic URL routes call the same existing analysis pipeline', async () => {
  const navigation = await read('./navigation.js');
  const submitFlow = navigation.match(
    /form\.addEventListener\('submit',[\s\S]*?clarificationActions\?\.addEventListener/,
  )?.[0] || '';
  const urlFlow = submitFlow.match(
    /const continueExistingUrlWatchFlow = async \(\) => \{[\s\S]*?\n    \};/,
  )?.[0] || '';
  const analysisFlow = navigation.match(
    /const startUrlAnalysis = async \(request, whyFollowing\) => \{[\s\S]*?const resetUrlFlow/,
  )?.[0] || '';
  const creationFlow = navigation.match(
    /reviewCreate\?\.addEventListener\('click',[\s\S]*?reviewCancel\?\.addEventListener/,
  )?.[0] || '';

  assert.match(urlFlow, /startUrlAnalysis\(request, whyFollowing\)/);
  assert.equal((submitFlow.match(/continueExistingUrlWatchFlow\(\)/g) || []).length, 2);
  assert.match(analysisFlow, /analyseUrl\(request,[\s\S]*?resolveUrlMonitoringSource\(analysis/);
  assert.match(analysisFlow, /showReview\(resolvedAnalysis\)/);
  assert.match(creationFlow, /completeWatchCreation\(createWatchObject\(/);
  assert.doesNotMatch(urlFlow, /createWatchObject|monitoringSnapshot|updates|check/);
});

test('Media Story planning does not enter monitoring, Home, or All Watches rendering', async () => {
  const navigation = await read('./navigation.js');
  const monitoring = await read('./watch-monitoring.js');
  const home = navigation.match(
    /const renderHomeWatchCards[\s\S]*?const renderHomeBriefing/,
  )?.[0] || '';
  const allWatches = navigation.match(
    /const renderWatchList[\s\S]*?const renderWatchDetail/,
  )?.[0] || '';

  assert.doesNotMatch(home, /media_story|MEDIA_STORY_PLAN_ROUTES|getMediaStoryPlanRoute/);
  assert.doesNotMatch(allWatches, /media_story|MEDIA_STORY_PLAN_ROUTES|getMediaStoryPlanRoute/);
  assert.doesNotMatch(monitoring, /media_story|MEDIA_STORY_PLAN_ROUTES|getMediaStoryPlanRoute/);
});
