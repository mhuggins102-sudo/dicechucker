import { rollMany, rollDie, createDie, setDie, animateRoll, animateRollSequence, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep, runRounds } from '../ui.js';

const SCORE_BY_SUM = {
  2: 10, 3: 9, 4: 8, 5: 7, 6: 6, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 12: 10,
};

function scoreForSum(s) { return SCORE_BY_SUM[s] || 0; }

function hasPairOfSum(values, frozenSet, S) {
  for (let i = 0; i < values.length; i++) {
    if (frozenSet.has(i)) continue;
    for (let j = i + 1; j < values.length; j++) {
      if (frozenSet.has(j)) continue;
      if (values[i] + values[j] === S) return true;
    }
  }
  return false;
}

function anyPairPossible(values, frozenSet) {
  for (let i = 0; i < values.length; i++) {
    if (frozenSet.has(i)) continue;
    for (let j = i + 1; j < values.length; j++) {
      if (frozenSet.has(j)) continue;
      return true;
    }
  }
  return false;
}

const rules = `
  <p><strong>Collect pairs of dice that add to the same number.</strong></p>
  <p>Roll 10 dice. Pick two dice whose values add up — that total becomes your "target." Every pair you lock in from now on must add to that same target.</p>
  <p>After locking pairs, either <strong>stop</strong> and bank, or <strong>reroll</strong> the leftover dice to try for more pairs. If a reroll has no way to make another target-total pair, you bust and score 0 for the round.</p>
  <p>Rarer totals pay more. Totals of 2 or 12 are worth 10 pts each pair, down to 5 pts for a 7. Best of 3 rounds counts.</p>
`;

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const state = {
      values: rollMany(10),
      frozen: new Set(),
      pairs: [],
      S: null,
      staged: [],
      justRolled: true,
      busy: true,
    };

    const tray = el('div', { class: 'dice-tray' });
    const pairListWrap = el('div');
    const controls = el('div', { class: 'button-row' });
    const subInfo = el('div', { class: 'status', html: '<strong>Stage a pair</strong> by clicking two dice, then Freeze pair to lock them in.' });

    host.appendChild(tray);
    host.appendChild(pairListWrap);
    host.appendChild(subInfo);
    host.appendChild(controls);

    const dieEls = state.values.map((_, i) => {
      const d = createDie(1, { placeholder: true, selectable: false });
      d.addEventListener('click', () => onDieClick(i));
      tray.appendChild(d);
      return d;
    });

    function currentScore() {
      return state.pairs.reduce((acc, p) => acc + scoreForSum(p.sum), 0);
    }

    function renderDice() {
      state.values.forEach((v, i) => {
        setDie(dieEls[i], v, {
          frozen: state.frozen.has(i),
          staged: state.staged.includes(i),
          selectable: !state.frozen.has(i),
        });
      });
    }

    function renderPairList() {
      clear(pairListWrap);
      if (!state.pairs.length) return;
      const list = el('div', { class: 'pair-list' });
      const byS = state.pairs.reduce((acc, p) => (acc[p.sum] = (acc[p.sum] || 0) + 1, acc), {});
      for (const [s, count] of Object.entries(byS)) {
        list.appendChild(el('span', {
          class: 'pair-chip',
          html: `${count} × sum <strong>${s}</strong> → ${count * scoreForSum(Number(s))} pts`,
        }));
      }
      pairListWrap.appendChild(list);
    }

    function renderControls() {
      clear(controls);

      const stageSum = state.staged.length === 2
        ? state.values[state.staged[0]] + state.values[state.staged[1]]
        : null;

      const canFreezeStage =
        state.staged.length === 2 &&
        (state.S === null || stageSum === state.S);

      controls.appendChild(button('Freeze pair', {
        onClick: onFreezeClick, disabled: !canFreezeStage, variant: 'good',
      }));

      const hasFrozenThisRoll = state.pairs.some(p => p.rollIdx === state.rollIdx());
      const canProceed = !state.justRolled || hasFrozenThisRoll;
      const unfrozenCount = state.values.length - state.frozen.size;

      controls.appendChild(button('Reroll', {
        onClick: onRerollClick,
        disabled: !canProceed || unfrozenCount < 2,
        title: unfrozenCount < 2 ? 'Need at least 2 unfrozen dice' : '',
        variant: 'reroll',
      }));
      controls.appendChild(button('Stop & Bank', {
        onClick: onStopClick,
        disabled: !canProceed || state.pairs.length === 0,
      }));
    }

    state.rollIdx = () => state.rollsDone || 0;
    state.rollsDone = 1;

    function render() {
      renderDice();
      renderPairList();
      renderControls();
      updateHeader({ roundScore: currentScore(), S: state.S });
    }

    function onDieClick(i) {
      if (state.busy) return;
      if (state.frozen.has(i)) return;
      const pos = state.staged.indexOf(i);
      if (pos >= 0) state.staged.splice(pos, 1);
      else {
        if (state.staged.length >= 2) state.staged.shift();
        state.staged.push(i);
      }
      render();
    }

    function onFreezeClick() {
      if (state.staged.length !== 2) return;
      const [a, b] = state.staged;
      const sum = state.values[a] + state.values[b];
      if (state.S !== null && sum !== state.S) return;
      state.S = sum;
      state.frozen.add(a);
      state.frozen.add(b);
      state.pairs.push({ a, b, sum, rollIdx: state.rollsDone });
      state.staged = [];
      if (subInfo.parentNode) subInfo.remove();
      render();
    }

    async function onRerollClick() {
      if (state.busy) return;
      state.busy = true;
      state.staged = [];
      clear(controls);
      const toReroll = [];
      for (let i = 0; i < state.values.length; i++) {
        if (!state.frozen.has(i)) toReroll.push(i);
      }
      if (toReroll.length < 2) { state.busy = false; return; }

      for (const i of toReroll) {
        state.values[i] = rollDie();
        // Blank the face so players can't read the next value in advance.
        setDie(dieEls[i], 1, { placeholder: true, selectable: false });
      }
      for (const i of toReroll) {
        delete dieEls[i].dataset.placeholder;
        await animateRoll(dieEls[i], state.values[i]);
      }

      state.rollsDone += 1;
      state.justRolled = true;

      if (!hasPairOfSum(state.values, state.frozen, state.S)) {
        bust(`No pair summing to ${state.S} after reroll`);
        return;
      }
      state.busy = false;
      render();
    }

    function onStopClick() {
      finish(currentScore());
    }

    function bust(reason) {
      state.values.forEach((v, i) => {
        if (!state.frozen.has(i)) applyState(dieEls[i], { bust: true, selectable: false });
      });
      toast(`Bust — ${reason}`, { tone: 'bad', duration: 2200 });
      clear(controls);
      updateHeader({ roundScore: 0, S: state.S, bust: true });
      setTimeout(() => resolve(0), 1400);
    }

    function finish(score) {
      state.values.forEach((_, i) => applyState(dieEls[i], { selectable: false, frozen: state.frozen.has(i) }));
      toast(`Round ${roundIdx + 1}: ${score} pts`, { tone: 'good' });
      clear(controls);
      updateHeader({ roundScore: score, S: state.S, done: true });
      setTimeout(() => resolve(score), 900);
    }

    (async () => {
      await animateRollSequence(dieEls, state.values);
      state.justRolled = true;
      if (!anyPairPossible(state.values, state.frozen)) {
        bust('No pairs possible on opening roll');
        return;
      }
      state.busy = false;
      render();
    })();
  });
}

export default {
  id: 'pairs',
  decathlon: 'ryno',
  name: 'Pair Sums',
  blurb: 'Lock pairs that add to the same total. Reroll for more or stop.',
  rulesHtml: rules,
  rounds: 3,

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
      head.appendChild(chip('Target sum', ctx.S ?? '—'));
      head.appendChild(chip('This round', ctx.roundScore ?? 0, { tone: ctx.bust ? 'bust' : '' }));
      head.appendChild(chip('Best round', Math.max(0, ...results), { tone: 'accent' }));
    };
    const renderPills = (total, active, oc) => {
      clear(pills);
      pills.appendChild(roundPills(total, active, oc));
    };

    return runRounds({
      rounds: 3,
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
