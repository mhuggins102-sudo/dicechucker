import { rollMany, createDie, animateRollSequence, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, runRounds } from '../ui.js';

const PAIRS = 5;
const REROLLS = 10;
const ROUNDS = 3;

const rules = `
  <p><strong>Roll 5 pairs of dice. Lock or reroll each pair. Dodge the snake eyes.</strong></p>
  <p>Roll two dice at a time. After each pair, <strong>lock it in</strong> or <strong>reroll</strong> (burns one of your ${REROLLS} rerolls). Play until 5 pairs are locked.</p>
  <p><strong>Pair scoring:</strong> normally the sum. A single <strong>6</strong> scores its own pips <em>and</em> doubles the other die (6+4 → 6 + 8 = 14; 6+5 → 6 + 10 = 16). Two <strong>6s</strong> double each other → <strong>24</strong>. A single <strong>1</strong> busts the pair to <strong>0</strong> (but you can reroll).</p>
  <p><strong>Snake eyes</strong> (both 1s): the whole round busts to 0 and <em>cannot</em> be rerolled. With up to 15 rolls available, snake eyes appear ~35% of the time if you press every reroll — mind how deep you push.</p>
  <p>Best of ${ROUNDS} rounds counts.</p>
`;

function scorePair(a, b) {
  if (a === 1 && b === 1) return { kind: 'snake', pts: 0 };
  if (a === 1 || b === 1) return { kind: 'bust', pts: 0 };
  if (a === 6 && b === 6) return { kind: 'double6', pts: 24 };
  if (a === 6) return { kind: 'six', pts: 6 + 2 * b };
  if (b === 6) return { kind: 'six', pts: 6 + 2 * a };
  return { kind: 'sum', pts: a + b };
}

function describePair(a, b, pts, kind) {
  if (kind === 'snake') return `<strong>Snake eyes!</strong> Round busted.`;
  if (kind === 'bust') return `${a} + ${b} — a single 1 busts this pair.`;
  if (kind === 'double6') return `${a} + ${b} — double sixes! <strong>${pts}</strong> points.`;
  if (kind === 'six') return `${a} + ${b} — the 6 scores plus doubles the other. <strong>${pts}</strong> points.`;
  return `${a} + ${b} = <strong>${pts}</strong>.`;
}

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    host.appendChild(el('div', { class: 'tray-label', text: 'Locked pairs' }));
    const lockTray = el('div', { class: 'dice-tray' });
    host.appendChild(lockTray);
    host.appendChild(el('div', { class: 'tray-label', text: 'Current pair' }));
    const rollTray = el('div', { class: 'dice-tray' });
    host.appendChild(rollTray);
    const status = el('div', {
      class: 'status',
      html: `Roll your first pair. You have ${REROLLS} rerolls for the whole round.`,
    });
    host.appendChild(status);
    const controls = el('div', { class: 'button-row' });
    host.appendChild(controls);

    let locked = 0;
    let total = 0;
    let rerolls = REROLLS;
    let currentPair = null;
    let done = false;
    let busy = false;

    function emit(extra = {}) {
      updateHeader({
        locked,
        rerolls,
        score: total,
        ...extra,
      });
    }

    function renderRollControls() {
      clear(controls);
      if (done) return;
      controls.appendChild(button(`Roll pair ${locked + 1}`, {
        onClick: rollNextPair,
        variant: 'good',
      }));
    }

    function renderPairControls() {
      clear(controls);
      if (done || !currentPair) return;
      const { pts, kind } = currentPair;
      if (kind === 'snake') return;
      const lockLabel = kind === 'bust' ? 'Lock at 0' : `Lock (${pts} pts)`;
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

    async function animatePairRoll(msg) {
      const values = rollMany(2);
      const dieEls = values.map(() => createDie(1, { placeholder: true, selectable: false }));
      clear(rollTray);
      for (const d of dieEls) rollTray.appendChild(d);
      status.innerHTML = msg;
      await animateRollSequence(dieEls, values, {});
      return { values, dieEls };
    }

    async function rollNextPair() {
      if (busy || done) return;
      busy = true;
      clear(controls);
      const { values, dieEls } = await animatePairRoll(`Rolling pair ${locked + 1}…`);
      const [a, b] = values;
      const { kind, pts } = scorePair(a, b);
      currentPair = { a, b, dieEls, pts, kind };
      presentPair();
      busy = false;
    }

    async function rerollPair() {
      if (busy || done || rerolls <= 0 || !currentPair) return;
      busy = true;
      clear(controls);
      rerolls -= 1;
      emit();
      const { values, dieEls } = await animatePairRoll(`Rerolling pair ${locked + 1}… (${rerolls} rerolls left)`);
      const [a, b] = values;
      const { kind, pts } = scorePair(a, b);
      currentPair = { a, b, dieEls, pts, kind };
      presentPair();
      busy = false;
    }

    function presentPair() {
      const { a, b, dieEls, pts, kind } = currentPair;
      status.innerHTML = describePair(a, b, pts, kind);
      if (kind === 'snake') {
        dieEls.forEach(d => applyState(d, { bust: true }));
        bustRound();
        return;
      }
      if (kind === 'bust') {
        dieEls.forEach(d => applyState(d, { bust: true }));
      } else {
        dieEls.forEach(d => applyState(d, { highlight: true }));
      }
      renderPairControls();
    }

    function lockPair() {
      if (busy || done || !currentPair) return;
      const { dieEls, pts } = currentPair;
      total += pts;
      locked += 1;
      dieEls.forEach(d => {
        applyState(d, { frozen: true });
        lockTray.appendChild(d);
      });
      clear(rollTray);
      currentPair = null;
      emit();
      if (locked >= PAIRS) {
        status.innerHTML = `All ${PAIRS} pairs locked — banking <strong>${total}</strong>.`;
        setTimeout(finish, 700);
        return;
      }
      status.innerHTML = `Locked ${locked}/${PAIRS}. Running total: <strong>${total}</strong>. ${rerolls} reroll${rerolls === 1 ? '' : 's'} left.`;
      renderRollControls();
    }

    function bustRound() {
      done = true;
      clear(controls);
      toast(`Snake eyes — round busted.`, { tone: 'bad', duration: 2000 });
      emit({ bust: true, score: 0 });
      setTimeout(() => resolve(0), 1400);
    }

    function finish() {
      done = true;
      clear(controls);
      toast(`Round ${roundIdx + 1}: ${total} pts`, { tone: 'good' });
      emit({ done: true });
      setTimeout(() => resolve(total), 900);
    }

    emit();
    renderRollControls();
  });
}

export default {
  id: 'doubledown',
  decathlon: 'ryno',
  name: 'Double Down',
  blurb: 'Roll 5 pairs. 6s double, 1s bust, snake eyes kill the round.',
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
      head.appendChild(chip('Locked', `${ctx.locked ?? 0} / ${PAIRS}`));
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
