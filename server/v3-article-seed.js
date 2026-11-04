import {createHash} from 'node:crypto';
import {fetchPageMetadata} from './url-watch-api.js';

const htmlFailure=new Set(['UNSUPPORTED_CONTENT_TYPE','NOT_A_FEED']);
const unsupported=reason=>({decision:{status:'UNSUPPORTED_FOR_NOW',reason}});

// Reuse the public-URL/redirect/size/deadline protections of the existing
// feed and page readers. Never fetch a canonical URL or bypass an access gate.
export async function resolveV3UrlCapture(capture,{feed,pageMetadata=fetchPageMetadata}){
 let parsed;
 try{parsed=new URL(capture.raw_input);}catch{return unsupported('A valid public HTTPS feed or article URL is required.');}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password)return unsupported('A public HTTPS feed or article URL is required.');
 try{
  const initial=await feed(capture.raw_input);
  return {capture,baselineFeed:async url=>url===capture.raw_input?initial:feed(url)};
 }catch(error){
  if(error.code==='ACCESS_DENIED')return unsupported('This public feed or article denied access. No access restrictions were bypassed.');
  if(!htmlFailure.has(error.code))throw error; // Preserve real feed/network failures.
 }
 let page;
 try{page=await pageMetadata(capture.raw_input);}catch{return unsupported('This page could not be read as a public article reference.');}
 // No slug-derived access-challenge identity, homepage, login page or generic
 // page is silently converted into a story. Public metadata can suffice.
 const articleMetadata=page.openGraphType==='article'||page.jsonLdTypes?.some(t=>/Article|Posting$/i.test(t))||page.publishedAt;
 if(page.pageType!=='article'||!articleMetadata||!page.title||page.title.length>500||page.titleSource==='url_slug'||/^(?:sign in|log in|login|connexion|access denied|just a moment)\b/i.test(page.title)){
  return unsupported('This page does not provide enough public article identity to follow a specific story.');
 }
 const seed={original_url:capture.raw_input,canonical_url:page.canonicalUrl||null,title:page.title,
  publisher:page.siteName||new URL(page.resolvedUrl||capture.raw_input).hostname,
  published_at:page.publishedAt||null,description:(page.description||'').slice(0,1200)};
 const context={id:'article',kind:'article_reference',url:seed.original_url,text:JSON.stringify(seed)};
 const storyCapture={...capture,kind:'PAGE_CONTEXT',raw_input:'Follow future developments in the specific story described by this article.',context:[context]};
 const item={id:'article-seed:'+createHash('sha256').update(seed.original_url).digest('hex'),title:seed.title,
  excerpt:seed.description,url:seed.original_url,source:seed.publisher,...(seed.published_at?{publishedAt:seed.published_at}:{})};
 // The already-fetched seed is the initial reference. Future checks use the
 // normal news source, not this closure or another poll of the article page.
 return {capture:storyCapture,seed,baselineFeed:async url=>({source:{title:seed.publisher,url},checkedAt:new Date().toISOString(),items:[item]})};
}
