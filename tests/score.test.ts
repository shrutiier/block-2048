import { describe, expect, it } from 'vitest';
import { chainMultiplier, eventPoints } from '../src/systems/score';

describe('score', () => {
  it('chain multiplier steps by 0.5 and caps at 5', () => {
    expect(chainMultiplier(null)).toBe(1);
    expect(chainMultiplier(1)).toBe(1);
    expect(chainMultiplier(2)).toBe(1.5);
    expect(chainMultiplier(3)).toBe(2);
    expect(chainMultiplier(9)).toBe(5);
    expect(chainMultiplier(20)).toBe(5);
  });
  it('event points use the merged pair tier', () => {
    expect(eventPoints(0, 1)).toBe(4); // 2 + 2 scores 4
    expect(eventPoints(9, 3)).toBe(4096); // 1024 + 1024 at 3rd in chain: 2048 × 2
  });
});
