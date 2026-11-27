import test from 'node:test';
import assert from 'node:assert/strict';
import {createConditionCheck,guardConditionAction,OUTPUT_SCHEMA} from './candidate.mjs';
const check=value=>createConditionCheck({required_state:'Complete mandatory expression',observed_state:'Frozen observation',condition_satisfied:value});
// Aggregate truth is supplied by the existing semantic contract. These are not a new evaluator.
for(const [name,value] of [
 ['TRUE AND TRUE',true],['TRUE AND FALSE',false],['TRUE AND UNKNOWN',null],
 ['TRUE OR FALSE',true],['TRUE OR UNKNOWN',true],['FALSE OR UNKNOWN',null],
 ['NOT TRUE',false],['NOT FALSE',true],['NOT UNKNOWN',null],
 ['(TRUE OR UNKNOWN) AND TRUE',true],['(TRUE OR FALSE) AND UNKNOWN',null],
 ['mandatory TRUE with optional UNKNOWN preference',true],
 ['IF first path FALSE; ELSE second path TRUE',true],
 ['IF first path FALSE; ELSE second path UNKNOWN',null],
 ['strict numeric boundary unmet',false],['missing total price including baggage',null],
 ['official entry into force unknown',null],['complete temporal transition established',true],
])test(name+' — admit ALERT only for aggregate TRUE',()=>{
 const c=check(value),before=structuredClone(c);
 if(value===true)assert.doesNotThrow(()=>guardConditionAction({action:'ALERT'},c));
 else assert.throws(()=>guardConditionAction({action:'ALERT'},c),TypeError);
 assert.deepEqual(c,before);assert.equal(c.condition_satisfied,value);
});
for(const value of [true,false,null])test('NO_ALERT preserves '+String(value)+' without forcing an alert',()=>{
 const c=check(value);assert.doesNotThrow(()=>guardConditionAction({action:'NO_ALERT'},c));assert.equal(c.condition_satisfied,value);
});
for(const value of [undefined,null])test('no separate condition check preserves legacy '+String(value),()=>{
 const c=createConditionCheck(value);assert.equal(c,undefined);assert.doesNotThrow(()=>guardConditionAction({action:'ALERT'},c));
});
test('unknown and false remain distinguishable failures and unchanged wire states',()=>{
 assert.throws(()=>guardConditionAction({action:'ALERT'},check(false)),/Condition false/);
 assert.throws(()=>guardConditionAction({action:'ALERT'},check(null)),/Condition unknown/);
 assert.deepEqual(OUTPUT_SCHEMA.properties.condition_check.properties.condition_satisfied.type,['boolean','null']);
});
