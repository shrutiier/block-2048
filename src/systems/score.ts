import { tierDef } from '../config/tiers';

export const MAX_MULTIPLIER = 5;

/** Position is 1-based within the chain; null means no live chain. */
export function chainMultiplier(position: number | null): number {
  if (position === null || position < 1) return 1;
  return Math.min(MAX_MULTIPLIER, 1 + 0.5 * (position - 1));
}

export function eventPoints(tier: number, position: number | null): number {
  return Math.round(tierDef(tier).mergePoints * chainMultiplier(position));
}
