import Matter from 'matter-js';
import {
  CAN_FLOOR, CAN_LEFT, CAN_RIGHT, CHAIN_NO_CONTACT_MS, COMBO_WINDOW_MS, COOLDOWN_MAX_MS, COOLDOWN_MS, DROP_Y,
  JUST_DROPPED_MS, LOGICAL_H, MERGE_OVERFLOW_GRACE_MS, OVERFLOW_LOSS_MS, OVERFLOW_VISIBLE_WITHIN, OVERFLOW_Y,
  RESOLVE_BLOCK_MS, SETTLE_FALLBACK_MS, SETTLE_MS, SETTLE_SPEED, SPAWN_GRACE_MS, STEP_MS,
} from '../config/constants';
import type { GameConfig } from '../config/game';
import { MAX_TIER, tierDef } from '../config/tiers';
import {
  addWalls, clampSpeeds, createEngine, createPieceBody, removeBody, setVelocity, stepEngine,
  type MBody, type MEngine,
} from '../physics/world';
import { ChainTracker, selectMerges, type CandidatePair } from '../systems/merge';
import { OverflowTimer } from '../systems/overflow';
import { nextDropTier } from '../systems/queue';
import { mulberry32, type Rng } from '../systems/rng';
import { eventPoints } from '../systems/score';

export class Piece {
  state: 'active' | 'merging' | 'removed' = 'active';
  graceUntil = 0;
  justDroppedUntil = 0;
  overflowGraceUntil = 0;

  constructor(readonly id: number, readonly tier: number, readonly body: MBody) {}

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get angle() { return this.body.angle; }
  get radius() { return tierDef(this.tier).radius; }
}

export interface ParentSnapshot { x: number; y: number; angle: number; tier: number }

export type GameEvent =
  | { type: 'drop'; x: number; tier: number }
  | { type: 'land'; x: number; y: number }
  | { type: 'merge'; tier: number; x: number; y: number; points: number; chainPos: number | null; parents: ParentSnapshot[]; resultId: number }
  | { type: 'chainCallout'; length: number }
  | { type: 'chainEnd'; length: number }
  | { type: 'lost'; reason: LossReason };

export type LossReason = 'overflow' | 'escaped';

type Listener = (e: GameEvent) => void;

/**
 * Headless Suika-style game (two matches merge one size up; the top tier never merges): owns the physics world and every rule. Rendering, audio
 * and UI subscribe to events and read public fields; they never mutate game state.
 */
export class Game {
  readonly config: GameConfig;
  readonly engine: MEngine;

  state: 'playing' | 'lost' = 'playing';
  lossReason: LossReason | null = null;
  time = 0;

  pieces = new Map<number, Piece>();
  private nextPieceId = 1;

  hand: number;
  preview: number;
  heldVisible = true;
  aimX = (CAN_LEFT + CAN_RIGHT) / 2;
  private cooldownUntil = 0;
  private dropBodyId: number | null = null;
  private dropTime = 0;
  private dropContacted = true;
  private pendingReleaseAt: number | null = null;

  dropsUsed = 0;
  score = 0;
  /** Largest tier that has appeared in the can this game. */
  topTier = 0;
  lastMergeAt = -Infinity;

  readonly chain = new ChainTracker(COMBO_WINDOW_MS, CHAIN_NO_CONTACT_MS);
  readonly overflow = new OverflowTimer(OVERFLOW_LOSS_MS);
  overflowPieceId: number | null = null;
  overflowLineVisible = false;

  settled = true;
  private slowSince: number | null = null;
  private lastActivity = 0;
  private candidates: CandidatePair<Piece>[] = [];
  private mergesPending = false;

  private rng: Rng;
  private listeners: Listener[] = [];

  constructor(config: GameConfig) {
    this.config = config;
    this.engine = createEngine();
    addWalls(this.engine, false);
    Matter.Events.on(this.engine, 'collisionStart', (e) => this.onCollisions(e.pairs, true));
    Matter.Events.on(this.engine, 'collisionActive', (e) => this.onCollisions(e.pairs, false));

    this.rng = mulberry32(config.seed);
    this.hand = this.pickNext();
    this.preview = this.pickNext();
  }

  on(fn: Listener) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
  private emit(e: GameEvent) { for (const l of this.listeners) l(e); }

  // ---------- queries ----------

  get pieceCount() { return this.pieces.size; }

  get handRadius() { return tierDef(this.hand).radius; }

