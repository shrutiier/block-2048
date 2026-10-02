import { describe, expect, it } from 'vitest';
import { ChainTracker, selectMerges, type MergeCandidatePiece } from '../src/systems/merge';

const piece = (id: number, tier: number, y: number, extra: Partial<MergeCandidatePiece> = {}): MergeCandidatePiece =>
  ({ id, tier, x: 0, y, state: 'active', graceUntil: 0, ...extra });

describe('merge pairing', () => {
  it('resolves smallest tier first, then lowest in the can', () => {
    const a = piece(1, 2, 100), b = piece(2, 2, 110);
    const c = piece(3, 0, 50), d = piece(4, 0, 55);
    const e = piece(5, 2, 600), f = piece(6, 2, 610);
    const { merges } = selectMerges([{ a, b }, { a: e, b: f }, { a: c, b: d }], 0);
    expect(merges.map((m) => m.a.id)).toEqual([3, 5, 1]);
  });

  it('three matching pieces: one pair merges, the third waits', () => {
    const a = piece(1, 3, 500), b = piece(2, 3, 520), c = piece(3, 3, 540);
    const { merges, deferred } = selectMerges([{ a, b }, { a: b, b: c }, { a, b: c }], 0);
    expect(merges).toHaveLength(1);
    expect(merges[0].a.id === 2 || merges[0].b.id === 2).toBe(true); // lowest midpoint pair includes the middle piece
    expect(deferred).toBe(true);
  });

  it('dedupes the same pair from collisionStart and collisionActive', () => {
    const a = piece(1, 1, 0), b = piece(2, 1, 0);
    expect(selectMerges([{ a, b }, { a: b, b: a }], 0).merges).toHaveLength(1);
  });

  it('spawn grace defers a merge result', () => {
    const a = piece(1, 1, 0, { graceUntil: 60 }), b = piece(2, 1, 0);
    expect(selectMerges([{ a, b }], 30)).toEqual({ merges: [], deferred: true });
    expect(selectMerges([{ a, b }], 60).merges).toHaveLength(1);
  });

  it('ignores mismatched tiers and inactive pieces', () => {
    expect(selectMerges([{ a: piece(1, 1, 0), b: piece(2, 2, 0) }], 0).merges).toHaveLength(0);
    expect(selectMerges([{ a: piece(1, 1, 0, { state: 'removed' }), b: piece(2, 1, 0) }], 0).merges).toHaveLength(0);
  });
});

describe('chain tracker', () => {
  it('window starts at first contact and resets on each event', () => {
    const c = new ChainTracker(1200, 3000);
    c.startDrop(0);
    expect(c.tick(1500)).toBeNull(); // no contact yet: still live
    c.contact(1500);
    expect(c.event(1600)).toBe(1);
    expect(c.event(2700)).toBe(2);
    expect(c.tick(3800)).toBeNull();
    expect(c.tick(3901)).toBe(2);
    expect(c.live).toBe(false);
  });
  it('a new drop ends the previous chain', () => {
    const c = new ChainTracker(1200, 3000);
    c.startDrop(0);
    c.contact(10);
    c.event(20);
    expect(c.startDrop(100)).toBe(1);
    expect(c.length).toBe(0);
  });
  it('no live chain means no position', () => {
    const c = new ChainTracker(1200, 3000);
    expect(c.event(0)).toBeNull();
  });
});
