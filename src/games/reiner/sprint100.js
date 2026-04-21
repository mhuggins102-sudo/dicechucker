import { rollMany, createDie, animateRollSequence, applyState, setDie } from '../../dice.js';
import { el, clear, button, chip, toast } from '../../ui.js';

const LANES = 2;
const DICE_PER_LANE = 4;
const MAX_REROLLS = 5;

const rules = `
  <p><strong>Two sets of 4 dice. Sprint through both.</strong></p>
  <p>Throw set A (4 dice). Reroll the whole set if you want, then commit. Same for set B.</p>
  <p>Up to <strong>${MAX_REROLLS}</strong> rerolls total, shared across both sets.</p>
  <p>Score = sum of all 8 dice, but every <strong>6</strong> is worth <strong>−6</strong> (counts against you). Max 40; min −48.</p>
`;

function effVal(v) { return v === 6 ? -6 : v; }
function effSum(values) { return values.reduce((a, b) => a + effVal(b), 0); }

export default {
  id: 'sprint100',
  decathlon: 'reiner',
  name: '100 Metres',
  blurb: 'Two sets of 4 dice. Reroll up to 5 times total. 6s hurt.',
  rulesHtml: rules,
  rounds: 1,

  async play(host) {
    return new Promise((resolve) => {
      const head = el('div', { class: 'score-strip' });
      const lanesWrap = el('div', { class: 'lanes' });
      const laneEls = [];
      const laneTrays = [];

      for (let i = 0; i < LANES; i++) {
        const laneLabel = el('div', { class: 'tray-label', text: `Set ${String.fromCharCode(65 + i)}` });
        const tray = el('div', { class: 'dice-tray' });
        const wrap = el('div', { class: 'lane' }, [laneLabel, tray]);
        lanesWrap.appendChild(wrap);
        laneEls.push(wrap);
        laneTrays.push(tray);
      }
      const status = el('div', { class: 'status', html: 'Throw set A to start.' });
      const controls = el('div', { class: 'button-row' });

      host.appendChild(head);
      host.appendChild(lanesWrap);
      host.appendChild(status);
      host.appendChild(controls);

      const laneValues = [null, null];
      const laneDies = [null, null];
      let activeLane = 0;
      let rerollsUsed = 0;
      let done = false;
      let busy = false;

      function totalSum() {
        let s = 0;
        for (const v of laneValues) if (v) s += effSum(v);
        return s;
      }

      function renderHead() {
        clear(head);
        head.appendChild(chip('Score', totalSum(), { tone: totalSum() < 0 ? 'bust' : 'accent' }));
        head.appendChild(chip('Rerolls left', MAX_REROLLS - rerollsUsed));
      }

      function renderActiveLane() {
        for (let i = 0; i < LANES; i++) {
          laneEls[i].dataset.active = i === activeLane && !done ? 'true' : 'false';
        }
      }

      async function throwLane(i, initial) {
        busy = true;
        clear(controls);
        const values = rollMany(DICE_PER_LANE);
        laneValues[i] = values;

        if (initial) {
          clear(laneTrays[i]);
          laneDies[i] = values.map(() => createDie(1, { placeholder: true, selectable: false }));
          for (const d of laneDies[i]) laneTrays[i].appendChild(d);
        } else {
          for (let k = 0; k < DICE_PER_LANE; k++) {
            setDie(laneDies[i][k], 1, { placeholder: true, selectable: false });
          }
        }

        status.innerHTML = `Throwing set ${String.fromCharCode(65 + i)}…`;
        await animateRollSequence(laneDies[i], values, {
          onReveal: (_idx, _v, shown) => {
            const partial = effSum(shown);
            const remaining = DICE_PER_LANE - shown.length;
            const tail = remaining > 0 ? ` (${remaining} to go)` : '';
            status.innerHTML = `Set ${String.fromCharCode(65 + i)} so far: <strong>${partial}</strong>${tail}.`;
          },
        });

        laneDies[i].forEach(d => applyState(d, { frozen: true }));
        renderHead();
        busy = false;
        renderControls();
      }

      function renderControls() {
        clear(controls);
        renderActiveLane();
        if (done) return;

        if (laneValues[activeLane] === null) {
          controls.appendChild(button(`Throw set ${String.fromCharCode(65 + activeLane)}`, {
            variant: 'good',
            onClick: () => throwLane(activeLane, true),
          }));
          return;
        }

        const rerollsLeft = MAX_REROLLS - rerollsUsed;
        if (rerollsLeft > 0) {
          controls.appendChild(button(`Reroll set ${String.fromCharCode(65 + activeLane)}`, {
            variant: 'reroll',
            onClick: async () => {
              if (busy) return;
              rerollsUsed += 1;
              renderHead();
              await throwLane(activeLane, false);
            },
          }));
        }

        if (activeLane < LANES - 1) {
          controls.appendChild(button(`Commit & throw set ${String.fromCharCode(65 + activeLane + 1)}`, {
            onClick: async () => {
              if (busy) return;
              activeLane += 1;
              await throwLane(activeLane, true);
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
        const score = Math.max(0, totalSum());
        toast(`100m: ${score} pts`, { tone: score > 0 ? 'good' : 'bad' });
        renderHead();
        renderActiveLane();
        setTimeout(() => resolve(score), 900);
      }

      renderHead();
      renderActiveLane();
      renderControls();
    });
  },
};
