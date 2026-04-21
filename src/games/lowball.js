import { rollMany, createDie, animateRollSequence, applyState, setDie } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, runRounds } from '../ui.js';

const COLLECT = 10;
const PAIRS = 9; // pairs 1-8 lock the low die, pair 9 (final) locks both => 10 dice
const REROLLS = 6;
const ROUNDS = 3;

const rules = `
  <p><strong>Roll pairs, lock the low die, fill a 10-die collection.</strong></p>
  <p>Roll two dice at a time. From pairs 1–8, lock the <strong>lower</strong> die (either one if they tie); the higher is discarded. On the <strong>final pair</strong>, you lock <strong>both</strong> dice. Score = sum of all 10 collected.</p>
  <p><strong>Snake eyes</strong> (both 1s): the round busts to 0 and <em>cannot</em> be rerolled.</p>
  <p>Any other pair can be locked as rolled — including a low <strong>1</strong>. Or spend one of your <strong>${REROLLS}</strong> rerolls to try again. Best of ${ROUNDS} rounds counts.</p>
`;

function classifyPair(a, b, takeBoth) {
  if (a === 1 && b === 1) return { kind: 'snake', lockIdx: [] };
  if (takeBoth) return { kind: 'both', lockIdx: [0, 1] };
  const lowIdx = a <= b ? 0 : 1;
  return { kind: 'low', lockIdx: [lowIdx] };
}

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const collectLabel = el('div', { class: 'tray-label', text: `Collected (0 / ${COLLECT})` });
    const collectTray = el('div', { class: 'dice-tray' });
    const collectLane = el('div', { class: 'lane' }, [collectLabel, collectTray]);
    host.appendChild(collectLane);

    const rollLabel = el('div', { class: 'tray-label', text: 'Current pair' });
    const rollTray = el('div', { class: 'dice-tray' });
    const rollLane = el('div', { class: 'lane' }, [rollLabel, rollTray]);
    rollLane.dataset.active = 'true';
    host.appendChild(rollLane);

    const status = el('div', {
      class: 'status',
      html: `Roll your first pair. You have ${REROLLS} rerolls for the round.`,
    });
    host.appendChild(status);
    const controls = el('div', { class: 'button-row' });
    host.appendChild(controls);

    let pairIdx = 0;
    let rerolls = REROLLS;
    let total = 0;
    let collectedCount = 0;
    let currentPair = null;
    let done = false;
    let busy = false;

    const isFinalPair = () => pairIdx === PAIRS - 1;

    function emit(extra = {}) {
      updateHeader({
        collected: collectedCount,
        rerolls,
        score: total,
        ...extra,
      });
    }

    function updateCollectLabel() {
      collectLabel.textContent = `Collected (${collectedCount} / ${COLLECT})`;
    }

    function renderRollControls() {
      clear(controls);
      if (done || pairIdx >= PAIRS) return;
      const label = isFinalPair()
        ? 'Roll final pair (both dice)'
        : `Roll pair ${pairIdx + 1}`;
      controls.appendChild(button(label, {
        onClick: rollNextPair,
        variant: 'good',
      }));
    }

    function renderPairControls() {
      clear(controls);
      if (done || !currentPair) return;
      const { kind, lockIdx, values } = currentPair;
      if (kind === 'snake') return;
      const pts = lockIdx.reduce((s, i) => s + values[i], 0);
      const lockLabel = kind === 'both' ? `Lock both (${pts} pts)` : `Lock the ${pts}`;
      controls.appendChild(button(lockLabel, {
        onClick: lockPair,
        variant: 'good',
      }));
      if (rerolls > 0) {
        controls.appendChild(button(`Reroll (${rerolls} left)`, {
          onClick: rerollPair,
          variant: 'reroll',
        }));
      }
    }

    async function rollIntoCurrentPair(initial) {
      busy = true;
      clear(controls);
      const values = rollMany(2);
      let dieEls;
      if (initial) {
        clear(rollTray);
        dieEls = values.map(() => createDie(1, { placeholder: true, selectable: false }));
        for (const d of dieEls) rollTray.appendChild(d);
      } else {
        dieEls = currentPair.dieEls;
        for (const d of dieEls) {
          setDie(d, 1, { placeholder: true, selectable: false });
        }
      }
      status.innerHTML = initial
        ? (isFinalPair() ? 'Rolling final pair…' : `Rolling pair ${pairIdx + 1}…`)
        : `Rerolling… (${rerolls} reroll${rerolls === 1 ? '' : 's'} left)`;
      await animateRollSequence(dieEls, values, {});
      const [a, b] = values;
      const classification = classifyPair(a, b, isFinalPair());
      currentPair = { values, dieEls, ...classification };
      presentPair();
      busy = false;
    }

    async function rollNextPair() {
      if (busy || done || currentPair) return;
      await rollIntoCurrentPair(true);
    }

    async function rerollPair() {
      if (busy || done || rerolls <= 0 || !currentPair) return;
      rerolls -= 1;
      emit();
      await rollIntoCurrentPair(false);
    }

    function presentPair() {
      const { values, dieEls, kind, lockIdx } = currentPair;
      const [a, b] = values;
      if (kind === 'snake') {
        status.innerHTML = `<strong>Snake eyes!</strong> Round busted.`;
        dieEls.forEach(d => applyState(d, { bust: true }));
        bustRound('Snake eyes — round busted.');
        return;
      }
      const lockSet = new Set(lockIdx);
      dieEls.forEach((d, i) => {
        if (lockSet.has(i)) applyState(d, { highlight: true });
        else applyState(d, { dim: true });
      });
      if (kind === 'both') {
        status.innerHTML = `${a} + ${b} — final pair, lock both for <strong>${a + b}</strong>.`;
      } else {
        const low = Math.min(a, b);
        status.innerHTML = `${a} + ${b} — lock the <strong>${low}</strong>${low === 1 ? ' or reroll' : ''}.`;
      }
      renderPairControls();
    }

    function lockPair() {
      if (busy || done || !currentPair) return;
      const { values, dieEls, lockIdx } = currentPair;
      const lockSet = new Set(lockIdx);
      for (let i = 0; i < dieEls.length; i++) {
        if (lockSet.has(i)) {
          applyState(dieEls[i], { frozen: true });
          collectTray.appendChild(dieEls[i]);
          total += values[i];
          collectedCount += 1;
        }
      }
      clear(rollTray);
      currentPair = null;
      pairIdx += 1;
      updateCollectLabel();
      emit();
      if (pairIdx >= PAIRS) {
        status.innerHTML = `All ${COLLECT} dice collected — banking <strong>${total}</strong>.`;
        setTimeout(finish, 700);
        return;
      }
      status.innerHTML = `Locked. Running total: <strong>${total}</strong>. ${rerolls} reroll${rerolls === 1 ? '' : 's'} left.`;
      renderRollControls();
    }

    function bustRound(message) {
      done = true;
      clear(controls);
      rollLane.dataset.active = 'false';
      toast(message, { tone: 'bad', duration: 2000 });
      emit({ bust: true, score: 0 });
      setTimeout(() => resolve(0), 1400);
    }

    function finish() {
      done = true;
      clear(controls);
      rollLane.dataset.active = 'false';
      toast(`Round ${roundIdx + 1}: ${total} pts`, { tone: 'good' });
      emit({ done: true });
      setTimeout(() => resolve(total), 900);
    }

    emit();
    renderRollControls();
  });
}

export default {
  id: 'lowball',
  decathlon: 'ryno',
  name: 'Lowball',
  blurb: 'Roll pairs, lock the low die. Snake eyes kill the round.',
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
      head.appendChild(chip('Collected', `${ctx.collected ?? 0} / ${COLLECT}`));
      head.appendChild(chip('Rerolls', `${ctx.rerolls ?? REROLLS} / ${REROLLS}`));
      head.appendChild(chip('Score', ctx.score ?? 0, { tone: ctx.bust ? 'bust' : 'accent' }));
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
