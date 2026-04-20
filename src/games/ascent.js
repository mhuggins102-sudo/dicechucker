import { rollMany, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep, runRounds } from '../ui.js';

const POOL = 10;
const ROUNDS = 3;

const rules = `
  <p><strong>Climb higher with more dice each turn.</strong></p>
  <p>Turn 1: roll 1 die. Its pip value is the number to beat.</p>
  <p>Each following turn, roll more dice than last time (up to 10). If their sum beats your last sum, the new sum becomes the number to beat. If it doesn't, you bust.</p>
  <p>Stop after any good turn to bank your score. The round ends if you bust, stop, or roll all 10 dice and beat the previous sum.</p>
  <p>Score = <strong>n × (n + 1) ÷ 2</strong>, where <em>n</em> is the number of turns you cleared (1 to 10). So: 1 turn → 1 pt, 2 → 3, 3 → 6, … 10 → 55. Best of ${ROUNDS} rounds counts.</p>
`;

function triangular(n) {
  return (n * (n + 1)) / 2;
}

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', { class: 'status', html: 'Roll your first die to set the starting sum.' });
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
      const chooser = el('div', { class: 'dice-chooser' });
      for (let n = minNext; n <= POOL; n++) {
        chooser.appendChild(button(String(n), {
          variant: 'good',
          onClick: () => doRoll(n),
        }));
      }
      controls.appendChild(el('div', {
        class: 'chooser-label',
        text: `Turn ${turnsCleared + 1}: pick ${minNext}–${POOL} dice (must beat ${lastSum})`,
      }));
      controls.appendChild(chooser);
      controls.appendChild(el('div', { class: 'button-row' }, [
        button('Stop & Bank', { onClick: finish }),
      ]));
    }

    async function doRoll(n) {
      if (busy || done) return;
      busy = true;
      clear(controls);

      const values = rollMany(n);
      const dieEls = values.map(v => createDie(v, { selectable: false }));

      if (turnsCleared > 0) tray.appendChild(el('div', { class: 'stage-divider' }));
      for (const d of dieEls) tray.appendChild(d);

      await Promise.all(dieEls.map((d, i) => animateRoll(d, values[i])));

      const sum = values.reduce((a, b) => a + b, 0);

      if (turnsCleared === 0) {
        turnsCleared = 1;
        lastSum = sum;
        lastCount = n;
        dieEls.forEach(d => applyState(d, { highlight: true }));
        emit();
        status.innerHTML = `Starting sum: <strong>${sum}</strong>. Bank 1 pt, or roll more dice for a higher sum.`;
        busy = false;
        renderControls();
        return;
      }

      if (sum <= lastSum) {
        dieEls.forEach(d => applyState(d, { bust: true }));
        status.innerHTML = `Rolled <strong>${sum}</strong> — didn't beat <strong>${lastSum}</strong>. Busted on turn ${turnsCleared + 1}.`;
        bustRound();
        return;
      }

      turnsCleared += 1;
      lastSum = sum;
      lastCount = n;
      dieEls.forEach(d => applyState(d, { highlight: true }));
      emit();

      if (lastCount >= POOL) {
        status.innerHTML = `Rolled <strong>${sum}</strong> with all 10 dice — ${turnsCleared} turns cleared for <strong>${score()}</strong> pts.`;
        await sleep(500);
        finish();
        return;
      }

      status.innerHTML = `Rolled <strong>${sum}</strong> — beats previous. ${turnsCleared} turns cleared → <strong>${score()}</strong> pts. Keep climbing or stop.`;
      busy = false;
      renderControls();
    }

    function bustRound() {
      done = true;
      clear(controls);
      const s = score();
      toast(`Busted — ${s} pt${s === 1 ? '' : 's'}`, { tone: 'bad', duration: 2000 });
      emit({ bust: s === 0 });
      setTimeout(() => resolve(s), 1400);
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
