import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  COMPANY_EDIT_PLAN_OUTCOMES,
  createExistingCompanyEditAnalysis,
  getCompanyEditPlanOutcome,
  getPreservedCompanyEditChanges,
  isSameCompanyEditAnalysis,
} from './company-watch-edit.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const SIREN = '552005969';
const OTHER_SIREN = '905266524';
const source = {
  type: 'bodacc',
  provider: 'dila',
  siren: SIREN,
  title: 'BODACC',
  discovery: 'official-company',
};
const createWatch = () => ({
  id: 'company-watch',
  createdAt: '2026-08-01T08:00:00.000Z',
  request: `Monitor company ${SIREN}`,
  title: 'EXAMPLE COMPANY',
  inputType: 'company',
  company: {
    siren: SIREN,
    name: 'EXAMPLE COMPANY',
    administrativeStatus: 'active',
    status: 'judicial_liquidation',
  },
  monitoringSource: source,
  monitoringState: 'active',
  monitoringSnapshot: { itemIds: ['BASELINE'], checkedAt: '2026-08-01T09:00:00.000Z' },
  seenMonitoringItemIds: ['BASELINE', 'UPDATE'],
  monitoringUpdates: [{ id: 'CANDIDATE' }],
  updates: [{ id: 'UPDATE' }],
  lastChecked: '2026-08-02T09:00:00.000Z',
  firstCheckCompletedAt: '2026-08-01T09:00:00.000Z',
  timeline: [{ type: 'created', date: '2026-08-01T08:00:00.000Z' }],
  monitoringSummary: `Monitoring official BODACC publications for SIREN ${SIREN}.`,
  keywords: [],
  storyFingerprint: [],
});

test('same-SIREN Company edits reuse the existing Company analysis without mutation', () => {
  const watch = createWatch();
  const original = structuredClone(watch);
  const plan = { strategy: 'official_company', connector: 'bodacc', identifier: SIREN };

  assert.equal(getCompanyEditPlanOutcome(watch, plan), COMPANY_EDIT_PLAN_OUTCOMES.SAME_COMPANY);
  const analysis = createExistingCompanyEditAnalysis(watch);
  assert.equal(isSameCompanyEditAnalysis(watch, analysis), true);
  assert.deepEqual(analysis.company, watch.company);
  assert.deepEqual(analysis.monitoringSource, source);
  assert.equal(analysis.title, watch.title);
  assert.deepEqual(watch, original);
});

test('preserved Company edit changes keep identity, BODACC source, baseline, and history', () => {
  const watch = createWatch();
  const analysis = createExistingCompanyEditAnalysis(watch);
  const edited = {
    ...watch,
    request: `Watch ${SIREN}`,
    inputType: 'company',
    monitoringSource: null,
    company: { siren: SIREN, name: null, status: 'unknown' },
    ...getPreservedCompanyEditChanges(watch, analysis),
  };

  for (const key of [
    'id', 'createdAt', 'title', 'company', 'monitoringSource', 'monitoringState',
    'monitoringSnapshot', 'seenMonitoringItemIds', 'monitoringUpdates', 'updates',
    'lastChecked', 'firstCheckCompletedAt', 'timeline',
  ]) {
    assert.deepEqual(edited[key], watch[key], key);
  }
  assert.equal(edited.request, `Watch ${SIREN}`);
});

test('a different SIREN is rejected and cannot alter the original Company Watch', () => {
  const watch = createWatch();
  const original = structuredClone(watch);
  const plan = { strategy: 'official_company', connector: 'bodacc', identifier: OTHER_SIREN };

  assert.equal(
    getCompanyEditPlanOutcome(watch, plan),
    COMPANY_EDIT_PLAN_OUTCOMES.DIFFERENT_COMPANY,
  );
  assert.deepEqual(watch, original);
});

test('a previously corrupted Company edit recovers only its canonical BODACC source', () => {
  const watch = { ...createWatch(), monitoringSource: null };
  const analysis = createExistingCompanyEditAnalysis(watch);
  const changes = getPreservedCompanyEditChanges(watch, analysis);

  assert.deepEqual(changes.monitoringSource, source);
  assert.deepEqual(changes.company, watch.company);
  assert.deepEqual(watch.monitoringSource, null);
});

test('navigation keeps the Planner in front of Company edits and updates the existing ID once', async () => {
  const navigation = await read('./navigation.js');
  const submitFlow = navigation.match(
    /form\.addEventListener\('submit',[\s\S]*?clarificationActions\?\.addEventListener/,
  )?.[0] || '';
  const updateFlow = navigation.match(
    /const completeWatchUpdate = async \([\s\S]*?const getCreateOptions/,
  )?.[0] || '';

  assert.match(
    submitFlow,
    /requestWatchPlan\(request\)[\s\S]*?getCompanyEditPlanOutcome\(editingWatch, companyPlan\)/,
  );
  assert.match(
    submitFlow,
    /SAME_COMPANY[\s\S]*?completeWatchUpdate\([\s\S]*?createExistingCompanyEditAnalysis\(editingWatch\)/,
  );
  assert.match(submitFlow, /DIFFERENT_COMPANY[\s\S]*?companyEditDifferentSiren[\s\S]*?return/);
  assert.match(updateFlow, /getPreservedCompanyEditChanges\(editingWatch, urlAnalysis\)/);
  assert.match(updateFlow, /updateWatch\(editingWatch\.id, changes\)/);
  assert.equal((updateFlow.match(/updateWatch\(editingWatch\.id, changes\)/g) || []).length, 1);
  assert.doesNotMatch(updateFlow, /addWatch|crypto\.randomUUID/);
});
