import { games, gameById, decathlons, decathlonById, gamesByDecathlon } from './games/registry.js';
import { getBestForEvent, recordEventScore, getBestDecathlon, recordDecathlon } from './storage.js';
import { el, clear, button, chip, inlinePrompt } from './ui.js';

const stage = document.getElementById('stage');

function route() {
  const hash = location.hash || '#/';
  if (hash === '#/' || hash === '') return renderHome();
  for (const d of decathlons) {
    if (hash === `#/${d.id}`) return renderArcade(d.id);
    if (hash === `#/${d.id}/play`) return runDecathlon(d.id);
  }
  if (hash.startsWith('#/event/')) {
    const id = hash.slice('#/event/'.length);
    const game = gameById(id);
    if (game) return runEvent(game);
  }
  renderHome();
}

window.addEventListener('hashchange', route);
window.addEventListener('load', route);

function mountScreen() {
  clear(stage);
  const screen = el('div', { class: 'screen' });
  stage.appendChild(screen);
  return screen;
}

function eventCard(g) {
  const eventBest = getBestForEvent(g.id);
  return el('a', {
    class: 'card',
    href: `#/event/${g.id}`,
  }, [
    el('h3', { text: g.name }),
    el('p', { text: g.blurb }),
    el('div', {
      class: eventBest ? 'best' : 'best unplayed',
      text: eventBest ? `Best: ${eventBest}` : 'Unplayed',
    }),
  ]);
}

function decathlonHomeCard(d) {
  const best = getBestDecathlon(d.id);
  const events = gamesByDecathlon(d.id);
  return el('section', { class: 'decathlon-home-card' }, [
    el('h2', { text: d.name }),
    el('p', { class: 'hero-tagline', text: d.tagline }),
    el('p', { text: d.description }),
    el('p', { class: 'hero-meta', text: `${events.length} events.` }),
    el('div', { class: 'button-row' }, [
      button(`Start ${d.short} decathlon`, {
        onClick: () => { location.hash = `#/${d.id}/play`; },
        variant: 'good',
      }),
      button('Browse events', {
        onClick: () => { location.hash = `#/${d.id}`; },
        variant: 'ghost',
      }),
    ]),
    el('p', {
      class: 'hero-meta',
      text: best ? `Personal best: ${best.total} pts (${best.date}).` : 'No previous run recorded.',
    }),
  ]);
}

function renderHome() {
  const screen = mountScreen();

  screen.appendChild(el('section', { class: 'hero' }, [
    el('h1', { text: 'Dicechucker' }),
    el('p', { text: 'Two solo dice decathlons. Pick one to run.' }),
  ]));

  const grid = el('div', { class: 'decathlon-grid' });
  for (const d of decathlons) grid.appendChild(decathlonHomeCard(d));
  screen.appendChild(grid);
}

function renderArcade(decathlonId) {
  const screen = mountScreen();
  const d = decathlonById(decathlonId);
  const events = gamesByDecathlon(decathlonId);

  screen.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: d.name }),
    el('p', { text: d.description }),
    el('div', { class: 'button-row' }, [
      button(`Run full ${d.short} decathlon`, {
        onClick: () => { location.hash = `#/${d.id}/play`; },
        variant: 'good',
      }),
    ]),
  ]));

  const grid = el('div', { class: 'card-grid' });
  for (const g of events) grid.appendChild(eventCard(g));
  screen.appendChild(grid);
}

function eventHeader(game) {
  const collapse = el('div', { class: 'rules-collapse' }, [
    el('div', { class: 'rules', html: game.rulesHtml }),
  ]);
  const titleBtn = el('button', {
    class: 'title-toggle',
    'aria-expanded': 'false',
    'aria-controls': `rules-${game.id}`,
    onClick: () => {
      const open = collapse.classList.toggle('open');
      titleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    },
  }, [
    el('span', { class: 'event-title', text: game.name }),
    el('span', { class: 'chev', 'aria-hidden': 'true' }),
  ]);
  collapse.id = `rules-${game.id}`;

  return el('section', { class: 'panel tight' }, [
    el('div', { class: 'event-head' }, [titleBtn]),
    collapse,
  ]);
}

async function runEvent(game) {
  const screen = mountScreen();
  screen.appendChild(eventHeader(game));

  const playArea = el('div', { class: 'panel' });
  screen.appendChild(playArea);

  const score = await game.play(playArea);

  const previousBest = getBestForEvent(game.id);
  const { improved, best } = recordEventScore(game.id, score);

  playArea.appendChild(el('div', { class: 'event-end' }, [
    el('div', { class: 'event-end-summary' }, [
      el('div', { class: 'event-end-score', text: `Score: ${score}` }),
      el('div', { class: 'event-end-best', text: improved
        ? (previousBest ? `New best (was ${previousBest})` : 'New best')
        : `Best: ${best}` }),
    ]),
    el('div', { class: 'button-row' }, [
      button('Play again', {
        onClick: () => runEvent(game),
        variant: 'good',
      }),
      button('Back to events', {
        onClick: () => { location.hash = `#/${game.decathlon}`; },
        variant: 'ghost',
      }),
    ]),
  ]));
}

