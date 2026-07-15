import { initializeLanguage } from './i18n.js';
import { initLanguageSwitcher } from './language-switcher.js';

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
