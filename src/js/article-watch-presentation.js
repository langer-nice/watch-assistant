import {normalizeWatchCategory} from './watch-category.js';
import {createMonitoringScope} from './story-review.js';

export const articleWatchDisplayCategory = watch => {
 const category=normalizeWatchCategory(watch?.category);
 // Correct the hotel/civic-building collision only in article presentation.
 const subject=[watch?.sourceTitle,watch?.title,...(watch?.storyProfile?.concepts||[]).map(c=>c.label)].filter(Boolean).join(' ').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
 return category==='travel'&&watch?.inputType==='url'&&watch.isStory!==false&&/\bhotel de ville\b/iu.test(subject)?'news':category;
};

export const localizedGeneratedArticleScope = (watch,language,translate) => {
 if(watch?.inputType!=='url'||watch.isStory===false||!watch.monitoringSummary||watch.storyProfile?.userAddedConcepts?.length)return null;
 const concepts=watch.storyProfile?.concepts||[];if(!concepts.length)return null;
 const profile={...watch.storyProfile};
 for(const [field,type] of [['eventTypes','event'],['locations','location']])profile[field]??=concepts.filter(c=>c.type===type).map(c=>c.label);
 const scope=lang=>createMonitoringScope({profile,storyFingerprint:concepts,language:lang});
 // Recognize only our generated template; custom summaries are left verbatim.
 if(!['en','fr'].some(lang=>scope(lang)===watch.monitoringSummary))return null;
 const generatedEventKeys=new Map([
  ['Incendie de l’hôtel de ville','cityHallFire'],['City hall fire','cityHallFire'],
  ['Incendie de la mairie','townHallFire'],['Town hall fire','townHallFire'],
 ]);
 const localizedConcepts=concepts.map(c=>c.type==='event'&&generatedEventKeys.has(c.label)
  ?{...c,label:translate('watchData.generatedEvents.'+generatedEventKeys.get(c.label))}:c);
 return createMonitoringScope({profile,storyFingerprint:localizedConcepts,language});
};
