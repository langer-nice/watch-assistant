import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { escapeHtml, getUpdateSummaryPreview, renderSummaryCard } from './watch-summary-card.js';
import { mapMediaReportRow } from './media-watch-row.js';
import { buildStoredReport } from './report-snapshot.js';
import { selectHomeReport } from './home-report.js';
import { getLatestUpdate } from './watch-updates.js';
import { renderUpdateHistory } from './update-history-presentation.js';

const checkedAt = '2026-11-05T13:17:21Z';
const descriptions = [
  ['Gucci / Prada', 'New product development in the beauty category.'],
  ['France', 'Les manifestations et les grèves se poursuivent dans plusieurs villes.'],
  ['Manchester City', 'A new development was reported after the match.'],
  ['Taylor Swift', 'A new development was reported by several outlets. '.repeat(8).trim()],
  ['French elections', 'Une nouvelle candidature a été annoncée.'],
];

const card = (watch, supportingText, clampSummary = true) => renderSummaryCard({
  title: watch.title, category: 'News', supportingText, clampSummary,
  timestamp: '5 Nov 2026, 14:17', statusPresentation: { label: 'Updated', modifier: 'updated' },
  renderLink: content => `<a href="watch-detail.html?id=${watch.id}">${content}</a>`,
});

for (const [index, [title, summary]] of descriptions.entries()) {
  test(`${title}: snapshot and live Watch render one identical full summary`, () => {
    const watch = mapMediaReportRow({
      id: 'fixture-' + index, title, watch_definition: { category: 'news' },
      monitoring_source: { url: 'https://example.test/feed' },
      monitoring_state: 'monitoring', current_status: 'updated',
      created_at: '2026-11-01T12:00:00Z', last_checked_at: checkedAt,
      last_check_outcome: 'matching-items', last_change_item_id: 'development-' + index,
      media_last_change_detected_at: checkedAt, last_change_summary: summary,
      last_change_title: summary.slice(0, 300),
    }, 'fixture-owner');
    const report = buildStoredReport({
      watches: [watch], ownerId: 'fixture-owner', id: 'report',
      startedAt: checkedAt, completedAt: checkedAt,
    });
    const [home] = selectHomeReport({ report, watches: [watch], now: new Date(checkedAt) }).updatedWatches;
    const homeText = getUpdateSummaryPreview({ summary: home.reportSummary, sourceTitle: home.reportUpdateTitle });
    const listText = getUpdateSummaryPreview(getLatestUpdate(watch));
    const { document } = parseHTML(`<main>${card(watch, homeText)}${card(watch, listText)}</main>`);
    assert.deepEqual([...document.querySelectorAll('.briefing-item__summary')].map(p => p.textContent), [summary, summary]);
    assert.deepEqual([...document.querySelectorAll('.status-label')].map(p => p.textContent), ['Updated', 'Updated']);
    assert.deepEqual([...document.querySelectorAll('.briefing-item__time')].map(p => p.textContent), ['5 Nov 2026, 14:17', '5 Nov 2026, 14:17']);
    assert.ok([...document.querySelectorAll('a')].every(a => a.getAttribute('href') === `watch-detail.html?id=${watch.id}`));
    assert.equal(report.entries[0].summary, summary);
  });
}

test('missing body falls back to the headline and detail retains the full unclamped text', () => {
  assert.equal(getUpdateSummaryPreview({ summary: ' ', sourceTitle: 'Headline only' }), 'Headline only');
  const [title, summary] = descriptions[3];
  const history = renderUpdateHistory({
    items: [{ id: 'history', title, summary, timestamp: checkedAt }],
    language: 'en', t: key => key, escapeHtml, formatTimestamp: String,
  });
  const { document } = parseHTML(`<main><ul>${history}</ul>${card({ id: 'sample', title }, 'Short preview', false)}</main>`);
  assert.equal(document.querySelector('.monitoring-update__description').textContent, summary);
  assert.equal(document.querySelector('.briefing-item__summary'), null);
});
