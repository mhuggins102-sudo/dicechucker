import { rollDie, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep, runRounds } from '../ui.js';

const POOL = 10;
const ROUNDS = 3;

const rules = `
  <p><strong>Guess whether the next roll is higher or lower.</strong></p>
  <p>Roll one die at a time, up to 10. Before each new roll, call <em>Higher</em> or <em>Lower</em> than the last one — or <em>Stop</em> and bank.</p>
  <p>Right guess: add the new die's pips to your score. Wrong guess: bust, round scores 0. Tie: the die is wasted (no pips) but no bust.</p>
  <p>Best of 3 rounds counts.</p>
`;

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const callRow = el('div', { class: 'button-row' });
    const status = el('div', { class: 'status', html: 'Roll the first die to start.' });

    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(callRow);

    const dieEls = [];
    let rolls = 0;
    let pips = 0;
    let reference = null;
    let done = false;
    let busy = false;

    const score = () => pips;

    function renderCallButtons() {
      clear(callRow);
      if (done) return;
      if (rolls === 0) {
        callRow.appendChild(button('Roll first die', { onClick: doFirstRoll, variant: 'good' }));
        return;
      }
      if (rolls >= POOL) {
        finish(score());
        return;
      }
      callRow.appendChild(button('▲ Higher', {
        onClick: () => rollWithCall('higher'),
        variant: 'good',
      }));
      callRow.appendChild(button('▼ Lower', {
        onClick: () => rollWithCall('lower'),
        variant: 'good',
      }));
      callRow.appendChild(button('Stop & Bank', {
        onClick: () => finish(score()),
      }));
    }

    function renderStatus(html) { status.innerHTML = html; }

    async function doFirstRoll() {
      if (busy) return;
      busy = true;
      clear(callRow);
      const v = rollDie();
      rolls += 1;
      pips += v;
      reference = v;
      const d = createDie(v);
      dieEls.push(d);
      tray.appendChild(d);
      applyState(d, { highlight: true });
      await animateRoll(d, v);
      updateHeader({ score: score(), pips, rolls });
      renderStatus(`Rolled <strong>${v}</strong>. Predict the next one — or stop and bank.`);
      busy = false;
      renderCallButtons();
    }

    async function rollWithCall(call) {
      if (busy) return;
      busy = true;
      clear(callRow);
      const prev = reference;
      dieEls.forEach(d => applyState(d, { highlight: false }));

      const v = rollDie();
      rolls += 1;
      const d = createDie(v);
      dieEls.push(d);
      tray.appendChild(d);
      applyState(d, { highlight: true });
      await animateRoll(d, v);

      if (v === prev) {
        applyState(d, { highlight: false, dim: true });
        updateHeader({ score: score(), pips, rolls });
        const remaining = POOL - rolls;
        renderStatus(remaining > 0
          ? `Tied <strong>${v}</strong> — die wasted. Still ${remaining} roll${remaining === 1 ? '' : 's'} left. Call against <strong>${reference}</strong> again.`
          : `Tied on the final die — banking <strong>${score()}</strong> pts.`);
        busy = false;
        renderCallButtons();
        return;
      }

      const correct = (call === 'higher' && v > prev) || (call === 'lower' && v < prev);
      if (!correct) {
        applyState(d, { highlight: false, bust: true });
        bust(`${v} is not ${call} than ${prev}`);
        return;
      }

      pips += v;
      reference = v;
      updateHeader({ score: score(), pips, rolls });
      const remaining = POOL - rolls;
      renderStatus(remaining > 0
        ? `Rolled <strong>${v}</strong>. Pips so far: <strong>${pips}</strong>. ${remaining} roll${remaining === 1 ? '' : 's'} left.`
        : `Pool exhausted — stopping with <strong>${score()}</strong>.`);
      busy = false;
      renderCallButtons();
    }

    function bust(reason) {
      done = true;
      clear(callRow);
      toast(`Bust — ${reason}`, { tone: 'bad', duration: 2200 });
      updateHeader({ score: 0, pips: 0, rolls, bust: true });
      setTimeout(() => resolve(0), 1400);
    }

    function finish(finalScore) {
      done = true;
      clear(callRow);
      dieEls.forEach(d => applyState(d, { highlight: false, frozen: !d.dataset.dim, selectable: false }));
      toast(`Round ${roundIdx + 1}: ${finalScore} pts`, { tone: 'good' });
      updateHeader({ score: finalScore, pips, rolls, done: true });
      setTimeout(() => resolve(finalScore), 900);
    }

    renderCallButtons();
  });
}

export default {
  id: 'hilo',
  name: 'Higher or Lower',
  blurb: 'Call the next die higher or lower. Wrong call busts.',
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
