import { rollMany, createDie, animateRollSequence, applyState, setDie } from '../../dice.js';
import { el, clear, button, chip, toast } from '../../ui.js';

const DICE = 5;
const MAX_PICKUPS = 5;

const rules = `
  <p><strong>Roll 5 dice. Reroll all if you don't like them.</strong></p>
  <p>You get up to <strong>${MAX_PICKUPS}</strong> pick-ups (reroll of all 5 dice). Stop any time.</p>
  <p>Score = sum of all 5 dice.</p>
`;

export default {
  id: 'hurdles',
  decathlon: 'reiner',
  name: '110m Hurdles',
  blurb: 'Roll 5 dice. Reroll all up to 5 times.',
  rulesHtml: rules,
  rounds: 1,

  async play(host) {
    return new Promise((resolve) => {
      const head = el('div', { class: 'score-strip' });
      const tray = el('div', { class: 'dice-tray center' });
      const status = el('div', { class: 'status', html: 'Roll the 5 dice to start.' });
      const controls = el('div', { class: 'button-row' });

      host.appendChild(head);
      host.appendChild(tray);
      host.appendChild(status);
      host.appendChild(controls);

      let values = null;
      let dieEls = null;
      let pickupsUsed = 0;
      let done = false;
      let busy = false;

      function currentSum() { return values ? values.reduce((a, b) => a + b, 0) : 0; }

      function renderHead() {
        clear(head);
        head.appendChild(chip('Sum', currentSum(), { tone: 'accent' }));
        head.appendChild(chip('Pick-ups left', MAX_PICKUPS - pickupsUsed));
      }

      async function throwAll(isInitial) {
        busy = true;
        clear(controls);
        values = rollMany(DICE);
        if (isInitial) {
          clear(tray);
          dieEls = values.map(() => createDie(1, { placeholder: true, selectable: false }));
          for (const d of dieEls) tray.appendChild(d);
        } else {
          for (let i = 0; i < DICE; i++) setDie(dieEls[i], 1, { placeholder: true, selectable: false });
        }
        status.innerHTML = 'Rolling…';
        await animateRollSequence(dieEls, values, {
          onReveal: (_i, _v, shown) => {
            const sum = shown.reduce((a, b) => a + b, 0);
            const remaining = DICE - shown.length;
            const tail = remaining > 0 ? ` (${remaining} to go)` : '';
            status.innerHTML = `Rolling… so far: <strong>${sum}</strong>${tail}.`;
          },
        });
        renderHead();
        const s = currentSum();
        if (pickupsUsed >= MAX_PICKUPS) {
          status.innerHTML = `Rolled <strong>${s}</strong>. No more pick-ups — banking.`;
        } else {
          status.innerHTML = `Rolled <strong>${s}</strong>. Stop, or pick up and reroll (${MAX_PICKUPS - pickupsUsed} left).`;
        }
        busy = false;
        renderControls();
      }

      function renderControls() {
        clear(controls);
        if (done) return;
        if (values === null) {
          controls.appendChild(button(`Roll ${DICE} dice`, {
            variant: 'good',
            onClick: () => throwAll(true),
          }));
          return;
        }
        if (pickupsUsed < MAX_PICKUPS) {
          controls.appendChild(button(`Pick up & reroll`, {
            variant: 'reroll',
            onClick: async () => {
              if (busy) return;
              pickupsUsed += 1;
              renderHead();
              await throwAll(false);
            },
          }));
        }
        controls.appendChild(button('Stop & Bank', { onClick: finish }));
      }

      function finish() {
        if (busy || done) return;
        done = true;
        clear(controls);
        const score = currentSum();
        dieEls.forEach(d => applyState(d, { frozen: true }));
        toast(`Hurdles: ${score} pts`, { tone: 'good' });
        renderHead();
        setTimeout(() => resolve(score), 900);
      }

      renderHead();
      renderControls();
    });
  },
};
