// Owner-bound legacy Media/News preference. Mounted only under the browser digest gate.
// Native select semantics; no localStorage consent or Structured-only RPC dependency.
export const initMediaEmailPreference = ({root, client, auth, location, t}) => {
  if (!root || !client || !auth) return;
  const input = root.querySelector('input'), label = root.querySelector('[data-email-label]');
  const hint = root.querySelector('[data-email-hint]'), status = root.querySelector('[role="status"]');
  const frequency = root.querySelector('[data-email-frequency]');
  const frequencyControl = root.querySelector('[data-email-frequency-control]');
  const consentState = root.querySelector('[data-email-consent-state]');
  if (!input || !label || !hint || !status || (!frequency || !frequencyControl || !consentState)) return;
  const id = new URLSearchParams(location.search).get('id');
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id || '')) return;
  const modes = ['off','daily_digest','immediate'];
  const validPolicy = data => data && modes.includes(data.mode) && typeof data.enabled === 'boolean'
    && ['legacy','daily-digest.v1'].includes(data.version) && !(data.mode === 'off' && data.enabled);
  let generation = 0, saved = null, owner = null, busy = false, feedbackKey = null;
  const currentOwner = () => auth.getState().status === 'authenticated' ? auth.getState().session?.user?.id : null;
  const current = (epoch, expected) => generation === epoch && owner === expected && currentOwner() === expected;
  const rpc = async (name, parameters) => {
    try { return await client.rpc(name, parameters); } catch { return {error:true}; }
  };
  const setFrequency = mode => {
    if (frequency) {
      for (const option of frequency.options) option.selected = false;
      const selected = [...frequency.options].find(option => option.value === mode);
      if (selected) selected.selected = true;
    }
  };
  const disable = value => { input.disabled = value; if (frequency) frequency.disabled = value; };
  const restore = () => {
    input.checked = saved?.enabled === true;
    setFrequency(saved?.mode || 'off');
    if (consentState) consentState.textContent = saved ? t(saved.enabled ? 'detail.emailOn' : 'detail.emailOff') : '';
  };
  const render = () => {
    status.textContent = feedbackKey ? t(feedbackKey) : '';
    label.textContent = t('detail.emailConsent');
    input.setAttribute('aria-label', label.textContent);
    hint.textContent = t('detail.emailDigestIndependent');
    if (frequencyControl) frequencyControl.hidden = false;
    if (frequency) {
      frequency.setAttribute('aria-label', t('detail.emailFrequency'));
      const caption = root.querySelector('[data-email-frequency-label]');
      if (caption) caption.textContent = t('detail.emailFrequency');
      for (const option of frequency.options) option.textContent = t('detail.emailFrequency' + ({off:'Off',daily_digest:'Daily',immediate:'Immediate'}[option.value]));
    }
    if (consentState && saved) consentState.textContent = t(saved.enabled ? 'detail.emailOn' : 'detail.emailOff');
  };
  const scrub = () => {
    saved = null; busy = false; feedbackKey = null; root.setAttribute('aria-busy', 'false'); root.hidden = true; disable(true); restore(); status.textContent = '';
    if (frequencyControl) frequencyControl.hidden = true;
  };
  const refresh = async () => {
    const epoch = ++generation; owner = currentOwner(); scrub();
    if (!owner) return;
    const expected = owner;
    const result = await rpc('get_media_watch_email_policy', {p_watch_id:id});
    if (!current(epoch, expected) || result.error) return;
    if (!validPolicy(result.data)) return;
    saved = {...result.data};
    restore(); render(); disable(false); root.hidden = false;
  };
  const save = async fromFrequency => {
    if (!saved || busy || !owner || owner !== currentOwner()) return;
    const epoch = generation, expected = owner;
    let mode = frequency.value;
    let enabled = input.checked;
    {
      if (!modes.includes(mode)) { restore(); return; }
      // Frequency never grants consent. Off withdraws it; an explicit checkbox
      // opt-in from Off uses the documented daily default.
      if (fromFrequency && mode === 'off') enabled = false;
      else if (!fromFrequency && enabled && mode === 'off') mode = 'daily_digest';
    }
    const document = root.ownerDocument;
    const focusedControl = [input, frequency].includes(document.activeElement) ? document.activeElement : null;
    busy = true; root.setAttribute('aria-busy', 'true'); disable(true); feedbackKey = null; status.textContent = '';
    const result = await rpc('set_media_watch_email_policy', {p_watch_id:id,p_mode:mode,p_enabled:enabled});
    if (!current(epoch, expected)) return;
    const ok = !result.error && validPolicy(result.data) && result.data.mode === mode && result.data.enabled === enabled;
    if (ok) saved = {...result.data};
    restore(); feedbackKey = ok ? enabled ? 'detail.emailOn' : 'detail.emailOff' : 'detail.emailSaveFailed';
    render();
    busy = false; root.setAttribute('aria-busy', 'false'); disable(false);
    // Disabling a native select blurs it. Restore only if focus did not move elsewhere.
    if (focusedControl && document.activeElement === document.body) focusedControl.focus({preventScroll:true});
  };
  const changeConsent = () => { void save(false); };
  const changeFrequency = () => { void save(true); };
  input.addEventListener('change', changeConsent);
  frequency.addEventListener('change', changeFrequency);
  const unsubscribe = auth.subscribe(refresh);
  void refresh();
  return {refresh, render, destroy(){ generation++; owner = null; unsubscribe?.(); input.removeEventListener('change', changeConsent); frequency?.removeEventListener('change', changeFrequency); scrub(); }};
};
