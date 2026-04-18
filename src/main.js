import { games, gameById } from './games/registry.js';
import { getBestForEvent, recordEventScore, getBestDecathlon, recordDecathlon } from './storage.js';
import { el, clear, button, chip } from './ui.js';

const stage = document.getElementById('stage');

function route() {
  const hash = location.hash || '#/';
  if (hash === '#/' || hash === '') return renderHome();
  if (hash === '#/decathlon') return renderDecathlonIntro();
  if (hash === '#/decathlon/play') return runDecathlon();
  if (hash === '#/arcade') return renderArcade();
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

function renderHome() {
  const screen = mountScreen();
  const best = getBestDecathlon();

  screen.appendChild(el('section', { class: 'hero' }, [
    el('h1', { text: 'Dicechucker' }),
    el('p', { text: 'A solo dice decathlon — a string of short mini-games, each with its own push-your-luck mechanic. Play them all for a grand total, or pick one from the arcade.' }),
    el('div', { class: 'button-row' }, [
      button('Play Decathlon', {
        onClick: () => { location.hash = '#/decathlon'; },
        variant: 'good',
      }),
      button('Browse Arcade', {
        onClick: () => { location.hash = '#/arcade'; },
        variant: 'ghost',
      }),
    ]),
    best
      ? el('p', { text: `Best decathlon so far: ${best.total} (on ${best.date})` })
      : el('p', { text: 'No decathlon completed yet. Be the first.' }),
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
  screen.appendChild(el('section', { class: 'hero' }, [
    el('h1', { text: 'Arcade' }),
    el('p', { text: 'Pick a single event. Your best score per event is saved locally.' }),
    el('div', { class: 'button-row' }, [
      button('← Home', { onClick: () => { location.hash = '#/'; }, variant: 'ghost' }),
    ]),
  ]));

  const grid = el('div', { class: 'card-grid' });
  for (const g of games) {
    const eventBest = getBestForEvent(g.id);
    const card = el('a', {
      class: 'card',
      href: `#/event/${g.id}`,
    }, [
      el('h3', { text: g.name }),
      el('p', { text: g.blurb }),
      el('div', { class: 'best', text: eventBest ? `Best: ${eventBest}` : 'Unplayed' }),
    ]);
    grid.appendChild(card);
  }
  screen.appendChild(grid);
}

function renderDecathlonIntro() {
  const screen = mountScreen();
  const best = getBestDecathlon();

  screen.appendChild(el('section', { class: 'hero' }, [
    el('h1', { text: 'Decathlon' }),
    el('p', { text: `Play all ${games.length} events in sequence. Each event is a best-of-3 rounds. Your event scores sum to a grand total.` }),
    el('div', { class: 'button-row' }, [
      button('Start decathlon', {
        onClick: () => { location.hash = '#/decathlon/play'; },
        variant: 'good',
      }),
      button('← Home', {
        onClick: () => { location.hash = '#/'; },
        variant: 'ghost',
      }),
    ]),
    best
      ? el('p', { text: `Personal best: ${best.total} pts (${best.date}).` })
      : el('p', { text: 'No previous decathlon recorded.' }),
  ]));

  const list = el('ol');
  for (const g of games) {
    list.appendChild(el('li', { text: `${g.name} — ${g.blurb}` }));
  }
  screen.appendChild(el('div', { class: 'panel' }, [
    el('h3', { text: 'Events, in order:' }),
    list,
  ]));
}

async function runEvent(game) {
  const screen = mountScreen();

  screen.appendChild(el('section', { class: 'panel' }, [
    el('div', { class: 'event-head' }, [
      el('div', {}, [
        el('h2', { text: game.name }),
        el('div', { class: 'sub', text: 'Best of 3 rounds' }),
      ]),
      el('div', { class: 'button-row' }, [
        button('← Home', { onClick: () => { location.hash = '#/'; }, variant: 'ghost' }),
      ]),
    ]),
    el('div', { class: 'rules', html: game.rulesHtml }),
  ]));

  const playArea = el('div', { class: 'panel' });
  screen.appendChild(playArea);

  const score = await game.play(playArea);

  const previousBest = getBestForEvent(game.id);
  const { improved, best } = recordEventScore(game.id, score);
  const result = el('div', { class: 'panel' }, [
    el('h3', { text: `Event score: ${score}` }),
    el('p', { text: improved
      ? (previousBest ? `New best! Previous best: ${previousBest}` : 'New best! (First recorded score.)')
      : `Best score: ${best}` }),
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
  ]);
  screen.appendChild(result);
}

async function runDecathlon() {
  const screen = mountScreen();

  const header = el('section', { class: 'panel' }, [
    el('div', { class: 'event-head' }, [
      el('div', {}, [
        el('h2', { text: 'Decathlon in progress' }),
        el('div', { class: 'sub', text: '' }),
      ]),
      el('div', { class: 'button-row' }, [
        button('Quit', {
          onClick: () => {
            if (confirm('Quit the decathlon? Your run won\'t be saved.')) {
              location.hash = '#/';
            }
          },
          variant: 'ghost',
        }),
      ]),
    ]),
  ]);
  const progressStrip = el('div', { class: 'score-strip' });
  header.appendChild(progressStrip);
  screen.appendChild(header);

  const playArea = el('div', { class: 'panel' });
  screen.appendChild(playArea);

  const perEvent = {};
  let total = 0;

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    header.querySelector('.sub').textContent = `Event ${i + 1} of ${games.length}: ${g.name}`;
    clear(progressStrip);
    progressStrip.appendChild(chip('Event', `${i + 1}/${games.length}`));
    progressStrip.appendChild(chip('Total so far', total, { tone: 'accent' }));
    for (const g2 of games) {
      if (perEvent[g2.id] !== undefined) {
        progressStrip.appendChild(chip(g2.name, perEvent[g2.id], { tone: perEvent[g2.id] > 0 ? 'good' : 'bust' }));
      }
    }

    clear(playArea);
    playArea.appendChild(el('div', { class: 'rules', html: g.rulesHtml }));
    const body = el('div');
    playArea.appendChild(body);

    const score = await g.play(body);
    perEvent[g.id] = score;
    total += score;
    recordEventScore(g.id, score);
  }

  clear(progressStrip);
  progressStrip.appendChild(chip('Final total', total, { tone: 'accent' }));

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
