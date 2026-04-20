import { rollMany, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep, runRounds } from '../ui.js';

const PICKS = 5;
const ROUNDS = 3;

const rules = `
  <p>Pool of 10 dice. Each turn, roll <strong>2</strong> and keep <strong>1</strong>. Repeat 5 times — you'll keep 5 dice and discard 5.</p>
  <p>Aim to sum your kept dice as close to <strong>20</strong> as possible without going over. Go over → <strong>bust</strong> (0 for the round).</p>
  <p>Scoring: <strong>20 = 36 pts</strong>, 19 = 30, 18 = 24, 17 = 18, 16 = 12, 15 = 6, 14 or less = 0. Best of 3 rounds counts.</p>
`;

function scoreForSum(sum) {
  if (sum > 20) return 0;
  return Math.max(0, 36 - 6 * (20 - sum));
}

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const keptTray = el('div', { class: 'dice-tray' });
    const rollTray = el('div', { class: 'dice-tray center' });
    const status = el('div', { class: 'status', html: `Roll 2 dice, then click the one to keep. ${PICKS} keeps per round.` });
    const controls = el('div', { class: 'button-row' });

    host.appendChild(el('div', { class: 'tray-label', text: 'Kept' }));
    host.appendChild(keptTray);
    host.appendChild(el('div', { class: 'tray-label', text: 'Current roll' }));
    host.appendChild(rollTray);
    host.appendChild(status);
    host.appendChild(controls);

    const kept = [];
    let busy = false;
    let done = false;

    const sum = () => kept.reduce((a, b) => a + b, 0);

    function renderControls() {
      clear(controls);
      if (done) return;
      if (kept.length >= PICKS) {
        finish();
        return;
      }
      controls.appendChild(button(`Roll 2 dice (${kept.length + 1} of ${PICKS})`, {
        onClick: doRoll,
        variant: 'good',
      }));
    }

    async function doRoll() {
      if (busy) return;
      busy = true;
      clear(controls);
      clear(rollTray);
      status.innerHTML = 'Rolling…';

      const values = rollMany(2);
      const dieEls = values.map(v => {
        const d = createDie(v, { selectable: false });
        rollTray.appendChild(d);
        return d;
      });
      await Promise.all(dieEls.map((d, i) => animateRoll(d, values[i])));

      // Enable click-to-keep on both dice.
      dieEls.forEach((d, i) => {
        applyState(d, { selectable: true });
        d.addEventListener('click', () => onKeep(i, values, dieEls));
      });
      status.innerHTML = `Rolled <strong>${values[0]}</strong> and <strong>${values[1]}</strong>. Click the one to keep.`;
      busy = false;
    }

    function onKeep(i, values, dieEls) {
      if (busy) return;
      if (done) return;
      busy = true;
      const keepV = values[i];
      const dropV = values[1 - i];

      // Move the kept die into the kept tray.
      const kd = createDie(keepV);
      applyState(kd, { frozen: true, selectable: false });
      keptTray.appendChild(kd);
      kept.push(keepV);

      // Fade the other.
      dieEls.forEach(d => applyState(d, { selectable: false }));
      const dropEl = dieEls[1 - i];
      applyState(dropEl, { dim: true, selectable: false });

      const running = sum();
      updateHeader({ kept: kept.length, sum: running });

      if (running > 20) {
        // Early bust: can't undo, no point continuing.
        bust(`Sum ${running} over 20 with ${kept.length} kept — bust locked in`);
        return;
      }

      if (kept.length >= PICKS) {
        status.innerHTML = `Kept <strong>${keepV}</strong>, dropped <strong>${dropV}</strong>. Totalling…`;
        setTimeout(() => { busy = false; renderControls(); }, 400);
        return;
      }

      status.innerHTML = `Kept <strong>${keepV}</strong>, dropped <strong>${dropV}</strong>. Sum so far: <strong>${running}</strong>. ${PICKS - kept.length} to go.`;
      setTimeout(() => {
        clear(rollTray);
        busy = false;
        renderControls();
      }, 450);
    }

    function bust(reason) {
      done = true;
      clear(controls);
      toast(`Bust — ${reason}`, { tone: 'bad', duration: 2200 });
      updateHeader({ kept: kept.length, sum: sum(), bust: true });
      status.innerHTML = `Busted — ${reason}.`;
      setTimeout(() => resolve(0), 1400);
    }

    function finish() {
      done = true;
      clear(controls);
      const total = sum();
      const score = scoreForSum(total);
      updateHeader({ kept: kept.length, sum: total, done: true, score });
      if (score === 0) {
        status.innerHTML = `Final sum <strong>${total}</strong> — scores 0 pts.`;
        toast(`Round ${roundIdx + 1}: 0 pts`, { tone: 'bad' });
      } else {
        status.innerHTML = `Final sum <strong>${total}</strong> → <strong>${score}</strong> pts.`;
        toast(`Round ${roundIdx + 1}: ${score} pts`, { tone: 'good' });
      }
      setTimeout(() => resolve(score), 1100);
    }

    renderControls();
  });
}

export default {
  id: 'twenty',
  name: 'Twenty',
  blurb: 'Roll 2, keep 1, five times — sum as close to 20 as you can.',
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
      head.appendChild(chip('Kept', `${ctx.kept ?? 0} / ${PICKS}`));
      head.appendChild(chip('Sum', ctx.sum ?? 0, { tone: ctx.bust ? 'bust' : '' }));
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
