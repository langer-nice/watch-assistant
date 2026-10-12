import assert from 'node:assert/strict';
import test from 'node:test';
import { definitions } from './test-support/watch-definition-fixtures.js';
import { structuredMonitoringSource } from '../src/js/watch-definition.js';
import { createWatchCheckController } from '../src/js/watch-monitoring.js';
import { createMediaWatchMiddleware } from './media-watch-api.js';
import { createMediaWatchCheckMiddleware } from './media-watch-check-api.js';
import { runMediaMonitoring } from './media-monitoring-cron.js';
import { runCompanyMonitoring } from './company-monitoring-cron.js';

const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const rowFor = definition => ({ id, user_id: 'owner', type: definition.plan.domain === 'official_company' ? 'company_bodacc' : 'media_news',
  title: 'Fixture', siren: definition.plan.criteria.siren, watch_definition: definition,
  monitoring_source: structuredMonitoringSource(definition.plan.criteria), media_revision: 1,
  monitoring_state: 'monitoring', current_status: 'watching', deleted_at: null });
const clientFor = (row, calls = []) => ({
  from() {
    const filters = [];
    const builder = { select() { return builder; }, eq(key, value) { filters.push([key,value]); return builder; },
      is(key,value) { filters.push([key,value]); return builder; }, order() { return builder; },
      async range(start) { return { data: start === 0 && filters.every(([key,value]) => row[key] === value) ? [row] : [], error: null }; } };
    return builder;
  }, async rpc(name) { calls.push(name); return { data: false, error: null }; },
});
const invoke = async (handler, request) => {
  let payload;
  const response = { setHeader() {}, end(body) { payload = JSON.parse(body); } };
  await handler(request,response);
  return { status: response.statusCode, payload };
};
test('existing persistence endpoint rejects structured definitions before any database write', async () => {
  const definition = definitions()[0];
  const middleware = createMediaWatchMiddleware({ authenticate: async () => ({ user: { id:'owner' }, client: { rpc() { throw Error('unexpected write'); } } }) });
  const result = await invoke(middleware, { method:'POST', url:'/api/media-watches', body:{ revision:0, mutation:id, deleted:false,
    definition:{ id,title:'Fixture',watch_definition:definition,monitoring_source:structuredMonitoringSource(definition.plan.criteria),monitoring_state:'paused' } } });
  assert.equal(result.status,409);
  assert.equal(result.payload.code,'STRUCTURED_PERSISTENCE_DISABLED');
});
test('manual browser and server checks reject explicit versions before providers or completion RPCs', async () => {
  for (const definition of [definitions()[0], {...definitions()[0],definitionVersion:'future'}]) {
    const row = rowFor(definition);
    const forbidden = () => { throw Error('unexpected monitoring'); };
    const controller = createWatchCheckController({ getWatch: () => ({...definition,id}), saveWatch: () => ({}),
      requestCheck: forbidden, requestCurrency: forbidden, requestCompany: forbidden, checkStoredWatch: forbidden });
    await assert.rejects(controller.check(id), { code:'STRUCTURED_EXECUTION_DISABLED' });
    const middleware = createMediaWatchCheckMiddleware({ authenticate: async () => ({ user:{id:'owner'},client:clientFor(row) }),
      fetchFeed:forbidden,fetchCurrency:forbidden,serviceClient:{rpc:forbidden} });
    const result = await invoke(middleware,{method:'POST',url:'/api/media-watches?action=check',body:{id,revision:1}});
    assert.equal(result.payload.code,'STRUCTURED_EXECUTION_DISABLED');
  }
});
test('mock scheduled paths skip structured rows without fetching or completing checks', async () => {
  const forbidden = () => { throw Error('unexpected monitoring'); };
  const calls = [];
  const media = await runMediaMonitoring({client:clientFor(rowFor(definitions()[0]),calls),env:{},fetchFeed:forbidden,fetchCurrency:forbidden,
    notificationProcessor:async () => ({status:'disabled'})});
  assert.equal(media.skippedCount,1);
  const company = await runCompanyMonitoring({client:clientFor(rowFor(definitions().at(-1)),calls),env:{},fetchCompany:forbidden,
    notificationProcessor:async () => ({status:'disabled'})});
  assert.equal(company.skippedCount,1);
  assert.equal(calls.some(name => /complete_|claim_|fail_/.test(name)),false);
});
