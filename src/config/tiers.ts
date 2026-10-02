/**
 * Suika × 2048: every piece is the same size and carries a power of two. Two equal
 * values merge into their sum. Tier t holds the value 2^(t+1): tier 0 = 2, tier 10 = 2048.
 */
export interface TierDef {
  tier: number;
  value: number;
  /** Display name (the value). */
  name: string;
  radius: number;
  /** Points for merging a pair of this tier: the value they make, as in 2048. */
  mergePoints: number;
}

/** One size for every piece (the old middle size). */
export const PIECE_RADIUS = 50;

/** Up to 65536; the top tier never merges. */
const TIER_COUNT = 16;

export const TIERS: readonly TierDef[] = Array.from({ length: TIER_COUNT }, (_, t) => {
  const value = 2 ** (t + 1);
  return { tier: t, value, name: String(value), radius: PIECE_RADIUS, mergePoints: value * 2 };
});

export const MAX_TIER = TIERS.length - 1;

export const tierDef = (t: number): TierDef => TIERS[t];
