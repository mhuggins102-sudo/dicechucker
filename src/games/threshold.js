import { rollMany, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, runRounds } from '../ui.js';

const MAX_DICE = 8;
const MAX_ATTEMPTS = 3;
const MAX_PHASES = 3;
const Y_MIN = 10;
const Y_MAX = 50;
const ROUNDS = 3;

const rules = `
  <p>Pick a target <strong>y</strong> between ${Y_MIN} and ${Y_MAX}. You get <strong>3 rolls</strong> to hit a single-roll total ≥ y. Each roll you choose how many dice to throw (1–${MAX_DICE}).</p>
  <p>Rolling any <strong>1 wastes that roll</strong> (no sum counted) — but your remaining rolls still stand. Each <strong>6</strong> is a multiplier: +1 per 6, applied to that roll's non-6 pips. <em>e.g.</em> 5, 2, 6, 6 → (5 + 2) × 3 = 21.</p>
  <p>Succeed → <strong>stop</strong> and bank y, or raise to a higher target for a fresh 3 rolls. Up to <strong>${MAX_PHASES} targets</strong> per round; failing a target (3 rolls without hitting) busts to 0. Best of 3 rounds counts.</p>
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

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', { class: 'status', html: `Pick your starting target (${Y_MIN}–${Y_MAX}).` });
    const controls = el('div');

    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(controls);

    let y = Y_MIN;
    let locked = 0;
    let phaseIdx = 0;
    let attempts = 0;
    let done = false;
    let busy = false;

    const rollsLeft = () => MAX_ATTEMPTS - attempts;
    const emitHead = (extra = {}) => updateHeader({
      y, locked, rolls: rollsLeft(), phase: phaseIdx + 1, ...extra,
    });

    function askForY(initial, min) {
      const promptHtml = phaseIdx === 0
        ? `<strong>Pick starting target</strong>. 3 rolls to hit it.`
        : `<strong>Raise target</strong> — must be greater than <strong>${y}</strong>. Target #${phaseIdx + 1} of ${MAX_PHASES}.`;
      yStepper(host, {
        min,
        max: Y_MAX,
        initial,
        promptHtml,
        confirmLabel: phaseIdx === 0 ? 'Start attempt' : 'Raise & start',
        onConfirm: (v) => {
          y = v;
          attempts = 0;
          emitHead();
          status.innerHTML = `Target <strong>${y}</strong>. Choose how many dice to throw.`;
          renderDiceChooser();
        },
      });
    }

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

      const values = rollMany(n);
      const dieEls = values.map(v => createDie(v, { selectable: false }));

      if (attempts > 0) tray.appendChild(el('div', { class: 'stage-divider' }));
      for (const d of dieEls) tray.appendChild(d);

      await Promise.all(dieEls.map((d, i) => animateRoll(d, values[i])));

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
        onSuccess();
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

    function onSuccess() {
      locked = y;
      emitHead();
      const lastPhase = phaseIdx >= MAX_PHASES - 1;
      const atCeiling = y >= Y_MAX;
      if (lastPhase || atCeiling) {
        status.innerHTML = `Locked <strong>${locked}</strong>${atCeiling ? ' (ceiling)' : ''} — banking.`;
        setTimeout(() => finish(locked), 700);
        return;
      }
      const prompt = el('section', { class: 'inline-prompt' }, [
        el('div', { class: 'prompt-msg', html:
          `Locked <strong>${locked}</strong>. Stop and bank, or raise for another 3 rolls?` +
          `<span class="muted">Raising risks it — failing the new target busts to 0. Targets used: <strong>${phaseIdx + 1} / ${MAX_PHASES}</strong>.</span>` }),
        el('div', { class: 'button-row' }, [
          button(`Stop & bank ${locked}`, {
            variant: 'good',
            onClick: () => { prompt.remove(); finish(locked); },
          }),
          button('Raise target', {
            variant: 'ghost',
            onClick: () => {
              prompt.remove();
              phaseIdx += 1;
              clear(tray);
              const nextMin = Math.min(y + 1, Y_MAX);
              askForY(Math.min(y + 5, Y_MAX), nextMin);
            },
          }),
        ]),
      ]);
      host.appendChild(prompt);
      prompt.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      busy = false;
    }

    function bustRound(reason) {
      done = true;
      clear(controls);
      toast(`Bust — ${reason}`, { tone: 'bad', duration: 2200 });
      emitHead({ locked: 0, bust: true });
      status.innerHTML = `Round busted — ${reason}.`;
      setTimeout(() => resolve(0), 1500);
    }

    function finish(score) {
      done = true;
      clear(controls);
      toast(`Round ${roundIdx + 1}: ${score} pts`, { tone: score > 0 ? 'good' : 'bad' });
      emitHead({ locked: score, done: true });
      status.innerHTML = `Banked <strong>${score}</strong>.`;
      setTimeout(() => resolve(score), 900);
    }

    emitHead();
    askForY(Y_MIN, Y_MIN);
  });
}

export default {
  id: 'threshold',
  name: 'Threshold',
  blurb: 'Pick a target, beat it in 3 rolls, raise or bank.',
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
      head.appendChild(chip('Target', ctx.y ?? Y_MIN, { tone: 'accent' }));
      head.appendChild(chip('Locked', ctx.locked ?? 0, { tone: ctx.bust ? 'bust' : 'good' }));
      head.appendChild(chip('Rolls left', ctx.rolls ?? MAX_ATTEMPTS));
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
