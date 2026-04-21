import { rollMany, createDie, animateRollSequence, applyState, setDie } from '../../dice.js';
import { el, clear, button, chip, toast, sleep } from '../../ui.js';

const DICE = 5;
const ATTEMPTS_PER_HEIGHT = 3;
const START_HEIGHT = 10;
const HEIGHT_STEP = 2;
const MAX_HEIGHT = 30;

const rules = `
  <p><strong>Clear the bar. Each success raises it by 2.</strong></p>
  <p>Roll <strong>${DICE} dice</strong>. If the total is at or above the current height, you clear it. Miss <strong>3 times at the same height</strong> and the event ends.</p>
  <p>Before you take your first attempt at a height you can <em>skip</em> ahead to a higher bar. Once you attempt a height even once, you're committed — clear it or fail 3 times. Failing 3 times ends the event but you still keep your last cleared height.</p>
  <p>First height: <strong>${START_HEIGHT}</strong>. Score = highest height you cleared (or 0 if you fail at a height without clearing any).</p>
`;

export default {
  id: 'highjump',
  decathlon: 'reiner',
  name: 'High Jump',
  blurb: 'Roll 5 dice to meet the bar. 3 misses at a height ends it.',
  rulesHtml: rules,
  rounds: 1,

  async play(host) {
    return new Promise((resolve) => {
      const head = el('div', { class: 'score-strip' });
      const tray = el('div', { class: 'dice-tray center' });
      const status = el('div', { class: 'status', html: `First bar at <strong>${START_HEIGHT}</strong>. Roll ${DICE} dice.` });
      const controls = el('div', { class: 'button-row' });

      host.appendChild(head);
      host.appendChild(tray);
      host.appendChild(status);
      host.appendChild(controls);

      let height = START_HEIGHT;
      let cleared = 0;
      let attempts = 0;
      let dieEls = null;
      let done = false;
      let busy = false;

      function renderHead() {
        clear(head);
        head.appendChild(chip('Height', height, { tone: 'accent' }));
        const attemptLabel = Math.min(attempts + 1, ATTEMPTS_PER_HEIGHT);
        head.appendChild(chip('Attempt', `${attemptLabel} / ${ATTEMPTS_PER_HEIGHT}`));
        head.appendChild(chip('Cleared', cleared, { tone: 'good' }));
      }

      async function doJump() {
        busy = true;
        clear(controls);
        const values = rollMany(DICE);

        if (dieEls === null) {
          dieEls = values.map(() => createDie(1, { placeholder: true, selectable: false }));
          for (const d of dieEls) tray.appendChild(d);
        } else {
          for (let i = 0; i < DICE; i++) setDie(dieEls[i], 1, { placeholder: true, selectable: false });
        }

        status.innerHTML = `Jumping at <strong>${height}</strong>…`;
        await animateRollSequence(dieEls, values, {
          onReveal: (_i, _v, shown) => {
            const partial = shown.reduce((a, b) => a + b, 0);
            const remaining = DICE - shown.length;
            const tail = remaining > 0 ? ` (${remaining} to go)` : '';
            status.innerHTML = `Jumping at <strong>${height}</strong>… so far: <strong>${partial}</strong>${tail}.`;
          },
        });

        const sum = values.reduce((a, b) => a + b, 0);
        if (sum >= height) {
          dieEls.forEach(d => applyState(d, { highlight: true }));
          cleared = height;
          attempts = 0;
          status.innerHTML = `Rolled <strong>${sum}</strong> — cleared <strong>${height}</strong>!`;
          renderHead();
          await sleep(700);
          if (height >= MAX_HEIGHT) {
            status.innerHTML = `Cleared maximum height <strong>${MAX_HEIGHT}</strong>. Ending the event.`;
            await sleep(600);
            finish();
            return;
          }
          height += HEIGHT_STEP;
          renderHead();
          status.innerHTML = `Bar raised to <strong>${height}</strong>. Ready to jump.`;
          busy = false;
          renderControls();
        } else {
          dieEls.forEach(d => applyState(d, { bust: true }));
          attempts += 1;
          renderHead();
          if (attempts >= ATTEMPTS_PER_HEIGHT) {
            status.innerHTML = `Missed 3 times at <strong>${height}</strong> — event over. Banking <strong>${cleared}</strong>.`;
            await sleep(800);
            finish();
            return;
          }
          status.innerHTML = `Rolled <strong>${sum}</strong> — short of <strong>${height}</strong>. ${ATTEMPTS_PER_HEIGHT - attempts} attempt${ATTEMPTS_PER_HEIGHT - attempts === 1 ? '' : 's'} left at this height.`;
          busy = false;
          renderControls();
        }
      }

      function skipHeight() {
        if (busy || done) return;
        if (attempts !== 0) return;
        if (height >= MAX_HEIGHT) return;
        height += HEIGHT_STEP;
        renderHead();
        status.innerHTML = `Skipped — bar now at <strong>${height}</strong>. (You can still skip again before your first attempt here.)`;
        renderControls();
      }

      function renderControls() {
        clear(controls);
        if (done) return;
        controls.appendChild(button(`Jump at ${height}`, { variant: 'good', onClick: doJump }));
        if (attempts === 0 && height < MAX_HEIGHT) {
          controls.appendChild(button(`Skip to ${height + HEIGHT_STEP}`, {
            variant: 'reroll',
            onClick: skipHeight,
          }));
        }
      }

      function finish() {
        if (done) return;
        done = true;
        busy = false;
        clear(controls);
        toast(`High Jump: ${cleared} pts`, { tone: cleared > 0 ? 'good' : 'bad' });
        renderHead();
        setTimeout(() => resolve(cleared), 900);
      }

      renderHead();
      renderControls();
    });
  },
};
