const SPEECH_ERROR_KEYS = {
  'not-allowed': 'newWatch.voicePermissionDenied',
  'service-not-allowed': 'newWatch.voicePermissionDenied',
  'audio-capture': 'newWatch.voiceMicrophoneUnavailable',
  'no-speech': 'newWatch.voiceNoSpeech',
  network: 'newWatch.voiceRecognitionFailed',
  aborted: 'newWatch.voiceRecognitionInterrupted',
};

const appendTranscript = (prefix, transcript) => {
  const spokenText = transcript.trim();
  if (!spokenText) return prefix;
  if (!prefix || /\s$/.test(prefix)) return `${prefix}${spokenText}`;
  return `${prefix} ${spokenText}`;
};

export const getSpeechRecognitionConstructor = (browserWindow = window) => (
  browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null
);

export const getSpeechRecognitionLocale = (language) => (
  String(language).toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US'
);

export const renderVoiceDictationState = ({
  button,
  status,
  idleIcon,
  stopIcon,
  listening,
  label,
}) => {
  if (status) status.hidden = !listening;
  if (idleIcon) idleIcon.hidden = listening;
  if (stopIcon) stopIcon.hidden = !listening;
  if (!button) return;
  button.classList.toggle('is-active', listening);
  button.setAttribute('aria-pressed', String(listening));
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
};

export const createVoiceDictationController = ({
  input,
  Recognition,
  getLanguage,
  onStateChange = () => {},
  onTranscriptChange = () => {},
  onError = () => {},
}) => {
  let recognition = null;
  let sessionId = 0;
  let listening = false;
  let destroyed = false;
  let applyingTranscript = false;
  let prefix = '';
  let segments = [];

  const setListening = (nextListening) => {
    listening = nextListening;
    onStateChange(listening);
  };

  const detachRecognition = () => {
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition = null;
  };

  const finish = ({ abort = false, focus = false } = {}) => {
    if (!recognition) {
      setListening(false);
      return;
    }
    const currentRecognition = recognition;
    sessionId += 1;
    detachRecognition();
    setListening(false);
    try {
      if (abort && typeof currentRecognition.abort === 'function') currentRecognition.abort();
      else currentRecognition.stop();
    } catch {
      // Browsers may throw when recognition has already ended.
    }
    if (focus) input.focus();
  };

  const handleManualInput = () => {
    if (!applyingTranscript && listening) finish({ abort: true });
  };
  input.addEventListener('input', handleManualInput);

  const start = () => {
    if (destroyed || listening || !Recognition) return false;
    const currentSessionId = ++sessionId;
    const currentRecognition = new Recognition();
    recognition = currentRecognition;
    prefix = input.value;
    segments = [];
    currentRecognition.lang = getSpeechRecognitionLocale(getLanguage());
    currentRecognition.continuous = true;
    currentRecognition.interimResults = true;

    currentRecognition.onstart = () => {
      if (currentSessionId !== sessionId || recognition !== currentRecognition) return;
      onError(null);
      setListening(true);
    };
    currentRecognition.onresult = (event) => {
      if (currentSessionId !== sessionId || recognition !== currentRecognition) return;
      segments.length = event.results.length;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        segments[index] = result[0]?.transcript || '';
      }
      const transcript = segments
        .filter(Boolean)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(' ');
      applyingTranscript = true;
      try {
        input.value = appendTranscript(prefix, transcript);
        onTranscriptChange(input.value);
      } finally {
        applyingTranscript = false;
      }
    };
    currentRecognition.onerror = (event) => {
      if (currentSessionId !== sessionId || recognition !== currentRecognition) return;
      const key = SPEECH_ERROR_KEYS[event.error] || 'newWatch.voiceRecognitionFailed';
      finish({ abort: true });
      onError(key);
    };
    currentRecognition.onend = () => {
      if (currentSessionId !== sessionId || recognition !== currentRecognition) return;
      detachRecognition();
      setListening(false);
    };

    setListening(true);
    onError(null);
    try {
      currentRecognition.start();
      return true;
    } catch {
      finish({ abort: true });
      onError('newWatch.voiceRecognitionFailed');
      return false;
    }
  };

  const stop = ({ focus = true } = {}) => finish({ focus });
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    finish({ abort: true });
    input.removeEventListener('input', handleManualInput);
  };

  return { start, stop, destroy, isListening: () => listening };
};
