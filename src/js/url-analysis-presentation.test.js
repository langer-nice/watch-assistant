import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('analysis progress uses one localized borderless cancel control at the far right', async () => {
  const [html, navigation, enSource, frSource, reviewStyles, composerStyles] = await Promise.all([
    read('../../new-watch.html'),
    read('./navigation.js'),
    read('../locales/en.json'),
    read('../locales/fr.json'),
    read('../scss/components/_url-review.scss'),
    read('../scss/components/_watch-composer.scss'),
  ]);
  const english = JSON.parse(enSource);
  const french = JSON.parse(frSource);
  const actionGroup = html.match(/<div class="watch-analysis-action">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';
  const analysisSection = html.match(/<section class="url-analysis"[\s\S]*?<\/section>/)?.[0] || '';
  const urlClear = html.match(/<button[\s\S]*?data-watch-clear[\s\S]*?<\/button>/)?.[0] || '';

  assert.equal((html.match(/id="urlAnalysisProcessing"/g) || []).length, 1);
  assert.equal((html.match(/id="urlAnalysisCancel"/g) || []).length, 1);
  assert.match(actionGroup, /id="newWatchSubmit"[\s\S]*?id="urlAnalysisProcessing"[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?url-analysis__spinner[\s\S]*?id="urlAnalysisMessage"[\s\S]*?class="url-analysis__cancel"[\s\S]*?id="urlAnalysisCancel"[\s\S]*?type="button"[\s\S]*?data-i18n-aria-label="newWatch\.cancelAnalysis"[\s\S]*?>×<\/button>/);
  assert.doesNotMatch(actionGroup, /button--secondary|data-i18n="newWatch\.urlReviewCancel"/);
  assert.match(urlClear, /class="watch-composer__clear"[\s\S]*?data-watch-clear[\s\S]*?data-i18n-aria-label="newWatch\.clearWatchInput"/);
  assert.equal(english.newWatch.cancelAnalysis, 'Cancel analysis');
  assert.equal(french.newWatch.cancelAnalysis, 'Annuler l’analyse');
  assert.notEqual(english.newWatch.cancelAnalysis, english.newWatch.clearWatchInput);
  assert.doesNotMatch(analysisSection, /urlAnalysisProcessing|url-analysis__spinner/);
  assert.match(reviewStyles, /\.url-analysis__processing\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\) auto;[\s\S]*?min-height:\s*2\.75rem/);
  assert.doesNotMatch(composerStyles, /\.watch-composer__clear,[\s\S]*?\.url-analysis__cancel/);
  assert.match(reviewStyles, /\.url-analysis__cancel\s*\{[\s\S]*?width:\s*2\.25rem;[\s\S]*?height:\s*2\.25rem;[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;/);
  assert.doesNotMatch(reviewStyles, /\.url-analysis__cancel\s*\{[^}]*border-radius:\s*var\(--radius-pill\)/);
  assert.match(reviewStyles, /\.url-analysis__cancel:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--color-action\);[\s\S]*?outline-offset:\s*2px/);
  assert.match(reviewStyles, /\.url-analysis__cancel:active:not\(:disabled\)/);
  assert.match(reviewStyles, /\.url-analysis__cancel:disabled\s*\{[\s\S]*?opacity:/);
  assert.match(reviewStyles, /\.url-analysis__cancel::before\s*\{[\s\S]*?inset:\s*calc\(var\(--space-xxs\) \* -1\)/);
  assert.match(navigation, /analysisCancel\?\.addEventListener\('click',[\s\S]*?clearInput: false/);
  assert.doesNotMatch(reviewStyles, /\.url-analysis__processing\s*\{[^}]*min-height:\s*8rem/);
  assert.match(composerStyles, /\.watch-form\.is-analysing \.watch-composer__submit\s*\{[\s\S]*?display:\s*none/);
});

test('analysis cancellation preserves the URL and invalidates every late response', async () => {
  const navigation = await read('./navigation.js');
  const analysisFlow = navigation.match(/const startUrlAnalysis = async[\s\S]*?const resetUrlFlow/)?.[0] || '';
  const resetFlow = navigation.match(/const resetUrlFlow =[\s\S]*?const updateComposer/)?.[0] || '';
  const analysisCancel = navigation.match(/analysisCancel\?\.addEventListener\('click',[\s\S]*?\n  \}\);/)?.[0] || '';
  const inputClear = navigation.match(/watchClear\?\.addEventListener\('click',[\s\S]*?\n  \}\);/)?.[0] || '';
  const submitHandler = navigation.match(/form\.addEventListener\('submit',[\s\S]*?clarificationActions\?\.addEventListener/)?.[0] || '';

  assert.match(submitHandler, /analysisInProgress[\s\S]*?return/);
  assert.match(analysisFlow, /const requestId = urlAnalysisRequestId \+ 1/);
  assert.equal((analysisFlow.match(/requestId !== urlAnalysisRequestId \|\| controller\.signal\.aborted/g) || []).length, 3);
  assert.match(analysisFlow, /await resolveUrlMonitoringSource\(analysis,[\s\S]*?if \(requestId !== urlAnalysisRequestId \|\| controller\.signal\.aborted\) return;[\s\S]*?showReview\(resolvedAnalysis\)/);
  assert.match(resetFlow, /urlAnalysisRequestId \+= 1;[\s\S]*?urlAnalysisController\?\.abort\(\)/);
  assert.match(analysisCancel, /resetUrlFlow\(\{ clearInput: false, trackCancellation: true \}\)/);
  assert.match(inputClear, /resetUrlFlow\(\{ clearInput: true \}\)/);
  assert.doesNotMatch(analysisCancel, /addWatch|completeWatchCreation/);
  assert.match(analysisFlow, /catch \(error\)[\s\S]*?showReview\(\{[\s\S]*?status: 'failure'/);
});

test('New Watch removes its Recent UI and renderer without changing other collection pages', async () => {
  const [html, navigation, mainStyles, pageStyles, homeHtml, watchesHtml] = await Promise.all([
    read('../../new-watch.html'),
    read('./navigation.js'),
    read('../scss/main.scss'),
    read('../scss/pages/_new-watch.scss'),
    read('../../index.html'),
    read('../../watches.html'),
  ]);

  assert.doesNotMatch(html, /recentWatchesSection|recentWatchesList|id="recentTitle"|newWatch\.recent|class="recent-watch/);
  assert.doesNotMatch(navigation, /renderRecentWatches|recentWatchesSection|recentWatchesList|class="recent-watch/);
  assert.doesNotMatch(mainStyles, /components\/recent-watches/);
  assert.doesNotMatch(pageStyles, /\.recent-watches/);
  assert.match(html, /id="urlAnalysis"[\s\S]*?id="urlReviewCreate"[\s\S]*?id="urlReviewEdit"[\s\S]*?id="urlReviewCancel"/);
  assert.match(homeHtml, /page--home/);
  assert.match(watchesHtml, /id="watchList"/);
});

test('analysis and review copy consistently identifies the supplied article', async () => {
  const [html, navigation, enSource, frSource] = await Promise.all([
    read('../../new-watch.html'),
    read('./navigation.js'),
    read('../locales/en.json'),
    read('../locales/fr.json'),
  ]);
  const english = JSON.parse(enSource);
  const french = JSON.parse(frSource);

  assert.equal(english.newWatch.urlProcessingButton, 'Analyzing article…');
  assert.equal(english.newWatch.urlReviewFound, 'This is the article you’re about to watch');
  assert.equal(french.newWatch.urlReviewFound, 'Voici l’article que vous êtes sur le point de surveiller');
  assert.doesNotMatch(enSource, /I found this article|Analy[sz]ing page…/);
  assert.match(html, /data-i18n="newWatch\.urlReviewFound"/);
  assert.match(html, /<span data-i18n="newWatch\.urlReviewSource"><\/span>[\s\S]*?<strong id="urlReviewSource"><\/strong>/);
  assert.match(navigation, /reviewSource\.textContent = analysis\?\.source \|\| t\('newWatch\.urlReviewUnknownSource'\)/);
  assert.match(navigation, /urlAnalysisProgressKey = 'newWatch\.urlProcessingButton'/);
});

test('review summary uses the shared bounded resizer without truncating its value', async () => {
  const [navigation, styles] = await Promise.all([
    read('./navigation.js'),
    read('../scss/components/_url-review.scss'),
  ]);
  const showReview = navigation.match(/const showReview = \(analysis\) => \{[\s\S]*?const startUrlAnalysis/)?.[0] || '';
  const inputHandler = navigation.match(/reviewSummary\?\.addEventListener\('input',[\s\S]*?\n  \}\);/)?.[0] || '';

  assert.match(navigation, /const resizeReviewSummary = \(options\) => resizeTextarea\([\s\S]*?reviewSummary,[\s\S]*?maxLines: 12/);
  assert.match(navigation, /const borderAdjustment = styles\.boxSizing === 'border-box'[\s\S]*?const requiredHeight = contentHeight \+ borderAdjustment/);
  assert.match(showReview, /reviewSummary\.value = analysis\?\.summary \|\| ''/);
  assert.match(showReview, /setReviewEditing\(failed\)/);
  assert.match(inputHandler, /validateReviewSummary\(\);[\s\S]*?resizeReviewSummary\(\)/);
  assert.equal((navigation.match(/reviewSummary\?\.addEventListener\('input'/g) || []).length, 1);
  assert.match(styles, /\.url-review__field textarea\s*\{[\s\S]*?min-height:[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(styles, /\.url-review__field textarea\s*\{[^}]*text-overflow:\s*ellipsis/);
});
