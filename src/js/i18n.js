import en from '../locales/en.json';
import fr from '../locales/fr.json';

// Fallback used when neither a saved preference nor a browser locale is available.
const DEFAULT_LANGUAGE = "en";

const translations = { en, fr };
const LANGUAGE_STORAGE_KEY = 'watchAssistant.language';
let currentLanguage = DEFAULT_LANGUAGE;

const lookup = (messages, key) => key
  .split('.')
  .reduce((value, part) => value?.[part], messages);

const interpolate = (message, variables) => Object.entries(variables).reduce(
  (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
  message,
);

/** Return a translated string, falling back to English when a key is missing. */
export const t = (key, variables = {}) => {
  const message = lookup(translations[currentLanguage], key) ?? lookup(en, key);

  if (typeof message !== 'string') {
    console.warn(`Missing translation: ${key}`);
    return key;
  }

  return interpolate(message, variables);
};

export const getLanguage = () => currentLanguage;

const getSavedLanguage = () => {
  try {
    const language = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return translations[language] ? language : null;
  } catch {
    return null;
  }
};

const getBrowserLanguage = () => (
  navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
);

/** Translate text and supported attributes marked with data-i18n-* attributes. */
export const translatePage = (root = document) => {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  ['placeholder', 'aria-label', 'title'].forEach((attribute) => {
    const dataAttribute = `i18n${attribute
      .split('-')
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join('')}`;

    root.querySelectorAll(`[data-i18n-${attribute}]`).forEach((element) => {
      element.setAttribute(attribute, t(element.dataset[dataAttribute]));
    });
  });
};

/** Set the active language, persist it, and immediately update the page. */
export const setLanguage = (language, { persist = true } = {}) => {
  currentLanguage = translations[language] ? language : DEFAULT_LANGUAGE;

  if (persist) {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
    } catch {
      // The interface still switches if storage is unavailable or blocked.
    }
  }

  document.documentElement.lang = currentLanguage;
  translatePage();
  document.dispatchEvent(new CustomEvent('i18n:languageChanged'));
};

/** Apply a saved language, or infer English/French from the browser locale. */
export const initializeLanguage = () => {
  setLanguage(getSavedLanguage() || getBrowserLanguage(), { persist: false });
};

export { DEFAULT_LANGUAGE };
