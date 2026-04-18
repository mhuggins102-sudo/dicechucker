export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function button(label, { onClick, variant = '', disabled = false, title = '' } = {}) {
  const b = el('button', {
    class: `btn ${variant}`.trim(),
    title,
    onClick,
  }, [label]);
  b.disabled = !!disabled;
  return b;
}

export function chip(label, value, { tone = '' } = {}) {
  return el('div', { class: `chip ${tone}`.trim() }, [
    el('div', { class: 'label', text: label }),
    el('div', { class: 'value', text: String(value) }),
  ]);
}

export function roundPills(totalRounds, currentRound, outcomes) {
  const wrap = el('div', { class: 'round-pills' });
  for (let i = 0; i < totalRounds; i++) {
    const outcome = outcomes[i];
    let cls = 'round-pill';
    let label = `R${i + 1}`;
    if (outcome?.bust) { cls += ' bust'; label += ': ×'; }
    else if (outcome?.done) { cls += ' done'; label += `: ${outcome.score}`; }
    else if (i === currentRound) { cls += ' active'; label += ': …'; }
    wrap.appendChild(el('span', { class: cls, text: label }));
  }
  return wrap;
}

let toastTimer = null;
export function toast(message, { tone = '', duration = 1800 } = {}) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = el('div', { class: 'toast' });
    document.body.appendChild(node);
  }
  node.className = `toast ${tone}`.trim();
  node.textContent = message;
  requestAnimationFrame(() => node.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('show');
  }, duration);
}

export function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
