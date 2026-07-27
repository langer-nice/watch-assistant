import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Story Summary uses the standard padded detail-card alignment at all breakpoints', async () => {
  const [html, styles] = await Promise.all([
    readFile(new URL('../../watch-detail.html', import.meta.url), 'utf8'),
    readFile(new URL('../scss/components/_detail-card.scss', import.meta.url), 'utf8'),
  ]);

  assert.match(
    html,
    /id="watchStorySummary"[^>]*class="[^"]*detail-card__take|class="[^"]*detail-card__take[^"]*"[^>]*id="watchStorySummary"/,
  );
  assert.match(styles, /\.detail-card__take\s*\{[\s\S]*?padding:\s*var\(--space-lg\)/);
  assert.match(styles, /@media \(min-width: 36rem\)[\s\S]*?\.detail-card__primary,[\s\S]*?\.detail-card__take\s*\{[\s\S]*?padding-inline:\s*var\(--space-xl\)/);
  assert.match(
    html,
    /id="watchStorySummary"[\s\S]*?id="watchAnalysisProvenance"[^>]*hidden/,
  );
});
