import { describe, expect, it } from 'vitest';
import { DROP_WEIGHTS } from '../src/config/game';
import { nextDropTier } from '../src/systems/queue';
import { mulberry32 } from '../src/systems/rng';

describe('drop queue', () => {
  it('deals 2 to 32, mostly 2s', () => {
    const rng = mulberry32(3);
    const hits: Record<number, number> = {};
    for (let i = 0; i < 6000; i++) { const t = nextDropTier(DROP_WEIGHTS, rng); hits[t] = (hits[t] ?? 0) + 1; }
    expect(Object.keys(hits).map(Number).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(hits[0]).toBeGreaterThan(hits[1]);
    expect(hits[1]).toBeGreaterThan(hits[2]);
  });
  it('is deterministic for a seed', () => {
    const a = mulberry32(9), b = mulberry32(9);
    for (let i = 0; i < 50; i++) expect(nextDropTier(DROP_WEIGHTS, a)).toBe(nextDropTier(DROP_WEIGHTS, b));
  });
});
