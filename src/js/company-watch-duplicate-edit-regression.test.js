import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { configureAccountStorage } from './account-storage.js';

register('./test-support/json-module-loader.js', import.meta.url);

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('duplicate Company UX stays in Review with accessible owned-Watch actions', async () => {
  const [navigation, html, styles, en, fr] = await Promise.all([
    read('./navigation.js'),
    read('../../new-watch.html'),
    read('../scss/components/_url-review.scss'),
    read('../locales/en.json').then(JSON.parse),
    read('../locales/fr.json').then(JSON.parse),
  ]);
  const createHandler = navigation.match(
    /editor\.listen\(reviewCreate, 'click',[\s\S]*?editor\.listen\(reviewCancel, /,
  )?.[0] || '';
  const duplicateFlow = navigation.match(
    /const showCompanyDuplicate =[\s\S]*?const startCompanyReview/,
  )?.[0] || '';

  assert.match(createHandler, /ACTIVE_WATCH_EXISTS[\s\S]*?showCompanyDuplicate\(error\.existingWatch\)[\s\S]*?return/);
  assert.doesNotMatch(
    createHandler.match(/if \(error\?\.code === 'ACTIVE_WATCH_EXISTS'\)[\s\S]*?return;/)?.[0] || '',
    /resetUrlFlow/,
  );
  assert.match(duplicateFlow, /reviewCreate\.disabled = true[\s\S]*?reviewCreate\.hidden = true/);
  assert.match(duplicateFlow, /getWatchDetailHref\(existingWatch\.id\)/);
  assert.match(duplicateFlow, /reviewCancel\.hidden = true/);
  assert.match(html, /id="companyDuplicateNotice"[\s\S]*?role="alert"/);
  assert.match(html, /id="companyDuplicateOpen"[\s\S]*?id="companyDuplicateCancel"/);
  assert.match(styles, /\.url-review__duplicate[\s\S]*?border: 2px solid var\(--color-status-action\)/);
  assert.equal(en.newWatch.companyDuplicateTitle, 'You are already monitoring this company.');
  assert.equal(en.newWatch.companyDuplicateOpen, 'Open existing Watch');
  assert.equal(fr.newWatch.companyDuplicateTitle, 'Vous surveillez déjà cette entreprise.');
  assert.equal(fr.newWatch.companyDuplicateOpen, 'Ouvrir la Watch existante');
});

test('server Company modal edit hydrates auth without profile UI and closes instead of leaking routes', async () => {
  const [authUi, main, navigation] = await Promise.all([
    read('./auth-ui.js'),
    read('./main.js'),
    read('./navigation.js'),
  ]);
  const initialization = navigation.match(
    /const formParams =[\s\S]*?form\.voiceDictationCleanup =/,
  )?.[0] || '';
  const updateFlow = navigation.match(
    /const completeWatchUpdate = async[\s\S]*?const getCreateOptions/,
  )?.[0] || '';

  assert.match(authUi, /const ready = auth\.initialize\(\)/);
  assert.doesNotMatch(authUi, /if \(!root\) return null/);
  assert.match(main, /await authUi\.ready;[\s\S]*?await configureCompanyWatchServerStore/);
  assert.match(initialization, /getWatchById\(editWatchId\)/);
  assert.match(initialization, /isRequestedModalEditMode[\s\S]*?watch-editor-close/);
  assert.doesNotMatch(
    initialization.match(/if \(isRequestedModalEditMode\)[\s\S]*?return;/)?.[0] || '',
    /location\.replace/,
  );
  assert.match(updateFlow, /updateServerCompanyWatch\(editingWatch\.id/);
  assert.match(updateFlow, /summary: changes\.whyFollowing/);
  assert.match(updateFlow, /summary: changes\.whyFollowing[\s\S]*?category,/);
  assert.match(updateFlow, /catch \{[\s\S]*?editSaveFailed[\s\S]*?return/);
  assert.match(navigation, /watch-editor-saved[\s\S]*?persistedWatch: event\.data\.watch/);
  assert.match(navigation, /acceptPersistedServerCompanyWatch\(persistedWatch\)[\s\S]*?renderWatchDetail\(\)[\s\S]*?showWatchUpdatedConfirmation\(\)/);
  assert.match(updateFlow, /finishModalTransition\('watch-editor-saved', \{ watch: editingWatch \}\)/);
  assert.match(navigation, /editingServerCompanyWatch && isModalEditMode[\s\S]*?WATCH_STORAGE_CHANGED_EVENT[\s\S]*?watch-editor-close/);
});

test('headless modal authentication initializes a real session without an auth root', async () => {
  const originals = Object.fromEntries(['window', 'document', 'Event', 'CustomEvent'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const { document, window } = parseHTML('<html><body></body></html>');
  window.location = new URL('https://preview.example/new-watch.html?presentation=modal');
  Object.assign(globalThis, { window, document, Event: window.Event, CustomEvent: window.CustomEvent });
  let context;
  const session = { access_token: 'header.payload.signature', user: { id: 'user-a' } };
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };

  try {
    const { initAuthUi } = await import(`./auth-ui.js?headless-modal=${Date.now()}`);
    context = initAuthUi({ client });
    assert.ok(context);
    await context.ready;
    assert.equal(context.auth.getState().status, 'authenticated');
    assert.equal(context.auth.getState().session, session);
    assert.equal(typeof context.revealEditor, 'function');
    context.revealEditor();
    assert.equal(document.querySelector('[data-auth-gate]'), null);
  } finally {
    context?.destroy();
    configureAccountStorage(null);
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
