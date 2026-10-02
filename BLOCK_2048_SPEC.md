# Block 2048 — Game Spec

Oct 2, 2026 · @Shruti

## Overview

Suika × 2048. Numbered balls drop into a well. Every ball is the same size. Two balls with the same number that touch merge into one ball with their sum (2 + 2 → 4) and a new colour. Play is endless: score as much as you can before the well overflows.

## Tech

TypeScript, Vite, Matter.js, Canvas 2D. Game rules live in `src/game/state.ts` and `src/systems/` and run headless (unit-tested). Rendering is in `src/render/`, UI in `src/ui/`, sound in `src/audio/`.

- **Logical space:** 420 × 760. The well's interior is x 20–400, floor y = 740, rim y = 140. The overflow line is y = 180; pieces are held at y = 90.
- **Loop:** fixed 1000/60 ms physics step with an accumulator (max 5 steps per frame). Merges and loss checks run after each engine update.
- **Determinism:** a seeded RNG (mulberry32) drives the drop queue. Each game picks a fresh seed.

## Balls

- **One size:** radius 50 for every value.
- **Values:** tier t holds 2^(t+1): 2, 4, 8 … 2048 … up to 65536 (tier 15), which never merges.
- **Merge:** two touching balls of the same value become one ball of double the value at their midpoint (velocity: average × 0.5). A new result can't merge for its first 60 ms. Candidates resolve smallest value first, then lowest in the well; a ball merges at most once per step, so three equal balls resolve one pair at a time.
- **Spawns:** 2–32 with weights 4 : 3 : 2 : 1 : 1 (2, 4, 8, 16, 32). One ball in hand, one shown as next.

## Physics (arcade feel)

| Setting | Value |
|---|---|
| Gravity y | 1.8 |
| Restitution (balls, walls) | 0 |
| Friction (balls / walls) | 0.45 / 0.5 |
| frictionAir | 0.03 |
| Max speed | 11 px per step |

Strong gravity against a low speed cap gives a near-constant drop speed; balls land dead; damping lets piles settle.

## Dropping

Aim with the pointer, touch or arrow keys (6 px per frame); release with pointer up, click or space. 450 ms cooldown before the next ball appears (and until the dropped ball is clear of it, max 2 s). A release during a merge animation (under 150 ms) is buffered. A dropped ball is ignored by the overflow check for 1 s.

## Scoring

- A merge scores the value it makes (2 + 2 scores 4), times the chain multiplier.
- **Chain:** every merge after a drop, until 1.2 s pass with no merge, is part of that drop's chain. Multiplier = 1 + 0.5 × (position − 1), capped at ×5.
- Best score is saved locally.

## Losing

| Outcome | Condition |
|---|---|
| Overflow | Any ball (not just dropped, not a merge result under 300 ms old) has its top above y = 180 for 3 s continuously |
| Escaped | A ball's centre leaves the column above the well, goes above y = −radius, or falls below the floor |

## Look

Handheld-green CRT. Nothing on screen that isn't needed. One font everywhere: Press Start 2P, the same pixel face as the numbers on the balls.

- **Layout:** one framed column the width of the well, in three connected sections: a top bar ("block 2048" left, score right), the play area, and a bottom bar (next ball and "next" left, "pause" right). The frame has a double-line border (light line, dark gap, light line) after 16-bit RPG windows, and the sections are split by double-line dividers; the page around is a shade darker.
- **Palette:** dark greens with light green lines and text (`src/render/pixel.ts`). Balls get their own muted colours per value: pale green, green, teal, blue, violet, magenta, red, orange, gold, cream, white for 2048, then darker repeats.
- **Balls:** generated pixel spheres (1px outline, banded light with Bayer dithering) with the number baked in (16 px for one or two digits, 8 px for more).
- **Play panel:** no fill, wall lines or drop guide; balls simply fall inside it. Drawn into a 210 × 380 buffer and scaled up without smoothing.
- **Retro motion:** balls move in whole pixels and update on screen at 30 fps. A new value flashes white for two frames at 120%, then 110%, then settles; merging balls jump together in three hard steps. Score popups ("+16 x2") rise in hops and flicker out. The overflow line hard-blinks; a ring of red pixels counts down around the offending ball; the screen tints red as it runs out.
- **Calm by default:** no screen shake, no CRT flicker, no window wipe, steady menu cursor. There is no motion setting.
- **CRT:** phosphor bloom, scanlines aligned to the pixel rows, vignette, faint red/cyan fringing on text.
- **Windows:** menu, pause, settings (sound and music volume) and game over use the same double-line panel, with the title over a double rule and menu items with a pixel-arrow cursor.

## Sound

Synthesised (`src/audio/audio.ts`). Merge: an 8-bit coin pickup, two square-wave notes B5 → E6 with a hard gate, a semitone higher per value step (up to +12) and per chain step (up to +7). Drop: a soft thud. 2048 and up: a short fanfare. Game over: a sad kazoo note. Optional quiet hold music.

## Balancing

`npm run bot` plays 20 seeds with a bot that drops each ball where it will land on a match. Current settings: median about 220 drops, 16/20 games end by overflow within 10 minutes, best values reached 512–1024. The test requires a median of at least 30 drops and at least half the games ending within 10 minutes. With only 2–8 spawning, the bot never lost; with 2–64 flat, games lasted about 2 minutes.
