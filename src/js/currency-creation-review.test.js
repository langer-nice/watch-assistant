import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { showCurrencyCreationReview } from './currency-creation-review.js';
for(const language of ['fr','en']) test(`currency review requires policy confirmation and preserves the original: ${language}`,()=>{
  const old=globalThis.document;
  const {document,window}=parseHTML('<form></form>'); globalThis.document=document;
  // linkedom has a read-only select.value; mirror the browser selection setter.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._selectedValue || '';},set(v){this._selectedValue=[...this.options].some(o=>o.value===v)?v:'';}});
  try {
    const form=document.querySelector('form'); let saved;
    const listen=(el,event,fn)=>el.addEventListener(event,fn);
    const request='Notify me when GBP reaches 1.17 EUR';
    showCurrencyCreationReview({form,request,language,listen,confirm:policy=>{saved=policy;}});
    const select=form.querySelector('select');const create=form.querySelector('button');
    assert.equal(select.value,'');assert.equal(create.disabled,true);assert.ok(form.textContent.includes(request));
    select.value='crossing';select.dispatchEvent(new window.Event('change'));assert.equal(create.disabled,false);
    create.click();assert.equal(saved,'crossing');assert.equal(form.querySelector('[data-currency-review]'),null);
    const recurring='Préviens-moi chaque fois que le taux de la livre sterling change et qu’une livre vaut plus de 1,17 euro.';
    showCurrencyCreationReview({form,request:recurring,language,listen,confirm:policy=>{saved=policy;}});
    assert.equal(form.querySelector('select').value,'daily');
    assert.ok(form.textContent.includes(recurring));assert.match(form.textContent,/> 1[,.]17/);
    form.querySelectorAll('button')[1].click();assert.equal(form.classList.contains('is-reviewing'),false);
  } finally {globalThis.document=old;}
});
