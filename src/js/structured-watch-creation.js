import { structuredWatchObjective } from './media-watch-title.js';
import { assessCapabilities } from './watch-capabilities.js';
import { validateInterpretation } from './watch-interpretation.js';
import { createWatchDefinition, validateWatchDefinition, structuredMonitoringSource } from './watch-definition.js';
import { canonicalJSON } from './structured-fingerprint.js';

let authSource;
export const configureStructuredWatchCreation = auth => { authSource = auth; };
const activeSession = () => {
  const state = authSource?.getState?.();
  return state?.status === 'authenticated' ? state.session : null;
};
const copy = {
 en: { review:'Review your Watch', original:'Your request', subjects:'News about', all:'All names must appear in the same article.', topics:'Required topics', focus:'Topics of interest (not filters)', exclusions:'Exclude articles mentioning', coverage:'Google News, UK English edition. Matches use article titles and excerpts, including approved alternative names. Only the first 20 results are checked; coverage is not comprehensive.', recurrence:'Future alerts: each new matching article, after a first baseline.', language:'Request language', en:'English', fr:'French', mixed:'English and French', und:'Not identified', paused:'Saved paused. Monitoring is not active and no automatic notifications are being sent.', before:'This Watch will be saved paused. No source check or automatic notification will start.', confirm:'Confirm and save paused', edit:'Edit my request', cancel:'Cancel review', saved:'Watch saved', open:'Open Watch', busy:'Preparing your review…', saving:'Saving…', retry:'Try saving again', unsupported:'This request cannot be monitored yet.', clarify:'Please clarify your request', otherAdapter:'This preview can save news about named people or brands. Currency and official company monitoring are not available in this flow.', error:'The request could not be reviewed. Your text has been kept.', unavailable:'This preview is unavailable for your account.', auth:'Sign in again to continue. Your request has been kept.', ai:'The interpretation service is temporarily unavailable. Try reviewing again.', expired:'This review has expired. Edit or resubmit your request to review it again.', invalid:'The review has changed or is invalid. Review your request again before saving.', conflict:'The Watch changed or this submission conflicts with an earlier save. Reload before continuing.', persist:'Saving could not be confirmed. Try saving again with this same review to avoid duplicates.', stale:'Your request or language changed. Submit it again for a fresh review.' },
 fr: { review:'Vérifier votre Watch', original:'Votre demande', subjects:'Actualités concernant', all:'Tous les noms doivent figurer dans le même article.', topics:'Sujets obligatoires', focus:'Sujets d’intérêt (sans filtrage)', exclusions:'Exclure les articles mentionnant', coverage:'Google Actualités, édition britannique en anglais. Les correspondances portent sur les titres et extraits, avec les autres noms approuvés. Seuls les 20 premiers résultats sont vérifiés ; la couverture n’est pas exhaustive.', recurrence:'Alertes futures : chaque nouvel article correspondant, après une première référence.', language:'Langue de la demande', en:'Anglais', fr:'Français', mixed:'Anglais et français', und:'Non identifiée', paused:'Enregistrée en pause. La surveillance est inactive et aucune notification automatique n’est envoyée.', before:'Cette Watch sera enregistrée en pause. Aucune vérification de source ni notification automatique ne démarrera.', confirm:'Confirmer et enregistrer en pause', edit:'Modifier ma demande', cancel:'Annuler la vérification', saved:'Watch enregistrée', open:'Ouvrir la Watch', busy:'Préparation de la vérification…', saving:'Enregistrement…', retry:'Réessayer l’enregistrement', unsupported:'Cette demande ne peut pas encore être surveillée.', clarify:'Précisez votre demande', otherAdapter:'Cet aperçu permet d’enregistrer des actualités sur des personnes ou marques nommées. Le suivi des devises et des registres officiels d’entreprises n’est pas disponible ici.', error:'La demande n’a pas pu être vérifiée. Votre texte est conservé.', unavailable:'Cet aperçu n’est pas disponible pour votre compte.', auth:'Reconnectez-vous pour continuer. Votre demande est conservée.', ai:'Le service d’interprétation est temporairement indisponible. Réessayez la vérification.', expired:'Cette vérification a expiré. Modifiez ou renvoyez votre demande pour la vérifier à nouveau.', invalid:'La vérification a changé ou est invalide. Vérifiez de nouveau votre demande avant d’enregistrer.', conflict:'La Watch a changé ou cet envoi entre en conflit avec un enregistrement précédent. Rechargez avant de continuer.', persist:'L’enregistrement n’a pas pu être confirmé. Réessayez avec cette même vérification pour éviter les doublons.', stale:'Votre demande ou sa langue a changé. Renvoyez-la pour une nouvelle vérification.' },
};
const limitations = {
 unsupported_role_resolution:['Your role reference is understood. This news monitor cannot reliably identify who holds or held that role, or distinguish that person from other holders. No personal name has been assumed; your requested topics are preserved.','Votre référence à une fonction est comprise. Ce suivi ne peut pas identifier fiablement son titulaire actuel ou passé, ni le distinguer des autres titulaires. Aucun nom personnel n’a été supposé ; vos sujets demandés sont conservés.'],
 unsupported_independent_or:['Following several names independently is not supported here. The request has not been narrowed.','Le suivi indépendant de plusieurs noms n’est pas disponible ici. La demande n’a pas été restreinte.'],
 unsupported_group_membership:['We cannot resolve an open group such as all Italian tennis players.','Nous ne pouvons pas déterminer les membres d’un groupe ouvert, comme tous les joueurs de tennis italiens.'],
 unsupported_event_detection:['We cannot reliably detect events or collaborations from literal news matching.','La recherche littérale d’actualités ne permet pas de détecter fiablement les événements ou collaborations.'],
 unsupported_geographic_constraint:['This source cannot guarantee the requested geographic restriction.','Cette source ne garantit pas la restriction géographique demandée.'],
 unsupported_temporal_constraint:['This source cannot enforce the requested dates.','Cette source ne permet pas d’appliquer les dates demandées.'],
 unsupported_recurrence:['The requested notification timing is not supported by this news source.','La fréquence de notification demandée n’est pas prise en charge par cette source.'],
 unsupported_boolean_combination:['This combination of conditions cannot be matched faithfully.','Cette combinaison de conditions ne peut pas être vérifiée fidèlement.'],
 unresolved_requirement:['A required source or condition is not supported. Please specify what can be checked.','Une source ou condition obligatoire n’est pas prise en charge. Précisez ce qui peut être vérifié.'],
 unsupported_constraint:['This source can check literal names, topics and exclusions, but cannot enforce one of the required conditions in this request.','Cette source peut vérifier des noms, sujets et exclusions littéraux, mais ne peut pas appliquer une des conditions obligatoires de cette demande.'],
 unsupported_predicate:['Please specify whose news you want to follow.','Précisez les personnes ou marques dont vous souhaitez suivre les actualités.'],
 contradictory_topic_role:['A topic is both optional and required. Please clarify which is intended.','Un sujet est à la fois facultatif et obligatoire. Précisez votre intention.'],
 unsupported_subject_type:['This source cannot identify that kind of subject for news monitoring.','Cette source ne permet pas d’identifier ce type de sujet pour le suivi d’actualités.'],
 unsupported_subject_resolution:['We cannot identify the subject precisely enough to monitor it.','Nous ne pouvons pas identifier le sujet assez précisément pour le surveiller.'],
 contradictory_criteria:['The included and excluded conditions contradict each other.','Les conditions d’inclusion et d’exclusion se contredisent.'],
};
export const structuredCreationError = (code,language) => {
 const c=copy[language==='fr'?'fr':'en'];
 if(code==='ROLE_EVIDENCE_UNAVAILABLE')return language==='fr'?'Le titulaire actuel n’a pas pu être vérifié auprès de la source officielle. Réessayez plus tard ; aucune identité n’a été supposée.':'The current holder could not be verified with the official source. Try again later; no identity was assumed.';
 if (['AUTH_REQUIRED','INVALID_SESSION','AUTH_SESSION_CHANGED','AUTH_UNAVAILABLE'].includes(code)) return c.auth;
 if (['STRUCTURED_BACKEND_DISABLED','STRUCTURED_FEATURE_UNAVAILABLE'].includes(code)) return c.unavailable;
 if (['AI_SERVICE_UNAVAILABLE','AI_TIMEOUT'].includes(code)) return c.ai;
 if (code==='EXPIRED_PLAN_AUTHORIZATION') return c.expired;
 if (code==='STALE_REVIEW') return c.stale;
 if (/CONFLICT/.test(code||'')) return c.conflict;
 if (code==='STRUCTURED_PERSISTENCE_UNAVAILABLE' || code==='NETWORK_ERROR') return c.persist;
 if (/PLAN_|DEFINITION|SOURCE_MISMATCH/.test(code||'')) return c.invalid;
 return c.error;
};