async function runDecathlon(decathlonId) {
  const d = decathlonById(decathlonId);
  const screen = mountScreen();

  const titleNode = el('h2', { text: d.name });
  const subNode = el('div', { class: 'sub', text: '' });
  const gameNameNode = el('div', { class: 'game-name', text: '' });
  const chev = el('span', { class: 'chev', 'aria-hidden': 'true' });
  const totalChip = chip('Total Score', 0, { tone: 'accent' });
  const useChips = decathlonId === 'ryno';
  const chipsChip = useChips ? chip('Chips', 0, { tone: 'good' }) : null;

  const rulesBody = el('div', { class: 'rules', html: '' });
  const rulesCollapse = el('div', { class: 'rules-collapse', id: 'decathlon-rules' }, [rulesBody]);

  const titleBtn = el('button', {
    class: 'title-toggle',
    'aria-expanded': 'false',
    'aria-controls': 'decathlon-rules',
    onClick: () => {
      const open = rulesCollapse.classList.toggle('open');
      titleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    },
  }, [
    el('div', { class: 'title-block' }, [titleNode, subNode, gameNameNode]),
    chev,
  ]);

  const headChildren = [titleBtn, totalChip];
  if (chipsChip) headChildren.push(chipsChip);

  const header = el('section', { class: 'panel tight' }, [
    el('div', { class: 'event-head' }, headChildren),
    rulesCollapse,
  ]);
  screen.appendChild(header);

  const playSlot = el('div');
  screen.appendChild(playSlot);

  const events = gamesByDecathlon(decathlonId);
  const perEvent = {};
  let total = 0;
  let chips = 0;

  function setTotal(value) {
    totalChip.querySelector('.value').textContent = String(value);
  }
  function setChips(value) {
    chips = value;
    if (chipsChip) chipsChip.querySelector('.value').textContent = String(value);
  }

  // Ryno shuffles its events; Reiner runs in the classic decathlon order.
  const order = useChips ? shuffled(events) : events.slice();

  for (let i = 0; i < order.length; i++) {
    const g = order[i];
    subNode.textContent = `Event ${i + 1} of ${order.length}`;
    gameNameNode.textContent = g.name;
    rulesBody.innerHTML = g.rulesHtml;
    rulesCollapse.classList.remove('open');
    titleBtn.setAttribute('aria-expanded', 'false');
    setTotal(total);

    clear(playSlot);
    const playArea = el('div', { class: 'panel' });
    playSlot.appendChild(playArea);

    const isLastEvent = i === order.length - 1;
    let bankedThisEvent = false;

    const hooks = useChips ? {
      async beforeFinalRound(currentBest) {
        if (currentBest === 0) return 'play';
        if (isLastEvent) return 'play';
        const choice = await inlinePrompt(
          playArea,
          `Last round coming up. Skip it to <strong>bank an Extra Round chip</strong> instead? Current best: <strong>${currentBest}</strong>. You can spend it on a future event for a bonus round.<br><span class="muted">Chips on hand: <strong>${chips}</strong>.</span>`,
          [
            { label: 'Bank chip & skip', value: 'skip', variant: 'good' },
            { label: 'Play final round', value: 'play', variant: 'ghost' },
          ],
        );
        if (choice === 'skip') {
          setChips(chips + 1);
          bankedThisEvent = true;
        }
        return choice;
      },
      async afterRoundsExhausted(currentBest) {
        if (bankedThisEvent) return 'stop';
        if (chips === 0) return 'stop';
        if (isLastEvent) {
          setChips(chips - 1);
          return 'continue';
        }
        const choice = await inlinePrompt(
          playArea,
          `Spend an <strong>Extra Round chip</strong> for another attempt? Current best: <strong>${currentBest}</strong>.<br><span class="muted">Chips on hand: <strong>${chips}</strong>.</span>`,
          [
            { label: 'Spend chip', value: 'continue', variant: 'good' },
            { label: 'Stop', value: 'stop', variant: 'ghost' },
          ],
        );
        if (choice === 'continue') setChips(chips - 1);
        return choice;
      },
    } : undefined;

    const score = await g.play(playArea, hooks);
    perEvent[g.id] = score;
    total += score;
    setTotal(total);
    recordEventScore(g.id, score);
  }

  const { improved } = recordDecathlon(decathlonId, total, perEvent);

  header.remove();
  clear(playSlot);
  const playArea = el('div', { class: 'panel' });
  playSlot.appendChild(playArea);

  const table = el('table', { class: 'results-table' });
  table.appendChild(el('thead', {}, [
    el('tr', {}, [el('th', { text: 'Event' }), el('th', { text: 'Score' })]),
  ]));
  const tbody = el('tbody');
  for (const g of order) {
    const s = perEvent[g.id];
    tbody.appendChild(el('tr', {}, [
      el('td', { text: g.name }),
      el('td', { class: 'score', text: s }),
    ]));
  }
  tbody.appendChild(el('tr', { class: 'total' }, [
    el('td', { text: 'Grand total' }),
    el('td', { class: 'score', text: total }),
  ]));
  table.appendChild(tbody);

  playArea.appendChild(el('h2', { text: improved ? 'New personal best!' : `${d.name} complete` }));
  playArea.appendChild(table);
  playArea.appendChild(el('div', { class: 'button-row' }, [
    button('Run again', {
      onClick: () => runDecathlon(decathlonId),
      variant: 'good',
    }),
    button('Home', {
      onClick: () => { location.hash = '#/'; },
      variant: 'ghost',
    }),
  ]));
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
