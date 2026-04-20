export function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

export function rollMany(n) {
  return Array.from({ length: n }, rollDie);
}

export function createDie(value, options = {}) {
  const el = document.createElement('div');
  el.className = 'die';
  setDie(el, value, options);
  return el;
}

export function setDie(el, value, options = {}) {
  el.dataset.value = String(value);
  el.innerHTML = '';
  if (!options.placeholder) {
    for (let i = 0; i < value; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip';
      el.appendChild(pip);
    }
  }
  applyState(el, options);
}

export function applyState(el, state = {}) {
  for (const key of ['frozen', 'bust', 'staged', 'dim', 'highlight', 'placeholder']) {
    if (state[key]) el.dataset[key] = 'true';
    else delete el.dataset[key];
  }
  if (state.selectable !== undefined) {
    el.dataset.selectable = state.selectable ? 'true' : 'false';
  }
}

export function animateRoll(el, finalValue, { duration = 450 } = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    setDie(el, finalValue, readState(el));
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    el.classList.remove('rolling');
    void el.offsetWidth;
    el.classList.add('rolling');
    const ticker = setInterval(() => {
      setDie(el, rollDie(), readState(el));
    }, 70);
    setTimeout(() => {
      clearInterval(ticker);
      setDie(el, finalValue, readState(el));
      el.classList.remove('rolling');
      resolve();
    }, duration);
  });
}

export async function animateRollSequence(dieEls, values, options = {}) {
  const { onReveal, ...rollOpts } = options;
  for (let i = 0; i < dieEls.length; i++) {
    const el = dieEls[i];
    // Drop placeholder so the tumbling animation renders real pips.
    delete el.dataset.placeholder;
    await animateRoll(el, values[i], rollOpts);
    if (onReveal) onReveal(i, values[i], values.slice(0, i + 1));
  }
}

function readState(el) {
  return {
    frozen: el.dataset.frozen === 'true',
    bust: el.dataset.bust === 'true',
    staged: el.dataset.staged === 'true',
    dim: el.dataset.dim === 'true',
    highlight: el.dataset.highlight === 'true',
    selectable: el.dataset.selectable === 'true',
  };
}
