import pairs from './pairs.js';
import hilo from './hilo.js';
import multiplier from './multiplier.js';
import stairs from './stairs.js';
import salvo from './salvo.js';
import twentyfour from './twentyfour.js';
import threshold from './threshold.js';
import ascent from './ascent.js';
import roundup from './roundup.js';
import snakes from './snakes.js';

export const games = [pairs, hilo, multiplier, stairs, salvo, twentyfour, threshold, ascent, roundup, snakes];

export function gameById(id) {
  return games.find(g => g.id === id) || null;
}
