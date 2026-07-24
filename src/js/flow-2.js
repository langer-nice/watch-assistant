import { t } from './i18n.js';
import { mountOnboardingLanguageControl } from './language-control.js';
import { getWatches } from './watch-storage.js';
import {
  beginOnboardingFirstWatch,
  registerCurrentIntroFlow,
  skipOnboarding,
} from './intro-flow.js';
import { initializeFlowLanguage } from './flow-language-gate.js';
import {
  initializeAnalytics,
  PRODUCT_EVENTS,
  trackProductEvent,
  trackProductEventOnce,
} from './analytics.js';

initializeAnalytics();
trackProductEventOnce(PRODUCT_EVENTS.LANDING_PAGE_VIEWED, { onboarding_flow: 'flow-2' });

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
    const statusModifier = needsAttention ? 'attention' : 'updated';
    const status = t(needsAttention ? 'statuses.attention' : 'statuses.updated');
    return `
      <article>
        <span class="status-label status-label--${statusModifier}">${escapeHtml(status)}</span>
        <h2>${escapeHtml(localizeField(watch, 'latestChange'))}</h2>
      </article>
    `;
  }).join('');
};

const initFlow = (languageControl) => {
  const steps = [...document.querySelectorAll('[data-flow-step]')];
  let activeStep = 0;

  const showStep = (nextStep) => {
    if (!steps[nextStep] || nextStep === activeStep) {
      return;
    }

    steps[activeStep].hidden = true;
    steps[nextStep].hidden = false;
    activeStep = nextStep;
    languageControl?.setTheme(activeStep === 0 ? 'dark' : 'light');
    steps[activeStep].focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-onboarding-first-watch]')) {
      trackProductEventOnce(PRODUCT_EVENTS.ONBOARDING_COMPLETED, { onboarding_flow: 'flow-2' });
      beginOnboardingFirstWatch();
    } else if (event.target.closest('[data-onboarding-skip]')) {
      trackProductEventOnce(PRODUCT_EVENTS.ONBOARDING_COMPLETED, { onboarding_flow: 'flow-2' });
      skipOnboarding();
    } else if (event.target.closest('[data-flow-next]')) {
      if (activeStep === 0) {
        trackProductEventOnce(PRODUCT_EVENTS.ONBOARDING_STARTED, { onboarding_flow: 'flow-2' });
      }
      showStep(activeStep + 1);
    } else if (event.target.closest('[data-flow-back]')) {
      showStep(activeStep - 1);
    } else {
      const example = event.target.closest('.flow-2__examples li');
      if (example) {
        const exampleIndex = [...example.parentElement.children].indexOf(example) + 1;
        trackProductEvent(PRODUCT_EVENTS.EXAMPLE_SELECTED, {
          onboarding_flow: 'flow-2',
          example_position: exampleIndex,
        });
      }
    }
  });
};

initializeFlowLanguage().then(() => {
  registerCurrentIntroFlow();
  const languageControl = mountOnboardingLanguageControl();
  initFlow(languageControl);
  renderSampleBriefing();
  document.addEventListener('i18n:languageChanged', renderSampleBriefing);
});
