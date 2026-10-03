import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { parseMediaMentionRequest, getMediaMentionConcepts } from './media-mention-request.js';
import { mediaMentionSearchQuery } from './media-subject-aliases.js';
import { inferWatchCategory } from './watch-category.js';
import { isMediaWatch, mediaWatchDefinition } from './media-watch-definition.js';
import { discoverTextMonitoringSource } from '../../server/monitoring-source-api.js';
import { fetchAndNormalizeFeed } from '../../server/check-watch-api.js';
import { createWatchCheckController, matchFeedItemToMediaMention, MonitoringCheckError } from './watch-monitoring.js';
register('./test-support/json-module-loader.js', import.meta.url);
const { createWatchObject } = await import('./navigation.js');

const original = 'Monitoring there is new information about Royal Caribbean Cruises.';
const reformulated = 'Monitor for new information about Royal Caribbean Cruises';
const query = '("Royal Caribbean Cruises" OR "Royal Caribbean Group")';
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const article = (id, title, publishedAt) => ({ id, title, excerpt: title, publishedAt,
  url: `https://publisher.example/${id}`, source: 'Fixture News' });
const old = article('agreement', 'Royal Caribbean Group and Sandals Resorts announce partnership', '2026-09-23T09:00:00Z');
// Synthetic post-baseline development, not a claim that this event happened.
const fresh = article('future', 'Royal Caribbean Group announces a new development', '2026-10-03T15:00:00Z');
const unrelated = article('other', 'Carnival announces Caribbean cruises', '2026-10-03T15:00:00Z');
const xml = (items) => `<rss><channel><title>Fixture news</title>${items.map(item => `<item><guid>${item.id}</guid><title>${item.title}</title><link>${item.url}</link><pubDate>${item.publishedAt}</pubDate><description>${item.excerpt}</description></item>`).join('')}</channel></rss>`;
const source = { type: 'rss', discovery: 'news-search', query, url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en` };
const create = (request = reformulated) => createWatchObject(request, '', null, {
  monitoringSource: source, storyFingerprint: getMediaMentionConcepts(request),
});

test('original and reformulated news requests extract the subject and persist as media Watches', async () => {
  for (const request of [original, reformulated, 'Monitor news about Royal Caribbean Group', 'Monitor news about Royal Caribbean Cruises Ltd.', 'Surveille les nouvelles informations sur Royal Caribbean Cruises.']) {
    const parsed = parseMediaMentionRequest(request);
    assert.equal(parsed.recognized, true);
    assert.equal(inferWatchCategory(request), 'news');
    assert.equal(mediaMentionSearchQuery(parsed), query);
    const watch = create(request);
    assert.equal(watch.request, request);
    assert.equal(isMediaWatch(watch), true);
    assert.equal(mediaWatchDefinition(watch).watch_definition.mediaMention.matchMode, 'all');
    const urls = [];
    const discovered = await discoverTextMonitoringSource({ request }, {
      lookup: publicLookup,
      fetchImpl: async url => { urls.push(new URL(url)); return new Response(xml([old])); },
    });
    assert.equal(urls.length, 1);
    assert.equal(urls[0].searchParams.get('q'), query);
    assert.equal(discovered.monitoringSource.query, query);
  }
});

test('corporate aliases match in either direction without conflating brands or cruise news', () => {
  for (const subject of ['Royal Caribbean Cruises', 'Royal Caribbean Cruises Ltd.', 'Royal Caribbean Group']) {
    const definition = { subjects: [subject], matchMode: 'all' };
    for (const title of ['Royal Caribbean Group announces partnership', 'Royal Caribbean Cruises Ltd. files report']) {
      assert.equal(matchFeedItemToMediaMention({ title }, definition).matched, true);
    }
    for (const title of [unrelated.title, 'Celebrity Cruises introduces ship', 'Silversea announces itinerary', 'Royal Caribbean International announces voyage']) {
      assert.equal(matchFeedItemToMediaMention({ title }, definition).matched, false);
    }
  }
  assert.equal(matchFeedItemToMediaMention(old, {subjects:['Royal Caribbean International'],matchMode:'all'}).matched, false);
  assert.equal(matchFeedItemToMediaMention(old, {subjects:['Royal Caribbean Cruises','Tesla'],matchMode:'all'}).matched, false);
  assert.equal(mediaMentionSearchQuery(parseMediaMentionRequest('Tell me when Royal Caribbean Group and Tesla are mentioned in the media.')), `${query} "Tesla"`);
});

test('historical first results establish baseline; subsequent relevant articles alert once', async () => {
  let watch = create();
  let items = [old];
  let checkedAt = '2026-10-03T14:40:00Z';
  const controller = createWatchCheckController({getWatch: () => watch,
    saveWatch: (_id, changes) => (watch = {...watch, ...changes}),
    requestCheck: async () => ({checkedAt, items}),
  });
  const baseline = await controller.check(watch.id);
  assert.equal(baseline.outcome, 'baseline');
  assert.equal(baseline.changes.lastCheckResult.diagnostics.returnedItemCount, 1);
  assert.equal(watch.updates.length, 0);
  checkedAt = '2026-10-03T16:00:00Z'; items = [fresh, old, unrelated];
  const next = await controller.check(watch.id);
  assert.deepEqual(next.matchedItems.map(item => item.id), ['future']);
  assert.equal(next.changes.lastCheckResult.diagnostics.unseenItemCount, 2);
  assert.equal(watch.updates.length, 1);
  assert.equal((await controller.check(watch.id)).outcome, 'no-new-items');
  assert.equal(watch.updates.length, 1);
});

test('unrelated new articles are distinguished from an unchanged feed', async () => {
  let watch = create();
  const controller = createWatchCheckController({getWatch: () => watch,
    saveWatch: (_id, changes) => (watch = {...watch, ...changes}),
    requestCheck: async () => ({checkedAt:'2026-10-03T16:00:00Z',items:watch.monitoringSnapshot ? [old,unrelated] : [old]}),
  });
  await controller.check(watch.id);
  assert.equal((await controller.check(watch.id)).outcome, 'no-matching-items');
  assert.equal(watch.updates.length, 0);
});

test('failed or truncated provider responses preserve the last successful reference', async () => {
  for (const failure of ['timeout','truncated','invalid-response']) {
    let watch = create(); let fail = false;
    const controller = createWatchCheckController({getWatch: () => watch,
      saveWatch: (_id, changes) => (watch = {...watch, ...changes}),
      requestCheck: async () => {
        if (!fail) return {checkedAt:'2026-10-03T14:40:00Z',items:[old]};
        if (failure === 'timeout') throw new MonitoringCheckError('FETCH_TIMEOUT','Fixture timeout');
        if (failure === 'invalid-response') return {checkedAt:'2026-10-03T16:00:00Z'};
        return fetchAndNormalizeFeed(source.url, {lookup:publicLookup,fetchImpl:async()=>new Response('<rss><channel><item>')});
      },
    });
    await controller.check(watch.id);
    const snapshot = structuredClone(watch.monitoringSnapshot);
    fail = true;
    await assert.rejects(controller.check(watch.id));
    assert.deepEqual(watch.monitoringSnapshot, snapshot);
    assert.equal(watch.lastChecked, snapshot.checkedAt);
    assert.equal(watch.lastCheckAttempt.status, 'failed');
    assert.equal(watch.updates.length, 0);
  }
});


test('authenticated check tolerates persistence normalization but rejects changed matching criteria', async () => {
  for (const changed of [false,true]) {
    let watch={...create(),storyProfile:{concepts:[{label:'Royal Caribbean Group',type:'organization',displayOnly:'local'}],userAddedConcepts:[]}};
    const controller=createWatchCheckController({getWatch:()=>watch,saveWatch:(_id,changes)=>(watch={...watch,...changes}),
      checkStoredWatch:async()=>{
        watch={...watch,monitoringSource:{type:'feed',url:watch.monitoringSource.url},
          mediaMention:{matchMode:'all',subjects:changed?['Carnival']:watch.mediaMention.subjects},
          storyProfile:{concepts:[{type:'organization',label:'Royal Caribbean Group'}],userAddedConcepts:[]}};
        return {outcome:'baseline',changes:{lastChecked:'2026-10-03T16:00:00Z'}};
      },
    });
    if(changed) await assert.rejects(controller.check(watch.id),error=>error.code==='STALE_CHECK');
    else assert.equal((await controller.check(watch.id)).outcome,'baseline');
  }
});
