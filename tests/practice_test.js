import assert from 'node:assert/strict';
import {
  createTimer,
  getElapsed,
  getReviewItems,
  loadPractice,
  RECENT_MS,
  savePractice,
  updatePractice,
} from '../js/practice.js';

const hour = 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 19, 18, 30);

Deno.test('practice timestamps and focus persist independently', () => {
  const id = 'c-major';
  const focused = updatePractice({}, id, 'toggle-focus', now);
  assert.equal(focused[id].needsWork, true);

  const practiced = updatePractice(focused, id, 'practiced', now + hour);
  assert.equal(practiced[id].practicedAt, now + hour);
  assert.equal(practiced[id].needsWork, true);

  const undone = updatePractice(practiced, id, 'undo', now + 2 * hour);
  assert.equal(undone[id].practicedAt, 0);
  assert.equal(undone[id].needsWork, true);
  assert.equal(practiced[id].practicedAt, now + hour);
});

Deno.test('review prioritizes due focus and includes the exact 72-hour cutoff', () => {
  const items = ['boundary', 'recent-focus', 'oldest', 'never', 'due-focus'].map((id) => ({ id }));
  assert.equal(RECENT_MS, 72 * hour);

  const records = {
    boundary: { practicedAt: now - RECENT_MS, needsWork: false },
    'recent-focus': { practicedAt: now - RECENT_MS + 1, needsWork: true },
    oldest: { practicedAt: now - 120 * hour, needsWork: false },
    'due-focus': { practicedAt: now - 73 * hour, needsWork: true },
  };

  const review = getReviewItems(items, records, now);
  assert.deepEqual(review.map((item) => item.id), ['due-focus', 'never', 'oldest', 'boundary']);
  assert.ok(review.every((item) => item.reason));
});

Deno.test('timer reflects timestamps after long gaps and caps at one hour', () => {
  const timer = createTimer(60);
  assert.equal(timer.durationMs, hour);
  assert.equal(getElapsed(timer, now), 0);

  const paused = { ...timer, elapsedMs: 12 * 60 * 1000 };
  assert.equal(getElapsed(paused, now + hour), paused.elapsedMs);

  const running = { ...paused, startedAt: now };
  assert.equal(getElapsed(running, now + 15 * 60 * 1000), 27 * 60 * 1000);
  assert.equal(getElapsed(running, now + 2 * hour), hour);
});

Deno.test('practice storage keeps known records and falls back when malformed or unavailable', () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let raw = null;
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => raw,
        setItem: (_, value) => {
          raw = value;
        },
      },
    });

    const records = {
      'c-major': { practicedAt: now, needsWork: true },
      'unknown-id': { practicedAt: now, needsWork: true },
    };
    const timer = createTimer(60);
    assert.equal(savePractice(records, timer), true);
    assert.deepEqual(loadPractice(['c-major']), {
      records: { 'c-major': records['c-major'] },
      timer,
      available: true,
    });

    raw = '{';
    assert.deepEqual(loadPractice(['c-major']).records, {});

    assert.equal(
      savePractice({ 'c-major': { practicedAt: Number.MAX_SAFE_INTEGER, needsWork: true } }, timer),
      true,
    );
    assert.deepEqual(loadPractice(['c-major']).records['c-major'], { practicedAt: 0, needsWork: true });

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage is blocked', 'SecurityError');
      },
    });
    assert.equal(loadPractice(['c-major']).available, false);
    assert.equal(savePractice(records, timer), false);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', storage);
  }
});
