import { TIERS } from '../config/tiers';

/** Logical units per screen pixel: the game renders at 210 × 380 and is scaled up. */
export const PX = 2;

export const PIXEL_FONT = '"Press Start 2P", ui-monospace, monospace';

/** Handheld-green palette for everything except the balls. */
export const PAL = {
  bg: '#0c160d',
  well: '#0f1d10',
  dark: '#1d2f1c',
  mid: '#4f6b43',
  light: '#a9c48a',
  pale: '#d6e6b8',
  outline: '#081008',
  red: '#e0604a',
};

/** Ball colours by tier (2, 4, 8, …); muted so they sit on the green screen. */
const BALL_COLORS = [
  '#a9c48a', '#6fa65a', '#3f9a86', '#4a7fb4', '#7b68b8', '#b05a9a', '#c8505a', '#d8803c',
  '#e0b440', '#ece2a4', '#f6f4e4', '#5f9a3a', '#2f7a78', '#3e52a0', '#6e3e8a', '#983848',
];

/** 4×4 Bayer matrix, normalised to −0.5..0.5. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
export const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

type RGB = [number, number, number];
const hex = (c: string): RGB => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)) as RGB;
const css = (c: RGB) => `rgb(${c.join(',')})`;
const SHADE = hex('#0c1a14');
const LIGHT = hex('#fbffe8');

export const ballColor = (tier: number) => BALL_COLORS[tier % BALL_COLORS.length];

/**
 * Pixel ball for a tier with its number on it: 1px dark outline, light from the top
 * left in hard bands with ordered dithering, and the value in a pixel font.
 * Baked once per tier (and again after the font loads).
 */
function makeBall(tier: number, white: boolean): HTMLCanvasElement {
  const R = TIERS[tier].radius / PX;
  const size = Math.ceil(R) * 2 + 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const base = hex(white ? '#fbffe8' : ballColor(tier));
  const ramp = [mix(base, SHADE, 0.82), mix(base, SHADE, 0.5), mix(base, SHADE, 0.25), base, mix(base, LIGHT, 0.4), mix(base, LIGHT, 0.85)];
  const L = [-0.5, -0.62, 0.6].map((v, _, a) => v / Math.hypot(...a));
  const mid = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - mid, dy = y + 0.5 - mid, d = Math.hypot(dx, dy);
      if (d > R) continue;
      let ci: number;
      if (d > R - 1) ci = 0;
      else {
        const nx = dx / R, ny = dy / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const I = nx * L[0] + ny * L[1] + nz * L[2] + bayer(x, y) * 0.14;
        ci = I > 0.94 && d < R * 0.75 ? 5 : I > 0.76 ? 4 : I > 0.36 ? 3 : I > 0 ? 2 : 1;
      }
      const o = (y * size + x) * 4;
      img.data.set([...ramp[ci], 255], o);
    }
  }
  ctx.putImageData(img, 0, 0);
  if (white) return c;

  // The number: big for 1–2 digits, small for longer values.
  const label = TIERS[tier].name;
  const fontPx = label.length <= 2 ? 16 : 8;
  ctx.font = `${fontPx}px ${PIXEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lum = (0.3 * base[0] + 0.59 * base[1] + 0.11 * base[2]) / 255;
  const ink = lum > 0.62 ? css(mix(base, SHADE, 0.85)) : '#fbffe8';
  const shadow = lum > 0.62 ? css(mix(base, LIGHT, 0.6)) : css(mix(base, SHADE, 0.7));
  const ty = Math.round(mid) + 1;
  ctx.fillStyle = shadow;
  ctx.fillText(label, Math.round(mid) + 1, ty + 1);
  ctx.fillStyle = ink;
  ctx.fillText(label, Math.round(mid), ty);
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();
export function ballSprite(tier: number, white = false): HTMLCanvasElement {
  const key = `${tier}:${white ? 1 : 0}`;
  let s = cache.get(key);
  if (!s) { s = makeBall(tier, white); cache.set(key, s); }
  return s;
}

/** Rebuilds number sprites once the pixel font has loaded. */
export function resetBallSprites() { cache.clear(); }

/** Pixel text with a hard 1px drop shadow, snapped to whole pixels. */
export function pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, font = `8px ${PIXEL_FONT}`) {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = PAL.outline;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
