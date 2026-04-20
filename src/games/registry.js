import pairs from './pairs.js';
import hilo from './hilo.js';
import multiplier from './multiplier.js';
import stairs from './stairs.js';
import salvo from './salvo.js';
import twenty from './twenty.js';
import threshold from './threshold.js';

export const games = [pairs, hilo, multiplier, stairs, salvo, twenty, threshold];

export function gameById(id) {
  return games.find(g => g.id === id) || null;
}
