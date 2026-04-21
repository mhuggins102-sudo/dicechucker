import { rollMany, rollDie, createDie, animateRollSequence, animateRoll, applyState, setDie } from '../../dice.js';
import { el, clear, button, chip, toast, sleep } from '../../ui.js';

const DICE = 5;
const MAX_RUNUP = 8;
const ATTEMPTS = 3;

const rules = `
  <p><strong>Two phases: run-up then jump.</strong></p>
  <p><strong>Run-up:</strong> roll 5 dice. Each throw, freeze at least one die, reroll the rest. Try to freeze as many dice as possible while keeping the frozen total ≤ <strong>${MAX_RUNUP}</strong>. Go over and the jump is a foul.</p>
  <p><strong>Jump:</strong> take the dice you froze in run-up and throw them. Freeze at least one per throw, reroll the rest, until all are frozen. Try for high values.</p>
  <p>Score = sum of the dice frozen in the jump. Best of ${ATTEMPTS} attempts.</p>
`;

async function playAttempt(host, attemptIdx) {
  return new Promise((resolve) => {
    const phaseLabel = el('div', { class: 'tray-label', text: 'Run-up' });
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', {
      class: 'status',
      html: `Attempt ${attemptIdx + 1}: roll ${DICE} dice to start the run-up (freeze up to ${MAX_RUNUP} total).`,
    });
    const controls = el('div', { class: 'button-row' });

    host.appendChild(phaseLabel);
    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(controls);

    let phase = 'runup'; // 'runup' | 'jump'
    const runupValues = new Array(DICE).fill(null);
    const runupDieEls = [];
    const runupFrozen = new Set();
    let staged = new Set();
    let pendingFreeze = false;
    let done = false;
    let busy = false;

    // For jump phase:
    let jumpCount = 0;
    let jumpValues = [];
    let jumpDieEls = [];
    const jumpFrozen = new Set();

    function runupSum() {
      let s = 0;
      for (const i of runupFrozen) s += runupValues[i];
      return s;
    }

    function renderRunup() {
      for (let i = 0; i < DICE; i++) {
        const d = runupDieEls[i];
        if (!d) continue;
        const isFrozen = runupFrozen.has(i);
        const isStaged = staged.has(i);
        applyState(d, {
          frozen: isFrozen,
          staged: isStaged,
          selectable: !isFrozen,
        });
      }
      renderRunupControls();
    }

    function stagedSum() {
      let s = 0;
      for (const i of staged) s += runupValues[i];
      return s;
    }

    function renderRunupControls() {
      clear(controls);
      if (done) return;
      if (runupDieEls.length === 0) {
        controls.appendChild(button(`Roll ${DICE} dice`, {
          variant: 'good',
          onClick: runupInitial,
        }));
        return;
      }
      if (pendingFreeze) {
        // User must freeze at least one die from the current throw before
        // anything else. No stop/reroll escape hatch here.
        const afterFreezeSum = runupSum() + stagedSum();
        const canFreeze = staged.size > 0;
        controls.appendChild(button(
          `Freeze staged (${staged.size}, sum → ${afterFreezeSum})`,
          { variant: 'good', disabled: !canFreeze, onClick: commitFreeze },
        ));
        return;
      }
      // Already froze from this throw — pick next action.
      const unfrozen = DICE - runupFrozen.size;
      if (unfrozen > 0) {
        controls.appendChild(button(`Reroll ${unfrozen} unfrozen ${unfrozen === 1 ? 'die' : 'dice'}`, {
          variant: 'reroll',
          onClick: rerollUnfrozen,
        }));
      }
      if (runupFrozen.size > 0) {
        controls.appendChild(button(`Stop & Jump (${runupFrozen.size} dice)`, {
          onClick: startJump,
        }));
      }
    }

    async function runupInitial() {
      busy = true;
      clear(controls);
      clear(tray);
      const rolls = rollMany(DICE);
      for (let i = 0; i < DICE; i++) {
        runupValues[i] = rolls[i];
        runupDieEls[i] = createDie(1, { placeholder: true, selectable: false });
        runupDieEls[i].addEventListener('click', () => runupClick(i));
        tray.appendChild(runupDieEls[i]);
      }
      status.innerHTML = 'Rolling…';
      await animateRollSequence(runupDieEls, rolls);
      pendingFreeze = true;
      status.innerHTML = `Pick at least one die to freeze. Keep the frozen sum ≤ <strong>${MAX_RUNUP}</strong> or foul.`;
      busy = false;
      renderRunup();
    }

    function runupClick(i) {
      if (busy || done || phase !== 'runup') return;
      if (runupFrozen.has(i)) return;
      if (staged.has(i)) staged.delete(i);
      else staged.add(i);
      renderRunup();
    }

    async function commitFreeze() {
      if (busy || staged.size === 0) return;
      busy = true;
      clear(controls);
      for (const i of staged) runupFrozen.add(i);
      staged.clear();
      pendingFreeze = false;
      renderRunup();
      clear(controls);

      const total = runupSum();
      if (total > MAX_RUNUP) {
        for (const i of runupFrozen) applyState(runupDieEls[i], { bust: true });
        status.innerHTML = `Frozen sum <strong>${total}</strong> > ${MAX_RUNUP} — foul!`;
        await sleep(900);
        foul();
        return;
      }

      if (runupFrozen.size >= DICE) {
        status.innerHTML = `All ${DICE} dice frozen (sum ${total}). Moving to jump.`;
        await sleep(500);
        busy = false;
        startJump();
        return;
      }

      status.innerHTML = `Frozen sum <strong>${total}</strong> (of ${MAX_RUNUP} allowed). Reroll the rest, or stop and jump.`;
      busy = false;
      renderRunup();
    }

    async function rerollUnfrozen() {
      if (busy || pendingFreeze) return;
      busy = true;
      clear(controls);
      const toReroll = [];
      for (let i = 0; i < DICE; i++) if (!runupFrozen.has(i)) toReroll.push(i);
      for (const i of toReroll) {
        setDie(runupDieEls[i], 1, { placeholder: true, selectable: false });
        runupValues[i] = rollDie();
      }
      status.innerHTML = `Rerolling ${toReroll.length}… frozen sum <strong>${runupSum()}</strong>.`;
      for (const i of toReroll) {
        delete runupDieEls[i].dataset.placeholder;
        await animateRoll(runupDieEls[i], runupValues[i]);
      }
      pendingFreeze = true;
      status.innerHTML = `Rolled — now you must freeze at least one of these dice. Frozen so far: <strong>${runupSum()}</strong>.`;
      busy = false;
      renderRunup();
    }

    function startJump() {
      if (busy) return;
      phase = 'jump';
      jumpCount = runupFrozen.size;
      jumpValues = new Array(jumpCount).fill(null);
      jumpDieEls = [];
      jumpFrozen.clear();
      staged = new Set();
      phaseLabel.textContent = 'Jump';
      clear(tray);
      status.innerHTML = `Jump phase — throw ${jumpCount} ${jumpCount === 1 ? 'die' : 'dice'} to begin.`;
      renderJumpControls();
    }

    function renderJump() {
      for (let i = 0; i < jumpCount; i++) {
        const d = jumpDieEls[i];
        if (!d) continue;
        const isFrozen = jumpFrozen.has(i);
        const isStaged = staged.has(i);
        applyState(d, {
          frozen: isFrozen,
          staged: isStaged,
          selectable: !isFrozen,
        });
      }
      renderJumpControls();
    }

    function renderJumpControls() {
      clear(controls);
      if (done) return;
      if (jumpDieEls.length === 0) {
        controls.appendChild(button(`Throw ${jumpCount} ${jumpCount === 1 ? 'die' : 'dice'}`, {
          variant: 'good',
          onClick: jumpInitial,
        }));
        return;
      }
      const canFreeze = staged.size > 0;
      const hasUnfrozen = jumpCount - jumpFrozen.size > 0;
      controls.appendChild(button(
        hasUnfrozen ? `Freeze staged (${staged.size}) & reroll rest` : 'Finish',
        { variant: 'good', disabled: hasUnfrozen && !canFreeze, onClick: jumpFreezeAndReroll },
      ));
    }

    async function jumpInitial() {
      busy = true;
      clear(controls);
      clear(tray);
      const rolls = rollMany(jumpCount);
      for (let i = 0; i < jumpCount; i++) {
        jumpValues[i] = rolls[i];
        jumpDieEls[i] = createDie(1, { placeholder: true, selectable: false });
        jumpDieEls[i].addEventListener('click', () => jumpClick(i));
        tray.appendChild(jumpDieEls[i]);
      }
      status.innerHTML = 'Rolling jump…';
      await animateRollSequence(jumpDieEls, rolls, {
        onReveal: (_i, _v, shown) => {
          const partial = shown.reduce((a, b) => a + b, 0);
          const remaining = jumpCount - shown.length;
          const tail = remaining > 0 ? ` (${remaining} to go)` : '';
          status.innerHTML = `Jumping… current sum <strong>${partial}</strong>${tail}.`;
        },
      });
      status.innerHTML = `Stage at least one die to freeze, then reroll rest. Sum of shown: <strong>${jumpValues.reduce((a, b) => a + b, 0)}</strong>.`;
      busy = false;
      renderJump();
    }

    function jumpClick(i) {
      if (busy || done || phase !== 'jump') return;
      if (jumpFrozen.has(i)) return;
      if (staged.has(i)) staged.delete(i);
      else staged.add(i);
      renderJump();
    }

    async function jumpFreezeAndReroll() {
      if (busy) return;
      const hasUnfrozen = jumpCount - jumpFrozen.size > 0;
      if (hasUnfrozen && staged.size === 0) return;
      busy = true;
      clear(controls);
      for (const i of staged) jumpFrozen.add(i);
      staged.clear();
      renderJump();
      clear(controls);

      if (jumpFrozen.size >= jumpCount) {
        const sum = jumpValues.reduce((a, b, i) => a + (jumpFrozen.has(i) ? b : 0), 0);
        status.innerHTML = `Jump complete — scored <strong>${sum}</strong>.`;
        await sleep(500);
        finish(sum);
        return;
      }

      const toReroll = [];
      for (let i = 0; i < jumpCount; i++) if (!jumpFrozen.has(i)) toReroll.push(i);
      for (const i of toReroll) {
        setDie(jumpDieEls[i], 1, { placeholder: true, selectable: false });
        jumpValues[i] = rollDie();
      }
      status.innerHTML = `Rerolling ${toReroll.length}…`;
      for (const i of toReroll) {
        delete jumpDieEls[i].dataset.placeholder;
        await animateRoll(jumpDieEls[i], jumpValues[i]);
      }
      const frozenSum = jumpValues.reduce((a, b, i) => a + (jumpFrozen.has(i) ? b : 0), 0);
      status.innerHTML = `Frozen so far: <strong>${frozenSum}</strong>. Stage more to freeze.`;
      busy = false;
      renderJump();
    }

    function foul() {
      done = true;
      clear(controls);
      toast(`Attempt ${attemptIdx + 1}: foul`, { tone: 'bad' });
      setTimeout(() => resolve(0), 1200);
    }

    function finish(score) {
      done = true;
      clear(controls);
      jumpDieEls.forEach(d => applyState(d, { frozen: true, selectable: false }));
      toast(`Attempt ${attemptIdx + 1}: ${score} pts`, { tone: 'good' });
      setTimeout(() => resolve(score), 900);
    }

    renderRunupControls();
  });
}

export default {
  id: 'longjump',
  decathlon: 'reiner',
  name: 'Long Jump',
  blurb: 'Run-up (freeze low, total ≤ 8) then jump (freeze high).',
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
