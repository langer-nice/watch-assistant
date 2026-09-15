import { getJourneyFromLocation, getOnboardingFlows } from './onboarding-journeys.js';

// Optional audience copy uses the existing translation and animation machinery.
export const configureJourneyPresentation = (root, journey) => {
  Object.entries(journey.copy || {}).forEach(([key, translation]) => {
    ['data-i18n', 'data-flow-3-i18n'].forEach((attribute) => {
      root.querySelectorAll(`[${attribute}="flow3.${key}"]`).forEach((element) => {
        element.setAttribute(attribute, translation);
      });
    });
  });

  if (journey.requestNotice) {
    const flow = getOnboardingFlows().find((candidate) => candidate.journeyId === journey.id);
    const link = root.querySelector('[data-onboarding-first-watch]');
    if (flow && link) link.setAttribute('href', `new-watch.html?onboarding=first-watch&flow=${flow.id}`);
  }
};

// Carry only the audience ID in the URL, so reload and browser Back retain it.
// This decorates the existing composer; submission stays in the shared pipeline.
export const configureOnboardingRequest = (root = document) => {
  const input = root.querySelector('#newWatchInput');
  const params = new URLSearchParams(window.location.search);
  if (!input || params.get('onboarding') !== 'first-watch' || params.has('edit')) return;

  const journey = getJourneyFromLocation();
  if (!journey.requestNotice) return;

  let notice = root.querySelector('#onboardingRequestNotice');
  if (!notice) {
    notice = root.createElement('p');
    notice.id = 'onboardingRequestNotice';
    notice.className = 'watch-composer__helper';
    notice.setAttribute('data-i18n', journey.requestNotice);
    input.closest('.watch-composer').append(notice);
  }
  const descriptions = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  descriptions.add(notice.id);
  input.setAttribute('aria-describedby', [...descriptions].join(' '));
  if (journey.requestHelper) {
    root.querySelector('[data-i18n="newWatch.urlHelper"]')?.setAttribute('data-i18n', journey.requestHelper);
  }
};
