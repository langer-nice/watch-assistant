import { validRoleResolution } from './role-development.js';
import { parseMediaMentionRequest } from './media-mention-request.js';

const formatTitle = (query, language) => language === 'fr'
  ? `${query} dans les médias` : `${query} media mentions`;

// Translate only titles generated from a recognized request. Never rewrite a
// custom title, the request, or the persisted monitoring definition.
export const localizedGeneratedMediaTitle = (watch, language) => {
  if(watch?.plan?.domain==='media_news'&&!watch.titleKey){
    const generated=structuredWatchObjective(watch,watch.interpretation?.language);
    const old=watch.plan.criteria?.subjects?.join(' + ').slice(0,200);
    if(generated&&[old,generated.title].includes(watch.title))return structuredWatchObjective(watch,language).title;
    return null; // Preserve a customized title. No database or definition rewrite.
  }
  if (watch?.inputType !== 'text' || watch.titleKey || typeof watch.title !== 'string') return null;
  const parsed = parseMediaMentionRequest(watch.request);
  if (!parsed.recognized || watch.title !== formatTitle(parsed.query, parsed.language)) return null;
  return formatTitle(parsed.query, language);
};

// Deterministic presentation from the approved objective; no identity assumptions or AI.
export const structuredWatchObjective = (watch,language='en') => {
 const c=watch?.plan?.criteria;if(watch?.plan?.domain!=='media_news'||!c?.subjects?.length)return null;
 const fr=language==='fr',subjects=c.subjects.join(' + '),topics=c.topics||[],r=c.roleResolution;
 let title,description;
 if(r?.officeId==='papacy'&&validRoleResolution(r,r.originalRole)&&topics.length===1&&['health','santé'].includes(topics[0])){
  const name=fr?r.names.at(-1):r.name;
  title=fr?`Santé du pape ${name}`:`Health of Pope ${name}`;
  description=fr?`Watch Assistant vérifiera chaque jour les nouvelles informations publiques concernant la santé du pape ${name}.`:`Watch Assistant will check daily for new public information about Pope ${name}'s health.`;
 }else{
  title=topics.length?`${topics.join(', ')} — ${subjects}`:subjects;
  description=fr?`Watch Assistant vérifiera chaque jour les nouvelles informations publiques concernant ${subjects}${topics.length?` sur les sujets suivants : ${topics.join(', ')}`:''}.`:`Watch Assistant will check daily for new public information about ${subjects}${topics.length?`, concerning ${topics.join(', ')}`:''}.`;
 }
 return {title:title.slice(0,200),description,
  activated:fr?`${title} — surveillance activée`:`${title} — monitoring activated`,
  baseline:fr?'Le premier contrôle établira les informations de référence. Notifications email désactivées.':'The first check will establish baseline information. Email notifications disabled.'};
};
