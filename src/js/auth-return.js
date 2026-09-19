// Exact destinations only: retain public onboarding choices, never private editor data.
const FIRST_WATCH = 'new-watch.html?onboarding=first-watch';
const FLOW_IDS = ['1', '2', '3', '4'];
const DESTINATIONS = new Set([
  'new-watch.html', FIRST_WATCH,
  ...FLOW_IDS.map(flow => `${FIRST_WATCH}&flow=${flow}`),
]);
export const safeAuthReturn = (value) => DESTINATIONS.has(value) ? value : null;
export const getCreationReturn = (location) => {
  const params = new URLSearchParams(location.search);
  if (params.get('onboarding') !== 'first-watch') return 'new-watch.html';
  const flow = params.get('flow');
  return FLOW_IDS.includes(flow) ? `${FIRST_WATCH}&flow=${flow}` : FIRST_WATCH;
};
export const getCallbackReturn = (location) => {
  const params = new URLSearchParams(location.search);
  if (params.getAll('returnTo').length !== 1) return null;
  const destination = safeAuthReturn(params.get('returnTo'));
  if (!destination) return null;
  const raw = location.search.replace(/^\?/, '').split('&').find(part => part.startsWith('returnTo='))?.slice(9);
  // Accept only the literal or canonical query encoding produced by our callback.
  return raw === destination || raw === encodeURIComponent(destination) ? destination : null;
};
