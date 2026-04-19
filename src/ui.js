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
  const host = document.querySelector('.screen') || document.body;
  let node = host.querySelector(':scope > .toast');
  if (!node) {
    node = el('div', { class: 'toast' });
    host.appendChild(node);
  } else {
    host.appendChild(node);
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

/**
 * Inline prompt rendered into a host container. Resolves with the chosen value.
 * `choices` = [{ label, value, variant? }]
 */
export function inlinePrompt(host, html, choices) {
  return new Promise((resolve) => {
    const wrap = el('section', { class: 'inline-prompt' }, [
      el('div', { class: 'prompt-msg', html }),
      el('div', { class: 'button-row' },
        choices.map(c => button(c.label, {
          variant: c.variant,
          onClick: () => { wrap.remove(); resolve(c.value); },
        })),
      ),
    ]);
    host.appendChild(wrap);
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

/**
 * Drive a best-of-N game with optional Decathlon chip hooks.
 *  - hooks.beforeFinalRound() => 'play' | 'skip'
 *  - hooks.afterRoundsExhausted(currentBest) => 'continue' | 'stop'
 * The caller owns the results/outcomes arrays so its renderHead() and
 * renderPills() can read them via closure.
 */
export async function runRounds({
  rounds,
  hooks,
  body,
  results,
  outcomes,
  renderHead,
  renderPills, // (totalPlanned, active, outcomes) => void
  playRound,   // (body, roundIdx, updateHead) => Promise<score>
}) {
  let plannedRounds = rounds;

  const playOne = async (r) => {
    clear(body);
    renderHead();
    renderPills(plannedRounds, r, outcomes);
    const score = await playRound(body, r, (ctx) => renderHead(ctx));
    results.push(score);
    outcomes.push(score > 0 ? { done: true, score } : { bust: true });
    renderPills(plannedRounds, -1, outcomes);
    await sleep(400);
  };

  for (let r = 0; r < rounds; r++) {
    if (r === rounds - 1 && hooks?.beforeFinalRound) {
      const currentBest = Math.max(0, ...results);
      const choice = await hooks.beforeFinalRound(currentBest);
      if (choice === 'skip') {
        plannedRounds = outcomes.length;
        renderPills(plannedRounds, -1, outcomes);
        break;
      }
    }
    await playOne(r);
  }

  while (hooks?.afterRoundsExhausted) {
    const best = Math.max(0, ...results);
    const choice = await hooks.afterRoundsExhausted(best);
    if (choice !== 'continue') break;
    plannedRounds += 1;
    await playOne(outcomes.length);
  }

  return Math.max(0, ...results);
}
