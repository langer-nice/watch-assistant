import { currencyCriteriaFor, currencyPolicyFor, CURRENCY_POLICIES } from './currency-watch.js';
import { getAccountOwner } from './account-storage.js';
import { getWatchById, updateWatch } from './watch-storage.js';
import { getMediaPersistenceState } from './media-watch-server-store.js';

export const currencyPolicyCopy = {
  en: {
    label: 'Currency alert policy', save: 'Save alert policy',
    once: 'Once per condition (legacy)', crossing: 'Each threshold crossing', daily: 'Each changed matching daily rate',
    onceHelp: 'One alert for this condition. Falling below the target does not rearm it.',
    crossingHelp: 'Alert on the first matching observation, then wait for a later valid non-matching rate before alerting again.',
    dailyHelp: 'Alert for each new ECB publication date with a changed rate satisfying the selected comparison. Repeated observations and unchanged rates stay silent.',
    first: 'The first valid check can alert immediately if it matches; it is not historical context.',
    activation: 'A change takes effect when saved to your account. The last evaluated observation and alert history are retained; changing policy does not replay them.',
    cadence: 'Source: ECB daily reference rate, normally on TARGET business days. This is not a live market quote.',
    latest: 'Latest source publication date: ', none: 'No successful observation yet.',
    done: 'This condition has already alerted. Monitoring continues, but this policy will not alert again.',
    waiting: 'Next alert: after a valid non-matching rate, followed by a later matching rate.',
    ready: 'Next alert: the next new matching observation.',
    dailyNext: 'Next alert: a new publication date with a changed matching rate.',
  },
  fr: {
    label: 'Politique d’alerte de change', save: 'Enregistrer la politique d’alerte',
    once: 'Une fois par condition (historique)', crossing: 'À chaque franchissement du seuil', daily: 'À chaque nouveau cours quotidien correspondant',
    onceHelp: 'Une alerte pour cette condition. Un retour sous le seuil ne la réarme pas.',
    crossingHelp: 'Alerte au premier cours correspondant, puis attente d’un cours valide ultérieur ne remplissant pas la condition avant une nouvelle alerte.',
    dailyHelp: 'Alerte à chaque nouvelle date de publication BCE dont le cours a changé et respecte la comparaison choisie. Les observations répétées et les cours inchangés restent silencieux.',
    first: 'Le premier contrôle valide peut déclencher une alerte immédiatement ; il ne constitue pas un contexte historique.',
    activation: 'Le changement prend effet après enregistrement sur votre compte. Le dernier cours évalué et l’historique sont conservés ; changer de politique ne les rejoue pas.',
    cadence: 'Source : cours de référence quotidien BCE, normalement les jours ouvrés TARGET. Ce n’est pas un cours de marché en direct.',
    latest: 'Dernière date de publication de la source : ', none: 'Aucune observation réussie.',
    done: 'Cette condition a déjà déclenché une alerte. Le suivi continue, mais cette politique ne déclenchera plus d’alerte.',
    waiting: 'Prochaine alerte : après un cours valide ne remplissant pas la condition, suivi d’un cours ultérieur correspondant.',
    ready: 'Prochaine alerte : à la prochaine nouvelle observation correspondante.',
    dailyNext: 'Prochaine alerte : une nouvelle date de publication avec un cours modifié correspondant.',
  },
};
export const renderCurrencyPolicyControl = (watch, anchor, language) => {
  let panel = document.getElementById('currencyPolicyControl');
  if (!currencyCriteriaFor(watch)) { panel?.remove(); return; }
  const labels = currencyPolicyCopy[language === 'fr' ? 'fr' : 'en'];
  const policy = currencyPolicyFor(watch);
  const account = getAccountOwner();
  // A stable panel avoids changing focus or announcing ordinary background reads.
  const signature = JSON.stringify([watch.id, account, language, policy, watch.currencyEvaluation, watch.currencySatisfied, getMediaPersistenceState(watch)?.status]);
  if (panel?.dataset.signature === signature) return;
  if (!panel) { panel = document.createElement('section'); panel.id = 'currencyPolicyControl'; anchor.insertAdjacentElement('afterend', panel); }
  panel.dataset.signature = signature;
  panel.replaceChildren();
  const label = document.createElement('label'); label.textContent = labels.label; label.htmlFor = 'currencyPolicySelect';
  const select = document.createElement('select'); select.id = label.htmlFor;
  for (const value of CURRENCY_POLICIES) { const option = document.createElement('option'); option.value = value; option.textContent = labels[value]; option.selected = policy === value; select.append(option); }
  const button = document.createElement('button'); button.type = 'button'; button.className = 'button button--secondary'; button.textContent = labels.save;
  const saved = getMediaPersistenceState(watch)?.status === 'saved';
  select.disabled = !saved; button.disabled = true;
  const help = document.createElement('p'); help.textContent = labels[`${policy}Help`];
  select.onchange = () => { button.disabled = !saved || select.value === policy; help.textContent = labels[`${select.value}Help`]; };
  button.onclick = () => {
    const current = getWatchById(watch.id);
    if (!current || getAccountOwner() !== account || currencyPolicyFor(current) !== policy || getMediaPersistenceState(current)?.status !== 'saved') return;
    updateWatch(watch.id, { currencyPolicy: select.value });
  };
  panel.append(label, select, button, help);
  const next = policy === 'daily' ? labels.dailyNext : policy === 'crossing' && watch.currencyEvaluation?.met ? labels.waiting
    : policy === 'once' && watch.currencySatisfied ? labels.done : labels.ready;
  for (const text of [next, labels.first, labels.activation, labels.cadence, labels.latest + (watch.currencyEvaluation?.observationDate || labels.none)]) {
    const p = document.createElement('p'); p.textContent = text; panel.append(p);
  }
};
