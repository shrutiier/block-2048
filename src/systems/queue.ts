import { weightedPick, type Rng } from './rng';

/** Suika-style queue: a random tier from the drop pool, nothing smarter. */
export function nextDropTier(weights: Record<number, number>, rng: Rng): number {
  return weightedPick(Object.entries(weights).map(([t, w]) => ({ value: Number(t), weight: w })), rng);
}
