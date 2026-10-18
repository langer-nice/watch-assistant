import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {articleWatchDisplayCategory,localizedGeneratedArticleScope} from './article-watch-presentation.js';
const title='A limoges la colere et la sideration apres l’incendie qui a ravage l hotel de ville';
const watch={inputType:'url',title,category:'travel',monitoringSummary:'Cette Watch suivra les prochaines informations directement liées à Incendie de l’hôtel de ville et Limoges, notamment les développements majeurs.',storyProfile:{concepts:[{type:'location',label:'Limoges'},{type:'event',label:'Incendie de l’hôtel de ville'}],userAddedConcepts:[]}};
for(const language of ['en','fr'])test(`${language}: existing article card uses localized generated scope/category and preserves original headline/data`,()=>{
 const before=structuredClone(watch),locale=JSON.parse(readFileSync(new URL(`../locales/${language}.json`,import.meta.url))),t=key=>key.split('.').reduce((v,k)=>v[k],locale);
 assert.equal(t('categories.'+articleWatchDisplayCategory(watch)),language==='fr'?'Actualité':'News');
 const scope=localizedGeneratedArticleScope(watch,language,t);assert.equal(scope,language==='fr'?watch.monitoringSummary:'This Watch will follow future reporting directly related to City hall fire and Limoges, including major developments.');
 assert.equal(watch.title,title);assert.deepEqual(watch,before);
});
test('custom summaries and user-added text are never translated',()=>{
 const t=()=>assert.fail('Custom text must not be localized');
 assert.equal(localizedGeneratedArticleScope({...watch,monitoringSummary:'Mon texte personnel'},'en',t),null);
 assert.equal(localizedGeneratedArticleScope({...watch,storyProfile:{...watch.storyProfile,userAddedConcepts:['Mon texte']}},'en',t),null);
});
test('actual hotel travel and other Watch types retain their categories and text behavior',()=>{
 assert.equal(articleWatchDisplayCategory({inputType:'url',title:'Hotel prices in Nice',category:'travel'}),'travel');
 assert.equal(articleWatchDisplayCategory({...watch,inputType:'text'}),'travel');
 assert.equal(articleWatchDisplayCategory({...watch,isStory:false}),'travel');
 assert.equal(localizedGeneratedArticleScope({...watch,inputType:'text'},'en',()=>assert.fail()),null);
});
