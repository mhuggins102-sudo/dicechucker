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
  for (let i = 0; i < value; i++) {
    const pip = document.createElement('span');
    pip.className = 'pip';
    el.appendChild(pip);
  }
  applyState(el, options);
}

export function applyState(el, state = {}) {
  for (const key of ['frozen', 'bust', 'staged', 'dim', 'highlight']) {
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
