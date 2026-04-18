import { games, gameById } from './games/registry.js';
import { getBestForEvent, recordEventScore, getBestDecathlon, recordDecathlon } from './storage.js';
import { el, clear, button, chip } from './ui.js';

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
  const totalChip = chip('Total Score', 0, { tone: 'accent' });
  const header = el('section', { class: 'panel tight' }, [
    el('div', { class: 'event-head' }, [
      el('div', {}, [titleNode, subNode]),
      totalChip,
      button('Quit', {
        onClick: () => {
          if (confirm('Quit the decathlon? Your run won\'t be saved.')) {
            location.hash = '#/';
          }
        },
        variant: 'ghost',
      }),
    ]),
  ]);
  screen.appendChild(header);

  const playArea = el('div', { class: 'panel' });
  screen.appendChild(playArea);

  const perEvent = {};
  let total = 0;

  function setTotal(value) {
    totalChip.querySelector('.value').textContent = String(value);
  }

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    subNode.textContent = `Event ${i + 1} of ${games.length}: ${g.name}`;
    setTotal(total);

    clear(playArea);
    playArea.appendChild(eventHeader(g));
    const body = el('div');
    playArea.appendChild(body);

    const score = await g.play(body);
    perEvent[g.id] = score;
    total += score;
    setTotal(total);
    recordEventScore(g.id, score);
  }

  subNode.textContent = 'Complete';
  setTotal(total);

  const { improved } = recordDecathlon(total, perEvent);

  clear(playArea);
  const table = el('table', { class: 'results-table' });
  table.appendChild(el('thead', {}, [
    el('tr', {}, [el('th', { text: 'Event' }), el('th', { text: 'Score' })]),
  ]));
  const tbody = el('tbody');
  for (const g of games) {
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
