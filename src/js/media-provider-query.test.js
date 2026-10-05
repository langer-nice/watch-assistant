import test from 'node:test';
import assert from 'node:assert/strict';
import { planMediaQuery, validateMediaQuery } from './media-provider-query.js';
import { matchFeedItemToMediaMention } from './watch-monitoring.js';
import { discoverTextMonitoringSource } from '../../server/monitoring-source-api.js';
const french = 'Dis-moi quand Ed Sheeran est mentionné dans les médias';
const legacy = 'https://news.google.com/rss/search?q=Dis-moi+quand+Ed+Sheeran+est+mentionné+dans+le+média&hl=fr&gl=FR&ceid=FR:fr';
test('original, singular and English instructions produce focused coherent queries', () => {
 for (const request of [french, french.replace('les médias','le média'),'Tell me when Ed Sheeran is mentioned in the media']) {
  const p=planMediaQuery(request,{sourceUrl:legacy});
  assert.equal(p.monitoringSource.query,'Ed Sheeran');
  assert.equal(new URL(p.monitoringSource.url).searchParams.get('ceid'),'FR:fr');
  validateMediaQuery({inputType:'text',request,mediaMention:p.mediaMention},p.monitoringSource);
 }
 assert.throws(()=>validateMediaQuery({inputType:'text',request:french,mediaMention:{subjects:['Ed Sheeran'],matchMode:'all'}},{url:legacy,query:'Dis-moi quand Ed Sheeran est mentionné dans le média'}),{code:'MEDIA_QUERY_REVIEW_REQUIRED'});
});
test('topics, exclusions, multiple subjects and explicit edition survive planning and matching', () => {
 const request='Tell me when Ed Sheeran and Bono are mentioned in the media concerning Ukraine excluding gossip in English in France';
 const p=planMediaQuery(request,{language:'fr'});
 assert.deepEqual(p.mediaMention,{subjects:['Ed Sheeran','Bono'],matchMode:'all',topics:['Ukraine'],exclusions:['gossip'],locale:{country:'FR',language:'en'}});
 assert.equal(p.monitoringSource.query,'"Ed Sheeran" "Bono" "Ukraine" -"gossip"');
 assert.equal(new URL(p.monitoringSource.url).searchParams.get('ceid'),'FR:en');
 for(const [title,expected] of [['Ed Sheeran and Bono discuss Ukraine',true],['Ed Sheeran and Bono tour',false],['Ed Sheeran and Bono Ukraine gossip',false],['Ed Sheeran Ukraine',false]]) assert.equal(matchFeedItemToMediaMention({title},p.mediaMention).matched,expected);
 const fr=planMediaQuery(french+' concernant Ukraine sauf rumeurs en français en France');
 assert.equal(fr.monitoringSource.query,'Ed Sheeran "Ukraine" -"rumeurs"');
});
test('unsafe or unsupported intent never becomes a conversational or silently broader query', async () => {
 for (const request of ['Tell me when something important happens in AI','Tell me when Ed Sheeran is mentioned in the media only in Spanish','Monitor news about Ed Sheeran without politics','Tell me when Ed Sheeran or Bono is mentioned in the media']) {
  assert.throws(()=>planMediaQuery(request),{code:'MEDIA_QUERY_REVIEW_REQUIRED'});
  await assert.rejects(discoverTextMonitoringSource({request},{fetchImpl:()=>assert.fail('must not retrieve')}),{code:'MEDIA_QUERY_REVIEW_REQUIRED'});
 }
});
test('encoding and persisted JSONB ordering cannot corrupt a query', () => {
 const request='Tell me when AC/DC & Co is mentioned in the media';
 const p=planMediaQuery(request);
 assert.equal(new URL(p.monitoringSource.url).searchParams.get('q'),'AC/DC & Co');
 validateMediaQuery({inputType:'text',request,mediaMention:{matchMode:'all',subjects:p.mediaMention.subjects}},p.monitoringSource);
 assert.throws(()=>validateMediaQuery({inputType:'text',request,mediaMention:p.mediaMention},{...p.monitoringSource,url:p.monitoringSource.url+'&q=other'}),{code:'MEDIA_QUERY_REVIEW_REQUIRED'});
});
