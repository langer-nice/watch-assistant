import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('analysis progress replaces the original action in one accessible grouped region', async () => {
  const [html, reviewStyles, composerStyles] = await Promise.all([
    read('../../new-watch.html'),
    read('../scss/components/_url-review.scss'),
    read('../scss/components/_watch-composer.scss'),
  ]);
  const actionGroup = html.match(/<div class="watch-analysis-action">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';
  const analysisSection = html.match(/<section class="url-analysis"[\s\S]*?<\/section>/)?.[0] || '';

  assert.equal((html.match(/id="urlAnalysisProcessing"/g) || []).length, 1);
  assert.equal((html.match(/id="urlAnalysisCancel"/g) || []).length, 1);
  assert.match(actionGroup, /id="newWatchSubmit"[\s\S]*?id="urlAnalysisProcessing"[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?url-analysis__spinner[\s\S]*?id="urlAnalysisMessage"[\s\S]*?id="urlAnalysisCancel"[^>]*type="button"/);
  assert.doesNotMatch(analysisSection, /urlAnalysisProcessing|url-analysis__spinner/);
  assert.match(reviewStyles, /\.url-analysis__processing\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\) auto;[\s\S]*?min-height:\s*2\.75rem/);
  assert.match(reviewStyles, /\.url-analysis__cancel\s*\{[\s\S]*?min-height:\s*2\.75rem;[\s\S]*?box-shadow:\s*none/);
  assert.doesNotMatch(reviewStyles, /\.url-analysis__processing\s*\{[^}]*min-height:\s*8rem/);
  assert.match(composerStyles, /\.watch-form\.is-analysing \.watch-composer__submit\s*\{[\s\S]*?display:\s*none/);
});

test('analysis cancellation preserves the URL and invalidates every late response', async () => {
  const navigation = await read('./navigation.js');
  const analysisFlow = navigation.match(/const startUrlAnalysis = async[\s\S]*?const resetUrlFlow/)?.[0] || '';
  const resetFlow = navigation.match(/const resetUrlFlow =[\s\S]*?const updateComposer/)?.[0] || '';
  const analysisCancel = navigation.match(/analysisCancel\?\.addEventListener\('click',[\s\S]*?\n  \}\);/)?.[0] || '';
  const submitHandler = navigation.match(/form\.addEventListener\('submit',[\s\S]*?clarificationActions\?\.addEventListener/)?.[0] || '';

  assert.match(submitHandler, /analysisInProgress[\s\S]*?return/);
  assert.match(analysisFlow, /const requestId = urlAnalysisRequestId \+ 1/);
  assert.equal((analysisFlow.match(/requestId !== urlAnalysisRequestId \|\| controller\.signal\.aborted/g) || []).length, 3);
  assert.match(analysisFlow, /await resolveUrlMonitoringSource\(analysis,[\s\S]*?if \(requestId !== urlAnalysisRequestId \|\| controller\.signal\.aborted\) return;[\s\S]*?showReview\(resolvedAnalysis\)/);
  assert.match(resetFlow, /urlAnalysisRequestId \+= 1;[\s\S]*?urlAnalysisController\?\.abort\(\)/);
  assert.match(analysisCancel, /resetUrlFlow\(\{ clearInput: false, trackCancellation: true \}\)/);
  assert.doesNotMatch(analysisCancel, /addWatch|completeWatchCreation/);
  assert.match(analysisFlow, /catch \(error\)[\s\S]*?showReview\(\{[\s\S]*?status: 'failure'/);
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
