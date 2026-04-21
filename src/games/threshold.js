import { rollMany, createDie, animateRollSequence, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep, runRounds } from '../ui.js';

const MAX_DICE = 8;
const MAX_ATTEMPTS = 3;
const Y_MIN = 10;
const Y_MAX = 50;
const ROUNDS = 5;

const rules = `
  <p><strong>Set a target. Hit it in one roll.</strong></p>
  <p>Pick a target from ${Y_MIN} to ${Y_MAX}. You get 3 tries to reach it in a single roll. Each try you choose how many dice to throw (1–${MAX_DICE}).</p>
  <p>Any die showing a <strong>1</strong> wastes that try (no score, but you still have the rest of your tries). Every <strong>6</strong> is a multiplier: the non-6 pips get multiplied by (1 + number of 6s). Example: 5, 2, 6, 6 → (5 + 2) × 3 = 21.</p>
  <p>Hit the target → bank its value. Miss all 3 tries → 0. Each new round, you must set a target <em>higher</em> than your best hit so far. ${ROUNDS} rounds; best round counts.</p>
`;

function rollResult(values) {
  if (values.includes(1)) return { wasted: true };
  let base = 0, sixes = 0;
  for (const v of values) {
    if (v === 6) sixes++;
    else base += v;
  }
  const mult = 1 + sixes;
  return { wasted: false, base, mult, sixes, total: base * mult };
}

