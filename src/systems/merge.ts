export interface MergeCandidatePiece {
  id: number;
  tier: number;
  x: number;
  y: number;
  state: 'active' | 'merging' | 'removed';
  graceUntil: number;
}

export interface CandidatePair<P extends MergeCandidatePiece = MergeCandidatePiece> {
  a: P;
  b: P;
}

/** Dedupe key so collisionStart + collisionActive for the same pair count once. */
export const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Orders candidate pairs and picks which ones merge this step.
 * Smallest tier first, then lowest midpoint in the can (largest y) first.
 * A piece can merge at most once per step; pieces in spawn grace wait.
 * Returns the chosen pairs and whether any valid pair was deferred (for the settled check).
 */
export function selectMerges<P extends MergeCandidatePiece>(
  candidates: CandidatePair<P>[],
  now: number,
): { merges: CandidatePair<P>[]; deferred: boolean } {
  const seen = new Set<string>();
  const unique = candidates.filter(({ a, b }) => {
    if (a.id === b.id || a.tier !== b.tier) return false;
    const k = pairKey(a.id, b.id);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  unique.sort((p, q) => {
    if (p.a.tier !== q.a.tier) return p.a.tier - q.a.tier;
    return (q.a.y + q.b.y) / 2 - (p.a.y + p.b.y) / 2;
  });

  const used = new Set<number>();
  const merges: CandidatePair<P>[] = [];
  let deferred = false;
  for (const pair of unique) {
    const { a, b } = pair;
    if (a.state !== 'active' || b.state !== 'active') continue;
    if (now < a.graceUntil || now < b.graceUntil) { deferred = true; continue; }
    if (used.has(a.id) || used.has(b.id)) { deferred = true; continue; }
    used.add(a.id);
    used.add(b.id);
    merges.push(pair);
  }
  return { merges, deferred };
}

/** Tracks the chain started by a player drop. */
export class ChainTracker {
  id = 0;
  length = 0;
  live = false;
  private windowEndsAt: number | null = null;
  private droppedAt = 0;

  constructor(private windowMs: number, private noContactMs: number) {}

  /** Starts a new chain; returns the length of the chain it ended (0 if none). */
  startDrop(now: number): number {
    const ended = this.live ? this.length : 0;
    this.id += 1;
    this.length = 0;
    this.live = true;
    this.windowEndsAt = null;
    this.droppedAt = now;
    return ended;
  }

  /** The dropped piece touched something: the combo window starts counting. */
  contact(now: number) {
    if (this.live && this.windowEndsAt === null) this.windowEndsAt = now + this.windowMs;
  }

  /** Registers a merge; returns its 1-based position in the chain, or null. */
  event(now: number): number | null {
    if (!this.live) return null;
    this.length += 1;
    this.windowEndsAt = now + this.windowMs;
    return this.length;
  }

  /** Call every step; returns the final length when the chain expires, else null. */
  tick(now: number): number | null {
    if (!this.live) return null;
    if (this.windowEndsAt === null && now - this.droppedAt >= this.noContactMs) {
      this.windowEndsAt = now;
    }
    if (this.windowEndsAt !== null && now > this.windowEndsAt) {
      this.live = false;
      return this.length;
    }
    return null;
  }

  reset() {
    this.length = 0;
    this.live = false;
    this.windowEndsAt = null;
  }
}
