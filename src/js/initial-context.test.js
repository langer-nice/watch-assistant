import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { renderInitialContext, initialContextArticles } from './initial-context.js';

const article = {id:'initial',title:'Royal Caribbean Group announces an agreement',url:'https://news.example/agreement',publishedAt:'2026-09-23T09:00:00Z'};
const base = {request:'Monitor news about Royal Caribbean Cruises',inputType:'text',mediaMention:{subjects:['Royal Caribbean Cruises'],matchMode:'all'},monitoringSource:{type:'feed',url:'https://news.example/rss'},initialContext:{checkedAt:'2026-10-03T14:00:00Z',items:[article,{id:'unrelated',title:'Carnival cruise news'}]},updates:[]};
for (const language of ['en','fr']) test(`${language}: initial context, empty, pending, legacy, later updates and failure`, async()=>{
  const messages=JSON.parse(await readFile(new URL(`../locales/${language}.json`,import.meta.url),'utf8'));
  const t=(key,values={})=>key.split('.').reduce((value,part)=>value[part],messages).replace(/\{(\w+)\}/g,(_,key)=>values[key]??'');
  const {document}=parseHTML('<section id="context"></section><section id="updates"></section>');
  const root=document.querySelector('#context');
  const render=watch=>renderInitialContext(root,watch,{t,formatTimestamp:value=>new Intl.DateTimeFormat(language,{dateStyle:'long',timeZone:'UTC'}).format(new Date(value))});
  const watch=structuredClone(base);const before=JSON.stringify(watch);
  render(watch);
  assert.match(root.textContent,/Royal Caribbean Group/);assert.doesNotMatch(root.textContent,/Carnival/);
  assert.ok(root.textContent.includes(messages.detail.initialContextTitle));
  assert.equal(root.querySelectorAll('a').length,1);assert.equal(document.querySelector('#updates').textContent,'');
  assert.equal(JSON.stringify(watch),before,'rendering cannot create unread updates');
  const first=root.innerHTML;const firstLink=root.querySelector('a');
  render({...watch,updates:[{id:'future',sourceTitle:'Later development',status:'new'}],lastCheckAttempt:{status:'failed',code:'TIMEOUT'}});
  assert.equal(root.innerHTML,first,'later updates and failures preserve the initial reference');
  assert.equal(root.querySelector('a'),firstLink,'unchanged context retains the focused link node');
  render({...watch,initialContext:{...watch.initialContext,items:[{id:'other',title:'Carnival'}]}});
  assert.ok(root.textContent.includes(messages.detail.initialContextEmpty));
  render({...watch,initialContext:null});assert.ok(root.textContent.includes(messages.detail.initialContextPending));
  render({...watch,initialContext:null,lastChecked:'2026-10-03T14:00:00Z'});assert.ok(root.textContent.includes(messages.detail.initialContextUnavailable));
  render({...watch,inputType:'company'});assert.equal(root.hidden,true);
  render({...watch,monitoringSource:{type:'currency'}});assert.equal(root.hidden,true);
  render({...watch,initialContext:{items:[{...article,url:'javascript:alert(1)',title:'Royal Caribbean Group <script>alert(1)</script>'}],checkedAt:base.initialContext.checkedAt}});
  assert.equal(root.querySelector('a'),null);assert.equal(root.querySelector('script'),null);
});
test('initial context tolerates malformed local records and deduplicates retained articles',()=>{
  assert.deepEqual(initialContextArticles({...base,initialContext:{items:{}}}),[]);
  assert.deepEqual(initialContextArticles({...base,initialContext:{items:[null,article,article]}}),[article]);
});
