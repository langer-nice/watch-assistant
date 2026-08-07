import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPage,
  isStoryPageType,
  PAGE_TYPES,
  requiresNonArticleClarification,
} from './page-classification.js';

test('classifies publisher homepages, sections, categories, searches and articles deterministically', () => {
  const cases = [
    ['https://www.bbc.com/', PAGE_TYPES.HOMEPAGE],
    ['https://www.bbc.com/news/articles/cp309ng0xq1o', PAGE_TYPES.ARTICLE],
    ['https://www.bbc.com/news', PAGE_TYPES.NEWS_SECTION],
    ['https://www.bbc.com/sport', PAGE_TYPES.CATEGORY_PAGE],
    ['https://www.bbc.com/search?q=Michigan', PAGE_TYPES.SEARCH_PAGE],
    ['https://www.reuters.com/world/us/example-2026-08-06/', PAGE_TYPES.ARTICLE],
    ['https://edition.cnn.com/', PAGE_TYPES.HOMEPAGE],
    ['https://edition.cnn.com/world', PAGE_TYPES.CATEGORY_PAGE],
    ['https://edition.cnn.com/sport', PAGE_TYPES.CATEGORY_PAGE],
    ['https://www.lemonde.fr/', PAGE_TYPES.HOMEPAGE],
    ['https://www.reuters.com/', PAGE_TYPES.HOMEPAGE],
    ['https://www.franceinfo.fr/', PAGE_TYPES.HOMEPAGE],
  ];

  for (const [sourceUrl, expected] of cases) {
    assert.equal(classifyPage({ sourceUrl }), expected, sourceUrl);
  }
});

test('only broad news navigation pages use advisory clarification', () => {
  for (const pageType of [
    PAGE_TYPES.HOMEPAGE,
    PAGE_TYPES.NEWS_SECTION,
    PAGE_TYPES.CATEGORY_PAGE,
    PAGE_TYPES.SEARCH_PAGE,
  ]) {
    assert.equal(requiresNonArticleClarification(pageType), true, pageType);
  }
  for (const pageType of [
    PAGE_TYPES.ARTICLE,
    PAGE_TYPES.LIVE_PAGE,
    PAGE_TYPES.RSS_FEED,
    PAGE_TYPES.GENERIC_WEBPAGE,
  ]) {
    assert.equal(requiresNonArticleClarification(pageType), false, pageType);
  }
});

test('uses structured article signals and keeps navigation-heavy pages outside Story analysis', () => {
  assert.equal(classifyPage({
    sourceUrl: 'https://news.example.com/report',
    openGraphType: 'article',
  }), PAGE_TYPES.ARTICLE);
  assert.equal(classifyPage({
    sourceUrl: 'https://news.example.com/live/election',
    jsonLdTypes: ['LiveBlogPosting'],
  }), PAGE_TYPES.LIVE_PAGE);
  assert.equal(classifyPage({
    sourceUrl: 'https://news.example.com/topics/europe',
    headlineCount: 12,
    navigationLinkCount: 18,
    articleBodyCount: 8,
  }), PAGE_TYPES.CATEGORY_PAGE);
  assert.equal(classifyPage({
    sourceUrl: 'https://news.example.com/rss/news.xml',
  }), PAGE_TYPES.RSS_FEED);
  assert.equal(classifyPage({
    sourceUrl: 'https://example.com/about',
  }), PAGE_TYPES.GENERIC_WEBPAGE);

  assert.equal(isStoryPageType(PAGE_TYPES.ARTICLE), true);
  assert.equal(isStoryPageType(PAGE_TYPES.LIVE_PAGE), true);
  assert.equal(isStoryPageType(PAGE_TYPES.HOMEPAGE), false);
});