export const initStructuredWatchCreation = ({form,input,noteInput,error,getLanguage,listen,isCurrent=()=>true,fetchImpl=(...args)=>fetch(...args),uuid=()=>crypto.randomUUID()}) => {
 let enabled=false, monitoringEnabled=false, v3Owner=null, v3Submission=null, generation=0, pending=null, busy=false, panel, reviewNote='';
 const message=text=>{if(error)error.textContent=text;const inline=panel?.querySelector('.structured-review-error');if(inline)inline.textContent=text;};
 const labels=()=>copy[getLanguage()==='fr'?'fr':'en'];
 const clear=()=>{generation++;pending=null;panel?.remove();panel=null;form.classList.remove('is-reviewing');};
 const headers=()=>{const session=activeSession();if(!session?.access_token)throw Object.assign(Error('auth'),{code:'AUTH_REQUIRED'});return {Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'};};
 const request=async(path,body)=>{
  let response;try{response=await fetchImpl(path,{method:body?'POST':'GET',headers:headers(),...(body?{body:JSON.stringify(body)}:{})});}catch(e){throw Object.assign(Error('request'),{code:e.code||'NETWORK_ERROR'});}
  const value=await response.json().catch(()=>null);if(!response.ok||!value)throw Object.assign(Error('request'),{code:value?.code||'STRUCTURED_PERSISTENCE_UNAVAILABLE'});return value;
 };
 const ready=(epoch,owner,original,language)=>isCurrent()&&generation===epoch&&activeSession()?.user?.id===owner&&input.value===original&&getLanguage()===language&&enabled&&(noteInput?.value||'').trim()===reviewNote;
 const show=(title,paragraphs)=>{
  panel?.remove();panel=document.createElement('section');panel.dataset.structuredReview='';panel.className='structured-watch-review';panel.setAttribute('aria-live','polite');
  const h=document.createElement('h2');h.textContent=title;h.tabIndex=-1;panel.append(h);
  for(const text of paragraphs){
   if(typeof text==='string'){const p=document.createElement('p');p.textContent=text;panel.append(p);continue;}
   const group=document.createElement('section');group.className='structured-review-field';
   const label=document.createElement('h3');label.className='structured-review-label';label.textContent=text.label;group.append(label);
   const value=document.createElement('p');value.className=text.prominent?'structured-review-subject':'structured-review-value';value.textContent=text.value;group.append(value);
   for(const detail of text.details||[]){const p=document.createElement('p');p.className='structured-review-detail';p.textContent=detail;group.append(p);}
   panel.append(group);
  }
  const inline=document.createElement('p');inline.className='form-error structured-review-error';inline.setAttribute('role','alert');panel.append(inline);
  form.classList.add('is-reviewing');form.append(panel);h.focus();return panel;
 };
 const button=(text,callback,primary=false)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.className=primary?'button button--primary':'button button--secondary';listen(b,'click',()=>{if(!b.disabled)callback();});(panel.querySelector('[data-structured-actions]')||panel).append(b);return b;};
 const edit=()=>{clear();input.focus();};
 const access=async()=>{
  if(!activeSession())return;
  const accessOwner=activeSession()?.user?.id;
  try {const result=await request('/api/structured-watches');if(!isCurrent()||activeSession()?.user?.id!==accessOwner||result.enabled!==true)return;enabled=true;v3Owner=result.v3Create===true?accessOwner:null;monitoringEnabled=result.monitoringEnabled===true;
  }catch{/* Default/public flow stays unchanged. No AI or persistence request. */}
 };
 const invalidateInput=()=>{if(busy||pending||panel){clear();message(labels().stale);}};
 listen(input,'input',invalidateInput);
 listen(noteInput,'input',invalidateInput);
 listen(document,'i18n:languageChanged',clear);
 const run=async(original,language,revalidation)=>{
  if(busy)return true;
  if(!enabled){const epoch=generation;busy=true;try{await accessReady;}finally{busy=false;}if(epoch!==generation)return true;}
  if(!enabled)return false;
  reviewNote=(noteInput?.value||'').trim();
  if(v3Owner&&v3Owner===activeSession()?.user?.id){
   if(!v3Submission||v3Submission.original!==original)v3Submission={original,id:uuid()};
   const epoch=generation,owner=activeSession()?.user?.id;
   busy=true;message(labels().busy);
   try{
    const captureKind=/^https:\/\/\S+$/i.test(original.trim())?'URL':'FREE_TEXT';
    const result=await request('/api/v3-pilot',{instruction:original,watchId:v3Submission.id,captureKind});
    if(!ready(epoch,owner,original,language))return true;
    if(result.status==='READY_TO_MONITOR'&&result.id){window.location.href='watch-detail.html?id='+encodeURIComponent(result.id);return true;}
    if(result.status==='NEEDS_CLARIFICATION'){message(result.clarification_question||labels().clarify);return true;}
    if(result.status==='UNSUPPORTED_FOR_NOW'){message(labels().unsupported+' '+(result.reason||''));return true;}
    throw Error('Invalid V3 response');
   }catch(e){if(ready(epoch,owner,original,language))message(e.code==='V3_CREATION_UNAVAILABLE'
    ? (language==='fr'?'La création n’a pas pu être confirmée. Votre texte est conservé.':'Creation could not be confirmed. Your text has been kept.')
    : structuredCreationError(e.code,language));return true;}
   finally{busy=false;}
  }
  clear();reviewNote=(noteInput?.value||'').trim();busy=true;const epoch=generation,owner=activeSession()?.user?.id,c=labels();
  message(c.busy);
  try{
   // Refresh a rejected, expired review without another AI call when its role evidence is still current.
   const reusable=revalidation?.interpreted;
   const interpreted=reusable&&(!reusable.roleResolution||Date.now()-Date.parse(reusable.roleResolution.verifiedAt)<3600000)
    ? reusable : await request('/api/plan-watch?mode=interpretation.v1',{request:original,language});
   if(!ready(epoch,owner,original,language))return true;
   const interpretation=validateInterpretation(interpreted.interpretation);
   if(interpretation.domain!=='media_news'){message('');return false;}
   if(interpretation.originalRequest!==original)throw Object.assign(Error('request'),{code:'INVALID_WATCH_DEFINITION'});
   const assessed=assessCapabilities(interpretation,{structured:true,roleResolution:interpreted.roleResolution});
   if(assessed.status!=='supported'){
    const question=interpretation.ambiguities[0]?.question;
    const messages=assessed.clarifications.length?[question|| (language==='fr'?'Quelle personne ou quel sujet souhaitez-vous suivre précisément ?':'Which person or subject exactly should we follow?')]:assessed.issues.map(i=>limitations[i.code]?.[language==='fr'?1:0]||c.otherAdapter);
    const details = [...new Set(messages)];
    if (assessed.issues.some(i=>i.code==='unsupported_role_resolution')) {
     const topics=interpretation.topics.filter(t=>t.role==='required').map(t=>t.label);
     details.unshift({label:c.original,value:original},
      {label:c.subjects,value:interpretation.subjects.map(s=>s.label).join(', '),
       details:topics.length?[`${c.topics}: ${topics.join(', ')}`]:[]});
    }
    show(assessed.clarifications.length?c.clarify:c.unsupported,details);button(c.edit,edit);button(c.cancel,clear);message('');return true;
   }
   if(assessed.plan.adapter!=='google_news_literal_v1'){show(c.unsupported,[c.otherAdapter]);button(c.edit,edit);button(c.cancel,clear);message('');return true;}
   const identity=revalidation?.identity||{watchId:uuid(),mutationId:uuid(),operation:'create',expectedRevision:0,title:structuredWatchObjective({plan:assessed.plan},language)?.title||assessed.plan.criteria.subjects.join(' + ').slice(0,200)};
   const issued=await request('/api/structured-watches',{action:'issue',...identity,interpretation,plan:assessed.plan,...(reviewNote?{whyFollowing:reviewNote}:{})});
   if(!ready(epoch,owner,original,language))return true;
   const definition=validateWatchDefinition(issued.definition,issued.source);
   if(canonicalJSON(definition)!==canonicalJSON(createWatchDefinition(interpretation,assessed.plan,{whyFollowing:reviewNote}))||typeof issued.token!=='string')throw Object.assign(Error('review'),{code:'INVALID_WATCH_DEFINITION'});
   pending={...identity,definition,token:issued.token};
   const criteria=definition.plan.criteria;
   const messages=[];
   if(criteria.roleResolution){const r=criteria.roleResolution;messages.push(language==='fr'
    ? `Titulaire vérifié : ${r.names.at(-1)}. Source : ${r.sourceUrl}. Vérifié le ${r.verifiedAt}. Le titulaire sera vérifié à chaque contrôle. Seuls les développements de santé sourcés et datés pourront être signalés. Les rapports du même type, état et jour sont regroupés de façon conservatrice.`
    : `Verified current holder: ${r.name}. Source: ${r.sourceUrl}. Verified at ${r.verifiedAt}. The holder will be checked again on each monitoring run. Only sourced, dated health developments can become alerts. Reports of the same type, state and day are conservatively grouped.`);}

   if(criteria.subjects.length>1)messages.push(c.all);
   if(criteria.topics.length)messages.push(`${c.topics}: ${criteria.topics.join(', ')}`);
   const focus=definition.interpretation.topics.filter(t=>t.role==='coverage_focus').map(t=>t.label);if(focus.length)messages.push(`${c.focus}: ${focus.join(', ')}`);
   if(criteria.exclusions.length)messages.push(`${c.exclusions}: ${criteria.exclusions.join(', ')}`);
   messages.push(c.coverage);if(definition.interpretation.recurrence==='per_new_item')messages.push(c.recurrence);
   show(c.review,[
    {label:c.original,value:original},
    {label:c.subjects,value:criteria.subjects.join(', '),prominent:true,details:messages},
    {label:c.language,value:c[definition.interpretation.language]},
    c.before,
   ]);panel.classList.add('structured-review-confirmation');
   panel.querySelector(':scope > p').classList.add('structured-review-paused');
   const actions=document.createElement('div');actions.dataset.structuredActions='';actions.className='structured-review-actions';panel.append(actions);message('');
   let confirming=false,saved=false,activation,renderActivation;
   if(monitoringEnabled){
    const label=document.createElement('label');label.className='structured-watch-opt-in';
    activation=document.createElement('input');activation.type='checkbox';activation.dataset.structuredActivate='';activation.checked=revalidation?.activate===true;
    const text=document.createElement('span');text.textContent=language==='fr'?'Activer la surveillance quotidienne après confirmation (emails désactivés)':'Activate daily monitoring after confirmation (emails off)';label.append(activation,text);actions.before(label);
    renderActivation=()=>{confirm.textContent=activation.checked?(language==='fr'?'Confirmer et activer la surveillance quotidienne':'Confirm and activate daily monitoring'):c.confirm;panel.querySelector('.structured-review-paused').textContent=activation.checked?(language==='fr'?'Après votre confirmation, la Watch sera enregistrée puis activée pour un contrôle quotidien. Le premier contrôle établira une référence, sans email.':'After your confirmation, the Watch will be saved and activated for daily checks. The first check establishes a baseline, without email.'):c.before;};listen(activation,'change',renderActivation);
   }
   const confirm=button(c.confirm,async()=>{
    if(confirming||saved)return;
    if(!pending||!ready(epoch,owner,original,language)){clear();message(c.stale);return;}
    confirming=true;const activate=activation?.checked===true;if(activation)activation.disabled=true;confirm.disabled=true;editButton.disabled=true;cancelButton.disabled=true;confirm.textContent=c.saving;
    try{
     const payload={action:'confirm',...pending};const result=await request('/api/structured-watches',payload);
     if(!ready(epoch,owner,original,language))return;
     if(result.receipt?.id!==pending.watchId||result.receipt?.ownerId!==owner||result.receipt?.mutationId!==pending.mutationId||result.receipt?.monitoringState!=='paused')throw Object.assign(Error('save'),{code:'STRUCTURED_PERSISTENCE_UNAVAILABLE'});
     saved=true;const id=pending.watchId;pending=null;let summary=c.paused,activated=false;
     if(activate){
      try{
       const active=await request('/api/structured-watches',{action:'monitoring',watchId:id,expectedRevision:result.receipt.revision,active:true});
       if(!ready(epoch,owner,original,language))return;
       if(active.id!==id||active.ownerId!==owner||active.revision!==result.receipt.revision+1||active.monitoringState!=='monitoring')throw Error('activation');
       activated=true;summary=language==='fr'?'Surveillance quotidienne activée. Le premier contrôle établira une référence. Emails désactivés.':'Daily monitoring activated. The first check will establish a baseline. Emails off.';
      }catch{summary=language==='fr'?'Watch enregistrée ; activation non confirmée. Ouvrez la Watch pour vérifier son état avant de réessayer. Aucun nouvel enregistrement nécessaire.':'Watch saved; activation could not be confirmed. Open the Watch to check its state before retrying. Do not create it again.';}
     }
     if(!ready(epoch,owner,original,language))return;const objective=activated&&structuredWatchObjective(definition,language);show(objective?objective.activated:c.saved,objective?[objective.description,objective.baseline]:[summary]);
     const link=document.createElement('a');link.className='button button--secondary';link.href=`watch-detail.html?id=${encodeURIComponent(id)}`;link.textContent=c.open;panel.append(link);
     message('');
    }catch(e){if(ready(epoch,owner,original,language)){
      if(e.code==='EXPIRED_PLAN_AUTHORIZATION'){
       // The server rejected before persistence. Revalidate, keep the mutation identity, and require a new personal confirmation.
       await run(original,language,{interpreted,identity,activate});
       if(pending)message(language==='fr'?'Vérification renouvelée. Relisez le plan et confirmez à nouveau.':'Review renewed. Read the plan and confirm again.');
      }else message(structuredCreationError(e.code,language));
     }}
    finally{confirming=false;if(!saved&&pending&&generation===epoch){if(activation)activation.disabled=false;confirm.disabled=false;editButton.disabled=false;cancelButton.disabled=false;confirm.textContent=c.retry;}}
   },true);
   const editButton=button(c.edit,edit);const cancelButton=button(c.cancel,clear);renderActivation?.();
  }catch(e){if(ready(epoch,owner,original,language))message(structuredCreationError(e.code,language));}
  finally{busy=false;}
  return true;
 };
 const accessReady=access();
 return {run,runV3:async(original,language)=>{await accessReady;return v3Owner?run(original,language):false;},invalidate:clear,isEnabled:()=>enabled};
};
