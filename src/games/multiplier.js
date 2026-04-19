import { rollDie, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep, runRounds } from '../ui.js';

const POOL = 10;
const ROUNDS = 3;

const rules = `
  <p>Pool of 10 dice, rolled one at a time. Your multiplier starts at <strong>×1</strong> and applies only to rolls you make <em>after</em> the multiplier changes.</p>
  <p>Rolling <strong>2–5</strong> adds <em>value × current multiplier</em> to your score. Rolling a <strong>6</strong> bumps the multiplier up by 1 for future rolls (the 6 itself scores nothing). Rolling a <strong>1</strong> busts the round.</p>
  <p>Stop whenever to bank your score. Best of 3 rounds counts.</p>
`;

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const display = el('div', { class: 'multiplier-display' });
    const scoreNode = el('div', { class: 'big-number' }, [
      el('div', { class: 'label', text: 'Score' }),
      el('div', { class: 'value', text: '0' }),
    ]);
    const multNode = el('div', { class: 'big-number mult' }, [
      el('div', { class: 'label', text: 'Next roll ×' }),
      el('div', { class: 'value', text: '×1' }),
    ]);
    display.appendChild(scoreNode);
    display.appendChild(multNode);

    const tray = el('div', { class: 'dice-tray' });
    const controls = el('div', { class: 'button-row' });

    host.appendChild(display);
    host.appendChild(tray);
    host.appendChild(controls);

    let score = 0;
    let mult = 1;
    let rolls = 0;
    let done = false;
    let busy = false;
    const dieEls = [];

    function renderDisplay() {
      scoreNode.querySelector('.value').textContent = String(score);
      multNode.querySelector('.value').textContent = `×${mult}`;
    }

    function renderControls() {
      clear(controls);
      if (done) return;
      if (rolls >= POOL) {
        finish(score);
        return;
      }
      controls.appendChild(button(
        rolls === 0 ? `Roll (×${mult})` : `Roll again (×${mult})`,
        { onClick: doRoll, variant: 'good' },
      ));
      controls.appendChild(button('Stop & Bank', {
        onClick: () => finish(score),
        disabled: rolls === 0,
      }));
    }

    async function doRoll() {
      if (busy) return;
      busy = true;
      clear(controls);
      const v = rollDie();
      rolls += 1;
      const d = createDie(v);
      dieEls.push(d);
      tray.appendChild(d);
      await animateRoll(d, v);

      if (v === 1) {
        applyState(d, { bust: true });
        bust();
        return;
      }
      if (v === 6) {
        applyState(d, { highlight: true });
        mult += 1;
      } else {
        score += v * mult;
      }
      renderDisplay();
      updateHeader({ score, mult, rolls });
      busy = false;
      renderControls();
    }

    function bust() {
      done = true;
      clear(controls);
      toast('Bust — rolled a 1', { tone: 'bad', duration: 2000 });
      updateHeader({ score: 0, mult, rolls, bust: true });
      setTimeout(() => resolve(0), 1400);
    }

    function finish(finalScore) {
      done = true;
      clear(controls);
      dieEls.forEach(d => applyState(d, { frozen: true, selectable: false }));
      toast(`Round ${roundIdx + 1}: ${finalScore} pts`, { tone: 'good' });
      updateHeader({ score: finalScore, mult, rolls, done: true });
      setTimeout(() => resolve(finalScore), 900);
    }

    renderDisplay();
    renderControls();
  });
}

export default {
  id: 'multiplier',
  name: 'Sixes Multiplier',
  blurb: 'Roll to add; 6s multiply later rolls; 1s bust.',
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
      head.appendChild(chip('Score', ctx.score ?? 0, { tone: ctx.bust ? 'bust' : 'accent' }));
      head.appendChild(chip('Next roll ×', `×${ctx.mult ?? 1}`, { tone: 'good' }));
      head.appendChild(chip('Rolls', `${ctx.rolls ?? 0} / ${POOL}`));
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
