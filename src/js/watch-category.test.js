import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCategoryPendingSituationKey,
  inferWatchCategory,
  normalizeWatchCategory,
} from './watch-category.js';

test('legal intent takes priority over incidental money in English and French', () => {
  assert.equal(inferWatchCategory('Notify me when this lawsuit receives a new ruling and damages rise to $2bn'), 'news');
  assert.equal(inferWatchCategory('Notify me if compensation in this lawsuit is increased'), 'news');
  assert.equal(inferWatchCategory('Suivre ce procès si les dommages-intérêts atteignent 2 milliards €'), 'news');
});

test('genuine price thresholds remain Price Watches', () => {
  assert.equal(inferWatchCategory('Notify me if Johnson & Johnson shares fall below $100'), 'price');
  assert.equal(inferWatchCategory('Notify me when this flight costs less than €200'), 'price');
  assert.equal(inferWatchCategory('Alertez-moi si ce vol coûte moins de 200 €'), 'price');
  assert.equal(inferWatchCategory('Notify me when this product is back in stock'), 'price');
  assert.equal(inferWatchCategory('Monitor this airfare'), 'price');
  assert.equal(inferWatchCategory('Monitor the price of this hotel room'), 'price');
  assert.equal(inferWatchCategory('Notify me when this product goes on sale'), 'price');
  assert.equal(inferWatchCategory('Alertez-moi lorsque le prix de ce vol augmente'), 'price');
  assert.equal(
    inferWatchCategory('Notify me if J&J shares fall below $100 after the lawsuit ruling'),
    'price',
  );
});

test('isolated monetary and commercial words do not dominate the monitored intent', () => {
  ['$', '€', 'Amazon', 'claim', 'damages', 'award', 'fine', 'cost', 'value'].forEach((word) => {
    assert.equal(inferWatchCategory(`Monitor ${word}`), 'general', word);
  });
  assert.equal(inferWatchCategory('Amazon announces a new executive'), 'general');
  assert.equal(inferWatchCategory('A court awards billions in alleged damages'), 'news');
  assert.equal(inferWatchCategory('A court case about disputed airline fares'), 'news');
});

test('explicit English and French media-mention Watches use the News category', () => {
  assert.equal(
    inferWatchCategory('Tell me when Elon Musk is mentioned in the media.'),
    'news',
  );
  assert.equal(
    inferWatchCategory('Dis-moi quand Bernard Arnault est mentionné dans les médias.'),
    'news',
  );
  assert.equal(inferWatchCategory('Monitor social media analytics'), 'general');
});

test('normalizes supported English and French category labels', () => {
  assert.equal(normalizeWatchCategory('Price'), 'price');
  assert.equal(normalizeWatchCategory('Prix'), 'price');
  assert.equal(normalizeWatchCategory('Actualités'), 'news');
  assert.equal(normalizeWatchCategory('Événements'), 'events');
  assert.equal(normalizeWatchCategory('Immobilier'), 'property');
});

test('Watch Detail pending copy follows the normalized stored category', () => {
  assert.equal(getCategoryPendingSituationKey('news'), 'watchData.pendingSituations.news');
  assert.equal(getCategoryPendingSituationKey('Actualité'), 'watchData.pendingSituations.news');
  assert.equal(getCategoryPendingSituationKey('price'), 'watchData.pendingSituations.price');
});
