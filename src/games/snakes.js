import { rollMany, createDie, animateRollSequence, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, runRounds } from '../ui.js';

const POOL = 10;
const MAX_ROLLS = 5;
const PENALTY = 15;
const ROUNDS = 3;

const rules = `
  <p><strong>Roll for pips — but watch out for snakes.</strong></p>
  <p>You have ${POOL} dice and ${MAX_ROLLS} rolls. Each roll, pick how many dice to throw — anywhere from 1 up to however many dice you have left.</p>
  <p>Pips 2–6 add to your score. Every <strong>1</strong> is a snake and subtracts <strong>${PENALTY}</strong>.</p>
  <p>Stop and bank any time. If you bank a negative total it scores 0. Best of ${ROUNDS} rounds counts.</p>
`;

function scoreOf(values) {
  let s = 0;
  for (const v of values) s += (v === 1 ? -PENALTY : v);
  return s;
}

function fmtSigned(n) {
  return n >= 0 ? `+${n}` : String(n);
}

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const tray = el('div', { class: 'dice-tray' });
    const status = el('div', {
      class: 'status',
      html: `Pick how many dice to roll (1–${POOL}). Each <strong>1</strong> costs ${PENALTY} pts.`,
    });
    const controls = el('div');

    host.appendChild(tray);
    host.appendChild(status);
    host.appendChild(controls);

    let total = 0;
    let rollsUsed = 0;
    let diceUsed = 0;
    let done = false;
    let busy = false;

    const remainingDice = () => POOL - diceUsed;
    const remainingRolls = () => MAX_ROLLS - rollsUsed;

    function emit(extra = {}) {
      updateHeader({ total, rollsUsed, diceUsed, ...extra });
    }

    function renderControls() {
      clear(controls);
      if (done) return;
      if (remainingRolls() === 0 || remainingDice() === 0) {
        finish();
        return;
      }
      const cap = remainingDice();
      controls.appendChild(el('div', {
        class: 'chooser-label',
        text: `Roll ${rollsUsed + 1} of ${MAX_ROLLS} — pick 1–${cap} dice`,
      }));
      const chooser = el('div', { class: 'dice-chooser' });
      for (let n = 1; n <= cap; n++) {
        chooser.appendChild(button(String(n), {
          variant: 'good',
          onClick: () => doRoll(n),
        }));
      }
      controls.appendChild(chooser);
      if (rollsUsed > 0) {
        controls.appendChild(el('div', { class: 'button-row' }, [
          button('Stop & Bank', { onClick: finish }),
        ]));
      }
    }

    async function doRoll(n) {
      if (busy || done) return;
      busy = true;
      clear(controls);

      const values = rollMany(n);
      const dieEls = values.map(() => createDie(1, { placeholder: true, selectable: false }));

      if (rollsUsed > 0) tray.appendChild(el('div', { class: 'stage-divider' }));
      for (const d of dieEls) tray.appendChild(d);

      status.innerHTML = `Rolling ${n} die${n === 1 ? '' : 's'}…`;

      await animateRollSequence(dieEls, values, {
        onReveal: (_i, _v, shown) => {
          const partial = scoreOf(shown);
          const ones = shown.filter(v => v === 1).length;
          const remaining = n - shown.length;
          const tail = remaining > 0 ? ` (${remaining} to go)` : '';
          const snakes = ones > 0 ? ` — <strong>${ones} snake${ones === 1 ? '' : 's'}!</strong>` : '';
          status.innerHTML = `This roll so far: <strong>${fmtSigned(partial)}</strong>${snakes}${tail}.`;
        },
      });

      dieEls.forEach((d, i) => {
        if (values[i] === 1) applyState(d, { bust: true });
        else applyState(d, { frozen: true });
      });

      const rollScore = scoreOf(values);
      const ones = values.filter(v => v === 1).length;
      total += rollScore;
      rollsUsed += 1;
      diceUsed += n;
      emit();

      const breakdown = ones > 0
        ? `Rolled ${ones} snake${ones === 1 ? '' : 's'} — this roll: <strong>${fmtSigned(rollScore)}</strong>.`
        : `This roll: <strong>${fmtSigned(rollScore)}</strong>.`;

      if (remainingRolls() === 0 || remainingDice() === 0) {
        const why = remainingRolls() === 0 ? 'No rolls left' : 'No dice left';
        status.innerHTML = `${breakdown} ${why} — banking total <strong>${total}</strong>.`;
        setTimeout(finish, 800);
        return;
      }

      status.innerHTML = `${breakdown} Total: <strong>${total}</strong>. ${remainingRolls()} roll${remainingRolls() === 1 ? '' : 's'} and ${remainingDice()} dice left.`;
      busy = false;
      renderControls();
    }

    function finish() {
      done = true;
      clear(controls);
      const banked = Math.max(0, total);
      const tone = banked === 0 ? 'bad' : 'good';
      const msg = banked === 0 && total < 0
        ? `Round ${roundIdx + 1}: ${total} → 0 pts (snakes wiped you out)`
        : `Round ${roundIdx + 1}: ${banked} pt${banked === 1 ? '' : 's'}`;
      toast(msg, { tone });
      emit({ done: banked > 0, bust: banked === 0, score: banked });
      setTimeout(() => resolve(banked), 1000);
    }

    emit();
    renderControls();
  });
}

export default {
  id: 'snakes',
  name: 'Snakes',
  blurb: 'Roll for pips — every 1 is a snake worth −15.',
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
      const totalTone = ctx.bust ? 'bust' : ((ctx.total ?? 0) < 0 ? 'bust' : 'accent');
      head.appendChild(chip('Total', ctx.total ?? 0, { tone: totalTone }));
      head.appendChild(chip('Rolls', `${ctx.rollsUsed ?? 0} / ${MAX_ROLLS}`));
      head.appendChild(chip('Dice', `${ctx.diceUsed ?? 0} / ${POOL}`));
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
