// Loaded only by the explicit loopback staging validation harness.
import '../../scss/main.scss';
import {configureAccountStorage} from '../account-storage.js';
import {configureMediaWatchServerStore,synchronizeMediaWatches} from '../media-watch-server-store.js';
import {initializeLanguage,setLanguage} from '../i18n.js';
import {initTopNavigation} from '../top-navigation.js';
import {initApp} from '../navigation.js';
const params=new URLSearchParams(location.search);
const bootstrap=await fetch(`/fixture-bootstrap?account=${params.get('account')==='1'?'1':'0'}`).then(r=>r.json());
const auth={getState:()=>({status:'authenticated',session:bootstrap.session}),subscribe:()=>()=>{}};
configureAccountStorage(auth);
await configureMediaWatchServerStore(auth);
initializeLanguage();setLanguage(params.get('lang')||'en');initTopNavigation();initApp();
const controls=document.createElement('section');controls.id='stagingTestControls';
const heading=document.createElement('h2');heading.textContent='Synthetic staging validation — email disabled';controls.append(heading);
const add=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=fn;controls.append(b);};
add('Clear all browser storage and reload',()=>{localStorage.clear();sessionStorage.clear();location.reload();});
add('Switch synthetic account',()=>{params.set('account',params.get('account')==='1'?'0':'1');location.search=params.toString();});
add('English',()=>setLanguage('en'));add('Français',()=>setLanguage('fr'));
const proof=document.createElement('pre');controls.append(proof);
add('Verify silent background refresh',async()=>{
 const notice=document.getElementById('watchMediaPersistenceNotice');const policy=document.getElementById('currencyPolicyControl');
 const initial=notice?.textContent;const original=policy;let changed=false;
 const observer=new MutationObserver(()=>{changed=true;});if(notice)observer.observe(notice,{subtree:true,childList:true,characterData:true});
 await synchronizeMediaWatches({readOnly:true});observer.disconnect();
 proof.textContent=JSON.stringify({silent:!changed&&notice?.textContent===initial,policyPanelStable:document.getElementById('currencyPolicyControl')===original});
});
document.body.prepend(controls);
