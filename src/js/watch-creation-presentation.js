// Presentation only: no requests, retries, timers, Watch data or success tests.
const transitionKey='watchAssistant.creationTransition';
export const watchCreationCopy=language=>language==='fr'
 ? {button:'Création de la Watch…',pending:'Création de votre Watch…',opening:'Chargement de votre Watch…'}
 : {button:'Creating Watch…',pending:'Creating your Watch…',opening:'Loading your Watch…'};

export const markWatchCreationTransition=(id,{storage,now=Date.now()}={})=>{
 try{(storage??globalThis.sessionStorage)?.setItem(transitionKey,JSON.stringify({id,at:now}));}catch{/* Optional UI handoff. */}
};
export const isWatchCreationTransition=({id,found,availability,storage,now=Date.now()})=>{
 try{
  storage??=globalThis.sessionStorage;
  const marker=JSON.parse(storage?.getItem(transitionKey)||'null');
  if(!marker||marker.id!==id)return false;
  const loading=!availability.active||availability.loading||availability.waiting;
  if(found||availability.failed||!loading||now-marker.at>120000||now<marker.at){storage.removeItem(transitionKey);return false;}
  return true;
 }catch{return false;}
};

export function createWatchCreationPresentation({form,status,getLanguage,listen,isCurrent=()=>true}){
 const button=form.querySelector('#newWatchSubmit'),label=form.querySelector('#newWatchSubmitLabel');
 let pending=false,navigating=false,controls=[],previousLabel='',focusBefore=null;
 const document=form.ownerDocument;
 listen(form,'submit',event=>{
  if(pending){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 const safe=render=>(...args)=>{try{return render(...args);}catch{/* Presentation must not interrupt creation. */}};
 return {
  start:safe(()=>{
   if(!button||!label||pending)return;
   pending=true;navigating=false;focusBefore=document.activeElement;previousLabel=label.textContent;
   controls=[...form.querySelectorAll('input,textarea,select,button')].map(node=>({node,disabled:node.disabled,readOnly:node.readOnly}));
   for(const {node} of controls){if(node.matches('textarea,input:not([type=checkbox]):not([type=radio])'))node.readOnly=true;else node.disabled=true;}
   form.classList.add('is-creating');form.setAttribute('aria-busy','true');button.setAttribute('aria-busy','true');
   let spinner=button.querySelector('.watch-creation-spinner');
   if(!spinner){spinner=document.createElement('span');spinner.className='watch-creation-spinner';spinner.setAttribute('aria-hidden','true');button.prepend(spinner);}
   spinner.hidden=false;label.textContent=watchCreationCopy(getLanguage()).button;
   if(status){
    button.after(status);status.classList.add('watch-creation-status');status.setAttribute('role','status');status.setAttribute('aria-atomic','true');
    status.textContent=watchCreationCopy(getLanguage()).pending;
   }
  }),
  navigating:safe(id=>{navigating=true;markWatchCreationTransition(id);}),
  finish:safe(()=>{
   // Keep the visible pending state until the existing navigation unloads us.
   if(!pending||navigating||!isCurrent())return;
   pending=false;
   for(const {node,disabled,readOnly} of controls){node.disabled=disabled;if(node.matches('textarea,input'))node.readOnly=Boolean(readOnly);}
   controls=[];form.classList.remove('is-creating');form.removeAttribute('aria-busy');button.removeAttribute('aria-busy');
   button.querySelector('.watch-creation-spinner').hidden=true;label.textContent=previousLabel;
   if(focusBefore?.isConnected&&(!document.activeElement||document.activeElement===document.body||form.contains(document.activeElement)))focusBefore.focus();
  }),
 };
}
