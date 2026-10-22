// Owner-bound control for the existing service-only activation RPC. No checks or email.
export const initStructuredMonitoringPreference = ({root,client,auth,location,t,onChanged=async()=>{},request=fetch}) => {
 if(!root||!client||!auth)return;
 const button=root.querySelector('[data-monitoring-toggle]'),hint=root.querySelector('[data-monitoring-hint]'),status=root.querySelector('[role=status]');
 const id=new URLSearchParams(location.search).get('id');if(!button||!hint||!status||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id||''))return;
 let generation=0,row=null,owner=null,busy=false,allowed=false,feedback=null;
 const session=()=>auth.getState().status==='authenticated'?auth.getState().session:null;
 const current=(epoch,user)=>generation===epoch&&session()?.user?.id===user&&owner===user;
 const render=()=>{button.textContent=t(row?.monitoring_state==='monitoring'?'detail.pauseWatch':'detail.resumeWatch');button.disabled=busy||!row||(row.monitoring_state!=='monitoring'&&!allowed);hint.textContent=t(allowed?'detail.structuredMonitoringDaily':'detail.structuredMonitoringUnavailable');status.textContent=feedback?t(feedback):'';};
 const call=async body=>{const token=session()?.access_token;if(!token)throw Error('AUTH_REQUIRED');const response=await request('/api/structured-watches',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw Error('MONITORING_FAILED');return response.json();};
 const scrub=()=>{row=null;busy=false;allowed=false;feedback=null;root.hidden=true;root.setAttribute('aria-busy','false');render();};
 const refresh=async()=>{const epoch=++generation;owner=session()?.user?.id;const expected=owner;scrub();if(!owner)return;
  try{const access=await call();if(!current(epoch,expected)||access.enabled!==true)return;
   const result=await client.from('watches').select('id,user_id,watch_definition,media_revision,monitoring_state').eq('id',id).eq('user_id',owner).is('deleted_at',null).range(0,0);
   if(!current(epoch,expected)||result.error)return;const value=result.data?.[0];
   if(value?.id!==id||value.user_id!==owner||value.watch_definition?.definitionVersion!=='watch-definition.v1'||value.watch_definition?.plan?.domain!=='media_news'||!Number.isSafeInteger(value.media_revision)||!['paused','monitoring'].includes(value.monitoring_state))return;
   row=value;allowed=access.monitoringEnabled===true;root.hidden=false;render();
  }catch{/* unavailable or unauthorized: keep this independent control hidden */}
 };
 const toggle=async()=>{if(busy||!row||session()?.user?.id!==owner)return;const epoch=generation,expected=owner,active=row.monitoring_state!=='monitoring';if(active&&!allowed)return;
  busy=true;feedback=null;root.setAttribute('aria-busy','true');render();
  try{const result=await call({action:'monitoring',watchId:id,expectedRevision:row.media_revision,active});if(!current(epoch,expected))return;
   if(result.id!==id||result.ownerId!==owner||result.revision!==row.media_revision+1||result.monitoringState!==(active?'monitoring':'paused'))throw Error('INVALID_RESULT');
   row={...row,media_revision:result.revision,monitoring_state:result.monitoringState};feedback=active?'detail.structuredMonitoringActive':'detail.structuredMonitoringPaused';await onChanged();
  }catch{if(current(epoch,expected))feedback='detail.structuredMonitoringFailed';}
  if(!current(epoch,expected))return;busy=false;root.setAttribute('aria-busy','false');render();
 };
 button.addEventListener('click',toggle);const unsubscribe=auth.subscribe(refresh);void refresh();
 return {refresh,render,destroy(){generation++;owner=null;unsubscribe?.();button.removeEventListener('click',toggle);scrub();}};
};
