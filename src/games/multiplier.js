import { rollDie, createDie, animateRoll, applyState } from '../dice.js';
import { el, clear, button, chip, roundPills, toast, sleep } from '../ui.js';

const POOL = 10;

const rules = `
  <p>Pool of 10 dice, rolled one at a time. Values 2–5 add to your running sum. A <strong>6</strong> adds nothing but increases your multiplier by 1 (starting at ×1). A <strong>1</strong> busts the round.</p>
  <p>Stop whenever to bank <em>sum × multiplier</em>. Best of 3 rounds counts.</p>
`;

async function playRound(host, roundIdx, updateHeader) {
  return new Promise((resolve) => {
    const display = el('div', { class: 'multiplier-display' });
    const sumNode = el('div', { class: 'big-number' }, [
      el('div', { class: 'label', text: 'Running sum' }),
      el('div', { class: 'value', text: '0' }),
    ]);
    const multNode = el('div', { class: 'big-number mult' }, [
      el('div', { class: 'label', text: 'Multiplier' }),
      el('div', { class: 'value', text: '×1' }),
    ]);
    const totalNode = el('div', { class: 'big-number' }, [
      el('div', { class: 'label', text: 'Bank if stop' }),
      el('div', { class: 'value', text: '0' }),
    ]);
    display.appendChild(sumNode);
    display.appendChild(multNode);
    display.appendChild(totalNode);

    const tray = el('div', { class: 'dice-tray' });
    const controls = el('div', { class: 'button-row' });

    host.appendChild(display);
    host.appendChild(tray);
    host.appendChild(controls);

    let sum = 0;
    let mult = 1;
    let rolls = 0;
    let done = false;
    const dieEls = [];

    function projected() { return sum * mult; }

    function renderDisplay() {
      sumNode.querySelector('.value').textContent = String(sum);
      multNode.querySelector('.value').textContent = `×${mult}`;
      totalNode.querySelector('.value').textContent = String(projected());
    }

    function renderControls() {
      clear(controls);
      if (done) return;
      if (rolls >= POOL) {
        finish(projected());
        return;
      }
      controls.appendChild(button(rolls === 0 ? 'Roll' : 'Roll again', {
        onClick: doRoll,
        variant: 'good',
      }));
      controls.appendChild(button('Stop & bank', {
        onClick: () => finish(projected()),
        disabled: rolls === 0,
      }));
    }

    async function doRoll() {
      clear(controls);
      const v = rollDie();
      rolls += 1;
      const d = createDie(v);
      dieEls.push(d);
      tray.appendChild(d);
      await animateRoll(d, v);

      if (v === 1) {
        applyState(d, { bust: true });
        bust();
        return;
      }
      if (v === 6) {
        applyState(d, { highlight: true });
        mult += 1;
      } else {
        sum += v;
      }
      renderDisplay();
      updateHeader({ sum, mult, rolls });
      renderControls();
    }

    function bust() {
      done = true;
      clear(controls);
      toast('Bust — rolled a 1', { tone: 'bad', duration: 2000 });
      updateHeader({ sum: 0, mult, rolls, bust: true });
      setTimeout(() => resolve(0), 1400);
    }

    function finish(score) {
      done = true;
      clear(controls);
      dieEls.forEach(d => applyState(d, { frozen: true, selectable: false }));
      toast(`Round ${roundIdx + 1}: ${score} pts`, { tone: 'good' });
      updateHeader({ sum, mult, rolls, done: true, total: score });
      setTimeout(() => resolve(score), 900);
    }

    renderDisplay();
    renderControls();
  });
}

export default {
  id: 'multiplier',
  name: 'Sixes Multiplier',
  blurb: 'Roll to add; 6s multiply, 1s bust.',
  rulesHtml: rules,
  rounds: 3,

  async play(host) {
    const outcomes = [null, null, null];
    const results = [0, 0, 0];
    const head = el('div', { class: 'score-strip' });
    const pills = el('div');
    host.appendChild(head);
    host.appendChild(pills);
    const body = el('div');
    host.appendChild(body);

    const renderHead = (ctx = {}) => {
      clear(head);
      const banked = ctx.bust ? 0 : (ctx.total ?? ((ctx.sum ?? 0) * (ctx.mult ?? 1)));
      head.appendChild(chip('Sum', ctx.sum ?? 0));
      head.appendChild(chip('Multiplier', `×${ctx.mult ?? 1}`, { tone: 'good' }));
      head.appendChild(chip('If stop', banked, { tone: ctx.bust ? 'bust' : 'accent' }));
      head.appendChild(chip('Best round', Math.max(0, ...results), { tone: 'accent' }));
    };
    const renderPills = (current) => {
      clear(pills);
      pills.appendChild(roundPills(3, current, outcomes));
    };

    for (let r = 0; r < 3; r++) {
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
