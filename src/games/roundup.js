import { rollMany, createDie, animateRollSequence, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, runRounds } from '../ui.js';

const POOL = 10;
const ROLL_SIZE = 6;
const ROUNDS = 3;

const rules = `
  <p><strong>Build a set, or collect uniques — commit to one path.</strong></p>
  <p>You have 10 dice. Roll 6 to start. Your first lock chooses the path:</p>
  <p><strong>Set path:</strong> pick one value that appears 2+ times in the roll and lock every die showing it. Later rolls lock any more dice of that same value.</p>
  <p><strong>Unique path:</strong> lock every die whose value appears exactly once in the roll. Later rolls lock any dice whose value is unique in the new roll and not already locked.</p>
  <p>After locking, stop & bank or roll again (up to 6 of the remaining unlocked dice). If a roll can't lock at least one die, you bust for 0.</p>
  <p><strong>Scoring:</strong></p>
  <p>• Set: sum of pips + (how many you locked)². Four 5s → 20 + 16 = 36.<br>
  • Unique: sum of pips + 2 × longest run of consecutive values. {1, 3, 4, 5} → 13 + 2×3 = 19.</p>
  <p>Best of ${ROUNDS} rounds counts.</p>
`;

function sumOf(values) { return values.reduce((a, b) => a + b, 0); }

function longestRun(values) {
  if (!values.length) return 0;
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 1;
    }
  }
  return best;
}

function scoreLocked(path, locked) {
  if (!locked.length) return 0;
  const pips = sumOf(locked);
  if (path === 'sets') return pips + locked.length * locked.length;
  return pips + 2 * longestRun(locked);
}

function countMap(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return m;
}

function uniqueIndicesInRoll(values) {
  const counts = countMap(values);
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (counts.get(values[i]) === 1) out.push(i);
  }
  return out;
}

function repeatedValues(values) {
  const counts = countMap(values);
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .map(([v]) => v)
    .sort((a, b) => a - b);
}

function pathChipLabel(path, setValue) {
  if (!path) return '—';
  if (path === 'sets') return `Set: ${setValue}s`;
  return 'Unique';
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
      html: `Roll ${ROLL_SIZE} dice to start. Your first lock sets your path.`,
    });
    host.appendChild(status);
    const controls = el('div', { class: 'button-row' });
    host.appendChild(controls);

    const locked = [];
    let path = null;
    let setValue = null;
    let done = false;
    let busy = false;

    const remaining = () => POOL - locked.length;
    const nextRoll = () => Math.min(ROLL_SIZE, remaining());
    const score = () => scoreLocked(path, locked);

    function emit(extra = {}) {
      updateHeader({
        locked: locked.length,
        path,
        setValue,
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
      controls.appendChild(button(`Roll ${n} die${n === 1 ? '' : 's'}`, {
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
      offerPathChoice(values, dieEls);
      busy = false;
    }

    function offerPathChoice(values, dieEls) {
      const setVals = repeatedValues(values);
      const uniqueIdx = uniqueIndicesInRoll(values);

      clear(controls);
      for (const v of setVals) {
        const count = values.filter(x => x === v).length;
        controls.appendChild(button(`Lock ${count} × ${v}s`, {
          onClick: () => chooseSets(v, values, dieEls),
          variant: 'good',
        }));
      }
      if (uniqueIdx.length > 0) {
        const pips = uniqueIdx.map(i => values[i]).sort((a, b) => a - b);
        controls.appendChild(button(`Lock uniques: ${pips.join(', ')}`, {
          onClick: () => chooseUnique(uniqueIdx, values, dieEls),
          variant: 'reroll',
        }));
      }
      status.innerHTML = `Pick your path: lock a repeated value <em>or</em> lock the uniques.`;
    }

    function chooseSets(v, values, dieEls) {
      path = 'sets';
      setValue = v;
      clear(controls);
      const idx = [];
      for (let i = 0; i < values.length; i++) if (values[i] === v) idx.push(i);
      commitLocks(values, dieEls, idx, `Locked the ${v}s — sets path.`);
    }

    function chooseUnique(uniqueIdx, values, dieEls) {
      path = 'unique';
      clear(controls);
      commitLocks(values, dieEls, uniqueIdx, `Locked ${uniqueIdx.length} unique value${uniqueIdx.length === 1 ? '' : 's'} — unique path.`);
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
      if (path === 'unique' && new Set(locked).size >= 6) {
        status.innerHTML = `${pathMsg} All six values (1–6) locked — you can't add any more. Banking <strong>${score()}</strong>.`;
        setTimeout(finish, 700);
        return;
      }
      const n = nextRoll();
      const rule = path === 'sets'
        ? `Next roll must include at least one <strong>${setValue}</strong>.`
        : `Next roll must show a unique value you haven't locked yet.`;
      status.innerHTML = `${pathMsg} Locked <strong>${locked.length}/${POOL}</strong>. Score so far: <strong>${score()}</strong>. ${rule} Roll ${n} or stop.`;
      renderContinueControls();
    }

    async function continueRoll() {
      if (busy) return;
      busy = true;
      clear(controls);
      const n = nextRoll();
      status.innerHTML = `Rolling ${n} die${n === 1 ? '' : 's'}…`;
      const { values, dieEls } = await rollDiceInto(n, `Rolling ${n} die${n === 1 ? '' : 's'}`);

      let lockIdx = [];
      if (path === 'sets') {
        for (let i = 0; i < values.length; i++) {
          if (values[i] === setValue) lockIdx.push(i);
        }
      } else {
        const counts = countMap(values);
        const lockedSet = new Set(locked);
        for (let i = 0; i < values.length; i++) {
          if (counts.get(values[i]) === 1 && !lockedSet.has(values[i])) lockIdx.push(i);
        }
      }

      if (lockIdx.length === 0) {
        dieEls.forEach(d => applyState(d, { bust: true }));
        const reason = path === 'sets'
          ? `no ${setValue}s in the roll`
          : `no new unique values in the roll`;
        status.innerHTML = `Rolled ${values.join(', ')} — ${reason}. Round busted.`;
        bustRound(reason);
        return;
      }

      const lockedPips = lockIdx.map(i => values[i]);
      commitLocks(values, dieEls, lockIdx, `Locked ${lockIdx.length} new die${lockIdx.length === 1 ? '' : 's'} (${lockedPips.join(', ')}).`);
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
  name: 'Roundup',
  blurb: 'Build a set or collect uniques. Each roll must lock a die.',
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
      head.appendChild(chip('Path', pathChipLabel(ctx.path, ctx.setValue)));
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
