import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseUrl,createSourceDerivedFallback} from './url-analysis.js';
import {resolveUrlMonitoringSource} from './watch-source-discovery.js';
const url='https://www.lemonde.fr/societe/article/2026/10/18/a-limoges-la-colere-et-la-sideration-apres-l-incendie-qui-a-ravage-l-hotel-de-ville_6797159_3224.html';
const title='A limoges la colere et la sideration apres l’incendie qui a ravage l hotel de ville';
test('observed title-only URL retains the fire, city hall and location through review, profile and actual source query without AI',async()=>{
 const originalFetch=globalThis.fetch,originalDocument=globalThis.document;const calls=[];
 globalThis.document={documentElement:{lang:'fr'}};
 globalThis.fetch=async path=>{calls.push(path);assert.equal(path,'/api/page-title');return Response.json({title,sourceUrl:url,siteName:'Le Monde',pageType:'news_article',contentAccessLimited:true});};
 try{
  const analysis=await analyseUrl(url);assert.deepEqual(analysis.storyProfile.locations,['Limoges']);
  assert.ok(analysis.storyProfile.concepts.some(c=>c.type==='location'&&c.label==='Limoges'));assert.ok(analysis.storyProfile.concepts.some(c=>c.type==='event'&&/incendie.*hôtel de ville/iu.test(c.label)));
  assert.match(analysis.monitoringScope,/Limoges/);assert.match(analysis.monitoringScope,/incendie.*hôtel de ville/iu);
  const resolved=await resolveUrlMonitoringSource(analysis,{fetchImpl:async(path,options)=>{
   assert.equal(path,'/api/monitoring-source');const body=JSON.parse(options.body);assert.equal(body.storyDiscovery,true);assert.equal(body.request,'"Limoges" incendie "hôtel de ville"');
   const feed=new URL('https://news.google.com/rss/search');feed.searchParams.set('q',body.request);return Response.json({monitoringSource:{type:'rss',url:feed.href,query:body.request,discovery:'news-search'}});
  }});
  assert.equal(new URL(resolved.monitoringSource.url).searchParams.get('q'),'"Limoges" incendie "hôtel de ville"');assert.equal(resolved.monitoringSource.query,analysis.monitoringQuery);assert.equal(calls.length,1);
 }finally{globalThis.fetch=originalFetch;if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
});
test('the same rule retains another explicitly named place and event without article-specific hardcoding',()=>{
 const other='https://example.test/a-bayonne-la-colere-apres-l-incendie-de-la-mairie';
 const result=createSourceDerivedFallback({title:'A bayonne la colère après l’incendie de la mairie',contentAccessLimited:true},other);
 assert.deepEqual(result.storyProfile.locations,['Bayonne']);assert.ok(result.storyFingerprint.some(c=>/incendie.*mairie/iu.test(c.label)));assert.equal(result.storyFingerprint.some(c=>c.label==='Limoges'),false);
});
