import {createHash} from 'node:crypto';
import {extractStoryDevelopmentFrames} from '../src/js/story-development-frames.js';
export const extractStoryDigestDevelopments = input => extractStoryDevelopmentFrames({...input,hash:text=>createHash('sha256').update(text).digest('hex')});
export async function loadStoryDigestDevelopments({client,claimed,deadline=Date.now()+30000,extractor=extractStoryDigestDevelopments}){
 if(deadline-Date.now()<1500)return [];
 try{
  const {data:w,error}=await client.from('watches').select('watch_definition').eq('id',claimed.watch_id).eq('user_id',claimed.user_id).is('deleted_at',null).maybeSingle();
  const story=w?.watch_definition;if(error||story?.inputType!=='url'||!story.storyProfile)return [];
  const [snap,history]=await Promise.all([
   client.from('media_watch_snapshots').select('initial_items').eq('watch_id',claimed.watch_id).eq('user_id',claimed.user_id).maybeSingle(),
   client.from('media_watch_notifications').select('article').eq('watch_id',claimed.watch_id).eq('user_id',claimed.user_id).eq('status','sent').order('sent_at',{ascending:false}).range(0,100),
  ]);
  if(snap.error||history.error||!snap.data||!Array.isArray(history.data)||history.data.length>100)return [];
  const initial=snap.data.initial_items;if(!Array.isArray(initial))return [];
  return extractor({story,articles:claimed.articles,knownArticles:[...initial,...history.data.map(n=>n.article)]});
 }catch{return [];}
}
