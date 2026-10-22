import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {renderUpdateHistory} from './update-history-presentation.js';
const copies=Object.fromEntries(await Promise.all(['en','fr'].map(async l=>[l,JSON.parse(await readFile(new URL('../locales/'+l+'.json',import.meta.url),'utf8'))])));
const items=[
 {id:'old',timestamp:'2026-10-21T09:00:00Z',title:'Older article',url:'https://example.test/old'},
 {id:'tie-a',timestamp:'2026-10-22T09:20:00Z',publishedAt:'2026-10-20T09:00:00Z',title:'Original headline A',source:'Goal.com',url:'https://example.test/a',summary:'Original summary'},
 {id:'tie-b',timestamp:'2026-10-22T09:20:00Z',title:'Original headline B',source:'Football365',url:'https://example.test/b'},
 {id:'earlier',timestamp:'2026-10-22T09:11:00Z',title:'Earlier detection',url:'https://example.test/c'},
 {id:'unknown',timestamp:'',title:'Undated article',url:'https://example.test/d'}];
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
for(const language of ['en','fr'])test('history dates, stable detection order, links and originals '+language,()=>{
 const before=structuredClone(items),t=(key,values={})=>Object.entries(values).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',v),key.split('.').reduce((v,k)=>v[k],copies[language]));
 const html=renderUpdateHistory({items,language,t,escapeHtml,formatTimestamp:value=>value}),{document}=parseHTML('<ul>'+html+'</ul>');
 assert.deepEqual([...document.querySelectorAll('.monitoring-update')].map(e=>e.id),['tie-a','tie-b','earlier','old','unknown'].map(id=>'watch-check-update-'+id));
 assert.equal(document.querySelectorAll('.history-day').length,3);
 assert.match(document.querySelector('h3').textContent,language==='fr'?/jeudi 22 octobre 2026/:/Thursday, 22 October 2026/);
 const locale=language==='fr'?'fr-FR':'en-GB';assert.equal(document.querySelector('time').textContent,new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(items[1].timestamp)));
 assert.deepEqual([...document.querySelectorAll('a')].map(e=>e.href),[items[1],items[2],items[3],items[0],items[4]].map(i=>i.url));
 assert.equal(document.querySelector('h4').textContent,'Original headline A');assert(html.includes('Original summary'));assert.match(document.querySelector('.history-update__time').title,language==='fr'?/Publié/:/Published/);assert.deepEqual(items,before);
});

// Exercise only the new union, including URL fallback and unique lifecycle events.
for(const language of ['en','fr'])test('combined history retains unique events, creation and source metadata '+language,async()=>{
 const {mergeHistoryItems}=await import('./update-history-presentation.js');
 const updates=[{id:'article-a',articleId:'article-a',timestamp:'2026-10-22T22:20:00Z',publishedAt:'2026-10-20T08:00:00Z',event:false,title:'Original headline',url:'https://example.test/a'}];
 const events=[
  {id:'overlap',articleId:'article-a',title:'Original headline',timestamp:'2026-10-20T08:00:00Z',summary:'Existing excerpt',source:'Goal.com',url:'https://example.test/a'},
  {id:'url-overlap',title:'Original headline',url:'https://example.test/a'},
  {id:'unique',eventId:'unique',event:true,title:'Original headline',timestamp:'2026-10-22T21:11:00Z',url:'https://example.test/unique'},
  {id:'created',eventId:'watch-created',event:true,title:copies[language].watchData.created,timestamp:'2026-10-01T08:00:00Z'},
  {id:'undated',eventId:'undated',event:true,title:'Historical event without time',dateLabel:'Existing historical label'}];
 const before=structuredClone({updates,events}),merged=mergeHistoryItems(updates,events);
 assert.equal(merged.length,4);assert.equal(merged[0].summary,'Existing excerpt');assert.equal(merged[0].source,'Goal.com');assert.equal(merged[0].timestamp,updates[0].timestamp);
 const t=(key,values={})=>Object.entries(values).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',v),key.split('.').reduce((v,k)=>v[k],copies[language]));
 const {document}=parseHTML('<ul>'+renderUpdateHistory({items:merged,language,t,escapeHtml,formatTimestamp:v=>v,timeZone:'Europe/Paris'})+'</ul>');
 assert.deepEqual([...document.querySelectorAll('h4')].map(e=>e.textContent),['Original headline','Original headline',copies[language].watchData.created,'Historical event without time']);
 assert.equal(document.querySelectorAll('a[href="https://example.test/a"]').length,1);assert(document.querySelector('a[href="https://example.test/unique"]'));
 assert.match(document.querySelector('h3').textContent,language==='fr'?/vendredi 23 octobre 2026/:/Friday, 23 October 2026/);
 assert.equal(document.querySelector('time').textContent,'00:20');assert.equal(document.querySelector('time').getAttribute('datetime'),updates[0].timestamp);
 assert.equal(document.querySelector('.monitoring-update__title').nextElementSibling.textContent,'Existing excerpt');assert(document.querySelector('ul').textContent.includes('Existing historical label'));
 assert.deepEqual({updates,events},before);
});
test('combined history has one section and preserves existing update anchor identities',async()=>{
 const html=await readFile(new URL('../../watch-detail.html',import.meta.url),'utf8'),{document}=parseHTML(html);
 assert.equal(document.querySelectorAll('#watchTimelineSection').length,0);
 assert.equal(document.querySelectorAll('#watchMonitoringUpdates').length,1);
 assert.equal(document.getElementById('watchMonitoringUpdatesTitle').getAttribute('data-i18n'),'detail.history');
 const overview=await readFile(new URL('./watch-detail-overview.js',import.meta.url),'utf8');assert(overview.includes("link.href='#watchMonitoringUpdates'"));
});
