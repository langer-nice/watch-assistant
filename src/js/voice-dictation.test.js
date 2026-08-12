import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';

register('./test-support/json-module-loader.js', import.meta.url);

import {
  createVoiceDictationController,
  getSpeechRecognitionConstructor,
  getSpeechRecognitionLocale,
  renderVoiceDictationState,
} from './voice-dictation.js';

const { default: en } = await import('../locales/en.json');
const { default: fr } = await import('../locales/fr.json');

const createInput = (value = '') => {
  const listeners = new Map();
  return {
    value,
    focusCount: 0,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatch(type) { listeners.get(type)?.forEach((listener) => listener({ type })); },
    focus() { this.focusCount += 1; },
  };
};

const createUiElement = () => {
  const attributes = new Map();
  const classes = new Set();
  return {
    hidden: false,
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, enabled) {
        if (enabled) classes.add(name); else classes.delete(name);
      },
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
  };
};

const createUi = () => ({
  button: createUiElement(),
  status: createUiElement(),
  idleIcon: createUiElement(),
  stopIcon: createUiElement(),
});

const renderUi = (ui, listening, messages = en.newWatch) => renderVoiceDictationState({
  ...ui,
  listening,
  label: messages[listening ? 'voiceStop' : 'voiceStart'],
});

const createRecognitionMock = () => {
  const instances = [];
  class RecognitionMock {
    constructor() {
      this.started = 0;
      this.stopped = 0;
      this.aborted = 0;
      instances.push(this);
    }
    start() { this.started += 1; }
    stop() { this.stopped += 1; }
    abort() { this.aborted += 1; }
    begin() { this.onstart?.(); }
    end() { this.onend?.(); }
    fail(error) { this.onerror?.({ error }); }
    result(resultIndex, ...segments) {
      const results = segments.map(({ transcript, final = false }) => {
        const result = [{ transcript }];
        result.isFinal = final;
        return result;
      });
      this.onresult?.({ resultIndex, results });
    }
  }
  return { RecognitionMock, instances };
};

const setup = ({ value = '', language = 'en' } = {}) => {
  const input = createInput(value);
  const { RecognitionMock, instances } = createRecognitionMock();
  const states = [];
  const errors = [];
  const ui = createUi();
  renderUi(ui, false, language === 'fr' ? fr.newWatch : en.newWatch);
  let transcriptChanges = 0;
  let controller;
  controller = createVoiceDictationController({
    input,
    Recognition: RecognitionMock,
    getLanguage: () => language,
    onStateChange: (state) => {
      states.push(state);
      renderUi(ui, state, language === 'fr' ? fr.newWatch : en.newWatch);
    },
    onError: (error) => errors.push(error),
    onTranscriptChange: () => {
      transcriptChanges += 1;
      input.dispatch('input');
    },
  });
  return {
    controller, input, instances, states, errors, ui,
    get transcriptChanges() { return transcriptChanges; },
  };
};

test('idle and active states swap icon, style, status, label, and ARIA on one control', () => {
  const context = setup();
  assert.equal(context.ui.idleIcon.hidden, false);
  assert.equal(context.ui.stopIcon.hidden, true);
  assert.equal(context.ui.status.hidden, true);
  assert.equal(context.ui.button.classList.contains('is-active'), false);
  assert.equal(context.ui.button.getAttribute('aria-label'), 'Start voice input');
  assert.equal(context.ui.button.getAttribute('aria-pressed'), 'false');

  context.controller.start();
  assert.equal(context.ui.idleIcon.hidden, true);
  assert.equal(context.ui.stopIcon.hidden, false);
  assert.equal(context.ui.status.hidden, false);
  assert.equal(context.ui.button.classList.contains('is-active'), true);
  assert.equal(context.ui.button.getAttribute('aria-label'), 'Stop voice input');
  assert.equal(context.ui.button.getAttribute('aria-pressed'), 'true');

  context.controller.stop();
  assert.equal(context.ui.idleIcon.hidden, false);
  assert.equal(context.ui.stopIcon.hidden, true);
  assert.equal(context.ui.status.hidden, true);
  assert.equal(context.ui.button.classList.contains('is-active'), false);
  assert.equal(context.ui.button.getAttribute('aria-label'), 'Start voice input');
  assert.equal(context.ui.button.getAttribute('aria-pressed'), 'false');
});

