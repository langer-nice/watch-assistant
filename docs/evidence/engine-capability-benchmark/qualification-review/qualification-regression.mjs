// Deterministic local regression. Semantic model functions are injected; no real provider/sender is invoked.
// Existing Node test + PGlite migration fixture strategy from server/v3-creation.test.js.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const engine=process.env.WA_ENGINE_ROOT;
if(!engine)throw Error('WA_ENGINE_ROOT must identify the reviewed engine checkout');
const require=createRequire(path.join(engine,'package.json'));
const {PGlite}=await import(pathToFileURL(require.resolve('@electric-sql/pglite')));
const load=p=>import(pathToFileURL(path.join(engine,p)));
const {understandCapture}=await load('server/v3-intent/understand.mjs');
const {v3Capability}=await load('server/v3-creation.js');
const {evaluateV3Source}=await load('server/v3-pilot.js');
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let db;const observations=[];
const clock=at=>db.query("select set_config('qualification.test_clock',$1,false)",[at]);
async function role(name,sql,args=[]){
 await db.exec(`set role ${name};set request.jwt.claim.role='${name}';set request.jwt.claim.sub='${owner}'`);
 try{return await db.query(sql,args);}finally{await db.exec('reset role;reset request.jwt.claim.role;reset request.jwt.claim.sub');}
}
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create function public.test_qualification_clock() returns timestamptz language sql as $$select current_setting('qualification.test_clock')::timestamptz$$;`);
 await clock('2026-11-01T12:00:00Z');
 const dir=path.join(engine,'supabase/migrations');
 for(const f of (await fs.readdir(dir)).sort().filter(x=>x.endsWith('.sql')&&x!=='20261022160000_private_morning_reports.sql')){
  const original=await fs.readFile(path.join(dir,f),'utf8');
  await db.exec(original.replace('create extension if not exists pgcrypto;','').replaceAll('clock_timestamp()','public.test_qualification_clock()'));
 }
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[owner,'synthetic@example.test','2026-10-01T00:00:00Z']);
});
after(async()=>{
 try{if(process.env.WA_QUALIFICATION_RESULTS)await fs.writeFile(process.env.WA_QUALIFICATION_RESULTS,JSON.stringify({engine_root:engine,observations,provider_calls:0,sender_calls:0,production_access:false},null,2)+'\n');}
 finally{if(db)await db.close();}
});
const cases=[
 {id:'A',request:'Préviens-moi d’un nouvel article sur OpenAI seulement si son auteur est un expert reconnu en IA.',truth:true,action:'ALERT',expected:1,body:'Dr Ada Lemaire signe cet article sur OpenAI ; le profil authentifié et les publications IA de la même personne établissent son expertise reconnue.'},
 {id:'B',request:'Préviens-moi d’un nouvel article sur OpenAI seulement si son auteur est un expert reconnu en IA.',truth:false,action:'ALERT',expected:0,body:'L’article porte sur OpenAI. L’auteur identifié n’est pas la personne du profil expert fourni ; cette qualification est explicitement réfutée dans le dossier contrôlé.'},
 {id:'C',request:'Préviens-moi d’un nouvel article sur OpenAI seulement si son auteur est un expert reconnu en IA.',truth:null,action:'ALERT',expected:0,body:'L’article porte sur OpenAI. Signature : journaliste généraliste. Aucune information permettant d’établir son expertise IA n’est fournie.'},
 {id:'D',request:'Préviens-moi d’un nouvel article sur OpenAI seulement si son auteur est un expert reconnu en IA.',truth:null,action:'NO_ALERT',expected:0,body:'L’article porte sur OpenAI. L’auteur est anonyme et son expertise n’est pas documentée.'},
 {id:'E',request:'Préviens-moi d’un nouvel article sur OpenAI seulement si son auteur est un expert reconnu en IA.',truth:true,action:'NO_ALERT',expected:0,body:'L’article porte sur OpenAI ; l’expertise de son auteur est documentée, mais le jugement ne recommande pas de notification.'},
 {id:'F',request:'Préviens-moi d’un nouvel article sur OpenAI si son auteur est un expert reconnu en IA ET si l’article a été évalué par les pairs.',truth:null,action:'ALERT',expected:0,body:'L’expertise IA de l’auteur est documentée par son profil authentifié et ses publications. Le statut d’évaluation par les pairs de cet article est inconnu. Article sur OpenAI.'},
 {id:'G',request:'Préviens-moi d’un nouvel article sur OpenAI si son auteur est un expert reconnu en IA OU si l’article est un communiqué officiel OpenAI.',truth:true,action:'ALERT',expected:1,body:'L’expertise IA de l’auteur est documentée et reconnue. L’article porte sur OpenAI ; son éventuel statut de communiqué officiel est inconnu.'},
 {id:'H',request:'Préviens-moi d’un nouvel article sur OpenAI si son auteur est un expert reconnu en IA OU si l’article est un communiqué officiel OpenAI.',truth:null,action:'ALERT',expected:0,body:'Le profil expert ne correspond pas à l’auteur : la première qualification est réfutée. Le statut de communiqué officiel est inconnu. Article sur OpenAI.'},
 {id:'I',request:'Préviens-moi d’un nouvel article sur OpenAI seulement si son auteur est un expert reconnu en IA ; un auteur francophone serait préférable.',truth:true,action:'ALERT',expected:1,body:'L’auteur identifié possède une expertise IA documentée et reconnue. L’article porte sur OpenAI ; la langue de l’auteur n’est pas connue.'},
 {id:'J',request:'Préviens-moi d’un nouvel article sur OpenAI uniquement si son auteur N’EST PAS salarié du fournisseur.',truth:null,action:'ALERT',expected:0,body:'L’article porte sur OpenAI. L’identité de l’auteur est fournie, mais aucun renseignement sur son employeur n’est disponible.'},
 {id:'K-status',request:'Préviens-moi d’un nouvel article sur OpenAI seulement si son auteur est un expert reconnu en IA.',truth:null,action:'ALERT',status:'INSUFFICIENT',expected:0,body:'Article sur OpenAI ; expertise de l’auteur non documentée.'},
 {id:'L-refs',request:'Préviens-moi d’un nouvel article sur OpenAI seulement si son auteur est un expert reconnu en IA.',truth:null,action:'ALERT',badRefs:true,expected:0,body:'Article sur OpenAI ; expertise de l’auteur non documentée.'},
 {id:'M-ambiguity',request:'Préviens-moi d’un nouvel article sur OpenAI seulement si son auteur est un expert reconnu en IA.',truth:null,action:'ALERT',unresolved:true,expected:0,body:'Article sur OpenAI ; expertise de l’auteur non documentée.'},
];
for(const c of cases)test(c.id+' — full local admission and notification eligibility',async()=>{
 const id=randomUUID();let intentCalls=0,judgmentCalls=0,sourceCalls=0;
 const request=c.request+' Référence du contrôle '+c.id+'.';
 const understanding=await understandCapture({kind:'FREE_TEXT',raw_input:request},[],{model:async()=>{
  intentCalls++;return {intent:{canonical_text:request,references:[{label:'OpenAI',source_ref:'raw_input'}],explicit_constraints:[{kind:'condition',text:request,source_ref:'raw_input'}],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'Topic and mandatory qualification understood.'}};
 }});
 const capability=v3Capability({raw_input:request},understanding);assert.ok(capability.source,'public news path must be admitted for this controlled case');
 // A genuine feed-source shape, injected transport. No author/profile lookup is added.
 const feedFor=(baseline=false)=>async url=>{sourceCalls++;return {source:{title:'Controlled public feed',url},checkedAt:baseline?'2026-11-01T12:00:00Z':'2026-11-02T12:00:00Z',items:[{id:baseline?'baseline-'+c.id:'article-'+c.id,title:baseline?'Earlier unrelated baseline':'New OpenAI article '+c.id,excerpt:baseline?'Earlier unrelated observation.':c.body,url:'https://example.test/'+(baseline?'baseline-':'article-')+c.id,publishedAt:baseline?'2026-10-31T10:00:00Z':'2026-11-02T10:00:00Z',source:'Controlled source'}]};};
 await clock('2026-11-01T12:00:00Z');
 const baseline=await evaluateV3Source({id,engine:'wa-v3-evidence-refs.v1',understanding,prior_state:{entries:[]}},capability.source,{feed:feedFor(true),model:()=>assert.fail('baseline must not call judgment model')});
 const created=(await role('service_role','select public.create_v3_watch($1,$2,$3,$4,$5,$6,$7,$8) id',[id,owner,request,'FREE_TEXT',understanding,capability.source,null,baseline])).rows[0].id;assert.equal(created,id);
 await role('authenticated',"select public.set_media_watch_email_policy($1,'immediate',true)",[id]);
 await clock('2026-11-02T12:00:00Z');
 const claimed=(await role('service_role','select public.claim_v3_pilot_checks() value')).rows[0].value;
 const row=claimed.find(r=>r.id===id);assert.ok(row,'watch must have a real scheduler lease');
 if(c.unresolved)row.understanding.intent.unresolved_ambiguities=['Unresolved mandatory qualification'];
 let result,error=null,sqlSaved=false;
 try{
  result=await evaluateV3Source(row,row.source,{feed:feedFor(false),model:async req=>{
   judgmentCalls++;assert.equal(req.input.intent.canonical_text,request);assert.equal(req.input.intent.explicit_constraints[0].text,request);
   return {action:c.action,evidence_status:c.status||'CONFIRMED',reason:c.truth===null?'A new OpenAI article is established; the mandatory qualification remains unknown.':'The supplied controlled observations establish the stated condition outcome.',novelty_summary:'New controlled article, no previous notification.',condition_check:{required_state:request,observed_state:c.body,condition_satisfied:c.truth},evidence_refs:c.badRefs?['foreign-ref']:req.input.evidence.segments.filter(s=>s.role==='CLAIM').map(s=>s.id),provenance_refs:req.input.evidence.segments.filter(s=>s.role==='PROVENANCE').map(s=>s.id)};
  }});
 }catch(e){error=e.message;}
 if(result){sqlSaved=(await role('service_role','select public.finish_v3_pilot_check($1,$2,$3) value',[id,row.token,result])).rows[0].value;assert.equal(sqlSaved,true);}
 const notifications=(await db.query('select id,status,delivery_mode,attempt_count,submission_started_at from public.media_watch_notifications where watch_id=$1',[id])).rows;
 let claimEligible=false;
 if(notifications.length){const n=notifications[0];assert.equal(n.status,'pending');assert.equal(n.delivery_mode,'immediate');assert.equal(n.attempt_count,0);assert.equal(n.submission_started_at,null);claimEligible=!!(await role('service_role','select public.claim_media_watch_email_notification($1,$2) value',[n.id,randomUUID()])).rows[0].value;}
 observations.push({id:c.id,aggregate_truth:c.truth,proposed_action:c.action,status:c.status||'CONFIRMED',intent_preserved:true,source_calls:sourceCalls,mocked_intent_calls:intentCalls,mocked_judgment_calls:judgmentCalls,admitted_action:result?.judgment?.action??null,admitted_condition:result?.judgment?.condition_check?.condition_satisfied,error,sql_saved:sqlSaved,notification_count:notifications.length,notification_claim_eligible:claimEligible,expected_notification_count:c.expected,sender_calls:0});
 assert.equal(notifications.length,c.expected,`${c.id}: unknown mandatory expression must not create an eligible notification`);
 if(c.expected)assert.equal(claimEligible,true);
 if(c.id==='B')assert.match(error,/Condition false/);
 if(c.id==='K-status')assert.match(error,/Evidence status cannot support ALERT/);
 if(c.id==='L-refs')assert.match(error,/reference/i);
 if(c.id==='M-ambiguity'){assert.match(error,/Unresolved Intent/);assert.equal(judgmentCalls,0);}
});
