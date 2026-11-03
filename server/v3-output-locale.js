export const normalizeV3OutputLocale=value=>value==='fr'?'fr':'en';
// Manual UI locale is current; scheduled work uses the same user's existing
// profile preference. Neither instruction nor evidence language is authority.
export async function resolveV3OutputLocale({client,ownerId,requested}={}){
 if(requested!==undefined)return normalizeV3OutputLocale(requested);
 if(!client?.rpc||!ownerId)return 'en';
 try{
  const r=await client.rpc('get_media_watch_notification_locale',{p_user_id:ownerId});
  return r.error?'en':normalizeV3OutputLocale(r.data);
 }catch{return 'en';}
}
export const v3OutputLocaleInstruction=locale=>`\nOutput locale: ${normalizeV3OutputLocale(locale)==='fr'?'French (fr)':'English (en)'}. Write user-facing reason and novelty_summary prose in this locale regardless of evidence or instruction language. Preserve proper nouns, official names, brands, source identities, numbers, dates and exact evidence meaning. Keep uncertainty qualification explicit in this locale.${normalizeV3OutputLocale(locale)==='fr'?' For STRONG_UNCONFIRMED alerts use an explicit qualification such as "non confirmé" or "confirmation officielle attendue".':''} Do not translate or rewrite source evidence, quoted evidence, references, URLs, field names, enum values or internal structured condition_check fields. All judgment, novelty, materiality, condition and evidence-admission rules above remain unchanged.`;