test('the composer has one Stop action and uses the strong attention color without resizing', async () => {
  const [html, styles] = await Promise.all([
    readFile(new URL('../../new-watch.html', import.meta.url), 'utf8'),
    readFile(new URL('../scss/components/_watch-composer.scss', import.meta.url), 'utf8'),
  ]);
  assert.equal((html.match(/data-voice-start/g) || []).length, 1);
  assert.equal((html.match(/data-voice-stop(?:[\s=>])/g) || []).length, 0);
  assert.match(html, /data-voice-idle-icon/);
  assert.match(html, /data-voice-stop-icon hidden/);
  assert.match(styles, /\.watch-composer__microphone\.is-active[\s\S]*?background: var\(--color-attention-strong\)/);
  assert.match(styles, /\.watch-composer__microphone\s*\{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
  const activeRule = styles.match(/\.watch-composer__microphone\.is-active[^\{]*\{[^}]+\}/)?.[0] || '';
  assert.doesNotMatch(activeRule, /(?:width|height):/);
});

test('French state labels use localized Start, Stop, and Listening copy', () => {
  const context = setup({ language: 'fr' });
  assert.equal(context.ui.button.getAttribute('aria-label'), 'Démarrer la saisie vocale');
  context.controller.start();
  assert.equal(context.ui.button.getAttribute('aria-label'), 'Arrêter la saisie vocale');
  assert.equal(fr.newWatch.voiceListening, 'Écoute en cours…');
});

test('detects standard and prefixed speech recognition support', () => {
  class Standard {}
  class Prefixed {}
  assert.equal(getSpeechRecognitionConstructor({ SpeechRecognition: Standard }), Standard);
  assert.equal(getSpeechRecognitionConstructor({ webkitSpeechRecognition: Prefixed }), Prefixed);
  assert.equal(getSpeechRecognitionConstructor({}), null);
});

test('uses the application English and French recognition locales', () => {
  assert.equal(getSpeechRecognitionLocale('en'), 'en-US');
  assert.equal(getSpeechRecognitionLocale('fr'), 'fr-FR');
  assert.equal(getSpeechRecognitionLocale('fr-CA'), 'fr-FR');
});

test('one start call creates one continuous interim recognition session', () => {
  const context = setup({ language: 'fr' });
  assert.equal(context.controller.start(), true);
  assert.equal(context.controller.start(), false);
  assert.equal(context.instances.length, 1);
  assert.equal(context.instances[0].started, 1);
  assert.equal(context.instances[0].lang, 'fr-FR');
  assert.equal(context.instances[0].continuous, true);
  assert.equal(context.instances[0].interimResults, true);
  assert.equal(context.controller.isListening(), true);
});

test('interim and final results replace segments without duplication', () => {
  const context = setup({ value: 'Tell me when' });
  context.controller.start();
  const recognition = context.instances[0];
  recognition.result(0, { transcript: ' a new' });
  assert.equal(context.input.value, 'Tell me when a new');
  recognition.result(0, { transcript: 'a new trailer', final: true });
  assert.equal(context.input.value, 'Tell me when a new trailer');
  recognition.result(1,
    { transcript: 'a new trailer', final: true },
    { transcript: 'is released', final: true });
  assert.equal(context.input.value, 'Tell me when a new trailer is released');
  assert.equal(context.transcriptChanges, 3);
});

test('explicit stop preserves text, restores idle, and returns focus', () => {
  const context = setup();
  context.controller.start();
  context.instances[0].result(0, { transcript: 'Long conversational request' });
  context.controller.stop();
  assert.equal(context.instances[0].stopped, 1);
  assert.equal(context.controller.isListening(), false);
  assert.equal(context.input.value, 'Long conversational request');
  assert.equal(context.input.focusCount, 1);
  assert.equal(context.ui.button.classList.contains('is-active'), false);
  assert.equal(context.ui.idleIcon.hidden, false);
});

test('repeated sessions append once to the previously captured text', () => {
  const context = setup();
  context.controller.start();
  context.instances[0].result(0, { transcript: 'first part', final: true });
  context.controller.stop();
  context.controller.start();
  context.instances[1].result(0, { transcript: 'second part', final: true });
  context.controller.stop();
  assert.equal(context.input.value, 'first part second part');
  assert.equal(context.instances.length, 2);
});

test('recognition errors preserve input and allow a later attempt', () => {
  for (const [error, key] of [
    ['not-allowed', 'newWatch.voicePermissionDenied'],
    ['no-speech', 'newWatch.voiceNoSpeech'],
    ['audio-capture', 'newWatch.voiceMicrophoneUnavailable'],
    ['network', 'newWatch.voiceRecognitionFailed'],
    ['aborted', 'newWatch.voiceRecognitionInterrupted'],
  ]) {
    const context = setup({ value: 'Keep this' });
    context.controller.start();
    context.instances[0].fail(error);
    assert.equal(context.input.value, 'Keep this');
    assert.equal(context.controller.isListening(), false);
    assert.equal(context.ui.button.classList.contains('is-active'), false);
    assert.equal(context.ui.idleIcon.hidden, false);
    assert.equal(context.errors.at(-1), key);
    assert.equal(context.controller.start(), true);
  }
});

test('automatic end preserves captured text and restores idle state', () => {
  const context = setup();
  context.controller.start();
  const recognition = context.instances[0];
  recognition.result(0, { transcript: 'captured words', final: true });
  recognition.end();
  assert.equal(context.input.value, 'captured words');
  assert.equal(context.controller.isListening(), false);
  assert.equal(context.ui.button.classList.contains('is-active'), false);
  assert.equal(context.ui.idleIcon.hidden, false);
});

test('manual edits abort recognition and stale callbacks cannot overwrite them', () => {
  const context = setup();
  context.controller.start();
  const recognition = context.instances[0];
  const staleResult = recognition.onresult;
  recognition.result(0, { transcript: 'interim text' });
  context.input.value = 'My manual edit';
  context.input.dispatch('input');
  assert.equal(recognition.aborted, 1);
  assert.equal(context.ui.button.classList.contains('is-active'), false);
  staleResult({ resultIndex: 0, results: [[{ transcript: 'stale speech' }]] });
  assert.equal(context.input.value, 'My manual edit');
});

test('destroy aborts the active session, ignores callbacks, and removes its input listener', () => {
  const context = setup({ value: 'Original' });
  context.controller.start();
  const recognition = context.instances[0];
  const staleResult = recognition.onresult;
  context.controller.destroy();
  assert.equal(recognition.aborted, 1);
  staleResult({ resultIndex: 0, results: [[{ transcript: 'late result' }]] });
  assert.equal(context.input.value, 'Original');
  context.input.dispatch('input');
  assert.equal(context.controller.start(), false);
});

test('localized UI and error strings exist in English and French', () => {
  for (const messages of [en.newWatch, fr.newWatch]) {
    for (const key of [
      'voiceStart', 'voiceListening', 'voiceStop', 'voiceUnavailable', 'voiceUnsupported',
      'voicePermissionDenied', 'voiceNoSpeech', 'voiceMicrophoneUnavailable',
      'voiceRecognitionInterrupted', 'voiceRecognitionFailed',
    ]) {
      assert.equal(typeof messages[key], 'string');
      assert.ok(messages[key].length > 0);
    }
  }
});
