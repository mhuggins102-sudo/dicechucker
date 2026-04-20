import pairs from './pairs.js';
import hilo from './hilo.js';
import multiplier from './multiplier.js';
import stairs from './stairs.js';
import salvo from './salvo.js';
import twentyfour from './twentyfour.js';
import threshold from './threshold.js';

export const games = [pairs, hilo, multiplier, stairs, salvo, twentyfour, threshold];

export function gameById(id) {
  return games.find(g => g.id === id) || null;
}
