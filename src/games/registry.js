// Wyte Ryno's Demathlon
import pairs from './pairs.js';
import hilo from './hilo.js';
import multiplier from './multiplier.js';
import stairs from './stairs.js';
import salvo from './salvo.js';
import twentyfour from './twentyfour.js';
import lowball from './lowball.js';
import ascent from './ascent.js';
import roundup from './roundup.js';
import snakes from './snakes.js';

// Reiner Knizia's Decathlon
import sprint100 from './reiner/sprint100.js';
import longjump from './reiner/longjump.js';
import shotput from './reiner/shotput.js';
import highjump from './reiner/highjump.js';
import sprint400 from './reiner/sprint400.js';
import hurdles from './reiner/hurdles.js';
import discus from './reiner/discus.js';
import polevault from './reiner/polevault.js';
import javelin from './reiner/javelin.js';
import run1500 from './reiner/run1500.js';

export const games = [
  // Ryno events
  pairs, hilo, multiplier, stairs, salvo, twentyfour, lowball, ascent, roundup, snakes,
  // Reiner events, in classic decathlon order
  sprint100, longjump, shotput, highjump, sprint400,
  hurdles, discus, polevault, javelin, run1500,
];

export const decathlons = [
  {
    id: 'reiner',
    name: "Reiner Knizia's Decathlon",
    short: 'Reiner',
    tagline: 'The classic 10-event dice decathlon.',
    description: "Ten mini dice events based on Olympic decathlon disciplines. No chips — play each event straight and add up your score.",
  },
  {
    id: 'ryno',
    name: "Wyte Ryno's Demathlon",
    short: 'Ryno',
    tagline: '10 push-your-luck dice games.',
    description: 'A push-your-luck decathlon of 10 original events — each is best of a few rounds. Skip a final round to earn an Extra Round chip you can spend on a later event.',
  },
];

export function gameById(id) {
  return games.find(g => g.id === id) || null;
}

export function gamesByDecathlon(decathlonId) {
  return games.filter(g => g.decathlon === decathlonId);
}

export function decathlonById(id) {
  return decathlons.find(d => d.id === id) || null;
}
