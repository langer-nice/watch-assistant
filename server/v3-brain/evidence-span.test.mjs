import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { resolveEvidenceBasis } from './evidence-basis.mjs';
import { createJudgment } from './judgment.mjs';
import { judgeConditionEvidence } from '../v3-brain-lab/condition-state/candidate.mjs';
const evidence = { title: '', content: 'Multiple promoters confirmed privately that negotiations are advanced and dates are expected this autumn. Tickets cost 120 euros. Company Alpha has not confirmed ticket sales.' };
const resolve = (quote, source = evidence) => resolveEvidenceBasis(source, { quote });
for (const [name, quote, mode] of [
  ['exact', 'Multiple promoters confirmed', 'EXACT'],
  ['decorative wrapper', '“Multiple promoters confirmed”', 'NORMALIZED_EXACT'],
  ['whitespace', '  Multiple\n promoters   confirmed  ', 'NORMALIZED_EXACT'],
  ['ASCII ellipsis', 'Multiple promoters confirmed ... dates are expected this autumn', 'ELLIPSIS_EXACT_FRAGMENTS'],
  ['Unicode ellipsis', 'Multiple promoters confirmed … dates are expected this autumn', 'ELLIPSIS_EXACT_FRAGMENTS'],
  ['three fragments', 'Multiple promoters confirmed ... negotiations are advanced ... dates are expected this autumn', 'ELLIPSIS_EXACT_FRAGMENTS'],
]) test(name + ' resolves to exact source spans', () => {
  const result = resolve(quote);assert.equal(result.mode, mode);assert.equal(result.original_quote, quote);
  assert.ok(evidence.content.includes(result.value));assert.deepEqual(resolve(result.reference.quote).reference, result.reference);
  for (const [start,end] of result.ranges) assert.ok(evidence.content.slice(start,end).trim());
});
for (const [name, quote] of [
  ['missing fragment','Multiple promoters confirmed ... dates are missing this autumn'],
  ['paraphrased fragment','Several promoters confirmed ... dates are expected this autumn'],
  ['invented word','Multiple promoters officially confirmed ... dates are expected this autumn'],
  ['reordered fragments','dates are expected this autumn ... Multiple promoters confirmed'],
  ['numeric mismatch','Tickets cost 121 euros'],
  ['negation mismatch','Company Alpha has confirmed ticket sales'],
  ['entity mismatch','Company Beta has not confirmed ticket sales'],
  ['trivial fragments','Multiple ... autumn'],
  ['single retained fragment','... Multiple promoters confirmed ...'],
  ['empty',''],['punctuation only','...'],
  ['implicit omission','Multiple promoters confirmed that dates are expected this autumn'],
  ['punctuation edit','Tickets cost 120 euros!'],
]) test(name + ' rejects', () => assert.throws(() => resolve(quote), TypeError));
test('cross-field composition rejects', () => assert.throws(() => resolve('Multiple promoters confirmed ... dates are expected this autumn', { title: 'Multiple promoters confirmed', content: 'dates are expected this autumn' }), TypeError));
test('separate evidence items are not searched', () => assert.throws(() => resolve('Multiple promoters confirmed ... dates are expected this autumn', {title:'',content:'Multiple promoters confirmed',other:{content:'dates are expected this autumn'}}), TypeError));
test('ambiguous fragment occurrences reject', () => assert.throws(() => resolve('Multiple promoters confirmed ... dates are expected this autumn', {title:'',content:evidence.content+' Multiple promoters confirmed yesterday.'}), TypeError));
test('distinct matching field contexts reject', () => assert.throws(() => resolve('Multiple promoters confirmed ... dates are expected this autumn', {title:evidence.content,content:evidence.content+' Different context.'}), /Ambiguous/));
test('overlapping fragments reject', () => assert.throws(() => resolve('Multiple promoters confirmed ... promoters confirmed privately'), TypeError));
test('URL ellipsis reconstruction rejects', () => assert.throws(() => resolve('https://example.com ... tickets/autumn', {title:'',content:'https://example.com/events/tickets/autumn'}), TypeError));
test('source whitespace maps to original offsets and one wrapper only', () => {
 const e={title:'',content:'Multiple\t promoters\nconfirmed privately and dates\nare expected this autumn'};
 const r=resolve('“Multiple promoters confirmed … dates are expected this autumn”',e);
 assert.equal(r.mode,'ELLIPSIS_EXACT_FRAGMENTS');assert.equal(r.value,e.content);
 assert.throws(()=>resolve('““Multiple promoters confirmed … dates are expected this autumn””',e),TypeError);
});
test('source provenance alone cannot substantiate ALERT', () => {
 const raw={action:'ALERT',evidence_status:'CONFIRMED',reason:'New event.',evidence_basis:[{field:'source'}]};
 assert.throws(()=>createJudgment(raw,{...evidence,source:'Publisher'}),/substantive/);
 assert.equal(createJudgment({...raw,evidence_basis:[{quote:'Multiple promoters confirmed'},{field:'source'}]},{...evidence,source:'Publisher'}).action,'ALERT');
});
const read = path => JSON.parse(fs.readFileSync(new URL(path,import.meta.url),'utf8'));
const rows=read('../v3-brain-lab/paraphrase-stability/results/ledger.json');
const cases=read('../v3-brain-lab/paraphrase-stability/paraphrases.json');
const input=cases.find(c=>c.id==='P6').input;
test('P6 implicit omissions and punctuation substitutions remain rejected by contract', async()=> {
 const raw=rows.find(r=>r.key==='paraphrase-P6').raw;
 await assert.rejects(judgeConditionEvidence(input,{model:async()=>structuredClone(raw)}),/exact supplied claim text/);
});
test('S8 historical explicit ellipses admit with unchanged semantics and qualification', async()=> {
 const raw=rows.find(r=>r.key==='stability-S8-r2').raw;
 const result=await judgeConditionEvidence(input,{model:async()=>structuredClone(raw)});
 for(const key of ['action','evidence_status','reason','novelty_summary'])assert.equal(result[key],raw[key]);
 for(const basis of raw.evidence_basis)assert.equal(resolve(basis.quote,input.evidence).mode,'ELLIPSIS_EXACT_FRAGMENTS');
});

test('partial URL fragments cannot evade URL reconstruction rejection', () => assert.throws(() => resolve('example.com … tickets/autumn', {title:'',content:'https://example.com/events/tickets/autumn'}), TypeError));
