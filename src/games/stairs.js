import { rollMany, createDie, animateRollSequence, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep, runRounds } from '../ui.js';

const STAGES = [1, 2, 3, 4];
const ROUNDS = 3;

const rules = `
  <p><strong>Climb four stages without repeating a number.</strong></p>
  <p>Stage 1: roll 1 die. Stage 2: roll 2. Stage 3: roll 3. Stage 4: roll 4. That's 10 dice over 4 stages.</p>
  <p>All the dice in a single stage must show different values. If any stage shows a duplicate, the round busts and scores 0.</p>
  <p>Every pip you roll adds to your score. After any clean stage you can stop and bank. Best of 3 rounds counts.</p>
`;

function hasDuplicate(values) {
  return new Set(values).size !== values.length;
}

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', { class: 'status', html: 'Roll stage 1 — 1 die.' });
    const controls = el('div', { class: 'button-row' });

    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(controls);

    let stageIdx = 0;            // 0..STAGES.length, points to the next stage to roll
    let total = 0;
    let done = false;
    let busy = false;
    const rolledStages = [];     // [{ values, dieEls, sum }]

    function renderControls() {
      clear(controls);
      if (done) return;
      if (stageIdx >= STAGES.length) {
        finish(total);
        return;
      }
      const count = STAGES[stageIdx];
      const isFirst = stageIdx === 0;
      controls.appendChild(button(
        isFirst ? `Roll stage 1 (1 die)` : `Continue — roll ${count} dice`,
        { onClick: rollNextStage, variant: 'good' },
      ));
      if (!isFirst) {
        controls.appendChild(button('Stop & Bank', {
          onClick: () => finish(total),
        }));
      }
    }

    async function rollNextStage() {
      if (busy) return;
      busy = true;
      clear(controls);

      const count = STAGES[stageIdx];
      const values = rollMany(count);
      const dieEls = values.map(() => createDie(1, { placeholder: true, selectable: false }));

      // Add a divider before non-first stages.
      if (stageIdx > 0) {
        tray.appendChild(el('div', { class: 'stage-divider' }));
      }
      for (const d of dieEls) tray.appendChild(d);

      status.innerHTML = `Rolling stage ${stageIdx + 1} — ${count} ${count === 1 ? 'die' : 'dice'}.`;

      await animateRollSequence(dieEls, values, {
        onReveal: (_i, _v, shown) => {
          const remaining = count - shown.length;
          const tail = remaining > 0 ? ` (${remaining} to go)` : '';
          const dup = hasDuplicate(shown);
          if (dup) {
            status.innerHTML = `Duplicate rolled — stage ${stageIdx + 1} will bust${tail}.`;
            return;
          }
          const partial = shown.reduce((a, b) => a + b, 0);
          status.innerHTML = `Stage ${stageIdx + 1}: <strong>+${partial}</strong> so far (total would be ${total + partial})${tail}.`;
        },
      });

      const sum = values.reduce((a, b) => a + b, 0);
      const bust = hasDuplicate(values);

      if (bust) {
        dieEls.forEach(d => applyState(d, { bust: true }));
        rolledStages.push({ values, dieEls, sum, bust: true });
        const dup = findDuplicates(values);
        bustRound(`stage ${stageIdx + 1} rolled duplicate ${dup}`);
        return;
      }

      total += sum;
      rolledStages.push({ values, dieEls, sum });
      dieEls.forEach(d => applyState(d, { frozen: true }));
      stageIdx += 1;
      updateHeader({ total, stage: stageIdx });

      if (stageIdx >= STAGES.length) {
        // Auto-stop after stage 4: no choice left
        status.innerHTML = `All 10 dice rolled clean. Banking <strong>${total}</strong>.`;
        await sleep(450);
        finish(total);
        return;
      }

      const nextCount = STAGES[stageIdx];
      status.innerHTML = `Stage ${stageIdx} clean (+${sum}). Continue with <strong>${nextCount} dice</strong> or stop.`;
      busy = false;
      renderControls();
    }

    function findDuplicates(values) {
      const seen = new Set();
      const dup = new Set();
      for (const v of values) {
        if (seen.has(v)) dup.add(v);
        seen.add(v);
      }
      return [...dup].join(', ');
    }

    function bustRound(reason) {
      done = true;
      clear(controls);
      toast(`Bust — ${reason}`, { tone: 'bad', duration: 2200 });
      updateHeader({ total: 0, stage: stageIdx, bust: true });
      status.innerHTML = `Round busted on ${reason}.`;
      setTimeout(() => resolve(0), 1400);
    }

    function finish(score) {
      done = true;
      clear(controls);
      toast(`Round ${roundIdx + 1}: ${score} pts`, { tone: 'good' });
      updateHeader({ total: score, stage: stageIdx, done: true });
      setTimeout(() => resolve(score), 900);
    }

    renderControls();
  });
}

export default {
  id: 'stairs',
  decathlon: 'ryno',
  name: 'Stairs',
  blurb: 'Four stages of 1, 2, 3, 4 dice — no repeats per stage.',
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
      head.appendChild(chip('Total', ctx.total ?? 0, { tone: ctx.bust ? 'bust' : 'accent' }));
      head.appendChild(chip('Stage', `${ctx.stage ?? 0} / ${STAGES.length}`));
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
