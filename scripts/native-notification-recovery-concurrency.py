#!/usr/bin/env python3
"""Actual patch SQL on disposable native PostgreSQL, separate psql backends.
No network/provider clients. --socket must be a private local Unix directory.
Business clock is substituted exactly as in existing SQL fixtures; locking,
roles, constraints, transactions, claims and submission SQL are unchanged.
"""
import argparse,subprocess,os,json,uuid,time,threading,queue,hashlib,pathlib
ap=argparse.ArgumentParser();ap.add_argument('--socket',required=True);ap.add_argument('--source',required=True);ap.add_argument('--output',required=True);args=ap.parse_args()
socket=pathlib.Path(args.socket).resolve();source=pathlib.Path(args.source).resolve();output=pathlib.Path(args.output).resolve()
assert str(socket).startswith('/private/tmp/watch-reliability-pg.') and socket.name=='socket'
assert socket.stat().st_mode&0o077==0,'Socket directory must be private'
env={k:v for k,v in os.environ.items() if not k.startswith('PG') and k not in ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','RESEND_API_KEY']}
cmd=['/opt/homebrew/opt/postgresql@17/bin/psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',str(socket),'-p','55437','-U','reliability_test','-d','reliability_concurrency_test']
def quote(x):return "'"+str(x).replace("'","''")+"'"
def js(x):return quote(json.dumps(x))+'::jsonb'
def oneshot(sql,fail=False):
 r=subprocess.run(cmd,input=sql,text=True,capture_output=True,env=env,timeout=60)
 if fail:assert r.returncode!=0 and 'permission denied' in r.stderr;return {'denied':True}
 if r.returncode:raise RuntimeError(r.stderr[-2500:])
 return [json.loads(x) for x in r.stdout.splitlines() if x.startswith('{')]
class Session:
 def __init__(self,name):
  self.p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1,env=env);self.q=queue.Queue();self.name=name
  def reader():
   for line in self.p.stdout:self.q.put(line.rstrip('\n'))
   self.q.put(None)
  threading.Thread(target=reader,daemon=True).start();self.pid=self.run("select json_build_object('pid',pg_backend_pid())::text;")[-1]['pid']
 def send(self,sql):
  marker='DONE_'+uuid.uuid4().hex;self.p.stdin.write(sql+'\n\\echo '+marker+'\n');self.p.stdin.flush();return marker
 def receive(self,marker):
  result=[];limit=time.monotonic()+25
  while True:
   line=self.q.get(timeout=max(.1,limit-time.monotonic()))
   if line is None:raise RuntimeError(self.p.stderr.read()[-2500:])
   if line==marker:return result
   if line.startswith('{'):result.append(json.loads(line))
 def run(self,sql):return self.receive(self.send(sql))
 def close(self):
  if self.p.poll() is None:self.p.stdin.write('\\q\n');self.p.stdin.flush();self.p.wait(timeout=5)

checks=oneshot("select json_build_object('version',version(),'server_version_num',current_setting('server_version_num'),'database',current_database(),'data_directory',current_setting('data_directory'),'listen_addresses',current_setting('listen_addresses'),'isolation',current_setting('default_transaction_isolation'))::text;")[0]
assert checks['database']=='reliability_concurrency_test' and checks['data_directory']==str(socket.parent/'data') and checks['listen_addresses']==''
assert checks['isolation']=='read committed' and int(checks['server_version_num'])//10000==17
setup="""create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
grant usage on schema auth,public to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
create function public.recovery_test_clock() returns timestamptz language sql as $$select current_setting('test.clock')::timestamptz$$;
set test.clock='2030-11-20T08:00:00Z';
"""
oneshot(setup)
migrations=[]
for file in sorted((source/'supabase/migrations').glob('*.sql')):
 if file.name=='20261022160000_private_morning_reports.sql':continue # Production manifest, as in existing fixtures.
 raw=file.read_text();sql=raw.replace('clock_timestamp()','public.recovery_test_clock()')
 oneshot("set test.clock='2030-11-20T08:00:00Z';\n"+sql)
 migrations.append({'id':file.stem,'source_sha256':hashlib.sha256(raw.encode()).hexdigest()})