function yStepper(host, { min, max, initial, promptHtml, confirmLabel, onConfirm }) {
  let value = Math.max(min, Math.min(max, initial));
  const wrap = el('section', { class: 'inline-prompt' });
  const msg = el('div', { class: 'prompt-msg', html: promptHtml });
  const stepper = el('div', { class: 'stepper' });
  const display = el('div', { class: 'stepper-value', text: String(value) });
  const rangeHint = el('div', { class: 'stepper-range', text: `Range: ${min}–${max}` });

  let m5, m1, p1, p5;
  function sync() {
    display.textContent = String(value);
    m5.disabled = value - 5 < min;
    m1.disabled = value - 1 < min;
    p1.disabled = value + 1 > max;
    p5.disabled = value + 5 > max;
  }
  function mkStep(delta, label) {
    return el('button', {
      class: 'stepper-btn',
      type: 'button',
      text: label,
      onClick: () => {
        value = Math.max(min, Math.min(max, value + delta));
        sync();
      },
    });
  }
  m5 = mkStep(-5, '−5');
  m1 = mkStep(-1, '−1');
  p1 = mkStep(+1, '+1');
  p5 = mkStep(+5, '+5');

  stepper.appendChild(m5);
  stepper.appendChild(m1);
  stepper.appendChild(display);
  stepper.appendChild(p1);
  stepper.appendChild(p5);

  const row = el('div', { class: 'button-row' }, [
    button(confirmLabel, {
      variant: 'good',
      onClick: () => { wrap.remove(); onConfirm(value); },
    }),
  ]);

  wrap.appendChild(msg);
  wrap.appendChild(stepper);
  wrap.appendChild(rangeHint);
  wrap.appendChild(row);
  host.appendChild(wrap);
  sync();
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function playSingleRound(host, roundIdx, updateHeader, minY) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', { class: 'status', html: `Pick your target (${minY}–${Y_MAX}).` });
    const controls = el('div');

    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(controls);

    let y = minY;
    let attempts = 0;
    let done = false;
    let busy = false;

    const rollsLeft = () => MAX_ATTEMPTS - attempts;
    const emitHead = (extra = {}) => updateHeader({ y, rolls: rollsLeft(), ...extra });

    const promptHtml = minY > Y_MIN
      ? `<strong>Pick this round's target</strong>. Must be higher than <strong>${minY - 1}</strong> (your previous best).`
      : `<strong>Pick this round's target</strong>. 3 rolls to hit it.`;

    yStepper(host, {
      min: minY,
      max: Y_MAX,
      initial: minY,
      promptHtml,
      confirmLabel: 'Lock target',
      onConfirm: (v) => {
        y = v;
        emitHead();
        status.innerHTML = `Target <strong>${y}</strong>. Choose how many dice to throw.`;
        renderDiceChooser();
      },
    });

    function renderDiceChooser() {
      clear(controls);
      if (done) return;
      const chooser = el('div', { class: 'dice-chooser' });
      for (let n = 1; n <= MAX_DICE; n++) {
        chooser.appendChild(button(String(n), {
          variant: 'good',
          onClick: () => doRoll(n),
        }));
      }
      controls.appendChild(el('div', { class: 'chooser-label', text: `Dice to throw (roll ${attempts + 1} of ${MAX_ATTEMPTS})` }));
      controls.appendChild(chooser);
    }

    async function doRoll(n) {
      if (busy || done) return;
      busy = true;
      clear(controls);
      clear(tray);

      const values = rollMany(n);
      const dieEls = values.map(() => createDie(1, { placeholder: true, selectable: false }));
      for (const d of dieEls) tray.appendChild(d);

      status.innerHTML = `Rolling ${n} ${n === 1 ? 'die' : 'dice'} — need <strong>${y}</strong>.`;

      await animateRollSequence(dieEls, values, {
        onReveal: (_i, _v, shown) => {
          const remaining = n - shown.length;
          const tail = remaining > 0 ? ` (${remaining} to go)` : '';
          if (shown.includes(1)) {
            status.innerHTML = `A <strong>1</strong> showed up — this roll will be wasted${tail}.`;
            return;
          }
          let base = 0, sixes = 0;
          for (const v of shown) {
            if (v === 6) sixes++;
            else base += v;
          }
          const mult = 1 + sixes;
          const total = base * mult;
          const display = mult > 1 ? `${base} × ${mult} = <strong>${total}</strong>` : `<strong>${total}</strong>`;
          status.innerHTML = `So far: ${display} — need <strong>${y}</strong>${tail}.`;
        },
      });

      attempts += 1;
      emitHead();

      const r = rollResult(values);

      if (r.wasted) {
        dieEls.forEach((d, i) => {
          if (values[i] === 1) applyState(d, { bust: true });
          else applyState(d, { dim: true });
        });
        if (rollsLeft() <= 0) {
          status.innerHTML = `Rolled a <strong>1</strong> — roll wasted. No rolls left to reach <strong>${y}</strong>.`;
          bustRound(`couldn't reach ${y}`);
          return;
        }
        status.innerHTML = `Rolled a <strong>1</strong> — roll wasted. ${rollsLeft()} roll${rollsLeft() === 1 ? '' : 's'} left to reach <strong>${y}</strong>.`;
        busy = false;
        renderDiceChooser();
        return;
      }

      dieEls.forEach((d, i) => {
        if (values[i] === 6) applyState(d, { highlight: true });
        else applyState(d, { frozen: true });
      });

      const breakdown = r.mult > 1
        ? `${r.base} × ${r.mult} = <strong>${r.total}</strong>`
        : `sum <strong>${r.total}</strong>`;

      if (r.total >= y) {
        status.innerHTML = `Rolled ${breakdown} — <strong>hit ${y}</strong>.`;
        finish(y);
        return;
      }

      if (rollsLeft() <= 0) {
        status.innerHTML = `Rolled ${breakdown} — stayed under <strong>${y}</strong>.`;
        bustRound(`couldn't reach ${y}`);
        return;
      }

      status.innerHTML = `Rolled ${breakdown} — under <strong>${y}</strong>. ${rollsLeft()} roll${rollsLeft() === 1 ? '' : 's'} left.`;
      busy = false;
      renderDiceChooser();
    }

    function bustRound(reason) {
      done = true;
      clear(controls);
      toast(`Round ${roundIdx + 1}: 0 pts`, { tone: 'bad', duration: 2000 });
      emitHead({ bust: true });
      status.innerHTML = `Round busted — ${reason}.`;
      setTimeout(() => resolve(0), 1400);
    }

    function finish(score) {
      done = true;
      clear(controls);
      toast(`Round ${roundIdx + 1}: ${score} pts`, { tone: 'good' });
      emitHead({ done: true });
      status.innerHTML = `Banked <strong>${score}</strong>.`;
      setTimeout(() => resolve(score), 900);
    }

    emitHead();
  });
}

export default {
  id: 'threshold',
  decathlon: 'ryno',
  name: 'Threshold',
  blurb: 'Pick a target, hit it in one roll. Raise the bar each round.',
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
      head.appendChild(chip('Target', ctx.y ?? '—', { tone: 'accent' }));
      head.appendChild(chip('Rolls left', ctx.rolls ?? MAX_ATTEMPTS));
      head.appendChild(chip('Best round', Math.max(0, ...results), { tone: 'accent' }));
    };
    const renderPills = (total, active, oc) => {
      clear(pills);
      pills.appendChild(roundPills(total, active, oc));
    };

    const playRound = async (roundHost, roundIdx, updateHeader) => {
      const maxAchieved = Math.max(0, ...results);
      const minY = Math.max(Y_MIN, maxAchieved + 1);

      if (minY > Y_MAX) {
        roundHost.appendChild(el('div', {
          class: 'status',
          html: `Already hit the <strong>${Y_MAX}</strong> ceiling — no target available.`,
        }));
        await sleep(1200);
        return 0;
      }

      return playSingleRound(roundHost, roundIdx, updateHeader, minY);
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
