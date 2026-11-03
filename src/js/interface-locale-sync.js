// Persist the existing UI locale in the existing owner-bound profile field.
// No preference UI, Watch mutation, translation or new storage schema.
export function configureInterfaceLocaleSync({client,auth,getLocale,events=globalThis.document}={}){
 if(!client||!auth||!getLocale)return null;
 let stopped=false,version=0,last=null,flight=Promise.resolve();
 const owner=()=>auth.getState()?.status==='authenticated'?auth.getState().session?.user?.id:null;
 const sync=()=>{
  const user=owner(),locale=getLocale()==='fr'?'fr':'en',key=user+':'+locale;
  if(!user){version++;last=null;return flight;}
  if(last===key)return flight;
  last=key;const epoch=++version;
  flight=flight.catch(()=>{}).then(async()=>{
   if(stopped||epoch!==version||user!==owner())return;
   try{const result=await client.from('profiles').update({locale}).eq('id',user);
    if(result.error&&last===key)last=null;
   }catch{if(last===key)last=null;}
  });
  return flight;
 };
 const unsubscribe=auth.subscribe(sync);events?.addEventListener('i18n:languageChanged',sync);void sync();
 return {sync,destroy(){stopped=true;version++;unsubscribe?.();events?.removeEventListener('i18n:languageChanged',sync);}};
}
