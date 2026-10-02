import {
  CAN_LEFT, CAN_RIGHT, DROP_Y, LOGICAL_H, LOGICAL_W, OVERFLOW_Y,
} from '../config/constants';
import type { Game, GameEvent } from '../game/state';
import { PAL, PX, ballSprite, pixelText } from './pixel';

/** Screen-pixel resolution of the game buffer. */
const W = LOGICAL_W / PX;
const H = LOGICAL_H / PX;
const px = (v: number) => Math.round(v / PX);
const CAN_L = px(CAN_LEFT), CAN_R = px(CAN_RIGHT);

/** Balls update on screen at 30 fps and move in whole pixels, like handheld sprites. */
const SPRITE_FRAME_MS = 1000 / 30;

interface Ghost { tier: number; x: number; y: number; tx: number; ty: number; start: number }
interface FloatText { text: string; x: number; y: number; start: number; dur: number }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  /** Everything draws into this low-res buffer, then scales up without smoothing. */
  private low: HTMLCanvasElement;
  private l: CanvasRenderingContext2D;
  private scanlines: HTMLCanvasElement | null = null;
  /** Render clock: advances only while not paused, so effects freeze with the game. */
  clock = 0;

  private ghosts: Ghost[] = [];
  private pops = new Map<number, number>();
  private texts: FloatText[] = [];
  private held = new Map<number, { x: number; y: number }>();
  private heldAt = -Infinity;
  private loseTint = 0;
  private unsub: (() => void) | null = null;
  game: Game | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.low = document.createElement('canvas');
    this.low.width = W; this.low.height = H;
    this.l = this.low.getContext('2d')!;
    this.l.imageSmoothingEnabled = false;
  }

  attach(game: Game) {
    this.unsub?.();
    this.game = game;
    this.ghosts = []; this.pops.clear(); this.texts = []; this.held.clear();
    this.heldAt = -Infinity; this.loseTint = 0;
    this.unsub = game.on((e) => this.onEvent(e));
  }

  private onEvent(e: GameEvent) {
    const now = this.clock;
    if (e.type === 'merge') {
      for (const p of e.parents) this.ghosts.push({ tier: p.tier, x: p.x, y: p.y, tx: e.x, ty: e.y, start: now });
      this.pops.set(e.resultId, now);
      const chain = e.chainPos && e.chainPos > 1 ? ` x${e.chainPos}` : '';
      this.texts.push({ text: `+${e.points}${chain}`, x: e.x, y: e.y - 60, start: now, dur: 800 });
    }
  }

  resize(cssW: number, cssH: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const scale = Math.min(cssW / LOGICAL_W, cssH / LOGICAL_H);
    const w = Math.round(LOGICAL_W * scale), h = Math.round(LOGICAL_H * scale);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.scanlines = this.buildScanlines();
  }

  /** Converts a client x coordinate to logical space. */
  toLogicalX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * LOGICAL_W;
  }

  advance(dtMs: number) { this.clock += dtMs; }

  // ---------- frame ----------

  draw() {
    const l = this.l, g = this.game, now = this.clock;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.fillStyle = PAL.bg;
    l.fillRect(0, 0, W, H);

    if (g) {
      this.drawOverflowLine(g, now);
      this.drawPieces(g, now);
      this.drawGhosts(now);
      this.drawHeld(g, now);
      this.drawCountdown(g);
      this.drawTexts(now);
      this.drawTint(g);
    }
    this.present();
  }

  /** Scales the buffer up and adds a light CRT pass: phosphor bloom and scanlines. */
  private present() {
    const ctx = this.ctx;
    const cw = this.canvas.width, ch = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.low, 0, 0, cw, ch);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${Math.max(2, (cw / W) * 1.5)}px)`;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28;
    ctx.drawImage(this.low, 0, 0, cw, ch);
    ctx.restore();

    if (this.scanlines) ctx.drawImage(this.scanlines, 0, 0);
  }

  /** Scanlines aligned to the buffer's pixel rows, at device resolution. */
  private buildScanlines(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const s = c.getContext('2d')!;
    const rowH = c.height / H;
    const t = Math.max(1, Math.round(rowH * 0.35));
    s.fillStyle = 'rgba(0,0,0,0.3)';
    for (let y = 0; y < H; y++) s.fillRect(0, Math.round((y + 1) * rowH) - t, c.width, t);
    return c;
  }

  // ---------- layers ----------

  private drawOverflowLine(g: Game, now: number) {
    const running = g.overflow.since !== null && g.state === 'playing';
    if (!g.overflowLineVisible && !running && g.lossReason !== 'overflow') return;
    if (running && Math.floor(now / 160) % 2 === 1) return; // hard blink
    const l = this.l;
    l.fillStyle = PAL.red;
    for (let x = CAN_L + 2; x < CAN_R - 2; x += 4) l.fillRect(x, px(OVERFLOW_Y), 2, 1);
  }

  private ball(tier: number, x: number, y: number, scale = 1, white = false) {
    const img = ballSprite(tier, white);
    const s = Math.max(1, Math.round(img.width * scale));
    this.l.drawImage(img, Math.round(px(x) - s / 2), Math.round(px(y) - s / 2), s, s);
  }

  private drawPieces(g: Game, now: number) {
    // Frame hold: sample positions at 30 fps so motion steps like an old handheld.
    if (now - this.heldAt >= SPRITE_FRAME_MS || now < this.heldAt) {
      this.heldAt = now;
      this.held.clear();
      for (const p of g.pieces.values()) this.held.set(p.id, { x: p.x, y: p.y });
    }
    for (const p of g.pieces.values()) {
      const pos = this.held.get(p.id) ?? p;
      // New value: two frames of white flash at 120%, then 110%, then settled.
      let scale = 1, white = false;
      const pop = this.pops.get(p.id);
      if (pop !== undefined) {
        const t = now - pop;
        if (t < 66) { scale = 1.2; white = true; }
        else if (t < 133) scale = 1.1;
        else this.pops.delete(p.id);
      }
      this.ball(p.tier, pos.x, pos.y, scale, white);
    }
  }

  /** Merging balls jump toward each other in three hard steps. */
  private drawGhosts(now: number) {
    const dur = 120;
    this.ghosts = this.ghosts.filter((gh) => now - gh.start < dur);
    for (const gh of this.ghosts) {
      const t = Math.min(2, Math.floor(((now - gh.start) / dur) * 3)) / 2;
      this.ball(gh.tier, gh.x + (gh.tx - gh.x) * t, gh.y + (gh.ty - gh.y) * t, 1 - 0.5 * t);
    }
  }

  private drawHeld(g: Game, now: number) {
    if (g.state !== 'playing' || !g.heldVisible) return;
    if (g.canDrop() || Math.floor(now / 100) % 2 === 0) this.ball(g.hand, g.aimX, DROP_Y);
  }

  /** A ring of red pixels around the offending ball that empties as time runs out. */
  private drawCountdown(g: Game) {
    if (g.state !== 'playing' || g.overflowPieceId === null) return;
    const p = [...g.pieces.values()].find((q) => q.id === g.overflowPieceId);
    if (!p) return;
    const l = this.l;
    const r = px(p.radius) + 3, steps = Math.round(r * 2);
    const prog = g.overflow.progress(g.time);
    l.fillStyle = PAL.red;
    for (let i = 0; i < steps * (1 - prog); i += 2) {
      const a = -Math.PI / 2 + (i / steps) * Math.PI * 2;
      l.fillRect(Math.round(px(p.x) + Math.cos(a) * r), Math.round(px(p.y) + Math.sin(a) * r), 1, 1);
    }
  }

  /** Score popups rise in 4px hops and flicker out. */
  private drawTexts(now: number) {
    this.texts = this.texts.filter((t) => now - t.start < t.dur);
    for (const t of this.texts) {
      const k = (now - t.start) / t.dur;
      if (k > 0.7 && Math.floor(now / 60) % 2) continue;
      pixelText(this.l, t.text, px(t.x), px(t.y) - Math.floor(k * 5) * 4, PAL.pale);
    }
  }

  private drawTint(g: Game) {
    const target = g.state === 'playing' ? g.overflow.progress(g.time) * 0.2 : g.lossReason === 'overflow' ? 0.18 : 0;
    this.loseTint += (target - this.loseTint) * 0.15;
    if (this.loseTint < 0.01) return;
    this.l.fillStyle = `rgba(224,96,74,${this.loseTint})`;
    this.l.fillRect(0, 0, W, H);
  }
}

/** Draws a tier's ball centred in a small canvas (HUD preview). */
export function drawSpriteInto(canvas: HTMLCanvasElement, tier: number) {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const img = ballSprite(tier);
  const fit = (canvas.width * 0.96) / img.width;
  const s = fit >= 2 ? Math.floor(fit) : fit;
  const w = img.width * s;
  ctx.drawImage(img, Math.round((canvas.width - w) / 2), Math.round((canvas.height - w) / 2), w, w);
}
