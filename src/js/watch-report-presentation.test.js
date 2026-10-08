import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import en from '../locales/en.json' with { type: 'json' };
import fr from '../locales/fr.json' with { type: 'json' };
import { getReadOnlyCardPresentation, getHomeReportHeader } from './watch-report-presentation.js';
import { renderSummaryCard } from './watch-summary-card.js';
import { getCanonicalWatchClassification } from './report-status.js';
import { selectHomeReport } from './home-report.js';
const translate = lang => (key, values = {}) => Object.entries(values).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
  key.split('.').reduce((node, name) => node[name], {en, fr}[lang]));
const event = { id: 'currency:fixture:GBP:EUR:1.17:2026-10-02', status: 'new',
  sourceTitle: 'Saved rate: 1 GBP ≈ 1.1760 EUR.', timestamp: '2026-10-04T12:24:34.421Z',
  publishedAt: '2026-10-02T00:00:00Z' };
const base = { id: 'fixture', title: 'GBP/EUR', createdAt: '2026-10-01T00:00:00Z',
  status: 'watching', lastChecked: '2026-10-04T12:26:15.149Z',
  lastCheckAttempt: { status: 'succeeded' }, updates: [] };
const now = new Date('2026-10-07T12:00:00Z');

test('compatibility explanation and historical dates preserve results, read states and classification', () => {
  for (const lang of ['fr', 'en']) for (const availability of ['saved', 'incompatible']) {
    for (const updates of [[], [event], [{ ...event, status: 'read' }]]) {
      const watch = { ...base, monitoringAvailability: availability, updates };
      const before = structuredClone(watch);
      const classification = getCanonicalWatchClassification(watch, { now });
      const presentation = getReadOnlyCardPresentation(watch, translate(lang), lang);
      if (availability === 'saved') assert.equal(presentation, null);
      else {
        assert.equal(classification, 'attention');
        assert.equal(presentation.explanation, { en, fr }[lang].watchCard.readOnly);
        if (!updates.length) assert.equal(presentation.result, null);
        else {
          assert.equal(presentation.result.label, { en, fr }[lang].watchCard.savedThreshold);
          assert.deepEqual(presentation.result.dates.map(d => d.value),
            ['2026-10-04T12:24:34.421Z', '2026-10-02T00:00:00.000Z']);
          assert.match(presentation.result.dates[1].text, lang === 'fr' ? /2 octobre 2026/ : /2 October 2026/);
          assert.ok(!JSON.stringify(presentation).includes(watch.lastChecked), 'do not label a check time as a result time');
        }
      }
      assert.deepEqual(watch, before);
      assert.equal(getCanonicalWatchClassification(watch, { now }), classification);
    }
  }
});

