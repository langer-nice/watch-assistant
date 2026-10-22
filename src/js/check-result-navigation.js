export const checkUpdateTargetId=id=>`watch-check-update-${encodeURIComponent(id)}`;

// Reuse the existing complete-history cards, selecting only identities from this
// completed check. Nothing here acknowledges, fetches or changes Watch data.
export const linkCheckResult=({feedback,section,updates,document,t,window})=>{
 if(!feedback||!section)return;
 const list=document.createElement('ul');list.className='detail-development-list';
 const found=[];
 for(const update of updates){
  const original=document.getElementById(checkUpdateTargetId(update.id));if(!original)continue;
  const card=original.cloneNode(true);card.id=`watch-check-result-${encodeURIComponent(update.id)}`;card.tabIndex=-1;list.append(card);found.push(card);
 }
 const heading=document.createElement('h2');heading.className='section-heading';heading.textContent=t('detail.resultsFromCheck');
 section.replaceChildren(heading,list);section.hidden=true;
 const fallback=document.getElementById('watchLatestDevelopments');
 const destination=found.length===1?found[0]:found.length?section:fallback&&!fallback.hidden?fallback:document.getElementById('watchMonitoringUpdates');
 const link=document.createElement('a');link.className='watch-fact-check__result-link';
 link.textContent=feedback.textContent.replace(/[.。]\s*$/u,'')+' →';
 link.href='#'+(destination?.id||'watchBriefing');
 feedback.replaceChildren(link);feedback.classList.add('is-action');
 const reveal=()=>{
  if(found.length)section.hidden=false;
  const target=destination||document.getElementById('watchBriefing');if(!target)return;
  const disclosure=target.closest('details');if(disclosure)disclosure.open=true;
  target.tabIndex=-1;target.focus({preventScroll:true});
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});
  section.dataset.navigationHash=window.location.hash;
 };
 link.onclick=event=>{
  if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();window.history.replaceState(window.history.state,'',link.getAttribute('href'));reveal();
 };
 if(window.location.hash===link.getAttribute('href')&&section.dataset.navigationHash!==window.location.hash)reveal();
};