output.parent.mkdir(parents=True,exist_ok=True)
evidence={'environment':checks,'isolation':'Disposable cluster; private 0700 Unix socket; no TCP; synthetic data only','clock_adaptation':'Only clock_timestamp() -> public.recovery_test_clock(), existing fixture strategy. Actual claim/locking/role/submission algorithm unchanged. Fixed business clock 2030-11-24 07:16 UTC, real session/lock scheduling.','migrations':migrations,'races':[],'safety':{},'production_or_staging_access':False,'provider_calls':0}
root=Session('controller');a=Session('worker-a');b=Session('worker-b');monitor=Session('observer');sessions=[root,a,b,monitor]
assert len({s.pid for s in sessions})==4
for s in sessions:s.run("set test.clock='2030-11-24T07:16:00Z';set statement_timeout='20s';")
owner=str(uuid.uuid4());other=str(uuid.uuid4());since='2030-11-01T00:00:00Z';activation='2030-11-20T08:00:00Z'
def rpcsql(name,arglist):
 assert name in ['prepare_production_recovery_digests','claim_production_recovery_digest','begin_production_recovery_digest','notification_recovery_eligible']
 vals=[]
 for x in arglist:
  if isinstance(x,list):vals.append('array['+','.join(quote(v)+'::uuid' for v in x)+']')
  elif x is None:vals.append('null')
  else:vals.append(quote(x))
 return 'public.'+name+'('+','.join(vals)+')'
def svc(session,expression,commit=True):
 sql="begin;set local role service_role;select set_config('request.jwt.claim.role','service_role',true);select json_build_object('pid',pg_backend_pid(),'xid',txid_current(),'result',"+expression+")::text;"+('commit;' if commit else '')
 return session.run(sql)[-1]
def command(expression):return "begin;set local role service_role;select set_config('request.jwt.claim.role','service_role',true);select json_build_object('pid',pg_backend_pid(),'xid',txid_current(),'result',"+expression+")::text;commit;"
def fixture():
 root.run('truncate auth.users cascade;')
 root.run("insert into auth.users(id,email,email_confirmed_at) values ("+quote(owner)+",'owner-a@example.invalid',now()),("+quote(other)+",'owner-b@example.invalid',now());")
 rows=[]
 for user in [owner,other]:
  w=str(uuid.uuid4());n=str(uuid.uuid4());identity=str(uuid.uuid4());article={'title':'Synthetic single development '+n,'summary':'Synthetic single development '+n,'url':'https://example.invalid/'+n,'publishedAt':'2030-11-23T06:00:00Z','source':'Synthetic fixture'}
  root.run("insert into public.watches(id,user_id,type,title,watch_definition,monitoring_source,monitoring_state,current_status,last_checked_at,last_change_item_id,last_change_url,last_change_summary) values ("+quote(w)+','+quote(user)+",'media_news','Synthetic fixture',"+js({'inputType':'text','category':'news','request':'Fixture','mediaMention':{'subjects':['Fixture'],'matchMode':'all'}})+','+js({'type':'feed','url':'https://example.invalid/feed'})+",'monitoring','watching','2030-11-24T06:35:00Z',"+quote(identity)+','+quote(article['url'])+','+quote(article['summary'])+");")
  root.run("insert into public.v3_pilot_watches(watch_id,user_id,engine,instruction,understanding,last_judgment) values ("+quote(w)+','+quote(user)+",'wa-v3-evidence-refs.v1',"+quote(n)+",'{}',"+js({'action':'NO_ALERT','evidence_status':'CONFIRMED','condition_check':None})+");insert into public.media_watch_email_policies(watch_id,user_id,mode,enabled,eligible_after) values ("+quote(w)+','+quote(user)+",'daily_digest',true,'2030-11-01');")
  root.run("insert into public.media_watch_notifications(id,watch_id,user_id,source_article_id,watch_title,article,article_position,created_at) values ("+quote(n)+','+quote(w)+','+quote(user)+','+quote(identity)+",'Synthetic fixture',"+js(article)+",0,'2030-11-23T06:35:00Z');")
  rows.append({'watch':w,'notification':n,'owner':user,'identity':identity})
 # Additional synthetic identities never copied from Production.
 w=rows[0]['watch']
 for label in ['sent','uncertain','historical','expired']:
  n=str(uuid.uuid4());article={'title':'Synthetic '+label,'summary':'Synthetic '+label,'url':'https://example.invalid/'+label,'publishedAt':'2030-11-23T06:00:00Z'}
  when={'historical':'2026-11-12T06:35:00Z','expired':'2030-11-21T06:35:00Z'}.get(label,'2030-11-23T06:35:00Z')
  extra=",'sent','2030-11-23T07:16Z','fake-provider'" if label=='sent' else ",'pending',null,null"
  token=quote(str(uuid.uuid4())) if label=='uncertain' else 'null';count=1 if label=='uncertain' else 0;claimed="'2030-11-23T07:16Z'" if label=='uncertain' else 'null'
  root.run("insert into public.media_watch_notifications(id,watch_id,user_id,source_article_id,watch_title,article,article_position,created_at,status,sent_at,provider_message_id,claim_token,claimed_at,submission_started_at,attempt_count) values ("+quote(n)+','+quote(w)+','+quote(owner)+','+quote(str(uuid.uuid4()))+",'Synthetic fixture',"+js(article)+',0,'+quote(when)+extra+','+token+','+claimed+','+claimed+','+str(count)+');')
  rows[0][label]=n
 return rows

