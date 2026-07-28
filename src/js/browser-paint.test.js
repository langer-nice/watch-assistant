import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForVisiblePaint } from './browser-paint.js';

test('keeps a visible state active through one complete browser paint', async () => {
  const frames = [];
  let resolved = false;
  const painted = waitForVisiblePaint({
    requestFrame: (callback) => frames.push(callback),
    setTimer: null,
  }).then(() => { resolved = true; });

  assert.equal(frames.length, 1);
  frames.shift()();
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(frames.length, 1);
  frames.shift()();
  await painted;
  assert.equal(resolved, true);
});

test('does not block outside a browser that provides animation frames', async () => {
  await waitForVisiblePaint({ requestFrame: null, setTimer: null });
});

test('keeps the loading state for a perceptible minimum after it has painted', async () => {
  const frames = [];
  const timers = [];
  let resolved = false;
  const visible = waitForVisiblePaint({
    requestFrame: (callback) => frames.push(callback),
    setTimer: (callback, delay) => {
      timers.push({ callback, delay });
      return delay;
    },
    clearTimer: () => {},
    minimumDuration: 120,
  }).then(() => { resolved = true; });

  frames.shift()();
  frames.shift()();
  await Promise.resolve();
  assert.equal(resolved, false);
  timers.find(({ delay }) => delay === 120).callback();
  await visible;
  assert.equal(resolved, true);
});
