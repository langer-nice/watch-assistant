import { currencyOverview, parseCurrencyRequest, requestedCurrencyPolicy, CURRENCY_POLICIES } from './currency-watch.js';
import { currencyPolicyCopy } from './currency-policy-control.js';

// Confirm the original instruction, comparison and policy before persistence.
// No generated reformulation becomes the authoritative request.
export const showCurrencyCreationReview = ({ form, request, language, listen, confirm }) => {
  form.querySelector('[data-currency-review]')?.remove();
  const fr = language === 'fr'; const labels = currencyPolicyCopy[fr ? 'fr' : 'en'];
  const panel = document.createElement('section'); panel.dataset.currencyReview = '';
  const heading = document.createElement('h2'); heading.textContent = fr ? 'Confirmer la Watch de change' : 'Confirm currency Watch';
  heading.tabIndex = -1;
  const original = document.createElement('p'); original.textContent = request;
  const summary = document.createElement('p'); summary.textContent = currencyOverview(parseCurrencyRequest(request), language);
  const label = document.createElement('label'); label.htmlFor = 'creationCurrencyPolicy'; label.textContent = labels.label;
  const select = document.createElement('select'); select.id = label.htmlFor;
  const inferred = requestedCurrencyPolicy(request);
  const empty = document.createElement('option'); empty.value = ''; empty.textContent = fr ? 'Quand souhaitez-vous être prévenu ?' : 'When would you like to be notified?'; select.append(empty);
  for (const value of CURRENCY_POLICIES) { const option = document.createElement('option'); option.value = value; option.textContent = value === 'once' ? (fr ? 'Une seule fois' : 'Once') : labels[value]; select.append(option); }
  select.value = inferred || '';
  const help = document.createElement('p'); help.setAttribute('aria-live', 'polite');
  const update = () => { help.textContent = select.value ? labels[`${select.value}Help`] : (fr ? 'Une seule fois, à chaque franchissement du seuil, ou à chaque cours quotidien modifié qui remplit la condition ?' : 'Once, on each threshold crossing, or on each changed daily rate that matches?'); create.disabled = !select.value; };
  const first = document.createElement('p'); first.textContent = labels.first;
  const create = document.createElement('button'); create.type = 'button'; create.className = 'button button--primary'; create.textContent = fr ? 'Confirmer et créer la Watch' : 'Confirm and create Watch';
  const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = fr ? 'Modifier ma demande' : 'Edit my request';
  const close = () => { form.classList.remove('is-reviewing'); panel.remove(); };
  listen(select, 'change', update);
  listen(edit, 'click', close);
  listen(create, 'click', () => { if (!CURRENCY_POLICIES.includes(select.value)) return; const policy = select.value; close(); void confirm(policy); });
  panel.append(heading, original, summary, label, select, help, first, create, edit);
  form.classList.add('is-reviewing'); form.append(panel); update(); heading.focus();
};
