import test from 'node:test';
import assert from 'node:assert/strict';
import { watchCreationState, creationConfirmationKey } from './watch-creation-state.js';
import { selectHomeReport } from './home-report.js';
import { isSupabaseEndpoint } from './supabase-endpoint.js';
import { getSupabaseBrowserConfig } from './supabase-client.js';
for(const availability of ['unsupported','local-only','pending','failed','conflict','loading','incompatible']) test(`creation never announces activation for ${availability}`,()=>{
 const watch={id:'a',title:'Test',status:'watching',monitoringState:'monitoring',monitoringAvailability:availability};
 assert.equal(watchCreationState(watch),'local');assert.equal(creationConfirmationKey(watch),'detail.savedLocallyCopy');
 assert.equal(selectHomeReport({watches:[watch]}).statusById.get('a'),'attention');
});
for(const state of ['failed','pending','active']) test(`saved Watch reports ${state} independently of persistence`,()=>{
 const watch={id:'a',title:'Test',status:'watching',monitoringAvailability:'saved',monitoringState:state==='pending'?'preparing':'monitoring',lastCheckAttempt:state==='failed'?{status:'failed'}:{status:'succeeded'}};
 assert.equal(watchCreationState(watch),state);
 if(state!=='active')assert.equal(selectHomeReport({watches:[watch]}).statusById.get('a'),'attention');
});
test('local Auth opt-in cannot authorize insecure remote or deployed endpoints',()=>{
 assert.equal(isSupabaseEndpoint('http://127.0.0.1:54321',true),true);
 for(const url of ['http://example.com','http://127.0.0.1.example.com','http://user:secret@127.0.0.1'])assert.equal(isSupabaseEndpoint(url,true),false);
 const env={VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_ANON_KEY:'local',VITE_SUPABASE_LOCAL_TEST:'true',DEV:true};
 assert.equal(getSupabaseBrowserConfig(env).enabled,true);
 for(const override of [{DEV:false},{VITE_VERCEL_ENV:'preview'},{VITE_VERCEL_ENV:'production'}])assert.equal(getSupabaseBrowserConfig({...env,...override}).enabled,false);
});
