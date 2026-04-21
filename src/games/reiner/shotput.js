import { rollDie, createDie, animateRoll, applyState } from '../../dice.js';
import { el, clear, button, chip, toast, sleep } from '../../ui.js';

const MAX_DICE = 8;
const ATTEMPTS = 3;

const rules = `
  <p><strong>Throw dice one at a time.</strong></p>
  <p>Stop any time and bank the sum. Any <strong>1</strong> makes the attempt invalid (0).</p>
  <p>${ATTEMPTS} attempts, up to ${MAX_DICE} dice each. Best attempt counts.</p>
`;

async function playAttempt(host, attemptIdx, updateBest) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', { class: 'status', html: `Attempt ${attemptIdx + 1} — throw a die to start.` });
    const controls = el('div', { class: 'button-row' });

    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(controls);

    const values = [];
    const dieEls = [];
    let done = false;
    let busy = false;

    function sum() { return values.reduce((a, b) => a + b, 0); }

    function renderControls() {
      clear(controls);
      if (done) return;
      const next = values.length + 1;
      if (next > MAX_DICE) {
        finish(sum());
        return;
      }
      controls.appendChild(button(
        values.length === 0 ? 'Throw first die' : `Throw die ${next}`,
        { variant: 'good', onClick: doThrow },
      ));
      if (values.length > 0) {
        controls.appendChild(button('Stop & Bank', { onClick: () => finish(sum()) }));
      }
    }

    async function doThrow() {
      if (busy || done) return;
      busy = true;
      clear(controls);

      const v = rollDie();
      const d = createDie(1, { placeholder: true, selectable: false });
      dieEls.push(d);
      tray.appendChild(d);
      status.innerHTML = `Throwing die ${values.length + 1}…`;
      await animateRoll(d, v);

      values.push(v);
      if (v === 1) {
        applyState(d, { bust: true });
        status.innerHTML = `Rolled a <strong>1</strong> — attempt invalid, 0 pts.`;
        fail();
        return;
      }
      applyState(d, { frozen: true });
      status.innerHTML = `Running total: <strong>${sum()}</strong>. Throw another or stop.`;
      busy = false;
      renderControls();
    }

    function fail() {
      done = true;
      clear(controls);
      toast('Invalid attempt — 0 pts', { tone: 'bad' });
      setTimeout(() => resolve(0), 1200);
    }

    function finish(score) {
      done = true;
      clear(controls);
      toast(`Attempt ${attemptIdx + 1}: ${score} pts`, { tone: 'good' });
      if (updateBest) updateBest();
      setTimeout(() => resolve(score), 900);
    }

    renderControls();
  });
}

export default {
  id: 'shotput',
  decathlon: 'reiner',
  name: 'Shot Put',
  blurb: 'Throw up to 8 dice one at a time. Any 1 invalidates.',
  rulesHtml: rules,
  rounds: ATTEMPTS,

  async play(host) {
    const head = el('div', { class: 'score-strip' });
    const body = el('div');
    host.appendChild(head);
    host.appendChild(body);

    const scores = [];
    const renderHead = () => {
      clear(head);
      head.appendChild(chip('Attempt', `${scores.length} / ${ATTEMPTS}`));
      head.appendChild(chip('Best', Math.max(0, ...scores), { tone: 'accent' }));
    };
    renderHead();

    for (let i = 0; i < ATTEMPTS; i++) {
      clear(body);
      const slot = el('div');
      body.appendChild(slot);
      const s = await playAttempt(slot, i, renderHead);
      scores.push(s);
      renderHead();
      await sleep(400);
    }

    return Math.max(0, ...scores);
  },
};