  clampAim(x: number) {
    const r = this.handRadius;
    return Math.max(CAN_LEFT + r, Math.min(CAN_RIGHT - r, x));
  }

  /** True when a release right now would drop a piece. */
  canDrop(): boolean {
    return this.state === 'playing' && this.heldVisible && this.time - this.lastMergeAt >= RESOLVE_BLOCK_MS;
  }

  /** Centre y where a circle of radius r released at x would first touch something. */
  landingY(x: number, r: number): number {
    return this.landing(x, r).y;
  }

  /** First surface a circle of radius r falling straight down at x would hit. */
  landing(x: number, r: number): { y: number; piece: Piece | null } {
    let y = CAN_FLOOR - r;
    let piece: Piece | null = null;
    for (const p of this.pieces.values()) {
      const dx = Math.abs(p.x - x);
      const reach = r + p.radius;
      if (dx >= reach) continue;
      const cy = p.y - Math.sqrt(reach * reach - dx * dx);
      if (cy < y) { y = cy; piece = p; }
    }
    return { y, piece };
  }

  // ---------- input ----------

  setAim(x: number) { this.aimX = this.clampAim(x); }

  requestRelease() {
    if (this.state !== 'playing') return;
    this.pendingReleaseAt = this.time;
  }

  // ---------- step ----------

  step() {
    if (this.state !== 'playing') return;
    this.time += STEP_MS;
    const t = this.time;

    // Phase 1: aim and drop.
    this.updateHeld(t);
    this.processRelease(t);

    // Phase 2: physics.
    this.candidates = [];
    clampSpeeds(Array.from(this.pieces.values(), (p) => p.body));
    stepEngine(this.engine);

    // Phase 3: merges.
    this.resolveMerges(t);
    const ended = this.chain.tick(t);
    if (ended !== null && ended > 0) this.emit({ type: 'chainEnd', length: ended });

    // Phase 4: settle and loss checks.
    this.updateSettled(t);
    this.checkLoss(t);
  }

  private updateHeld(t: number) {
    if (this.heldVisible || t < this.cooldownUntil) return;
    const d = this.dropBodyId === null ? undefined : this.pieces.get(this.dropBodyId);
    const clear = !d || d.y - d.radius > DROP_Y + this.handRadius;
    if (clear || t - this.dropTime >= COOLDOWN_MAX_MS) {
      this.heldVisible = true;
      this.aimX = this.clampAim(this.aimX);
    }
  }

  private processRelease(t: number) {
    if (this.pendingReleaseAt === null) return;
    // Releases are only buffered across the short merge-animation block.
    if (!this.heldVisible) { this.pendingReleaseAt = null; return; }
    if (t - this.lastMergeAt < RESOLVE_BLOCK_MS) {
      if (t - this.pendingReleaseAt > RESOLVE_BLOCK_MS * 2) this.pendingReleaseAt = null;
      return;
    }
    this.pendingReleaseAt = null;

    const tier = this.hand;
    const x = this.clampAim(this.aimX);
    const ended = this.chain.startDrop(t);
    if (ended > 0) this.emit({ type: 'chainEnd', length: ended });

    const piece = this.register(createPieceBody(this.engine, tier, x, DROP_Y), tier);
    piece.justDroppedUntil = t + JUST_DROPPED_MS;

    this.dropBodyId = piece.body.id;
    this.dropTime = t;
    this.dropContacted = false;
    this.cooldownUntil = t + COOLDOWN_MS;
    this.heldVisible = false;
    this.dropsUsed += 1;
    this.markActive(t);

    this.hand = this.preview;
    this.preview = this.pickNext();
    this.emit({ type: 'drop', x, tier });
  }

  private onCollisions(pairs: Matter.Pair[], isStart: boolean) {
    for (const pair of pairs) {
      if (isStart && this.dropBodyId !== null && !this.dropContacted
        && (pair.bodyA.id === this.dropBodyId || pair.bodyB.id === this.dropBodyId)) {
        this.dropContacted = true;
        this.chain.contact(this.time);
        const d = this.pieces.get(this.dropBodyId);
        if (d) this.emit({ type: 'land', x: d.x, y: d.y });
      }
      const a = this.pieces.get(pair.bodyA.id);
      const b = this.pieces.get(pair.bodyB.id);
      if (!a || !b || a.tier !== b.tier || a.tier === MAX_TIER) continue;
      if (a.state !== 'active' || b.state !== 'active') continue;
      this.candidates.push({ a, b });
    }
  }