def prepare(owners):return svc(root,rpcsql('prepare_production_recovery_digests',[owners,since,activation]))['result']
def claim(d,token,owners):return rpcsql('claim_production_recovery_digest',[d,token,owners,since,activation])
def begin(d,token,owners):return rpcsql('begin_production_recovery_digest',[d,token,owners,since,activation])
def state(d):return root.run("select json_build_object('id',d.id,'owner',d.user_id,'status',d.status,'claim_token',d.claim_token,'submission_started',d.submission_started_at is not null,'digest_count',(select count(*) from public.media_watch_digests where watch_id=d.watch_id and period=d.period),'members',(select count(*) from public.media_watch_notifications where digest_id=d.id),'attempt_count',(select max(attempt_count) from public.media_watch_notifications where digest_id=d.id))::text from public.media_watch_digests d where d.id="+quote(d)+';')[-1]
def wait_blocked(pids):
 end=time.monotonic()+8
 while time.monotonic()<end:
  result=monitor.run("select json_build_object('blocked',count(*),'sessions',json_agg(json_build_object('pid',pid,'wait_event',wait_event,'state',state)))::text from pg_stat_activity where pid in ("+','.join(map(str,pids))+") and wait_event_type='Lock';")[-1]
  if result['blocked']==len(pids):return result
  time.sleep(.02)
 raise AssertionError('Both independent sessions did not reach the PostgreSQL lock barrier')
