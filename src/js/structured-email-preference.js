// Shared owner-bound Media/News preference. Existing boolean UI is unchanged
// until the explicit browser digest gate is enabled. No localStorage consent.
export const initStructuredEmailPreference = ({root, client, auth, location, t, digestEnabled = false}) => {
  if (!root || !client || !auth) return;
  const input = root.querySelector('input'), label = root.querySelector('[data-email-label]');
  const hint = root.querySelector('[data-email-hint]'), status = root.querySelector('[role="status"]');
  const frequency = root.querySelector('[data-email-frequency]');
  const frequencyControl = root.querySelector('[data-email-frequency-control]');
  const consentState = root.querySelector('[data-email-consent-state]');
  const choices=[...root.querySelectorAll('[data-email-mode]')];
  if (!input || !label || !hint || !status || (digestEnabled && (!frequency || !frequencyControl || !consentState))) return;
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
  const disable = value => { input.disabled = value; if (frequency) frequency.disabled = value; for(const choice of choices)choice.disabled=value||Boolean([...frequency.options].find(option=>option.value===choice.value)?.disabled); };
  const restore = () => {
    input.checked = saved?.enabled === true;
    setFrequency(saved?.mode || 'off');
    if(consentState)consentState.textContent=saved?t(saved.enabled?'detail.settingsOn':'detail.settingsOff'):'';
    for(const choice of choices)choice.checked=choice.value===saved?.mode;
    input.setAttribute('aria-checked',String(input.checked));
  };
  const render = () => {
    status.textContent = feedbackKey ? t(['detail.emailOn','detail.emailOff'].includes(feedbackKey)?'detail.settingsSaved':feedbackKey) : '';
    label.textContent = t('detail.emailNotifications');
    input.setAttribute('aria-label', label.textContent);
    hint.textContent = t(digestEnabled ? 'detail.emailDigestIndependent' : 'detail.emailIndependent');
    if (frequencyControl) frequencyControl.hidden = !digestEnabled||saved?.enabled!==true;
    if (frequency) {
      frequency.setAttribute('aria-label', t('detail.emailFrequency'));
      const caption = root.querySelector('[data-email-frequency-label]');
      if (caption) caption.textContent = t(choices.length?'detail.settingsWhenEmail':'detail.emailFrequency');
      for (const option of frequency.options) option.textContent = t('detail.emailFrequency' + ({off:'Off',daily_digest:'Daily',immediate:'Immediate'}[option.value]));
    }
    if(consentState&&saved)consentState.textContent=t(saved.enabled?'detail.settingsOn':'detail.settingsOff');
  };
  const scrub = () => {
    saved = null; busy = false; feedbackKey = null; root.setAttribute('aria-busy', 'false'); root.hidden = true; disable(true); restore(); status.textContent = '';
    if (frequencyControl) frequencyControl.hidden = true;
  };
  const refresh = async () => {
    const epoch = ++generation; owner = currentOwner(); scrub();
    if (!owner) return;
    const expected = owner;
    const result = await rpc(digestEnabled ? 'get_media_watch_email_policy' : 'get_structured_media_email_preference', {p_watch_id:id});
    if (!current(epoch, expected) || result.error) return;
    if (digestEnabled) { if (!validPolicy(result.data)) return; saved = {...result.data}; }
    else { if (typeof result.data !== 'boolean') return; saved = {enabled:result.data}; }
    restore(); render(); disable(false); root.hidden = false;
  };
  const save = async fromFrequency => {
    if (!saved || busy || !owner || owner !== currentOwner()) return;
    const epoch = generation, expected = owner;
    let mode = digestEnabled ? frequency.value : undefined;
    let enabled = input.checked;
    if (digestEnabled) {
      if (!modes.includes(mode)) { restore(); return; }
      // Frequency never grants consent. Off withdraws it; an explicit checkbox
      // opt-in from Off uses the documented daily default.
      if (fromFrequency && mode === 'off') enabled = false;
      else if (!fromFrequency && enabled && mode === 'off') mode = 'daily_digest';
    }
    const document = root.ownerDocument;
    const focusedControl = [input, frequency,...choices].includes(document.activeElement) ? document.activeElement : null;
    busy = true; root.setAttribute('aria-busy', 'true'); disable(true); feedbackKey = null; status.textContent = '';
    const result = await rpc(digestEnabled ? 'set_media_watch_email_policy' : 'set_structured_media_email_preference',
      digestEnabled ? {p_watch_id:id,p_mode:mode,p_enabled:enabled} : {p_watch_id:id,p_enabled:enabled});
    if (!current(epoch, expected)) return;
    const ok = !result.error && (digestEnabled ? validPolicy(result.data) && result.data.mode === mode && result.data.enabled === enabled : result.data === enabled);
    if (ok) saved = digestEnabled ? {...result.data} : {enabled};
    restore(); feedbackKey = ok ? enabled ? 'detail.emailOn' : 'detail.emailOff' : 'detail.emailSaveFailed';
    render();
    busy = false; root.setAttribute('aria-busy', 'false'); disable(false);
    // Disabling a native select blurs it. Restore only if focus did not move elsewhere.
    if (focusedControl && document.activeElement === document.body) focusedControl.focus({preventScroll:true});
  };
  const changeConsent = () => { void save(false); };
  const changeFrequency = () => { void save(true); };
  input.addEventListener('change', changeConsent);
  if (digestEnabled) frequency.addEventListener('change', changeFrequency);
  const changeChoice=event=>{if(event.target.checked&&!event.target.disabled){setFrequency(event.target.value);void save(true);}};
  for(const choice of choices)choice.addEventListener('change',changeChoice);
  const unsubscribe = auth.subscribe(refresh);
  void refresh();
  return {refresh, render, destroy(){ generation++; owner = null; unsubscribe?.(); input.removeEventListener('change', changeConsent); frequency?.removeEventListener('change', changeFrequency);choices.forEach(choice=>choice.removeEventListener('change',changeChoice)); scrub(); }};
};
