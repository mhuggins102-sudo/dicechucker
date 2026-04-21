import { rollDie, createDie, animateRoll, applyState, setDie } from '../../dice.js';
import { el, clear, button, chip, toast } from '../../ui.js';

const DICE = 8;
const MAX_REROLLS = 5;

const rules = `
  <p><strong>Roll 8 dice, one at a time.</strong></p>
  <p>After each die, keep it or reroll that one die. You have <strong>${MAX_REROLLS}</strong> rerolls to spend across all 8 dice.</p>
  <p>Score = sum of all 8 dice, but every <strong>6</strong> is worth <strong>−6</strong>.</p>
`;

function effVal(v) { return v === 6 ? -6 : v; }
function effSum(values) { return values.reduce((a, b) => a + effVal(b), 0); }

export default {
  id: 'run1500',
  decathlon: 'reiner',
  name: '1500 Metres',
  blurb: 'Roll 8 dice one at a time. 5 rerolls. 6s hurt.',
  rulesHtml: rules,
  rounds: 1,

  async play(host) {
    return new Promise((resolve) => {
      const head = el('div', { class: 'score-strip' });
      const tray = el('div', { class: 'dice-tray' });
      const status = el('div', { class: 'status', html: 'Throw the first die to begin the race.' });
      const controls = el('div', { class: 'button-row' });

      host.appendChild(head);
      host.appendChild(tray);
      host.appendChild(status);
      host.appendChild(controls);

      const values = [];
      const dieEls = [];
      let rerollsUsed = 0;
      let done = false;
      let busy = false;

      function totalSum() { return effSum(values); }

      function renderHead() {
        clear(head);
        head.appendChild(chip('Score', totalSum(), { tone: totalSum() < 0 ? 'bust' : 'accent' }));
        head.appendChild(chip('Die', `${values.length} / ${DICE}`));
        head.appendChild(chip('Rerolls left', MAX_REROLLS - rerollsUsed));
      }

      async function rollOne(isReroll) {
        busy = true;
        clear(controls);

        let d;
        let idx;
        if (isReroll) {
          idx = values.length - 1;
          d = dieEls[idx];
          setDie(d, 1, { placeholder: true, selectable: false });
        } else {
          idx = values.length;
          d = createDie(1, { placeholder: true, selectable: false });
          dieEls.push(d);
          tray.appendChild(d);
        }

        const v = rollDie();
        status.innerHTML = `Rolling die ${idx + 1}…`;
        await animateRoll(d, v);

        if (isReroll) values[idx] = v;
        else values.push(v);

        renderHead();
        const eff = effVal(v);
        const effStr = eff >= 0 ? `+${eff}` : String(eff);
        status.innerHTML = `Die ${idx + 1}: <strong>${v}</strong> (${effStr}). Total <strong>${totalSum()}</strong>. Keep it or reroll just this die.`;
        busy = false;
        renderControls();
      }

      function renderControls() {
        clear(controls);
        if (done) return;
        if (values.length === 0) {
          controls.appendChild(button('Throw die 1', {
            variant: 'good',
            onClick: () => rollOne(false),
          }));
          return;
        }

        const rerollsLeft = MAX_REROLLS - rerollsUsed;
        if (rerollsLeft > 0) {
          controls.appendChild(button(`Reroll die ${values.length}`, {
            variant: 'reroll',
            onClick: async () => {
              if (busy) return;
              rerollsUsed += 1;
              renderHead();
              await rollOne(true);
            },
          }));
        }

        if (values.length < DICE) {
          controls.appendChild(button(`Keep & throw die ${values.length + 1}`, {
            onClick: async () => {
              if (busy) return;
              applyState(dieEls[values.length - 1], { frozen: values[values.length - 1] !== 6, bust: values[values.length - 1] === 6 });
              await rollOne(false);
            },
          }));
        } else {
          controls.appendChild(button('Finish', { onClick: finish }));
        }
      }

      function finish() {
        if (busy || done) return;
        done = true;
        clear(controls);
        dieEls.forEach((d, i) => {
          applyState(d, { frozen: values[i] !== 6, bust: values[i] === 6 });
        });
        const score = Math.max(0, totalSum());
        toast(`1500m: ${score} pts`, { tone: score > 0 ? 'good' : 'bad' });
        renderHead();
        setTimeout(() => resolve(score), 900);
      }

      renderHead();
      renderControls();
    });
  },
};
