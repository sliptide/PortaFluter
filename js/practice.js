export const RECENT_MS = 3 * 24 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

export function getReviewItems(items, records, now = Date.now()) {
  return items
    .map((item) => {
      const { practicedAt = 0, needsWork = false } = records[item.id] ?? {};
      return { item, practicedAt, needsWork };
    })
    .filter(({ practicedAt }) => !practicedAt || now - practicedAt >= RECENT_MS)
    .sort((a, b) => Number(b.needsWork) - Number(a.needsWork) || a.practicedAt - b.practicedAt)
    .map(({ item, practicedAt, needsWork }) => ({
      ...item,
      reason: needsWork ? "Needs more practice" : practicedAt ? "Due for review" : "Never practiced",
    }));
}

export function updatePractice(records, id, action, now = Date.now()) {
  const current = records[id] ?? { practicedAt: 0, needsWork: false };
  let next;

  switch (action) {
    case "practiced":
      next = { ...current, practicedAt: now };
      break;
    case "undo":
      next = { ...current, practicedAt: 0 };
      break;
    case "toggle-focus":
      next = { ...current, needsWork: !current.needsWork };
      break;
    default:
      return records;
  }
  return { ...records, [id]: next };
}

export function createTimer(minutes = 20) {
  const wholeMinutes = Number.isFinite(minutes) ? Math.round(minutes) : 20;
  return {
    durationMs: Math.max(1, Math.min(60, wholeMinutes)) * MINUTE_MS,
    elapsedMs: 0,
    startedAt: 0,
  };
}

export function getElapsed(timer, now = Date.now()) {
  const runningTime = timer.startedAt ? Math.max(0, now - timer.startedAt) : 0;
  return Math.min(timer.durationMs, timer.elapsedMs + runningTime);
}

const storageKey = "portafluter:v1";

export function loadPractice(ids) {
  const defaults = { records: {}, timer: createTimer(), available: true };
  let raw;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    return { ...defaults, available: false };
  }
  if (!raw) return defaults;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (data?.version !== 1) return defaults;

  const records = {};
  for (const id of ids) {
    const row = data.records?.[id];
    if (row && typeof row === "object") {
      records[id] = {
        practicedAt: Number.isSafeInteger(row.practicedAt) && row.practicedAt > 0 && row.practicedAt <= 8.64e15
          ? row.practicedAt : 0,
        needsWork: row.needsWork === true,
      };
    }
  }

  const timer = data.timer;
  const validTimer = timer
    && Number.isSafeInteger(timer.durationMs) && timer.durationMs >= MINUTE_MS && timer.durationMs <= 60 * MINUTE_MS
    && timer.durationMs % MINUTE_MS === 0
    && Number.isSafeInteger(timer.elapsedMs) && timer.elapsedMs >= 0 && timer.elapsedMs <= timer.durationMs
    && Number.isSafeInteger(timer.startedAt) && timer.startedAt >= 0;

  return { records, timer: validTimer ? timer : defaults.timer, available: true };
}

export function savePractice(records, timer) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, records, timer }));
    return true;
  } catch {
    return false;
  }
}
