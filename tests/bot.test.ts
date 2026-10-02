import { expect, it } from 'vitest';
import { runBot } from '../src/game/bot';

const SEEDS = 20;

it('balancing bot: games last a few minutes and do end', () => {
  const runs = Array.from({ length: SEEDS }, (_, i) => runBot(100 + i * 37, 600));
  const drops = runs.map((r) => r.dropsUsed).sort((a, b) => a - b);
  const median = drops[SEEDS >> 1];
  const lost = runs.filter((r) => r.lost).length;
  console.log(`median ${median} drops, ${lost}/${SEEDS} ended within 10 min, median score ${runs.map((r) => r.score).sort((a, b) => a - b)[SEEDS >> 1]}`);
  expect(median).toBeGreaterThanOrEqual(30); // not over instantly
  expect(lost / SEEDS).toBeGreaterThanOrEqual(0.5); // overflow is a real threat
});
