import { rollDie, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep } from '../ui.js';

const POOL = 10;

const rules = `
  <p>Pool of 10 dice. One die is rolled at a time. After each roll, call <strong>Higher</strong> or <strong>Lower</strong> for the next roll — or <strong>Stop</strong> and bank.</p>
  <p>If the next roll doesn't strictly match your call (a tie counts as wrong), you <strong>bust</strong> and the round scores 0.</p>
  <p>Score = <strong>2× the total pips</strong> of every die rolled. Best of 5 rounds counts.</p>
`;

const ROUNDS = 5;

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const callRow = el('div', { class: 'call-buttons' });
    const status = el('div', { class: 'rules', html: 'Roll the first die to start.' });

    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(callRow);

    const rolled = [];
    const dieEls = [];
    let pendingCall = null;
    let done = false;

    const currentValue = () => rolled[rolled.length - 1];
    const pipTotal = () => rolled.reduce((a, b) => a + b, 0);
    const score = () => pipTotal() * 2;

    function renderCallButtons() {
      clear(callRow);
      if (done) return;
      if (rolled.length === 0) {
        callRow.appendChild(button('Roll first die', { onClick: doFirstRoll, variant: 'good' }));
        return;
      }
      if (rolled.length >= POOL) {
        // Max rolls reached; auto-stop.
        finish(score());
        return;
      }
      const cv = currentValue();
      callRow.appendChild(button(`▲ Higher than ${cv}`, {
        onClick: () => rollWithCall('higher'),
        variant: 'good',
      }));
      callRow.appendChild(button(`Stop & bank ${score()}`, {
        onClick: () => finish(score()),
      }));
      callRow.appendChild(button(`▼ Lower than ${cv}`, {
        onClick: () => rollWithCall('lower'),
        variant: 'good',
      }));
    }

    function renderStatus(message) {
      status.innerHTML = message;
    }

    async function doFirstRoll() {
      clear(callRow);
      const v = rollDie();
      rolled.push(v);
      const d = createDie(v);
      dieEls.push(d);
      tray.appendChild(d);
      applyState(d, { highlight: true });
      await animateRoll(d, v);
      updateHeader({ score: score(), pips: pipTotal(), rolls: rolled.length });
      renderStatus(`Rolled <strong>${v}</strong>. Predict the next one — or stop and bank.`);
      renderCallButtons();
    }

    async function rollWithCall(call) {
      pendingCall = call;
      clear(callRow);
      const previous = currentValue();
      // remove highlight on previous die
      dieEls.forEach(d => applyState(d, { highlight: false }));

      const v = rollDie();
      rolled.push(v);
      const d = createDie(v);
      dieEls.push(d);
      tray.appendChild(d);
      applyState(d, { highlight: true });
      await animateRoll(d, v);

      const correct =
        (call === 'higher' && v > previous) ||
        (call === 'lower' && v < previous);

      if (!correct) {
        applyState(d, { highlight: false, bust: true });
        const why = v === previous ? `tied with ${previous}` : `${v} is not ${call} than ${previous}`;
        bust(why);
        return;
      }

      updateHeader({ score: score(), pips: pipTotal(), rolls: rolled.length });
      const remaining = POOL - rolled.length;
      renderStatus(remaining > 0
        ? `Rolled <strong>${v}</strong>. Pips so far: <strong>${pipTotal()}</strong> (×2 = <strong>${score()}</strong>). ${remaining} roll${remaining === 1 ? '' : 's'} left.`
        : `Pool exhausted — stopping with <strong>${score()}</strong>.`);
      renderCallButtons();
    }

    function bust(reason) {
      done = true;
      clear(callRow);
      toast(`Bust — ${reason}`, { tone: 'bad', duration: 2200 });
      updateHeader({ score: 0, pips: 0, rolls: rolled.length, bust: true });
      setTimeout(() => resolve(0), 1400);
    }

    function finish(finalScore) {
      done = true;
      clear(callRow);
      dieEls.forEach(d => applyState(d, { highlight: false, frozen: true, selectable: false }));
      toast(`Round ${roundIdx + 1}: ${finalScore} pts`, { tone: 'good' });
      updateHeader({ score: finalScore, pips: pipTotal(), rolls: rolled.length, done: true });
      setTimeout(() => resolve(finalScore), 900);
    }

    renderCallButtons();
  });
}

export default {
  id: 'hilo',
  name: 'Higher or Lower',
  blurb: 'Predict the next die. Tie busts.',
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
      head.appendChild(chip('Score', ctx.score ?? 0, { tone: ctx.bust ? 'bust' : 'accent' }));
      head.appendChild(chip('Pips ×2', ctx.pips ?? 0));
      head.appendChild(chip('Rolls', `${ctx.rolls ?? 0} / ${POOL}`));
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
