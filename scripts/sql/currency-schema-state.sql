-- Pure catalog read: no user data, timestamps, OIDs, or sequence values.
-- Stable on PostgreSQL 17; an unknown schema change deliberately closes the gate.
with relations as (
 select c.*, n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')
), objects as (
 select 'relation:'||relname as key, jsonb_build_object('kind',relkind,'owner',pg_get_userbyid(relowner),
 'rls',relrowsecurity,'force_rls',relforcerowsecurity,'persistence',relpersistence,
 'acl',(select jsonb_agg(x::text order by x::text collate "C") from unnest(coalesce(relacl,acldefault(case when relkind='S' then 's'::"char" else 'r'::"char" end,relowner))) x)) as value from relations
 union all
 select 'column:'||c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),
 'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,
 'acl',(select jsonb_agg(x::text order by x::text collate "C") from unnest(a.attacl) x))
 from relations c join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
 where a.attnum>0 and not a.attisdropped and c.relkind<>'S'
 union all
 select 'constraint:'||c.relname||'.'||k.conname,jsonb_build_object('definition',pg_get_constraintdef(k.oid),'validated',k.convalidated)
 from relations c join pg_constraint k on k.conrelid=c.oid
 union all
 select 'index:'||c.relname||'.'||i.relname,jsonb_build_object('definition',pg_get_indexdef(i.oid),'valid',x.indisvalid,'ready',x.indisready)
 from relations c join pg_index x on x.indrelid=c.oid join pg_class i on i.oid=x.indexrelid
 union all
 select 'sequence:'||c.relname,to_jsonb(s)-'seqrelid' from relations c join pg_sequence s on s.seqrelid=c.oid
 union all
 select 'view:'||relname,jsonb_build_object('definition',pg_get_viewdef(oid),'options',reloptions) from relations where relkind in ('v','m')
 union all
 select 'type:'||t.typname,jsonb_build_object('kind',t.typtype,'owner',pg_get_userbyid(t.typowner),
 'base',format_type(t.typbasetype,t.typtypmod),'not_null',t.typnotnull,'default',t.typdefault,
 'enum',(select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid),
 'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname collate "C") from pg_constraint k where k.contypid=t.oid))
 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typrelid=0 and t.typelem=0
 union all
 select 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),
 'acl',(select jsonb_agg(x::text order by x::text collate "C") from unnest(coalesce(p.proacl,acldefault('f',p.proowner))) x))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.prokind in ('f','p') and (n.nspname='public' or (n.nspname='auth' and p.proname in ('uid','role','jwt')))
 union all
 select 'trigger:'||n.nspname||'.'||c.relname||'.'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users' and t.tgname='on_auth_user_created'))
 union all
 select 'policy:'||tablename||'.'||policyname,to_jsonb(p)-'schemaname' from pg_policies p where schemaname='public'
 union all
 select 'schema:'||nspname,jsonb_build_object('owner',pg_get_userbyid(nspowner),
 'acl',(select jsonb_agg(x::text order by x::text collate "C") from unnest(coalesce(nspacl,acldefault('n',nspowner))) x))
 from pg_namespace where nspname in ('public','auth')
 union all
 select 'default_acl:'||pg_get_userbyid(d.defaclrole)||'.'||d.defaclobjtype::text,
 jsonb_build_object('acl',(select jsonb_agg(x::text order by x::text collate "C") from unnest(d.defaclacl) x))
 from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public'
 union all
 select 'role:'||rolname,jsonb_build_object('superuser',rolsuper,'bypass_rls',rolbypassrls,'inherit',rolinherit,'create_role',rolcreaterole)
 from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
 union all
 select 'membership:'||pg_get_userbyid(roleid)||'.'||pg_get_userbyid(member),jsonb_build_object('admin',admin_option,'inherit',inherit_option,'set',set_option)
 from pg_auth_members where pg_get_userbyid(member) in ('postgres','anon','authenticated','service_role')
 union all
 select 'extension:'||e.extname,jsonb_build_object('schema',n.nspname,'version',e.extversion)
 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('pgcrypto','uuid-ossp')
)
select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) as state from objects
