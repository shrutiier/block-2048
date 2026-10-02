import { CAN_LEFT, CAN_RIGHT } from '../config/constants';
import type { GameConfig } from '../config/game';
import { newGameConfig } from '../config/game';
import { Game } from './state';

/**
 * Balancing bot: drop where the piece will land on a matching piece (prefer a near-centred
 * hit so it does not glance off); with no match reachable, drop into the deepest gap.
 */
export function botAim(g: Game): number {
  const tier = g.hand;
  const r = g.handRadius;
  let best: { x: number; score: number } | null = null;
  let deepX = (CAN_LEFT + CAN_RIGHT) / 2, deepY = -Infinity;
  for (let x = CAN_LEFT + r; x <= CAN_RIGHT - r; x += 3) {
    const { y, piece } = g.landing(x, r);
    if (piece && piece.tier === tier) {
      const score = Math.abs(piece.x - x) - y * 0.01;
      if (!best || score < best.score) best = { x, score };
    }
    if (y > deepY) { deepY = y; deepX = x; }
  }
  return best ? best.x : deepX;
}

export interface BotRun { lost: boolean; dropsUsed: number; seconds: number; score: number; topTier: number }

export function runBot(seed: number, maxSeconds = 600, config: Partial<GameConfig> = {}): BotRun {
  const g = new Game({ ...newGameConfig(seed), ...config });
  const maxSteps = maxSeconds * 60;
  for (let i = 0; i < maxSteps && g.state === 'playing'; i++) {
    if (g.canDrop() && g.settled) {
      g.setAim(botAim(g));
      g.requestRelease();
    }
    g.step();
  }
  const out = { lost: g.state === 'lost', dropsUsed: g.dropsUsed, seconds: g.time / 1000, score: g.score, topTier: g.topTier };
  g.destroy();
  return out;
}
