export const maxDuration=60;
import {authenticateSupabaseRequest} from '../server/supabase-user.js';
import {createSupabaseServiceClient} from '../server/supabase-service.js';
import {PILOT_OWNER,PILOT_SPECS,pilotEnabled,pilotSource,preparePilot,pilotIntentModel,runPilotMonitoring} from '../server/v3-pilot.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(!pilotEnabled(process.env)||req.method!=='POST'){res.statusCode=404;return res.end();}
  const {user}=await authenticateSupabaseRequest(req);if(user.id!==PILOT_OWNER){res.statusCode=403;return res.end();}
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!body||Object.keys(body).join()!=='instruction'||typeof body.instruction!=='string')throw Error('Invalid body');
  const slot=PILOT_SPECS.findIndex(s=>s.instruction===body.instruction);if(slot<0){res.statusCode=200;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({pilot:false}));}
  const client=createSupabaseServiceClient({});
  const existing=await client.from('v3_pilot_watches').select('watch_id').eq('user_id',user.id).eq('slot',slot+1).maybeSingle();if(existing.error)throw Error('Pilot unavailable');
  let id=existing.data?.watch_id;
  if(!id){const prepared=await preparePilot(body.instruction,{model:pilotIntentModel(process.env)});const saved=await client.rpc('create_v3_pilot',{p_slot:slot+1,p_understanding:prepared.understanding,p_source:pilotSource(PILOT_SPECS[slot])});if(saved.error)throw Error('Pilot persistence failed');id=saved.data;const baseline=await runPilotMonitoring({client,env:process.env,schedulerAuthorized:true});if(baseline.failed)throw Error('Pilot baseline incomplete');}
  res.statusCode=200;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({pilot:true,id}));
 }catch(e){res.statusCode=e.statusCode||422;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Pilot creation could not complete. No retry was attempted.'}));}
}
