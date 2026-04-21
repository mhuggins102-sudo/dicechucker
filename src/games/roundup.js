import { rollMany, createDie, animateRollSequence, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, runRounds } from '../ui.js';

const POOL = 10;
const ROLL_SIZE = 6;
const ROUNDS = 3;

const rules = `
  <p><strong>Pick a value on the opening roll and collect as many as you can.</strong></p>
  <p>You have 10 dice. Roll 6 to start. Pick any value that appears in the roll and lock every die showing it — this is your <strong>committed value</strong> for the round.</p>
  <p>Then stop and bank, or press your luck: roll up to 6 of the remaining dice (fewer if fewer remain) and lock any that match your committed value. Continue pressing or stop after each press.</p>
  <p><strong>Bust:</strong> if a press yields zero matches, the round scores 0.</p>
  <p><strong>Scoring:</strong> sum of pips on locked dice + (how many you locked)². Four 5s → 20 + 16 = 36. Five 1s → 5 + 25 = 30.</p>
  <p>Best of ${ROUNDS} rounds counts.</p>
`;

function sumOf(values) { return values.reduce((a, b) => a + b, 0); }

function scoreLocked(locked) {
  if (!locked.length) return 0;
  const pips = sumOf(locked);
  return pips + locked.length * locked.length;
}

