import { rollMany, rollDie, createDie, animateRollSequence, animateRoll, applyState, setDie } from '../../dice.js';
import { el, clear, button, chip, toast, sleep } from '../../ui.js';

const DICE = 5;
const ATTEMPTS = 3;

const rules = `
  <p><strong>Only even dice can be frozen.</strong></p>
  <p>Roll 5 dice. Pick at least one <strong>even</strong> die to freeze. Then either reroll the rest or stop and bank what you've frozen so far.</p>
  <p>If a reroll shows no evens to freeze, the attempt is invalid (0). You get ${ATTEMPTS} attempts — best counts. Score = sum of frozen dice.</p>
`;

async function playAttempt(host, attemptIdx) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', { class: 'status', html: `Attempt ${attemptIdx + 1}: roll all ${DICE} dice to start.` });
    const controls = el('div', { class: 'button-row' });

    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(controls);

    const values = new Array(DICE).fill(null);
    const dieEls = [];
    const frozen = new Set();
    const staged = new Set();
    let pendingFreeze = false;
    let done = false;
    let busy = false;

    function sumFrozen() {
      let s = 0;
      for (const i of frozen) s += values[i];
      return s;
    }

    function hasAvailableEven() {
      for (let i = 0; i < DICE; i++) {
        if (!frozen.has(i) && values[i] != null && values[i] % 2 === 0) return true;
      }
      return false;
    }

    function render() {
      for (let i = 0; i < DICE; i++) {
        const d = dieEls[i];
        if (!d) continue;
        const isFrozen = frozen.has(i);
        const isStaged = staged.has(i);
        const isEven = values[i] != null && values[i] % 2 === 0;
        applyState(d, {
          frozen: isFrozen,
          staged: isStaged,
          dim: !isFrozen && !isEven,
          selectable: !isFrozen && isEven,
        });
      }
      renderControls();
    }

    function renderControls() {
      clear(controls);
      if (done) return;
      if (dieEls.length === 0) {
        controls.appendChild(button(`Roll ${DICE} dice`, {
          variant: 'good',
          onClick: initialRoll,
        }));
        return;
      }
      if (pendingFreeze) {
        // Must commit at least one even from the current throw first.
        const canFreeze = staged.size > 0;
        controls.appendChild(button(
          `Freeze staged (${staged.size})`,
          { variant: 'good', disabled: !canFreeze, onClick: commitFreeze },
        ));
        return;
      }
      // Freezing done for this throw — pick next action.
      const unfrozen = DICE - frozen.size;
      if (unfrozen === 0) {
        controls.appendChild(button('Finish', {
          variant: 'good',
          onClick: () => finish(sumFrozen()),
        }));
        return;
      }
      controls.appendChild(button(`Reroll ${unfrozen} unfrozen die${unfrozen === 1 ? '' : 's'}`, {
        variant: 'reroll',
        onClick: rerollUnfrozen,
      }));
      controls.appendChild(button('Stop & Bank', {
        onClick: () => finish(sumFrozen()),
      }));
    }

    async function initialRoll() {
      busy = true;
      clear(controls);
      clear(tray);
      const rolls = rollMany(DICE);
      for (let i = 0; i < DICE; i++) {
        values[i] = rolls[i];
        dieEls[i] = createDie(1, { placeholder: true, selectable: false });
        dieEls[i].addEventListener('click', () => onDieClick(i));
        tray.appendChild(dieEls[i]);
      }
      status.innerHTML = 'Rolling…';
      await animateRollSequence(dieEls, rolls);
      if (!hasAvailableEven()) {
        status.innerHTML = `No even dice rolled — attempt invalid.`;
        dieEls.forEach(d => applyState(d, { bust: true }));
        fail();
        return;
      }
      pendingFreeze = true;
      status.innerHTML = `Click even dice (${countEvens()} available) to stage, then freeze.`;
      busy = false;
      render();
    }

    async function commitFreeze() {
      if (busy || staged.size === 0) return;
      busy = true;
      clear(controls);

      for (const i of staged) frozen.add(i);
      staged.clear();
      pendingFreeze = false;
      render();
      clear(controls);

      if (frozen.size >= DICE) {
        status.innerHTML = `All ${DICE} dice frozen — scored <strong>${sumFrozen()}</strong>.`;
        await sleep(500);
        finish(sumFrozen());
        return;
      }

      status.innerHTML = `Frozen so far: <strong>${sumFrozen()}</strong>. Reroll the rest, or stop & bank.`;
      busy = false;
      render();
    }

    async function rerollUnfrozen() {
      if (busy || pendingFreeze) return;
      busy = true;
      clear(controls);

      const toReroll = [];
      for (let i = 0; i < DICE; i++) if (!frozen.has(i)) toReroll.push(i);
      for (const i of toReroll) {
        setDie(dieEls[i], 1, { placeholder: true, selectable: false });
        values[i] = rollDie();
      }
      status.innerHTML = `Rerolling ${toReroll.length}…`;
      for (const i of toReroll) {
        delete dieEls[i].dataset.placeholder;
        await animateRoll(dieEls[i], values[i]);
      }

      if (!hasAvailableEven()) {
        status.innerHTML = `No even dice rolled — attempt invalid.`;
        for (const i of toReroll) applyState(dieEls[i], { bust: true });
        fail();
        return;
      }
      pendingFreeze = true;
      status.innerHTML = `Click even dice to stage. Frozen so far: <strong>${sumFrozen()}</strong>.`;
      busy = false;
      render();
    }

    function countEvens() {
      let c = 0;
      for (let i = 0; i < DICE; i++) {
        if (!frozen.has(i) && values[i] != null && values[i] % 2 === 0) c += 1;
      }
      return c;
    }

    function onDieClick(i) {
      if (busy || done) return;
      if (frozen.has(i)) return;
      if (values[i] % 2 !== 0) return;
      if (staged.has(i)) staged.delete(i);
      else staged.add(i);
      render();
    }

    function fail() {
      done = true;
      clear(controls);
      toast(`Attempt ${attemptIdx + 1}: invalid`, { tone: 'bad' });
      setTimeout(() => resolve(0), 1200);
    }

    function finish(score) {
      done = true;
      clear(controls);
      dieEls.forEach(d => applyState(d, { frozen: true, selectable: false }));
      toast(`Attempt ${attemptIdx + 1}: ${score} pts`, { tone: 'good' });
      setTimeout(() => resolve(score), 900);
    }

    renderControls();
  });
}

export default {
  id: 'discus',
  decathlon: 'reiner',
  name: 'Discus',
  blurb: 'Roll 5 dice; freeze evens only until all 5 are even.',
  rulesHtml: rules,
  rounds: ATTEMPTS,

  async play(host) {
    const head = el('div', { class: 'score-strip' });
    const body = el('div');
    host.appendChild(head);
    host.appendChild(body);

    const scores = [];
    const renderHead = () => {
      clear(head);
      head.appendChild(chip('Attempt', `${scores.length} / ${ATTEMPTS}`));
      head.appendChild(chip('Best', Math.max(0, ...scores), { tone: 'accent' }));
    };
    renderHead();

    for (let i = 0; i < ATTEMPTS; i++) {
      clear(body);
      const slot = el('div');
      body.appendChild(slot);
      const s = await playAttempt(slot, i);
      scores.push(s);
      renderHead();
      await sleep(400);
    }

    return Math.max(0, ...scores);
  },
};