test('both views use the shared card with separately escaped compatibility, saved result and labelled dates', () => {
  const navigation = readFileSync(new URL('./navigation.js', import.meta.url), 'utf8');
  for (const name of ['renderHomeWatchCards', 'renderWatchList']) {
    const start = navigation.indexOf(`const ${name} =`);
    assert.match(navigation.slice(start, start + 6000), /renderSummaryWatchCard\(/);
  }
  const styles = readFileSync(new URL('../scss/components/_briefing-summary.scss', import.meta.url), 'utf8');
  assert.match(styles, /\.briefing-summary__timestamp\[hidden\]\s*\{\s*display: none/);
  assert.match(navigation, /getReadOnlyCardPresentation\(watch, t, getLanguage\(\)\)/);
  const presentation = getReadOnlyCardPresentation({ ...base, monitoringAvailability: 'incompatible',
    updates: [{ ...event, sourceTitle: '<script>bad</script>' }] }, translate('fr'), 'fr');
  const html = renderSummaryCard({ title: 'GBP/EUR', category: 'Finance',
    supportingText: presentation.explanation, historicalResult: presentation.result,
    renderLink: content => `<a href="fixture">${content}</a>` });
  const { document } = parseHTML(html);
  assert.match(document.querySelector('p').textContent, /^Lecture seule/);
  assert.match(document.querySelector('strong').textContent, /^Dernier résultat enregistré : seuil atteint\./);
  assert.equal(document.querySelectorAll('time').length, 2);
  assert.equal(document.querySelector('script'), null);
  assert.match(document.textContent || html, /Résultat détecté le/);
  assert.match(html, /Date de référence de la source/);
});

test('missing or malformed event dates are omitted, never substituted with a check date', () => {
  const presentation = getReadOnlyCardPresentation({ ...base, monitoringAvailability: 'incompatible',
    updates: [{ id: 'article:fixture', summary: 'Historical news', status: 'read', timestamp: event.timestamp, publishedAt: 'invalid' }] }, translate('en'));
  assert.equal(presentation.result.label, en.watchCard.savedResult);
  assert.deepEqual(presentation.result.dates.map(d => d.value), [event.timestamp]);
});

test('no-report presentation changes wording only; real report counters and uncertain states remain intact', () => {
  for (const lang of ['en', 'fr']) for (const hasReport of [true, false]) {
    for (const uncertain of [true, false]) for (const availability of ['saved', 'incompatible']) {
      const watch = { ...base, monitoringAvailability: availability, updates: [event] };
      const report = hasReport ? { completedAt: now.toISOString(),
        attempts: [{ watchId: watch.id, status: 'succeeded' }],
        entries: [{ watchId: watch.id, classification: 'updated', title: 'GBP/EUR' }] } : null;
      const before = structuredClone({watch, report});
      const selected = selectHomeReport({ report, watches: [watch], now });
      const header = getHomeReportHeader({ hasReport, uncertain, totalChecked: selected.totalChecked }, translate(lang));
      assert.equal(header.hideSummary, uncertain);
      assert.equal(header.hideTimestamp, !hasReport && !uncertain);
      assert.equal(selected.totalChecked, hasReport && availability === 'saved' ? 1 : 0);
      assert.equal(selected.attentionWatches.length, availability === 'incompatible' ? 1 : 0);
      assert.equal(header.summary, hasReport
        ? translate(lang)(`home.checkedAway.${selected.totalChecked === 1 ? 'one' : 'other'}`, {count: selected.totalChecked})
        : {en, fr}[lang].home.noReport);
      assert.deepEqual({watch, report}, before);
    }
  }
});

test('rendering works with network and storage writes prohibited', () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const forbidden = () => assert.fail('presentation must not perform checks, generate reports or write state');
  globalThis.fetch = forbidden;
  globalThis.localStorage = { getItem: forbidden, setItem: forbidden, removeItem: forbidden };
  try {
    const presentation = getReadOnlyCardPresentation({ ...base, monitoringAvailability: 'incompatible', updates: [event] }, translate('en'));
    renderSummaryCard({title: 'GBP/EUR', supportingText: presentation.explanation,
      historicalResult: presentation.result, renderLink: content => content});
    getHomeReportHeader({hasReport: false, uncertain: false, totalChecked: 0}, translate('en'));
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('report control is disabled before auth initializes, then explains hydration, failure and readiness', async () => {
  const {renderReportReadiness} = await import('./watch-report-presentation.js');
  const {document} = parseHTML(readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
  const button=document.querySelector('#homeGenerateReport'), message=document.querySelector('#homeReportReadiness');
  assert.equal(button.hasAttribute('disabled'),true);
  assert.equal(button.getAttribute('aria-busy'),'true');
  assert.equal(button.getAttribute('aria-describedby'),message.id);
  assert.equal(message.hidden,false);
  const cases=[
    {availability:{uncertain:true,failed:false},disabled:true,busy:true,visible:true,key:'reportPreparing'},
    {availability:{uncertain:true,failed:false,cached:true,waiting:true},disabled:true,busy:true,visible:true,key:'reportPreparing'},
    {availability:{uncertain:true,failed:true,cached:true},disabled:true,busy:false,visible:true,key:'reportPreparationFailed'},
    {availability:{uncertain:false,incompatible:true},disabled:false,busy:false,visible:false},
    {availability:{uncertain:false,loading:true,cached:true},disabled:false,busy:false,visible:false},
    {availability:{uncertain:false},generating:true,disabled:true,busy:true,visible:false},
    {availability:{uncertain:false},hasWatches:false,disabled:true,busy:false,visible:false},
    {availability:{uncertain:false},disabled:false,busy:false,visible:false},
  ];
  for(const language of ['en','fr'])for(const state of cases){
    renderReportReadiness({button,message,generating:false,hasWatches:true,...state},translate(language));
    assert.equal(button.disabled,state.disabled);
    assert.equal(button.hasAttribute('aria-busy'),state.busy);
    assert.equal(message.hidden,!state.visible);
    if(state.key)assert.equal(message.textContent,{en,fr}[language].home[state.key]);
  }
});
