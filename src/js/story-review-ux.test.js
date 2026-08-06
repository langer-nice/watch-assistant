import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Story Review and Detail present overview and monitoring scope separately', async () => {
  const [reviewHtml, detailHtml, navigation] = await Promise.all([
    read('../../new-watch.html'),
    read('../../watch-detail.html'),
    read('./navigation.js'),
  ]);

  assert.match(reviewHtml, /id="urlReviewSummaryLabel"[^>]*urlReviewOverviewRequired/);
  assert.match(reviewHtml, /id="urlReviewMonitoringScopeField"[\s\S]*?id="urlReviewMonitoringScope"/);
  assert.match(detailHtml, /id="watchStorySummary"[\s\S]*?detail\.storyOverview/);
  assert.match(detailHtml, /id="watchMonitoringScope"[\s\S]*?detail\.monitoringScope/);
  assert.match(navigation, /monitoringSummary: urlAnalysis\?\.monitoringScope/);
  assert.match(navigation, /storySummary: reviewSummary\.value\.trim\(\)/);
  assert.match(navigation, /isDistinctMonitoringScope\(watch\.monitoringSummary, storySummary, watch\.title\)/);
});

test('Media Story presentation contains no technical AI fallback warning', async () => {
  const [reviewHtml, detailHtml, navigation, english, french] = await Promise.all([
    read('../../new-watch.html'),
    read('../../watch-detail.html'),
    read('./navigation.js'),
    read('../locales/en.json'),
    read('../locales/fr.json'),
  ]);
  const userFacing = [reviewHtml, detailHtml, navigation, english, french].join('\n');

  assert.doesNotMatch(userFacing, /analysisProvenanceFallback|watchAnalysisProvenance/);
  assert.doesNotMatch(userFacing, /AI analysis was unavailable|limited fallback analysis|configuration missing|provider failure/i);
});

test('Story UX changes do not enter the monitoring engine or Company Review', async () => {
  const [monitoring, navigation] = await Promise.all([
    read('./watch-monitoring.js'),
    read('./navigation.js'),
  ]);
  const companyReview = navigation.match(
    /const renderCompanyReviewStatus[\s\S]*?const validateReviewSummary/,
  )?.[0] || '';

  assert.doesNotMatch(monitoring, /storyOverview|monitoringScope|createStoryOverview/);
  assert.match(companyReview, /companyReviewWatchingForRequired/);
  assert.match(companyReview, /reviewMonitoringScopeField\.hidden = failed \|\| isCompanyReview/);
  const validation = navigation.match(
    /const validateReviewSummary[\s\S]*?const showReview/,
  )?.[0] || '';
  assert.doesNotMatch(validation, /\bfailed\b|\banalysis\b/);
});

test('Media Story Review renders local analysis before the single AI enhancement settles', async () => {
  const navigation = await read('./navigation.js');
  const analysisFlow = navigation.match(
    /const startUrlAnalysis = async[\s\S]*?const resetUrlFlow/,
  )?.[0] || '';

  assert.match(analysisFlow, /analyseUrl\(request,[\s\S]*?progressive: true/);
  assert.equal((analysisFlow.match(/analyseUrl\(request/g) || []).length, 1);
  assert.equal((analysisFlow.match(/resolveUrlMonitoringSource\(analysis/g) || []).length, 1);
  assert.ok(analysisFlow.indexOf('showReview(resolvedAnalysis)') > -1);
  assert.ok(analysisFlow.indexOf('showReview(resolvedAnalysis)') < analysisFlow.indexOf('enhancement.then'));
  assert.match(analysisFlow, /pendingAnalysis !== resolvedAnalysis/);
  assert.match(analysisFlow, /review\?\.classList\.contains\('is-editing'\)/);
  assert.match(analysisFlow, /keywordsManuallyEdited/);
});

test('a total page failure keeps the recognized source and URL and cannot create a broken Watch', async () => {
  const navigation = await read('./navigation.js');
  const analysisFlow = navigation.match(
    /const startUrlAnalysis = async[\s\S]*?const resetUrlFlow/,
  )?.[0] || '';
  const createHandler = navigation.match(
    /reviewCreate\?\.addEventListener\('click'[\s\S]*?reviewCancel\?\.addEventListener/,
  )?.[0] || '';
  const cancelHandler = navigation.match(
    /reviewCancel\?\.addEventListener\('click'[\s\S]*?analysisCancel\?\.addEventListener/,
  )?.[0] || '';

  assert.match(analysisFlow, /source: error\.partialAnalysis\?\.source/);
  assert.match(analysisFlow, /sourceUrl: error\.partialAnalysis\?\.sourceUrl \|\| request/);
  assert.match(createHandler, /validateReviewSummary/);
  assert.match(createHandler, /reviewTitle\?\.reportValidity/);
  assert.match(cancelHandler, /clearInput: pendingAnalysis\?\.status === 'success'/);
});
