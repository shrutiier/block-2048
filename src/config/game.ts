/**
 * Spawns 2–32, weighted toward 2s (tier → relative chance). Mixing values creates the
 * clutter that makes overflow a threat; the balancing bot reaches 512–1024 with this.
 */
export const DROP_WEIGHTS: Record<number, number> = { 0: 4, 1: 3, 2: 2, 3: 1, 4: 1 };

export interface GameConfig {
  seed: number;
  dropWeights: Record<number, number>;
}

export const newGameConfig = (seed = Math.floor(Math.random() * 2 ** 31)): GameConfig => ({ seed, dropWeights: DROP_WEIGHTS });
