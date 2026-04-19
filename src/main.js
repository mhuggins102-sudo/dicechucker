import { games, gameById } from './games/registry.js';
import { getBestForEvent, recordEventScore, getBestDecathlon, recordDecathlon } from './storage.js';
import { el, clear, button, chip, inlinePrompt } from './ui.js';

const stage = document.getElementById('stage');

function route() {
  const hash = location.hash || '#/';
  if (hash === '#/' || hash === '' || hash === '#/decathlon') return renderDecathlonHome();
  if (hash === '#/decathlon/play') return runDecathlon();
  if (hash === '#/arcade') return renderArcade();
  if (hash.startsWith('#/event/')) {
    const id = hash.slice('#/event/'.length);
    const game = gameById(id);
    if (game) return runEvent(game);
  }
  renderDecathlonHome();
}

window.addEventListener('hashchange', route);
window.addEventListener('load', route);

function mountScreen() {
  clear(stage);
  const screen = el('div', { class: 'screen' });
  stage.appendChild(screen);
  return screen;
}

function renderDecathlonHome() {
  const screen = mountScreen();
  const best = getBestDecathlon();

  screen.appendChild(el('section', { class: 'hero' }, [
    el('h1', { text: 'Decathlon' }),
    el('p', { text: `Play all ${games.length} events in sequence. Each event is best-of-N rounds. Your event scores sum to a grand total.` }),
    el('div', { class: 'button-row' }, [
      button('Start decathlon', {
        onClick: () => { location.hash = '#/decathlon/play'; },
        variant: 'good',
      }),
    ]),
    best
      ? el('p', { text: `Personal best: ${best.total} pts (${best.date}).` })
      : el('p', { text: 'No previous decathlon recorded.' }),
  ]));

  const grid = el('div', { class: 'card-grid' });
  for (const g of games) {
    const eventBest = getBestForEvent(g.id);
    grid.appendChild(el('a', {
      class: 'card',
      href: `#/event/${g.id}`,
    }, [
      el('h3', { text: g.name }),
      el('p', { text: g.blurb }),
      el('div', { class: 'best', text: eventBest ? `Best: ${eventBest}` : 'Unplayed' }),
    ]));
  }
  screen.appendChild(grid);
}

function renderArcade() {
  const screen = mountScreen();
  const grid = el('div', { class: 'card-grid' });
  for (const g of games) {
    const eventBest = getBestForEvent(g.id);
    grid.appendChild(el('a', {
      class: 'card',
      href: `#/event/${g.id}`,
    }, [
      el('h3', { text: g.name }),
      el('p', { text: g.blurb }),
      el('div', { class: 'best', text: eventBest ? `Best: ${eventBest}` : 'Unplayed' }),
    ]));
  }
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
    el('span', { text: game.name }),
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
      button('Back to arcade', {
        onClick: () => { location.hash = '#/arcade'; },
        variant: 'ghost',
      }),
    ]),
  ]));
}

async function runDecathlon() {
  const screen = mountScreen();

  const titleNode = el('h2', { text: 'Decathlon' });
  const subNode = el('div', { class: 'sub', text: '' });
  const gameNameNode = el('div', { class: 'game-name', text: '' });
  const chev = el('span', { class: 'chev', 'aria-hidden': 'true' });
  const chipsChip = chip('Chips', 0, { tone: 'good' });
  const totalChip = chip('Total Score', 0, { tone: 'accent' });

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

  const header = el('section', { class: 'panel tight' }, [
    el('div', { class: 'event-head' }, [
      titleBtn,
      totalChip,
      chipsChip,
    ]),
    rulesCollapse,
  ]);
  screen.appendChild(header);

  // Slot for the play panel (replaced each iteration).
  const playSlot = el('div');
  screen.appendChild(playSlot);

  const perEvent = {};
  let total = 0;
  let chips = 0;

  function setTotal(value) {
    totalChip.querySelector('.value').textContent = String(value);
  }
  function setChips(value) {
    chips = value;
    chipsChip.querySelector('.value').textContent = String(value);
  }

  // Random event order each run.
  const order = shuffled(games);

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

    const hooks = {
      async beforeFinalRound(currentBest) {
        // Don't offer to bank when there's nothing to lock in,
        // and don't offer on the final event (chip can't be spent).
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
        // If the player just banked a chip for this event, don't turn
        // around and ask them to spend one on the same event.
        if (bankedThisEvent) return 'stop';
        if (chips === 0) return 'stop';
        // On the final event, chips have nowhere to go after this game,
        // so auto-spend them silently for bonus rounds.
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
    };

    const score = await g.play(playArea, hooks);
    perEvent[g.id] = score;
    total += score;
    setTotal(total);
    recordEventScore(g.id, score);
  }

  const { improved } = recordDecathlon(total, perEvent);

  // Final results screen — drop the running header entirely.
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

  playArea.appendChild(el('h2', { text: improved ? 'New personal best!' : 'Decathlon complete' }));
  playArea.appendChild(table);
  playArea.appendChild(el('div', { class: 'button-row' }, [
    button('Run again', {
      onClick: runDecathlon,
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
