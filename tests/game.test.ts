import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { CAN_FLOOR } from '../src/config/constants';
import { newGameConfig } from '../src/config/game';
import { MAX_TIER, PIECE_RADIUS, TIERS } from '../src/config/tiers';
import { Game } from '../src/game/state';

const R = PIECE_RADIUS;

function run(g: Game, ms: number) {
  const steps = Math.ceil(ms / (1000 / 60));
  for (let i = 0; i < steps && g.state === 'playing'; i++) g.step();
}

const game = (seed = 1) => new Game(newGameConfig(seed));
const values = (g: Game) => [...g.pieces.values()].map((p) => TIERS[p.tier].value).sort((a, b) => a - b);

describe('Suika × 2048 rules (headless)', () => {
  it('every piece is the same size, and values double per tier', () => {
    expect(new Set(TIERS.map((t) => t.radius))).toEqual(new Set([R]));
    expect(TIERS.slice(0, 11).map((t) => t.value)).toEqual([2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]);
  });

  it('starts with an empty can and a 2–32 in hand', () => {
    const g = game();
    expect(g.pieceCount).toBe(0);
    expect([2, 4, 8, 16, 32]).toContain(TIERS[g.hand].value);
  });

  it('2 + 2 makes 4 and scores 4', () => {
    const g = game();
    g.placePiece(0, 200, CAN_FLOOR - R);
    g.placePiece(0, 200, CAN_FLOOR - 3 * R - 5);
    run(g, 1500);
    expect(values(g)).toEqual([4]);
    expect(g.score).toBe(4);
  });

  it('different numbers do not merge', () => {
    const g = game();
    g.placePiece(0, 200, CAN_FLOOR - R);
    g.placePiece(1, 200, CAN_FLOOR - 3 * R - 5);
    run(g, 1500);
    expect(values(g)).toEqual([2, 4]);
  });

  it('three equal numbers resolve one pair at a time', () => {
    const g = game();
    let merges = 0;
    g.on((e) => { if (e.type === 'merge') merges++; });
    g.placePiece(2, 104, CAN_FLOOR - R);
    g.placePiece(2, 200, CAN_FLOOR - R);
    g.placePiece(2, 296, CAN_FLOOR - R);
    run(g, 2500);
    expect(merges).toBe(1);
    expect(values(g)).toEqual([8, 16]);
  });

  it('a merge result can chain into the next number up', () => {
    const g = game();
    g.placePiece(1, 200, CAN_FLOOR - R); // a 4 at the bottom
    g.placePiece(0, 200, CAN_FLOOR - 3 * R - 5);
    g.placePiece(0, 200, CAN_FLOOR - 5 * R - 10);
    run(g, 3000);
    expect(values(g)).toEqual([8]);
  });

  it('the top value never merges', () => {
    const g = game();
    g.placePiece(MAX_TIER, 200, CAN_FLOOR - R);
    g.placePiece(MAX_TIER, 200, CAN_FLOOR - 3 * R - 5);
    run(g, 2000);
    expect(g.pieceCount).toBe(2);
  });

  it('a dropped piece falls from above the rim without counting as escaped', () => {
    const g = game();
    g.requestRelease();
    g.step();
    expect([...g.pieces.values()].some((p) => p.y < 140)).toBe(true);
    run(g, 1500);
    expect(g.state).toBe('playing');
    expect(g.dropsUsed).toBe(1);
  });

  it('the hand advances to the preview after a drop', () => {
    const g = game(7);
    const preview = g.preview;
    g.requestRelease();
    g.step();
    expect(g.hand).toBe(preview);
  });

  it('a piece held above the overflow line loses after 3 s, not before', () => {
    const g = game();
    const p = g.placePiece(3, 200, 170);
    Matter.Body.setStatic(p.body, true);
    run(g, 2900);
    expect(g.state).toBe('playing');
    run(g, 300);
    expect(g.state).toBe('lost');
    expect(g.lossReason).toBe('overflow');
  });

  it('overflow timer resets when the piece drops back below the line', () => {
    const g = game();
    const p = g.placePiece(3, 200, 170);
    Matter.Body.setStatic(p.body, true);
    run(g, 2000);
    Matter.Body.setStatic(p.body, false);
    run(g, 4000);
    expect(g.state).toBe('playing');
  });
});
