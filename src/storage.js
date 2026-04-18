const KEY = 'dicechucker.v1';

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable; ignore */
  }
}

export function getBestForEvent(id) {
  const data = readAll();
  return data.bestByEvent?.[id] ?? 0;
}

export function recordEventScore(id, score) {
  const data = readAll();
  const best = data.bestByEvent?.[id] ?? 0;
  if (score > best) {
    data.bestByEvent = { ...(data.bestByEvent || {}), [id]: score };
    writeAll(data);
    return { improved: true, best: score };
  }
  return { improved: false, best };
}

export function getBestDecathlon() {
  const data = readAll();
  return data.bestDecathlon ?? null;
}

export function recordDecathlon(total, perEvent) {
  const data = readAll();
  const prev = data.bestDecathlon?.total ?? 0;
  if (total > prev) {
    data.bestDecathlon = {
      total,
      perEvent,
      date: new Date().toISOString().slice(0, 10),
    };
    writeAll(data);
    return { improved: true };
  }
  return { improved: false };
}
