import pairs from './pairs.js';
import hilo from './hilo.js';
import multiplier from './multiplier.js';
import stairs from './stairs.js';

export const games = [pairs, hilo, multiplier, stairs];

export function gameById(id) {
  return games.find(g => g.id === id) || null;
}
