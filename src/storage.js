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

// Per-decathlon bests. Legacy shape (single `bestDecathlon` object) is
// treated as the Ryno decathlon's best.
function bestsByDecathlon(data) {
  if (data.bestDecathlons && typeof data.bestDecathlons === 'object') {
    return data.bestDecathlons;
  }
  if (data.bestDecathlon && typeof data.bestDecathlon === 'object') {
    return { ryno: data.bestDecathlon };
  }
  return {};
}

export function getBestDecathlon(decathlonId) {
  const data = readAll();
  const all = bestsByDecathlon(data);
  return all[decathlonId] ?? null;
}

export function recordDecathlon(decathlonId, total, perEvent) {
  const data = readAll();
  const all = { ...bestsByDecathlon(data) };
  const prev = all[decathlonId]?.total ?? 0;
  if (total > prev) {
    all[decathlonId] = {
      total,
      perEvent,
      date: new Date().toISOString().slice(0, 10),
    };
    data.bestDecathlons = all;
    delete data.bestDecathlon;
    writeAll(data);
    return { improved: true };
  }
  return { improved: false };
}
