import { rollMany, createDie, animateRollSequence, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep, runRounds } from '../ui.js';

const POOL = 10;
const ROUNDS = 3;

const rules = `
  <p><strong>Climb higher with more dice each turn.</strong></p>
  <p>Turn 1: roll 1 die. Its pip value is the sum to beat. Bank 1 pt or keep going.</p>
  <p>Each later turn, roll more dice than last time (up to 10). Beat the previous sum → clear the turn. Tie the previous sum → no progress, no bust, but you've used up more dice. Roll under → you bust and lose the whole round.</p>
  <p>Stop any time to bank. Bust = 0 pts. Otherwise score = <strong>n × (n + 1) ÷ 2</strong>, where <em>n</em> is turns cleared (1 → 1 pt, 2 → 3, 3 → 6, … 10 → 55). Best of ${ROUNDS} rounds counts.</p>
`;

function triangular(n) {
  return (n * (n + 1)) / 2;
}

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', { class: 'status', html: 'Roll 1 die to set your starting sum.' });
    const controls = el('div');

    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(controls);

    let lastSum = 0;
    let lastCount = 0;
    let turnsCleared = 0;
    let done = false;
    let busy = false;

    const score = () => triangular(turnsCleared);

    function emit(extra = {}) {
      updateHeader({
        n: turnsCleared,
        lastSum,
        lastCount,
        score: score(),
        ...extra,
      });
    }

    function renderControls() {
      clear(controls);
      if (done) return;

      if (turnsCleared === 0) {
        const row = el('div', { class: 'button-row' });
        row.appendChild(button('Roll 1 die', {
          onClick: () => doRoll(1),
          variant: 'good',
        }));
        controls.appendChild(row);
        return;
      }

      if (lastCount >= POOL) {
        finish();
        return;
      }

      const minNext = lastCount + 1;
      controls.appendChild(el('div', {
        class: 'chooser-label',
        text: `Turn ${turnsCleared + 1}: pick ${minNext}–${POOL} dice to beat ${lastSum}`,
      }));
      const chooser = el('div', { class: 'ascent-chooser' });
      for (let n = minNext; n <= POOL; n++) {
        chooser.appendChild(button(String(n), {
          variant: 'good die-count',
          onClick: () => doRoll(n),
        }));
      }
      chooser.appendChild(button('Stop & Bank', {
        variant: 'stop-bank',
        onClick: finish,
      }));
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

      if (turnsCleared === 0) {
        status.innerHTML = 'Rolling your starting die…';
      } else {
        status.innerHTML = `Rolling ${n} dice — need to beat <strong>${lastSum}</strong>.`;
      }

      await animateRollSequence(dieEls, values, {
        onReveal: (_i, _v, shown) => {
          const running = shown.reduce((a, b) => a + b, 0);
          if (turnsCleared === 0) {
            status.innerHTML = `Rolling your starting die… <strong>${running}</strong>.`;
          } else {
            const need = lastSum;
            const remaining = n - shown.length;
            const tail = remaining > 0 ? ` (${remaining} die${remaining === 1 ? '' : 's'} to go)` : '';
            status.innerHTML = `So far: <strong>${running}</strong> — need > <strong>${need}</strong>${tail}.`;
          }
        },
      });

      const sum = values.reduce((a, b) => a + b, 0);

      if (turnsCleared === 0) {
        turnsCleared = 1;
        lastSum = sum;
        lastCount = n;
        dieEls.forEach(d => applyState(d, { highlight: true }));
        emit();
        status.innerHTML = `Starting sum: <strong>${sum}</strong>. Bank for 1 pt, or roll more dice for a higher sum.`;
        busy = false;
        renderControls();
        return;
      }

      if (sum < lastSum) {
        dieEls.forEach(d => applyState(d, { bust: true }));
        status.innerHTML = `Rolled <strong>${sum}</strong> — doesn't beat <strong>${lastSum}</strong>. Round busted, 0 pts.`;
        bustRound();
        return;
      }

      if (sum === lastSum) {
        dieEls.forEach(d => applyState(d, { dim: true }));
        lastCount = n;
        emit();
        if (lastCount >= POOL) {
          status.innerHTML = `Tied at <strong>${sum}</strong> with all 10 dice — no dice left to climb with. Banking <strong>${score()}</strong>.`;
          await sleep(600);
          finish();
          return;
        }
        status.innerHTML = `Tied at <strong>${sum}</strong> — turn doesn't count, but you used ${n} dice. Next roll needs <strong>${lastCount + 1}+</strong> dice and a sum over ${lastSum}.`;
        busy = false;
        renderControls();
        return;
      }

      const prevSum = lastSum;
      turnsCleared += 1;
      lastSum = sum;
      lastCount = n;
      dieEls.forEach(d => applyState(d, { highlight: true }));
      emit();

      if (lastCount >= POOL) {
        status.innerHTML = `Rolled <strong>${sum}</strong> with all 10 dice — ${turnsCleared} turns cleared for <strong>${score()}</strong> pts.`;
        await sleep(600);
        finish();
        return;
      }

      status.innerHTML = `Rolled <strong>${sum}</strong> — beats <strong>${prevSum}</strong>. ${turnsCleared} turns cleared → <strong>${score()}</strong> pts. Keep climbing or stop.`;
      busy = false;
      renderControls();
    }

    function bustRound() {
      done = true;
      clear(controls);
      toast('Busted — 0 pts', { tone: 'bad', duration: 2000 });
      emit({ bust: true, score: 0 });
      setTimeout(() => resolve(0), 1400);
    }

    function finish() {
      done = true;
      clear(controls);
      const s = score();
      toast(`Round ${roundIdx + 1}: ${s} pt${s === 1 ? '' : 's'}`, { tone: 'good' });
      emit({ done: true });
      setTimeout(() => resolve(s), 900);
    }

    emit();
    renderControls();
  });
}

export default {
  id: 'ascent',
  name: 'Ascent',
  blurb: 'Each turn: more dice, a higher sum. Miss and you bust.',
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
      head.appendChild(chip('Turns cleared', `${ctx.n ?? 0} / ${POOL}`));
      head.appendChild(chip('Sum to beat', ctx.lastSum ?? '—'));
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
