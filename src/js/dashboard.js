import { getFlowUrl, getOnboardingFlows } from './onboarding-journeys.js';

const journeyList = document.querySelector('[data-dashboard-journeys]');

const copyText = async (value) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.append(textArea);
  textArea.select();
  document.execCommand('copy');
  textArea.remove();
};

const createJourneyCard = (flow) => {
  const card = document.createElement('article');
  const title = document.createElement('h2');
  const description = document.createElement('p');
  const actions = document.createElement('div');
  const launchLink = document.createElement('a');
  const copyButton = document.createElement('button');
  const status = document.createElement('span');
  const statusId = `flow${flow.id}CopyStatus`;
  let statusTimer;

  card.className = 'introduction-card';
  title.textContent = flow.label;
  description.className = 'introduction-card__description';
  description.textContent = flow.description;
  actions.className = 'introduction-card__actions';

  launchLink.className = 'button button--primary';
  launchLink.href = getFlowUrl(flow);
  launchLink.textContent = 'Launch';

  copyButton.className = 'button button--secondary introduction-card__copy';
  copyButton.type = 'button';
  copyButton.textContent = 'Copy Link';
  copyButton.setAttribute('aria-describedby', statusId);

  status.className = 'introduction-card__status';
  status.id = statusId;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  copyButton.addEventListener('click', async () => {
    const shareableUrl = new URL(getFlowUrl(flow), document.baseURI).href;

    try {
      await copyText(shareableUrl);
      status.textContent = 'Copied!';
      window.clearTimeout(statusTimer);
      statusTimer = window.setTimeout(() => {
        status.textContent = '';
      }, 1800);
    } catch {
      status.textContent = 'Copy failed';
    }
  });

  actions.append(launchLink, copyButton, status);
  card.append(title, description, actions);
  return card;
};

if (journeyList) {
  journeyList.replaceChildren(...getOnboardingFlows().map(createJourneyCard));
}
