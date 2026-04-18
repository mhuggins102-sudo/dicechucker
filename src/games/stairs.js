import { rollMany, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep } from '../ui.js';

const STAGES = [1, 2, 3, 4];
const ROUNDS = 3;

const rules = `
  <p>Climb four stages, rolling more dice each time. Stage 1: roll 1 die. Stage 2: roll 2 dice. Stage 3: roll 3 dice. Stage 4: roll 4 dice (10 dice total).</p>
  <p>Each stage's dice add to your running total — but if a stage has any <strong>duplicate values</strong>, you <strong>bust</strong> and the round scores 0.</p>
  <p>You may <strong>stop &amp; bank</strong> after any successful stage. Best of 3 rounds counts.</p>
`;

function hasDuplicate(values) {
  return new Set(values).size !== values.length;
}

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', { class: 'rules', html: 'Roll stage 1 — 1 die.' });
    const controls = el('div', { class: 'button-row' });
    const stagesPill = el('div', { class: 'stage-pills' });

    host.appendChild(stagesPill);
    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(controls);

    let stageIdx = 0;            // 0..STAGES.length, points to the next stage to roll
    let total = 0;
    let done = false;
    let busy = false;
    const rolledStages = [];     // [{ values, dieEls, sum }]

    function renderStagePills() {
      clear(stagesPill);
      STAGES.forEach((count, i) => {
        let cls = 'pill';
        let label = `Stage ${i + 1}: ${count}d`;
        const s = rolledStages[i];
        if (s?.bust) { cls += ' bust'; label += ` — bust`; }
        else if (s) { cls += ' done'; label += ` +${s.sum}`; }
        else if (i === stageIdx && !done) { cls += ' active'; }
        stagesPill.appendChild(el('span', { class: cls, text: label }));
      });
    }

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
        controls.appendChild(button(`Stop & bank ${total}`, {
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
      const dieEls = values.map(v => {
        const d = createDie(v);
        applyState(d, { selectable: false });
        return d;
      });

      // Add a divider before non-first stages.
      if (stageIdx > 0) {
        tray.appendChild(el('div', { class: 'stage-divider' }));
      }
      for (const d of dieEls) tray.appendChild(d);

      await Promise.all(dieEls.map((d, i) => animateRoll(d, values[i])));

      const sum = values.reduce((a, b) => a + b, 0);
      const bust = hasDuplicate(values);

      if (bust) {
        dieEls.forEach(d => applyState(d, { bust: true }));
        rolledStages.push({ values, dieEls, sum, bust: true });
        renderStagePills();
        const dup = findDuplicates(values);
        bustRound(`stage ${stageIdx + 1} rolled duplicate ${dup}`);
        return;
      }

      total += sum;
      rolledStages.push({ values, dieEls, sum });
      dieEls.forEach(d => applyState(d, { frozen: true }));
      stageIdx += 1;
      renderStagePills();
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

    renderStagePills();
    renderControls();
  });
}

export default {
  id: 'stairs',
  name: 'Stairs',
  blurb: 'Climb 4 stages of dice — no duplicates per stage.',
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
      head.appendChild(chip('Stage', `${ctx.stage ?? 0} / ${STAGES.length}`));
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
