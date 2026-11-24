// Legacy Staging fixtures intentionally install the one-owner report manifest.
// Its guarded Production/V3 migrations are skipped; the later display-only V3
// migration requires that absent Production capability too. This is fixture
// selection, not a modification of the deployed migration.
export async function optionalProductionMigrationInstalled(db,filename){
 if(!['20261104210000_article_seed_display_title.sql','20261108150000_v3_watch_display_title.sql','20261109100000_v3_clarification_identity.sql'].includes(filename))return true;
 return (await db.query("select to_regprocedure('public.create_v3_watch(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb)') is not null installed")).rows[0].installed;
}
