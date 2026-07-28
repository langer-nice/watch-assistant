export const waitForVisiblePaint = ({
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
  maxWait = 100,
  minimumDuration = 120,
} = {}) => new Promise((resolve) => {
  if (typeof requestFrame !== 'function') {
    resolve();
    return;
  }

  let painted = false;
  let minimumElapsed = typeof setTimer !== 'function' || minimumDuration <= 0;
  let fallbackId = null;
  const finish = () => {
    if (!painted || !minimumElapsed) return;
    if (fallbackId != null && typeof clearTimer === 'function') clearTimer(fallbackId);
    resolve();
  };
  if (typeof setTimer === 'function') {
    setTimer(() => {
      minimumElapsed = true;
      finish();
    }, minimumDuration);
    fallbackId = setTimer(() => {
      painted = true;
      finish();
    }, maxWait);
  }
  requestFrame(() => requestFrame(() => {
    painted = true;
    finish();
  }));
});
