import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {linkCheckResult,checkUpdateTargetId} from './check-result-navigation.js';
const setup=(ids=['found'])=>{
 const {document}=parseHTML(`<p id="feedback" role="status">${ids.length} new updates found.</p><section id="watchCheckResults" hidden></section><section id="watchLatestDevelopments"></section><section id="watchMonitoringUpdates"><ul>${['history',...ids].map(id=>`<li id="${checkUpdateTargetId(id)}"><h3>${id} headline</h3><p>${id} summary</p><a href="https://example.test/${id}">Original source</a></li>`).join('')}</ul></section>`);
 const calls=[],window={location:{hash:''},history:{state:null,replaceState(_,__,hash){window.location.hash=hash;}},matchMedia:()=>({matches:false})};
 for(const node of document.querySelectorAll('*')){node.focus=()=>calls.push(['focus',node.id]);node.scrollIntoView=options=>calls.push(['scroll',node.id,options]);}
 const section=document.getElementById('watchCheckResults'),feedback=document.getElementById('feedback');
 linkCheckResult({document,section,feedback,updates:ids.map(id=>({id})),t:()=> 'What this check found',window});
 const target=section.firstElementChild; // Cloned cards receive their own native focus in a browser.
 for(const node of section.querySelectorAll('*')){node.focus=()=>calls.push(['focus',node.id]);node.scrollIntoView=options=>calls.push(['scroll',node.id,options]);}
 return {document,section,feedback,window,calls,click:()=>feedback.querySelector('a').onclick({button:0,preventDefault(){}})};
};
test('one result is a native full-area link to exactly the completed-check update',()=>{
 const s=setup(['new/one']);const link=s.feedback.querySelector('a');assert.equal(link.tagName,'A');assert.equal(link.getAttribute('href'),'#watch-check-result-new%2Fone');assert.match(link.textContent,/→$/);
 s.click();assert.equal(s.section.hidden,false);assert.equal(s.section.querySelectorAll('li').length,1);assert.match(s.section.textContent,/new\/one headline/);assert.match(s.section.textContent,/new\/one summary/);assert(s.section.querySelector('a[href="https://example.test/new/one"]'));assert(!s.section.textContent.includes('history headline'));assert.equal(s.calls[0][1],'watch-check-result-new%2Fone');
});
test('multiple results scroll to a list containing only this completed check',()=>{
 const s=setup(['a','b','c']);assert.equal(s.feedback.querySelector('a').getAttribute('href'),'#watchCheckResults');s.click();assert.equal(s.section.querySelectorAll('li').length,3);assert(!s.section.textContent.includes('history headline'));assert.equal(s.calls[0][1],'watchCheckResults');assert.equal(s.calls[1][2].behavior,'smooth');
});
test('missing exact result safely falls back to developments without fabricated cards',()=>{
 const s=setup([]);s.click();assert.equal(s.section.hidden,true);assert.equal(s.feedback.querySelector('a').getAttribute('href'),'#watchLatestDevelopments');assert.equal(s.calls[0][1],'watchLatestDevelopments');
});
test('empty/error states remain non-actions; native link and mobile target remain accessible',async()=>{
 const [source,html,css]=await Promise.all(['navigation.js','../../watch-detail.html','../scss/pages/_watch-detail.scss'].map(p=>readFile(new URL(p,import.meta.url),'utf8')));
 assert(!html.includes('watchCheckReview'));
 assert.match(source,/if\(\['matching-items','new-items'\]\.includes\(outcome\)\)linkCheckResult/);
 assert.match(source,/if \(lastAttemptFailed\) \{[\s\S]*?dataset.state = 'error'/);
 assert.match(css,/watch-fact-check__result-link[\s\S]*?min-height:\s*2\.75rem/);
 assert.match(css,/result-link:focus-visible/);
});
