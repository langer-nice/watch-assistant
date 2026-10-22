import {createHash, randomUUID} from 'node:crypto';
import {getMediaWatchEmailConfig, sendWithResend} from './media-watch-email.js';
import {getStructuredMediaStagingEmailConfig, structuredEmailTestOwners, structuredMediaEmailDeliveryAllowed, structuredDigestWatchScope} from './structured-media-notification-gates.js';
import {safeEmailCode, definiteProviderFailure} from './watch-email-config.js';
import {withinMediaDeadline} from './media-deadline.js';

export const mediaDailyDigestEnabled = env => env?.MEDIA_WATCH_DAILY_DIGEST_ENABLED === 'true';
export const validStructuredMediaDigestSelection = (selection, env) => Boolean(selection
  && typeof selection === 'object' && !Array.isArray(selection)
  && Object.keys(selection).sort().join(',') === 'digestId,ownerId,watchId'
  && ['digestId','watchId','ownerId'].every(key => typeof selection[key] === 'string'
    && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(selection[key]))
  && structuredEmailTestOwners(env).includes(selection.ownerId.toLowerCase())
  && (structuredDigestWatchScope(env) === null || structuredDigestWatchScope(env).includes(selection.watchId.toLowerCase())));
export const mediaDigestSendHour = env => {
  const value = env?.MEDIA_WATCH_DIGEST_SEND_HOUR_UTC ?? '8';
  return /^(?:[0-9]|1[0-9]|2[0-3])$/.test(value) ? Number(value) : null;
};
// Structured Staging delivery only. UTC grouping/idempotency remain unchanged.
export const parisDigestWindow = (at=Date.now()) => {
 const date=new Date(at);if(!Number.isFinite(date.getTime()))return {open:false};
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
 const seconds=Number(parts.hour)*3600+Number(parts.minute)*60+Number(parts.second);
 return {open:seconds>=8*3600+900&&seconds<8*3600+1800,utcHour:date.getUTCHours(),closesAt:date.getTime()+(8*3600+1800-seconds)*1000-date.getUTCMilliseconds()};
};
const clean = (s, max=300) => typeof s === 'string' ? s.replace(/\s+/gu,' ').trim().slice(0,max) : '';
const escape = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const https = value => {try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u:null;}catch{return null;}};
// Conservative grouping: exact normalized titles only, always keep every link.
// No fuzzy/AI clustering or claim that differently worded stories are equivalent.
export const groupDigestArticles = items => {
  const seen = new Set(), groups = new Map();
  for(const item of items || []){
    if(typeof item?.id!=='string'||seen.has(item.id))continue;
    seen.add(item.id);
    const a=item.article,url=https(a?.url);if(!url)throw Object.assign(Error('Unsafe article URL'),{code:'INVALID_ARTICLE_URL'});
    const title=clean(a.title)||'Untitled article';
    const key=title.normalize('NFKC').toLowerCase();
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({...a,title,url:url.href});
  }
  return [...groups.values()].sort((a,b)=>(Date.parse(b[0].publishedAt)||0)-(Date.parse(a[0].publishedAt)||0));
};
const safeDevelopmentSource=(source,articles)=>typeof source.quote==='string'&&articles.some(i=>i.id===source.id&&i.article?.url===source.url&&[i.article.title,i.article.summary??i.article.excerpt].filter(Boolean).join('\n').includes(source.quote));
export const renderMediaWatchDigest = ({locale,watchId,watchTitle,period,articles,baseUrl,includeSourceSummaries=false,storyDevelopments=[]}) => {
  const fr=locale==='fr',lang=fr?'fr':'en',app=https(baseUrl);
  if(!app)throw Object.assign(Error('Unsafe app URL'),{code:'INVALID_APP_URL'});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(period||''))throw Error('Invalid digest period');
  const groups=groupDigestArticles(articles),count=groups.reduce((n,g)=>n+g.length,0),shown=[];
  let available=5;for(const group of groups){if(!available)break;const part=group.slice(0,available);shown.push(part);available-=part.length;}
  const watch=clean(watchTitle,200)||'Media Watch';
  const subject=`${watch} — ${fr?'Votre récapitulatif du jour':'Your daily update'}`;
  const detail=new URL('/watch-detail.html',app);detail.searchParams.set('id',watchId);
  const preferences=new URL(detail);preferences.hash='email-notifications';
  const intro=fr?`${count} nouveaux articles pertinents — ${period} (UTC)`:`${count} new relevant articles — ${period} (UTC)`;
  const all=fr?'Voir tous les résultats de la Watch':'View all Watch results';
  const off=fr?'Désactiver les emails dans les réglages de cette Watch (connexion requise).':'Turn off emails in this Watch’s settings (sign-in required).';
  // Staging legacy digests retain sourced context that may contain a development absent from the headline.
  const excerptLabel=fr?'Extrait de la source':'Source excerpt';
  const excerpt=a=>includeSourceSummaries?clean(a.summary,1200):'';
  const line=a=>[a.title,clean(a.source),/^\d{4}-\d{2}-\d{2}/.exec(a.publishedAt||'')?.[0]||'',a.url].filter(Boolean).join(' — ')+(excerpt(a)?`\n${excerptLabel}: ${excerpt(a)}`:'');
  const developments=storyDevelopments.filter(d=>d&&Array.isArray(d.sources)&&d.sources.length&&d.sources.every(a=>safeDevelopmentSource(a,articles)));
  const heading=fr?'Ce qui a changé — selon les sources':'What changed — as reported';
  const sourceDate=a=>/^\d{4}-\d{2}-\d{2}/.exec(a.publishedAt||'')?.[0]||'';
  const developmentText=developments.flatMap(d=>[fr?d.fr:d.en,...d.sources.map(a=>`${clean(a.source)} — ${a.title} — ${sourceDate(a)}: ${a.url}\n« ${a.quote} »${excerpt(a)&&excerpt(a)!==a.quote?`\n${excerptLabel}: ${excerpt(a)}`:''}`),'']);
  const developmentHtml=developments.length?`<section><h2>${heading}</h2>${developments.map(d=>`<section><p><strong>${escape(fr?d.fr:d.en)}</strong></p>${d.sources.map(a=>`<p><a href="${escape(a.url)}">${escape(clean(a.source))} — ${escape(a.title)}</a> ${escape(sourceDate(a))}</p><blockquote>${escape(a.quote)}</blockquote>${excerpt(a)&&excerpt(a)!==a.quote?`<p>${escape(excerptLabel)}: ${escape(excerpt(a))}</p>`:''}`).join('')}</section>`).join('')}</section>`:'';
  const covered=new Set(developments.flatMap(d=>d.sources.map(a=>a.url)));
  const remaining=shown.map(g=>g.filter(a=>!covered.has(a.url))).filter(g=>g.length);
  const text=[subject,intro,'',...(developments.length?[heading,...developmentText]:[]),...remaining.flatMap(g=>g.map(line)),...(count>5?[fr?'Plus de résultats disponibles dans Watch Assistant.':'More results available in Watch Assistant.']:[]),'',`${all}: ${detail.href}`,off,preferences.href].join('\n');
  const html=`<!doctype html><html lang="${lang}"><body style="font-family:Arial,sans-serif;color:#18181b"><h1>${escape(subject)}</h1><p>${escape(intro)}</p>${developmentHtml}${remaining.map(g=>`<section><h2>${escape(g[0].title)}</h2>${g.map(a=>`<p><a href="${escape(a.url)}">${escape(clean(a.source)||a.title)}</a> ${escape(/^\d{4}-\d{2}-\d{2}/.exec(a.publishedAt||'')?.[0]||'')}</p>${excerpt(a)?`<p><strong>${escape(excerptLabel)}:</strong> ${escape(excerpt(a))}</p>`:''}`).join('')}</section>`).join('')}<p><a href="${escape(detail.href)}">${escape(all)} (${count})</a></p><p><a href="${escape(preferences.href)}">${escape(off)}</a></p></body></html>`;
  return {subject,text,html};
};
export const processMediaWatchDigests = async ({client,env=process.env,sender=sendWithResend,deadline=Date.now()+30000,digestSelection,now=Date.now}={}) => {
  const summary={status:'disabled',claimedCount:0,sentCount:0,failedCount:0};
  const exact=digestSelection!==undefined;
  if(exact && (getMediaWatchEmailConfig(env) || !getStructuredMediaStagingEmailConfig(env)
    || !validStructuredMediaDigestSelection(digestSelection,env)))return {...summary,status:'invalid-selection'};
  if(!mediaDailyDigestEnabled(env))return summary;
  const production=getMediaWatchEmailConfig(env),config=production||getStructuredMediaStagingEmailConfig(env);
  let hour=mediaDigestSendHour(env);
  if(!config||hour===null)return summary;
  const structured=!production,owners=structured?structuredEmailTestOwners(env):[];
  const window=()=>parisDigestWindow(now());
  if(structured){const slot=window();if(!slot.open)return {...summary,status:'outside-morning-window'};hour=slot.utcHour;}
  const rpc=async(name,args)=>{const r=await withinMediaDeadline(()=>client.rpc(name,args),deadline);if(r.error)throw Object.assign(Error('Digest SQL unavailable'),{code:'DATABASE_ERROR'});return r.data;};
  const selection=exact?Object.fromEntries(Object.entries(digestSelection).map(([k,v])=>[k,v.toLowerCase()])):null;
  // Exact delivery never prepares or enumerates any other digest or article.
  const watchScope=structured?structuredDigestWatchScope(env):null;
  let scopedSelections;
  if(!selection && watchScope !== null){
    scopedSelections=await rpc('prepare_scoped_structured_media_digests',{p_send_hour:hour,p_owners:owners,p_watches:watchScope});
    if(!Array.isArray(scopedSelections)||scopedSelections.some(item=>!validStructuredMediaDigestSelection(item,env)))throw Object.assign(Error('Invalid scoped digest batch'),{code:'DATABASE_ERROR'});
    // Old prepared digests keep their contents and priority; at most one per Watch/day.
    const seen=new Set();scopedSelections=scopedSelections.filter(item=>{if(seen.has(item.watchId))return false;seen.add(item.watchId);return true;});
  }
  if(!selection && !scopedSelections)await rpc('prepare_media_watch_digests',{p_send_hour:hour,p_owners:owners,p_structured:structured});
  const ids=selection?[selection.digestId]:scopedSelections?scopedSelections.map(item=>item.digestId):await rpc('pending_media_watch_digests',{p_owners:owners,p_structured:structured});
  if(!Array.isArray(ids)||ids.length>10)throw Error('Invalid digest batch');
  summary.status='success';
  for(const id of ids){
    if(Date.now()>=deadline||(structured&&!window().open))break;
    const selected=selection||scopedSelections?.find(item=>item.digestId===id);
    const token=randomUUID();let claimed=null,boundary=false,providerStarted=false;
    try{
      claimed=await rpc(selected?'claim_structured_media_test_digest':'claim_media_watch_digest',selected
        ?{p_digest_id:id,p_watch_id:selected.watchId,p_owner:selected.ownerId,p_claim_token:token,p_owners:[selected.ownerId],p_send_hour:hour}
        :{p_id:id,p_token:token,p_owners:owners,p_structured:structured});
      if(!claimed)continue;
      summary.claimedCount++;
      if(claimed.id!==id||claimed.is_structured!==structured||!Array.isArray(claimed.articles)||!claimed.articles.length
        ||(selected&&(claimed.watch_id!==selected.watchId||claimed.user_id!==selected.ownerId)))throw Error('Invalid digest claim');
      const auth=await withinMediaDeadline(()=>client.auth.admin.getUserById(claimed.user_id),deadline);
      const user=auth.data?.user;
      if(auth.error||!user?.email||!user.email_confirmed_at||(structured&&!structuredMediaEmailDeliveryAllowed(env,claimed.user_id,user.email)))throw Object.assign(Error('Recipient unavailable'),{code:'RECIPIENT_UNVERIFIED'});
      const locale=await rpc('get_media_watch_notification_locale',{p_user_id:claimed.user_id});
      const content=renderMediaWatchDigest({locale,watchId:claimed.watch_id,watchTitle:claimed.watch_title,period:claimed.period,articles:claimed.articles,baseUrl:config.baseUrl});
      if(structured&&!window().open)throw Object.assign(Error('Morning window closed'),{code:'DIGEST_WINDOW_CLOSED'});
      boundary=true;
      if(await rpc('begin_media_watch_digest',{p_id:id,p_token:token})!==true){boundary=false;throw Object.assign(Error('Digest no longer eligible'),{code:'DATABASE_ERROR'});}
      // If preparation crossed 08:30, no provider request has begun: release safely.
      if(structured&&!window().open)throw Object.assign(Error('Morning window closed'),{code:'DIGEST_WINDOW_CLOSED'});
      const key='watch-digest-'+createHash('sha256').update(`${claimed.watch_id}\0${claimed.period}`).digest('hex');
      const sent=await withinMediaDeadline(()=>{if(structured&&!window().open)throw Object.assign(Error('Morning window closed'),{code:'DIGEST_WINDOW_CLOSED'});providerStarted=true;return sender({...config,to:user.email,...content,idempotencyKey:key});},deadline);
      if(await rpc('finish_media_watch_digest',{p_id:id,p_token:token,p_provider:sent.id,p_error:null})!==true)throw Object.assign(Error('Completion unknown'),{code:'DATABASE_ERROR'});
      summary.sentCount++;
    }catch(error){
      if(structured&&claimed&&!providerStarted){
        // No provider call occurred: keep the frozen articles eligible for a safe
        // retry, including transient Auth/SQL errors and a lost begin response.
        if(error.code!=='DIGEST_WINDOW_CLOSED')summary.failedCount++;
        try{await rpc('defer_structured_digest_before_send',{p_id:id,p_token:token});}
        catch{if(error.code==='DIGEST_WINDOW_CLOSED')summary.failedCount++;}
        continue;
      }
      summary.failedCount++;
      const code=boundary&&!definiteProviderFailure(error.code)?'EMAIL_DELIVERY_OUTCOME_UNKNOWN':safeEmailCode(error);
      if(claimed)try{await rpc('finish_media_watch_digest',{p_id:id,p_token:token,p_provider:null,p_error:code});}catch{ /* Submission boundary remains durable: never retry an uncertain submission. */ }
    }
  }
  if(summary.failedCount)summary.status='partial-success';
  return summary;
};
