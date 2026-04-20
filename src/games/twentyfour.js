import { rollMany, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, runRounds } from '../ui.js';

const ATTEMPTS = 5;
const TARGET = 24;
const BASE = 40;
const BELOW_PENALTY = 4;
const SIX_PENALTY = 6;
const ROUNDS = 3;

const rules = `
  <p><strong>Goal: land on exactly ${TARGET}.</strong> You get ${ATTEMPTS} tries.</p>
  <p>Each try: roll 2 dice, keep 1. Your kept dice add up as you go.</p>
  <p>A kept <strong>6</strong> doesn't add pips — instead it doubles your total (a second 6 triples it, and so on).</p>
  <p>Hit ${TARGET} exactly → <strong>${BASE}</strong> pts. Under ${TARGET} → lose ${BELOW_PENALTY} pts per pip short. Each kept 6 also costs ${SIX_PENALTY} pts. Go over ${TARGET} → 0.</p>
  <p>Best of ${ROUNDS} rounds counts.</p>
`;

function computeValue(kept) {
  let sum = 0, sixes = 0;
  for (const v of kept) {
    if (v === 6) sixes++;
    else sum += v;
  }
  const mult = 1 + sixes;
  return { sum, sixes, mult, value: sum * mult };
}

function scoreForKept(kept) {
  const { value, sixes } = computeValue(kept);
  if (value > TARGET) return 0;
  const raw = BASE - BELOW_PENALTY * (TARGET - value) - SIX_PENALTY * sixes;
  return Math.max(0, raw);
}

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const keptTray = el('div', { class: 'dice-tray' });
    const rollTray = el('div', { class: 'dice-tray center' });
    const status = el('div', { class: 'status', html: `Roll a pair, then click one to keep. ${ATTEMPTS} attempts per round.` });
    const controls = el('div', { class: 'button-row' });

    host.appendChild(el('div', { class: 'tray-label', text: 'Kept' }));
    host.appendChild(keptTray);
    host.appendChild(el('div', { class: 'tray-label', text: 'Current pair' }));
    host.appendChild(rollTray);
    host.appendChild(status);
    host.appendChild(controls);

    const kept = [];
    let attemptsUsed = 0;
    let busy = false;
    let done = false;

    function emit(extra = {}) {
      const v = computeValue(kept);
      updateHeader({
        attempts: attemptsUsed,
        kept: kept.length,
        sum: v.sum,
        sixes: v.sixes,
        mult: v.mult,
        value: v.value,
        ...extra,
      });
    }

    function breakdownHtml() {
      const { sum, mult, value, sixes } = computeValue(kept);
      if (kept.length === 0) return 'Nothing kept yet.';
      const multPart = mult > 1 ? ` × ${mult}` : '';
      const sixNote = sixes > 0 ? ` (${sixes} × 6)` : '';
      return `Kept ${kept.length}: <strong>${sum}</strong>${multPart} = <strong>${value}</strong>${sixNote}`;
    }

    function renderControls() {
      clear(controls);
      if (done) return;
      if (attemptsUsed >= ATTEMPTS) {
        finish();
        return;
      }
      controls.appendChild(button(`Roll pair (attempt ${attemptsUsed + 1} of ${ATTEMPTS})`, {
        onClick: doRoll,
        variant: 'good',
      }));
    }

    async function doRoll() {
      if (busy) return;
      busy = true;
      clear(controls);
      clear(rollTray);
      status.innerHTML = 'Rolling…';

      const values = rollMany(2);
      const dieEls = values.map(v => {
        const d = createDie(v, { selectable: false });
        rollTray.appendChild(d);
        return d;
      });
      await Promise.all(dieEls.map((d, i) => animateRoll(d, values[i])));

      attemptsUsed += 1;
      emit();

      dieEls.forEach((d, i) => {
        applyState(d, { selectable: true });
        d.addEventListener('click', () => onKeep(i, values, dieEls));
      });
      status.innerHTML = `Rolled <strong>${values[0]}</strong> and <strong>${values[1]}</strong>. Click one to keep.`;
      busy = false;
    }

    function onKeep(i, values, dieEls) {
      if (busy || done) return;
      busy = true;
      const keepV = values[i];

      const kd = createDie(keepV);
      if (keepV === 6) applyState(kd, { highlight: true, selectable: false });
      else applyState(kd, { frozen: true, selectable: false });
      keptTray.appendChild(kd);
      kept.push(keepV);

      dieEls.forEach(d => applyState(d, { selectable: false }));
      applyState(dieEls[1 - i], { dim: true, selectable: false });

      const { value } = computeValue(kept);
      emit();

      if (value > TARGET) {
        status.innerHTML = `${breakdownHtml()} — over <strong>${TARGET}</strong>, locked bust.`;
        bust(`value ${value} over ${TARGET}`);
        return;
      }

      if (attemptsUsed >= ATTEMPTS) {
        status.innerHTML = `${breakdownHtml()}. Totalling…`;
        setTimeout(() => { busy = false; finish(); }, 450);
        return;
      }

      const left = ATTEMPTS - attemptsUsed;
      status.innerHTML = `${breakdownHtml()}. ${left} attempt${left === 1 ? '' : 's'} left.`;
      setTimeout(() => {
        clear(rollTray);
        busy = false;
        renderControls();
      }, 500);
    }

    function bust(reason) {
      done = true;
      clear(controls);
      toast(`Bust — ${reason}`, { tone: 'bad', duration: 2000 });
      emit({ bust: true });
      setTimeout(() => resolve(0), 1400);
    }

    function finish() {
      done = true;
      clear(controls);
      const score = scoreForKept(kept);
      emit({ done: true, score });
      if (score === 0) {
        status.innerHTML = `${breakdownHtml()} — scores 0 pts.`;
        toast(`Round ${roundIdx + 1}: 0 pts`, { tone: 'bad' });
      } else {
        const { sixes, value } = computeValue(kept);
        const belowPenalty = BELOW_PENALTY * (TARGET - value);
        const sixPenalty = SIX_PENALTY * sixes;
        const bits = [`base ${BASE}`];
        if (belowPenalty > 0) bits.push(`−${belowPenalty} below`);
        if (sixPenalty > 0) bits.push(`−${sixPenalty} per 6`);
        status.innerHTML = `${breakdownHtml()} → <strong>${score}</strong> pts (${bits.join(', ')}).`;
        toast(`Round ${roundIdx + 1}: ${score} pts`, { tone: 'good' });
      }
      setTimeout(() => resolve(score), 1200);
    }

    emit();
    renderControls();
  });
}

export default {
  id: 'twentyfour',
  name: '24',
  blurb: 'Roll 2, keep 1 — five times. Land on 24 exactly.',
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
      head.appendChild(chip('Attempts', `${ctx.attempts ?? 0} / ${ATTEMPTS}`));
      const valLabel = (ctx.mult ?? 1) > 1
        ? `${ctx.sum ?? 0} × ${ctx.mult}`
        : String(ctx.value ?? 0);
      const valTone = ctx.bust ? 'bust' : (ctx.value === TARGET ? 'good' : '');
      head.appendChild(chip('Value', valLabel, { tone: valTone }));
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