function distinctValues(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function commitChipLabel(commit) {
  return commit ? `${commit}s` : '—';
}

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    host.appendChild(el('div', { class: 'tray-label', text: 'Locked' }));
    const lockTray = el('div', { class: 'dice-tray' });
    host.appendChild(lockTray);
    host.appendChild(el('div', { class: 'tray-label', text: 'Current roll' }));
    const rollTray = el('div', { class: 'dice-tray' });
    host.appendChild(rollTray);
    const status = el('div', {
      class: 'status',
      html: `Roll ${ROLL_SIZE} dice to start. Pick the value you'll collect.`,
    });
    host.appendChild(status);
    const controls = el('div', { class: 'button-row' });
    host.appendChild(controls);

    const locked = [];
    let commit = null;
    let done = false;
    let busy = false;

    const remaining = () => POOL - locked.length;
    const nextRoll = () => Math.min(ROLL_SIZE, remaining());
    const score = () => scoreLocked(locked);

    function emit(extra = {}) {
      updateHeader({
        locked: locked.length,
        commit,
        score: score(),
        ...extra,
      });
    }

    function renderInitialControls() {
      clear(controls);
      if (done) return;
      controls.appendChild(button(`Roll ${ROLL_SIZE} dice`, {
        onClick: firstRoll,
        variant: 'good',
      }));
    }

    function renderContinueControls() {
      clear(controls);
      if (done) return;
      if (remaining() === 0) { finish(); return; }
      const n = nextRoll();
      controls.appendChild(button(`Roll ${n} ${n === 1 ? 'die' : 'dice'}`, {
        onClick: continueRoll,
        variant: 'good',
      }));
      controls.appendChild(button('Stop & Bank', { onClick: finish }));
    }

    async function rollDiceInto(n, onRevealMsg) {
      clear(rollTray);
      const values = rollMany(n);
      const dieEls = values.map(() => createDie(1, { placeholder: true, selectable: false }));
      for (const d of dieEls) rollTray.appendChild(d);

      await animateRollSequence(dieEls, values, {
        onReveal: (_i, _v, shown) => {
          const partial = sumOf(shown);
          const remainingDice = n - shown.length;
          const tail = remainingDice > 0 ? ` (${remainingDice} to go)` : '';
          status.innerHTML = `${onRevealMsg} — so far: <strong>${partial}</strong>${tail}.`;
        },
      });

      return { values, dieEls };
    }

    async function firstRoll() {
      if (busy) return;
      busy = true;
      clear(controls);
      status.innerHTML = `Rolling ${ROLL_SIZE} dice…`;
      const { values, dieEls } = await rollDiceInto(ROLL_SIZE, `Rolling ${ROLL_SIZE} dice`);
      offerCommitChoice(values, dieEls);
      busy = false;
    }

    function offerCommitChoice(values, dieEls) {
      clear(controls);
      for (const v of distinctValues(values)) {
        const count = values.filter(x => x === v).length;
        controls.appendChild(button(`Lock ${count} × ${v}s`, {
          onClick: () => chooseCommit(v, values, dieEls),
          variant: 'good',
        }));
      }
      status.innerHTML = `Pick the value you'll collect this round.`;
    }

    function chooseCommit(v, values, dieEls) {
      commit = v;
      clear(controls);
      const idx = [];
      for (let i = 0; i < values.length; i++) if (values[i] === v) idx.push(i);
      commitLocks(values, dieEls, idx, `Committed to ${v}s — locked ${idx.length}.`);
    }

    function commitLocks(values, dieEls, lockIdx, pathMsg) {
      const lockSet = new Set(lockIdx);
      for (let i = 0; i < dieEls.length; i++) {
        if (lockSet.has(i)) applyState(dieEls[i], { highlight: true });
        else applyState(dieEls[i], { dim: true });
      }
      setTimeout(() => {
        for (let i = 0; i < dieEls.length; i++) {
          if (lockSet.has(i)) {
            applyState(dieEls[i], { frozen: true, selectable: false });
            lockTray.appendChild(dieEls[i]);
            locked.push(values[i]);
          }
        }
        clear(rollTray);
        emit();
        afterLock(pathMsg);
      }, 650);
    }

    function afterLock(pathMsg) {
      if (remaining() === 0) {
        status.innerHTML = `${pathMsg} All 10 dice locked — banking <strong>${score()}</strong>.`;
        setTimeout(finish, 700);
        return;
      }
      const n = nextRoll();
      status.innerHTML = `${pathMsg} Locked <strong>${locked.length}/${POOL}</strong>. Score so far: <strong>${score()}</strong>. Next roll must include at least one <strong>${commit}</strong>. Roll ${n} or stop.`;
      renderContinueControls();
    }

    async function continueRoll() {
      if (busy) return;
      busy = true;
      clear(controls);
      const n = nextRoll();
      status.innerHTML = `Rolling ${n} ${n === 1 ? 'die' : 'dice'}…`;
      const { values, dieEls } = await rollDiceInto(n, `Rolling ${n} ${n === 1 ? 'die' : 'dice'}`);

      const lockIdx = [];
      for (let i = 0; i < values.length; i++) {
        if (values[i] === commit) lockIdx.push(i);
      }

      if (lockIdx.length === 0) {
        dieEls.forEach(d => applyState(d, { bust: true }));
        const reason = `no ${commit}s in the roll`;
        status.innerHTML = `Rolled ${values.join(', ')} — ${reason}. Round busted.`;
        bustRound(reason);
        return;
      }

      const lockedPips = lockIdx.map(i => values[i]);
      commitLocks(values, dieEls, lockIdx, `Locked ${lockIdx.length} new ${lockIdx.length === 1 ? 'die' : 'dice'} (${lockedPips.join(', ')}).`);
      busy = false;
    }

    function bustRound(reason) {
      done = true;
      clear(controls);
      toast(`Busted — ${reason}`, { tone: 'bad', duration: 2000 });
      emit({ bust: true, score: 0 });
      setTimeout(() => resolve(0), 1400);
    }

    function finish() {
      done = true;
      clear(controls);
      const s = score();
      toast(`Round ${roundIdx + 1}: ${s} pts`, { tone: 'good' });
      emit({ done: true });
      setTimeout(() => resolve(s), 900);
    }

    emit();
    renderInitialControls();
  });
}

export default {
  id: 'roundup',
  decathlon: 'ryno',
  name: 'Roundup',
  blurb: 'Pick a value on the opening roll and collect as many as you can.',
  rulesHtml: rules,
  rounds: ROUNDS,

  async play(host, hooks) {
    const outcomes = [];
    const results = [];
    const head = el('div', { class: 'score-strip' });
    const pills = el('div');
    host.appendChild(head);
    host.appendChild(pills);
    const body = el('div');
    host.appendChild(body);

    const renderHead = (ctx = {}) => {
      clear(head);
      head.appendChild(chip('Locked', `${ctx.locked ?? 0} / ${POOL}`));
      head.appendChild(chip('Value', commitChipLabel(ctx.commit)));
      head.appendChild(chip('Score', ctx.score ?? 0, { tone: ctx.bust ? 'bust' : 'accent' }));
      head.appendChild(chip('Best round', Math.max(0, ...results), { tone: 'accent' }));
    };
    const renderPills = (total, active, oc) => {
      clear(pills);
      pills.appendChild(roundPills(total, active, oc));
    };

    return runRounds({
      rounds: ROUNDS,
      hooks,
      body,
      results,
      outcomes,
      renderHead,
      renderPills,
      playRound,
    });
  },
};
