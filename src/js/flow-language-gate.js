import { setLanguage } from './i18n.js';

const SUPPORTED_LANGUAGES = ['en', 'fr'];
const LANGUAGE_QUERY_PARAMETER = 'lang';

const getUrlLanguage = () => {
  const language = new URL(window.location.href).searchParams.get(LANGUAGE_QUERY_PARAMETER);
  return SUPPORTED_LANGUAGES.includes(language) ? language : null;
};

const updateUrlLanguage = (language) => {
  const url = new URL(window.location.href);
  url.searchParams.set(LANGUAGE_QUERY_PARAMETER, language);
  window.history.replaceState(window.history.state, '', url);
};

const showFlow = () => {
  document.querySelector('[data-flow-language-selection]')?.remove();
  document.body.removeAttribute('data-flow-language-gate');
};

const createLanguageSelection = () => {
  const selection = document.createElement('main');
  selection.className = 'flow-language-selection';
  selection.dataset.flowLanguageSelection = '';
  selection.innerHTML = `
    <section class="flow-language-selection__content" aria-labelledby="flowLanguageSelectionTitle">
      <p class="flow-language-selection__brand">WATCH ASSISTANT</p>
      <h1 id="flowLanguageSelectionTitle">Choose your language</h1>
      <div class="flow-language-selection__actions">
        <button class="button flow-language-selection__button" type="button" data-flow-language="en">English</button>
        <button class="button flow-language-selection__button" type="button" data-flow-language="fr" lang="fr">Français</button>
      </div>
    </section>
  `;
  return selection;
};

const keepUrlInSync = () => {
  if (document.documentElement.dataset.flowLanguageUrlSync === 'true') return;

  document.documentElement.dataset.flowLanguageUrlSync = 'true';
  document.addEventListener('i18n:languageChanged', () => {
    const language = document.documentElement.lang;
    if (SUPPORTED_LANGUAGES.includes(language)) updateUrlLanguage(language);
  });
};

/**
 * Resolve only when a public onboarding flow has a valid selected language.
 * Future flows can use the same gate by awaiting this before starting their UI.
 */
export const initializeFlowLanguage = ({ onLanguageSelection } = {}) => {
  keepUrlInSync();
  const urlLanguage = getUrlLanguage();

  if (urlLanguage) {
    setLanguage(urlLanguage);
    showFlow();
    return Promise.resolve(urlLanguage);
  }

  document.title = 'Watch Assistant';
  const selection = createLanguageSelection();
  document.body.prepend(selection);

  return new Promise((resolve) => {
    selection.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-flow-language]');
      const language = button?.dataset.flowLanguage;
      if (!SUPPORTED_LANGUAGES.includes(language)) return;

      updateUrlLanguage(language);
      if (onLanguageSelection) {
        await onLanguageSelection(language, showFlow);
      } else {
        setLanguage(language);
        showFlow();
      }
      resolve(language);
    });
  });
};

export { LANGUAGE_QUERY_PARAMETER, SUPPORTED_LANGUAGES };