  /** Applies this step's merges: each pair becomes one piece a tier up. */
  private resolveMerges(t: number) {
    const { merges, deferred } = selectMerges(this.candidates, t);
    this.mergesPending = deferred;
    this.candidates = [];

    for (const { a, b } of merges) {
      const tier = a.tier;
      const parents: ParentSnapshot[] = [a, b].map((p) => ({ x: p.x, y: p.y, angle: p.angle, tier }));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const vx = (a.body.velocity.x + b.body.velocity.x) / 2 * 0.5;
      const vy = (a.body.velocity.y + b.body.velocity.y) / 2 * 0.5;
      for (const p of [a, b]) {
        p.state = 'removed';
        removeBody(this.engine, p.body);
        this.pieces.delete(p.body.id);
      }

      const chainPos = this.chain.event(t);
      const points = eventPoints(tier, chainPos);
      this.score += points;
      this.lastMergeAt = t;
      this.markActive(t);

      {
        const result = this.register(createPieceBody(this.engine, tier + 1, mx, my), tier + 1);
        setVelocity(result.body, { x: vx, y: vy });
        result.graceUntil = t + SPAWN_GRACE_MS;
        result.overflowGraceUntil = t + MERGE_OVERFLOW_GRACE_MS;
        if (this.dropBodyId === a.body.id || this.dropBodyId === b.body.id) this.dropBodyId = result.body.id;
        this.emit({ type: 'merge', tier, x: mx, y: my, points, chainPos, parents, resultId: result.id });
      }
      if (chainPos !== null && [2, 4, 6, 8].includes(chainPos)) this.emit({ type: 'chainCallout', length: chainPos });
    }
  }

  private updateSettled(t: number) {
    let maxSpeed = 0;
    for (const p of this.pieces.values()) maxSpeed = Math.max(maxSpeed, p.body.speed);
    if (maxSpeed < SETTLE_SPEED) this.slowSince ??= t;
    else this.slowSince = null;

    const quiet = (this.slowSince !== null && t - this.slowSince >= SETTLE_MS)
      || t - this.lastActivity >= SETTLE_FALLBACK_MS;
    this.settled = quiet && !this.mergesPending && t - this.lastMergeAt > STEP_MS;
  }

  private checkLoss(t: number) {
    // Escaped: centre leaves the can column, flies off the top, or falls through.
    for (const p of this.pieces.values()) {
      if (p.x < CAN_LEFT || p.x > CAN_RIGHT || p.y < -p.radius || p.y > LOGICAL_H + p.radius) {
        return this.lose('escaped');
      }
    }

    let offender: Piece | null = null;
    let nearLine = false;
    for (const p of this.pieces.values()) {
      if (t < p.justDroppedUntil || t < p.overflowGraceUntil) continue;
      const top = p.y - p.radius;
      if (top < OVERFLOW_Y + OVERFLOW_VISIBLE_WITHIN) nearLine = true;
      if (top < OVERFLOW_Y && (!offender || top < offender.y - offender.radius)) offender = p;
    }
    this.overflowLineVisible = nearLine;
    this.overflowPieceId = offender?.id ?? null;
    if (this.overflow.update(t, offender !== null)) this.lose('overflow');
  }

  private lose(reason: LossReason) {
    this.state = 'lost';
    this.lossReason = reason;
    if (this.chain.live && this.chain.length > 1) this.emit({ type: 'chainEnd', length: this.chain.length });
    this.chain.reset();
    this.emit({ type: 'lost', reason });
  }

  /** Places a piece directly (tests and tooling). */
  placePiece(tier: number, x: number, y: number): Piece {
    this.markActive(this.time);
    return this.register(createPieceBody(this.engine, tier, x, y), tier);
  }

  // ---------- helpers ----------

  private register(body: MBody, tier: number): Piece {
    const p = new Piece(this.nextPieceId++, tier, body);
    this.pieces.set(body.id, p);
    this.topTier = Math.max(this.topTier, tier);
    return p;
  }

  private markActive(t: number) {
    this.lastActivity = t;
    this.settled = false;
    this.slowSince = null;
  }

  private pickNext(): number {
    return nextDropTier(this.config.dropWeights, this.rng);
  }

  /** Clears physics listeners and bodies; call before discarding the game. */
  destroy() {
    Matter.Events.off(this.engine, 'collisionStart', undefined as any);
    Matter.Events.off(this.engine, 'collisionActive', undefined as any);
    Matter.World.clear(this.engine.world, false);
    Matter.Engine.clear(this.engine);
    this.listeners = [];
  }
}
