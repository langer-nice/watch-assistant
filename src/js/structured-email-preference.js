// Authenticated per-Watch preference. No localStorage opt-in and no monitoring mutation.
export const initStructuredEmailPreference = ({root, client, auth, location, t}) => {
  if (!root || !client || !auth) return;
  const input = root.querySelector('input'), label = root.querySelector('[data-email-label]');
  const hint = root.querySelector('[data-email-hint]'), status = root.querySelector('[role="status"]');
  const id = new URLSearchParams(location.search).get('id');
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id || '')) return;
  let generation = 0, saved = false, owner = null;
  const render = () => { label.textContent = t('detail.emailNotifications'); hint.textContent = t('detail.emailIndependent'); input.setAttribute('aria-label', t('detail.emailNotifications')); };
  const refresh = async () => {
    const current = ++generation; owner = auth.getState().status === 'authenticated' ? auth.getState().session?.user?.id : null;
    root.hidden = true; input.checked = false; input.disabled = true; status.textContent = '';
    if (!owner) return;
    const result = await client.rpc('get_structured_media_email_preference', {p_watch_id:id}).catch(() => ({error:true}));
    if (current !== generation || result.error || typeof result.data !== 'boolean') return;
    saved = result.data; input.checked = saved; input.disabled = false; root.hidden = false; render();
  };
  const change = async () => {
    const current = generation, expectedOwner = owner, enabled = input.checked;
    input.disabled = true; status.textContent = '';
    const result = await client.rpc('set_structured_media_email_preference', {p_watch_id:id,p_enabled:enabled}).catch(() => ({error:true}));
    if (current !== generation || expectedOwner !== owner) return;
    if (result.error || result.data !== enabled) { input.checked = saved; status.textContent = t('detail.emailSaveFailed'); }
    else { saved = enabled; status.textContent = t(enabled ? 'detail.emailOn' : 'detail.emailOff'); }
    input.disabled = false;
  };
  input.addEventListener('change', change);
  const unsubscribe = auth.subscribe(refresh);
  void refresh();
  return {refresh, render, destroy(){ generation++; unsubscribe?.(); input.removeEventListener('change', change); root.hidden = true; input.checked = false; }};
};
