import { rollMany, createDie, animateRollSequence, applyState, setDie } from '../../dice.js';
import { el, clear, button, chip, toast, sleep } from '../../ui.js';

const MAX_DICE = 8;
const ATTEMPTS_PER_HEIGHT = 3;
const START_HEIGHT = 10;
const HEIGHT_STEP = 2;
const MAX_HEIGHT = 48;

const rules = `
  <p><strong>Clear the bar — but no 1s allowed.</strong></p>
  <p>Pick <strong>1–${MAX_DICE} dice</strong> to throw. Clear the bar if the sum is at or above the current height <em>and</em> none of the dice show a <strong>1</strong>.</p>
  <p>Before you take your first attempt at a height you can <em>skip</em> ahead to a higher bar. Once you attempt a height even once, you're committed — clear it or fail 3 times. Failing 3 times ends the event but you still keep your last cleared height.</p>
  <p>Miss <strong>3 times at the same height</strong> and the event ends. First height <strong>${START_HEIGHT}</strong>; bar rises by <strong>${HEIGHT_STEP}</strong>.</p>
`;

export default {
  id: 'polevault',
  decathlon: 'reiner',
  name: 'Pole Vault',
  blurb: 'Pick 1-8 dice. Clear the bar with no 1s.',
  rulesHtml: rules,
  rounds: 1,

  async play(host) {
    return new Promise((resolve) => {
      const head = el('div', { class: 'score-strip' });
      const tray = el('div', { class: 'dice-tray center' });
      const status = el('div', { class: 'status', html: `Bar at <strong>${START_HEIGHT}</strong>. Pick how many dice to throw.` });
      const controls = el('div');

      host.appendChild(head);
      host.appendChild(tray);
      host.appendChild(status);
      host.appendChild(controls);

      let height = START_HEIGHT;
      let cleared = 0;
      let attempts = 0;
      let done = false;
      let busy = false;

      function renderHead() {
        clear(head);
        head.appendChild(chip('Height', height, { tone: 'accent' }));
        const attemptLabel = Math.min(attempts + 1, ATTEMPTS_PER_HEIGHT);
        head.appendChild(chip('Attempt', `${attemptLabel} / ${ATTEMPTS_PER_HEIGHT}`));
        head.appendChild(chip('Cleared', cleared, { tone: 'good' }));
      }

      function skipHeight() {
        if (busy || done) return;
        if (attempts !== 0) return;
        if (height >= MAX_HEIGHT) return;
        height += HEIGHT_STEP;
        renderHead();
        status.innerHTML = `Skipped — bar now at <strong>${height}</strong>. Pick your dice, or skip again.`;
        renderControls();
      }

      async function doJump(n) {
        busy = true;
        clear(controls);
        clear(tray);
        const values = rollMany(n);
        const dieEls = values.map(() => createDie(1, { placeholder: true, selectable: false }));
        for (const d of dieEls) tray.appendChild(d);

        status.innerHTML = `Throwing ${n} ${n === 1 ? 'die' : 'dice'} at <strong>${height}</strong>…`;
        await animateRollSequence(dieEls, values, {
          onReveal: (_i, _v, shown) => {
            const partial = shown.reduce((a, b) => a + b, 0);
            const hasOne = shown.includes(1);
            if (hasOne) {
              status.innerHTML = `A <strong>1</strong> — the bar will fall.`;
              return;
            }
            const remaining = n - shown.length;
            const tail = remaining > 0 ? ` (${remaining} to go)` : '';
            status.innerHTML = `So far: <strong>${partial}</strong> (need ${height})${tail}.`;
          },
        });

        const sum = values.reduce((a, b) => a + b, 0);
        const hasOne = values.includes(1);
        const success = !hasOne && sum >= height;

        if (success) {
          dieEls.forEach(d => applyState(d, { highlight: true }));
          cleared = height;
          attempts = 0;
          status.innerHTML = `Rolled <strong>${sum}</strong> — cleared <strong>${height}</strong>!`;
          renderHead();
          await sleep(700);
          if (height >= MAX_HEIGHT) {
            status.innerHTML = `Cleared max height <strong>${MAX_HEIGHT}</strong>. Ending.`;
            await sleep(600);
            finish();
            return;
          }
          height += HEIGHT_STEP;
          renderHead();
          status.innerHTML = `Bar raised to <strong>${height}</strong>. Pick your dice.`;
        } else {
          dieEls.forEach((d, i) => applyState(d, { bust: values[i] === 1 || !hasOne, dim: hasOne && values[i] !== 1 }));
          attempts += 1;
          renderHead();
          const reason = hasOne ? `rolled a 1` : `total ${sum} below ${height}`;
          if (attempts >= ATTEMPTS_PER_HEIGHT) {
            status.innerHTML = `Missed (${reason}). Three failed at <strong>${height}</strong> — event over, banking <strong>${cleared}</strong>.`;
            await sleep(900);
            finish();
            return;
          }
          status.innerHTML = `Missed (${reason}). ${ATTEMPTS_PER_HEIGHT - attempts} attempt${ATTEMPTS_PER_HEIGHT - attempts === 1 ? '' : 's'} left at <strong>${height}</strong>.`;
        }

        busy = false;
        renderControls();
      }

      function renderControls() {
        clear(controls);
        if (done) return;
        controls.appendChild(el('div', {
          class: 'chooser-label',
          text: `Dice to throw at ${height} (attempt ${Math.min(attempts + 1, ATTEMPTS_PER_HEIGHT)} of ${ATTEMPTS_PER_HEIGHT})`,
        }));
        const chooser = el('div', { class: 'inline-chooser' });
        for (let n = 1; n <= MAX_DICE; n++) {
          chooser.appendChild(button(String(n), {
            variant: 'good die-count',
            onClick: () => doJump(n),
          }));
        }
        if (attempts === 0 && height < MAX_HEIGHT) {
          chooser.appendChild(button(`Skip to ${height + HEIGHT_STEP}`, {
            variant: 'reroll',
            onClick: skipHeight,
          }));
        }
        controls.appendChild(chooser);
      }

      function finish() {
        if (done) return;
        done = true;
        busy = false;
        clear(controls);
        toast(`Pole Vault: ${cleared} pts`, { tone: cleared > 0 ? 'good' : 'bad' });
        renderHead();
        setTimeout(() => resolve(cleared), 900);
      }

      renderHead();
      renderControls();
    });
  },
};
