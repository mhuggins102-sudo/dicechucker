import { rollMany, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep } from '../ui.js';

const POOL = 10;
const MAX_ROLLS = 3;
const MAX_PER_ROLL = 4;
const ROUNDS = 3;

const rules = `
  <p>You have a pool of 10 dice. On each roll, choose to throw <strong>1–4 dice</strong> at once. If any die comes up a <strong>1</strong>, the whole round busts.</p>
  <p>Otherwise, the rolled pips add to your running total. You may <strong>stop &amp; bank</strong> or roll again.</p>
  <p>Max <strong>3 rolls</strong> per round and at most 10 dice total. Best of 3 rounds counts.</p>
`;

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', { class: 'rules', html: 'Pick how many dice to throw — 1, 2, 3, or 4.' });
    const controls = el('div', { class: 'button-row' });

    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(controls);

    let total = 0;
    let rollsUsed = 0;
    let diceUsed = 0;
    let done = false;
    let busy = false;

    function remainingPool() { return POOL - diceUsed; }
    function maxThisRoll() { return Math.min(MAX_PER_ROLL, remainingPool()); }

    function renderControls() {
      clear(controls);
      if (done) return;
      if (rollsUsed >= MAX_ROLLS || remainingPool() <= 0) {
        finish(total);
        return;
      }
      const cap = maxThisRoll();
      for (let n = 1; n <= cap; n++) {
        controls.appendChild(button(`Roll ${n}`, {
          onClick: () => doRoll(n),
          variant: 'good',
        }));
      }
      if (rollsUsed > 0) {
        controls.appendChild(button('Stop', {
          onClick: () => finish(total),
        }));
      }
    }

    async function doRoll(n) {
      if (busy) return;
      busy = true;
      clear(controls);

      const values = rollMany(n);
      const dieEls = values.map(v => {
        const d = createDie(v);
        applyState(d, { selectable: false });
        return d;
      });

      if (rollsUsed > 0) {
        tray.appendChild(el('div', { class: 'stage-divider' }));
      }
      for (const d of dieEls) tray.appendChild(d);

      await Promise.all(dieEls.map((d, i) => animateRoll(d, values[i])));

      rollsUsed += 1;
      diceUsed += n;

      if (values.includes(1)) {
        dieEls.forEach((d, i) => {
          if (values[i] === 1) applyState(d, { bust: true });
        });
        bustRound('rolled a 1');
        return;
      }

      const sum = values.reduce((a, b) => a + b, 0);
      total += sum;
      dieEls.forEach(d => applyState(d, { frozen: true }));
      updateHeader({ total, rollsUsed, diceUsed });

      const rollsLeft = MAX_ROLLS - rollsUsed;
      const poolLeft = remainingPool();
      if (rollsLeft === 0 || poolLeft === 0) {
        status.innerHTML = `+${sum}. ${rollsLeft === 0 ? 'No rolls left' : 'Pool empty'} — banking <strong>${total}</strong>.`;
        await sleep(450);
        finish(total);
        return;
      }

      status.innerHTML = `+${sum}. Running total: <strong>${total}</strong>. ${rollsLeft} roll${rollsLeft === 1 ? '' : 's'} left, up to ${Math.min(MAX_PER_ROLL, poolLeft)} dice.`;
      busy = false;
      renderControls();
    }

    function bustRound(reason) {
      done = true;
      clear(controls);
      toast(`Bust — ${reason}`, { tone: 'bad', duration: 2200 });
      updateHeader({ total: 0, rollsUsed, diceUsed, bust: true });
      status.innerHTML = `Round busted — ${reason}.`;
      setTimeout(() => resolve(0), 1400);
    }

    function finish(score) {
      done = true;
      clear(controls);
      toast(`Round ${roundIdx + 1}: ${score} pts`, { tone: 'good' });
      updateHeader({ total: score, rollsUsed, diceUsed, done: true });
      setTimeout(() => resolve(score), 900);
    }

    renderControls();
  });
}

export default {
  id: 'salvo',
  name: 'Salvo',
  blurb: 'Throw 1–4 dice at a time. Any 1 busts.',
  rulesHtml: rules,
  rounds: ROUNDS,

  async play(host) {
    const outcomes = Array(ROUNDS).fill(null);
    const results = Array(ROUNDS).fill(0);
    const head = el('div', { class: 'score-strip' });
    const pills = el('div');
    host.appendChild(head);
    host.appendChild(pills);
    const body = el('div');
    host.appendChild(body);

    const renderHead = (ctx = {}) => {
      clear(head);
      head.appendChild(chip('Total', ctx.total ?? 0, { tone: ctx.bust ? 'bust' : 'accent' }));
      head.appendChild(chip('Rolls', `${ctx.rollsUsed ?? 0} / ${MAX_ROLLS}`));
      head.appendChild(chip('Dice', `${ctx.diceUsed ?? 0} / ${POOL}`));
      head.appendChild(chip('Best round', Math.max(0, ...results), { tone: 'accent' }));
    };
    const renderPills = (current) => {
      clear(pills);
      pills.appendChild(roundPills(ROUNDS, current, outcomes));
    };

    for (let r = 0; r < ROUNDS; r++) {
      clear(body);
      renderHead();
      renderPills(r);
      const score = await playRound(body, r, (ctx) => renderHead(ctx));
      results[r] = score;
      outcomes[r] = score > 0 ? { done: true, score } : { bust: true };
      renderPills(r);
      await sleep(400);
    }

    return Math.max(...results);
  },
};