try:
 for repetition in range(5):
  rows=fixture();d=prepare([owner])[0];ta,tb=str(uuid.uuid4()),str(uuid.uuid4())
  root.run('begin;select 1 from public.watches where id='+quote(rows[0]['watch'])+' for update;')
  ma=a.send(command(claim(d,ta,[owner])));mb=b.send(command(claim(d,tb,[owner])))
  blocked=wait_blocked([a.pid,b.pid]);root.run('commit;');ra=a.receive(ma)[-1];rb=b.receive(mb)[-1]
  assert ra['pid']!=rb['pid'] and ra['xid']!=rb['xid'];assert sum(x['result'] is not None for x in [ra,rb])==1
  final=state(d);assert final['digest_count']==1 and final['members']==1 and final['attempt_count']==0
  winner=ta if ra['result'] else tb;assert final['claim_token']==winner
  evidence['races'].append({'repetition':repetition+1,'barrier':blocked,'worker_a':{'pid':ra['pid'],'xid':ra['xid'],'claimed':ra['result'] is not None},'worker_b':{'pid':rb['pid'],'xid':rb['xid'],'claimed':rb['result'] is not None},'persisted':final})
 # Repeated claim and uncertain outcome after durable begin: no provider is called.
 assert svc(a,claim(d,str(uuid.uuid4()),[owner]))['result'] is None
 assert svc(b,begin(d,winner,[owner]))['result'] is True
 assert svc(a,begin(d,winner,[owner]))['result'] is False
 assert svc(b,claim(d,str(uuid.uuid4()),[owner]))['result'] is None
 evidence['safety']['repeated_claim']={'pass':True};evidence['safety']['crash_after_submission_boundary']={'pass':True,'persisted':state(d),'simulated_submission_opportunities':1,'real_provider_calls':0}
 rows=fixture();ids=prepare([owner,other]);lookup={state(x)['owner']:x for x in ids};da,db=lookup[owner],lookup[other]
 assert svc(a,claim(da,str(uuid.uuid4()),[other]))['result'] is None
 root.run('begin;select 1 from public.watches order by id for update;')
 ma=a.send(command(claim(da,str(uuid.uuid4()),[owner])));mb=b.send(command(claim(db,str(uuid.uuid4()),[other])));barrier=wait_blocked([a.pid,b.pid]);root.run('commit;')
 ra,rb=a.receive(ma)[-1],b.receive(mb)[-1];assert ra['result'] and rb['result'];assert ra['result']['user_id']==owner and rb['result']['user_id']==other
 evidence['safety']['different_owners']={'pass':True,'barrier':barrier,'independent_pids':[ra['pid'],rb['pid']],'owner_a_claimed':True,'owner_b_claimed':True};evidence['safety']['cross_owner_denied']={'pass':True}
 rows=fixture();d=prepare([owner])[0];ta,tb=str(uuid.uuid4()),str(uuid.uuid4())
 assert svc(a,claim(d,ta,[owner]),commit=False)['result'];a.run('rollback;');assert state(d)['claim_token'] is None
 assert svc(b,claim(d,tb,[owner]))['result'];assert state(d)['claim_token']==tb
 evidence['safety']['rollback']={'pass':True,'persisted':state(d)}
 assert svc(a,claim(d,ta,[owner]))['result'] is None
 root.run("update public.media_watch_digests set claimed_at=public.recovery_test_clock()-interval '31 minutes' where id="+quote(d)+';')
 tc=str(uuid.uuid4());assert svc(a,claim(d,tc,[owner]))['result'];assert svc(b,begin(d,tb,[owner]))['result'] is False;assert svc(a,begin(d,tc,[owner]))['result'] is True
 assert state(d)['attempt_count']==1 and state(d)['digest_count']==1
 evidence['safety']['crash_before_submission_and_expired_lease']={'pass':True,'stale_token_fenced':True,'persisted':state(d)}
 rows=fixture();r=rows[0]
 def eligible(n):return svc(root,rpcsql('notification_recovery_eligible',[n,owner,since,activation]))['result']
 for label in ['sent','uncertain','historical','expired']:
  assert eligible(r[label]) is False;evidence['safety'][label+'_excluded']={'pass':True}
 assert eligible(r['notification']) is True
 root.run('update public.media_watch_email_policies set enabled=false where watch_id='+quote(r['watch'])+';');assert eligible(r['notification']) is False
 root.run('update public.media_watch_email_policies set enabled=true where watch_id='+quote(r['watch'])+';');evidence['safety']['consent_disabled']={'pass':True}
 root.run("update public.watches set last_checked_at='2030-11-23T06:35:01Z' where id="+quote(r['watch'])+';');assert eligible(r['notification']) is False;evidence['safety']['recent_check_required']={'pass':True}
 root.run("update public.watches set last_checked_at='2030-11-24T06:35Z',last_change_url=null where id="+quote(r['watch'])+";update public.media_watch_notifications set article=article-'url' where id="+quote(r['notification'])+';');assert eligible(r['notification']) is False;evidence['safety']['missing_source_url']={'pass':True}
 for role in ['anon','authenticated']:
  oneshot('begin;set local role '+role+';select '+rpcsql('claim_production_recovery_digest',[d,str(uuid.uuid4()),[owner],since,activation])+';rollback;',fail=True)
 evidence['safety']['unprivileged_execution_denied']={'pass':True,'roles':['anon','authenticated']}
 catalog=root.run("select json_build_object('functions',json_agg(json_build_object('name',p.proname,'security_definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl)))::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_production_recovery_digest','begin_production_recovery_digest','prepare_production_recovery_digests');")[-1]
 assert all(x['security_definer'] and 'search_path=""' in x['config'] for x in catalog['functions'])
 evidence['security_context']=catalog;evidence['session_pids']={s.name:s.pid for s in sessions};evidence['race_repetitions']=5;evidence['duplicate_successful_claims']=0;evidence['result']='PASS';evidence['limitations']=['PostgreSQL 17.11 local vs Supabase PostgreSQL 17.12 Production.','JWT signature validation, PostgREST gateway, Supabase platform/RLS end-to-end behavior and actual email delivery are not reproduced. Roles and RPC execution context are simulated inside the isolated cluster.','Business clock is controlled to exercise the grace window and lease rules; physical PostgreSQL sessions, transactions and locks are real.']
 output.write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps({'result':'PASS','version':checks['version'],'independent_pids':evidence['session_pids'],'races':5,'duplicate_claims':0,'safety_cases':len(evidence['safety'])}))
except BaseException as e:
 evidence['result']='FAIL';evidence['failure']=str(e);output.write_text(json.dumps(evidence,indent=2)+'\n');raise
finally:
 for s in sessions:
  try:s.close()
  except Exception:pass
