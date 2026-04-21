import { rollDie, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep, runRounds } from '../ui.js';

const POOL = 10;
const ROUNDS = 3;

const rules = `
  <p><strong>Push your luck with a growing multiplier.</strong></p>
  <p>Roll dice one at a time, up to 10. You start at ×1.</p>
  <p>Roll a <strong>2–5</strong>: its pips, times your multiplier, go on your score.<br>
  Roll a <strong>6</strong>: the 6 scores nothing, but your multiplier goes up by 1 for all future rolls.<br>
  Roll a <strong>1</strong>: bust — round scores 0.</p>
  <p>Stop anytime to bank. Best of 3 rounds counts.</p>
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
  decathlon: 'ryno',
  name: 'Sixes Multiplier',
  blurb: 'Add pips × multiplier. 6s grow the multiplier, 1s bust.',
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
