import pairs from './pairs.js';
import hilo from './hilo.js';
import multiplier from './multiplier.js';

export const games = [pairs, hilo, multiplier];

export function gameById(id) {
  return games.find(g => g.id === id) || null;
}
