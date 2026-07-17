import { initializeLanguage, t } from './i18n.js';
import { initLanguageSwitcher } from './language-switcher.js';
import { getWatches } from './watch-storage.js';
import { registerCurrentIntroFlow } from './intro-flow.js';

registerCurrentIntroFlow();

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const localizeField = (watch, field) => (
  watch[`${field}Key`] ? t(watch[`${field}Key`]) : watch[field]
);

const hasMeaningfulUpdate = (watch) => {
  const latestChange = localizeField(watch, 'latestChange');
  return typeof latestChange === 'string' && latestChange.trim().length > 0;
};

const renderSampleBriefing = () => {
  const activeWatches = getWatches().filter((watch) => watch.status !== 'completed');
  const briefingWatches = activeWatches.filter(hasMeaningfulUpdate);
  const attentionWatches = activeWatches.filter((watch) => (
    watch.requiresAttention || watch.status === 'attention'
  ));
  const updatedWatches = briefingWatches.filter((watch) => (
    !watch.requiresAttention && watch.status !== 'attention'
  ));
  const demoQuietWatchCount = 39;
  const totalChecked = demoQuietWatchCount + activeWatches.length;

  const counts = {
    flow2CheckedCount: totalChecked,
    flow2AttentionCount: attentionWatches.length,
    flow2UpdatedCount: updatedWatches.length,
    flow2UnchangedCount: totalChecked - attentionWatches.length - updatedWatches.length,
  };
  Object.entries(counts).forEach(([id, count]) => {
    const element = document.querySelector(`#${id}`);
    if (element) element.textContent = String(count);
  });

  const list = document.querySelector('#flow2BriefingItems');
  if (!list) return;
  list.innerHTML = briefingWatches.map((watch) => {
    const needsAttention = watch.requiresAttention || watch.status === 'attention';
    const statusModifier = needsAttention ? 'action' : 'update';
    const status = t(needsAttention ? 'home.actNow' : 'home.updated');
    return `
      <article>
        <span class="status-badge status-badge--${statusModifier}">${escapeHtml(status)}</span>
        <h2>${escapeHtml(localizeField(watch, 'latestChange'))}</h2>
      </article>
    `;
  }).join('');
};

const initFlow = () => {
  const steps = [...document.querySelectorAll('[data-flow-step]')];
  let activeStep = 0;

  const showStep = (nextStep) => {
    if (!steps[nextStep] || nextStep === activeStep) {
      return;
    }

    steps[activeStep].hidden = true;
    steps[nextStep].hidden = false;
    activeStep = nextStep;
    steps[activeStep].focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-flow-next]')) {
      showStep(activeStep + 1);
    } else if (event.target.closest('[data-flow-back]')) {
      showStep(activeStep - 1);
    }
  });
};

initializeLanguage();
initLanguageSwitcher();
initFlow();
renderSampleBriefing();
document.addEventListener('i18n:languageChanged', renderSampleBriefing);
