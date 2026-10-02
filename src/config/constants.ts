export const LOGICAL_W = 420;
export const LOGICAL_H = 760;

export const STEP_MS = 1000 / 60;
export const MAX_STEPS_PER_FRAME = 5;

export const CAN_LEFT = 20;
export const CAN_RIGHT = 400;
export const CAN_FLOOR = 740;
export const CAN_RIM = 140;
export const WALL_THICKNESS = 60;

export const OVERFLOW_Y = 180;
export const OVERFLOW_VISIBLE_WITHIN = 60;
export const OVERFLOW_LOSS_MS = 3000;
export const DROP_Y = 90;

/**
 * Arcade feel: strong gravity with a low speed cap means pieces hit a steady drop speed
 * almost at once (the fixed fall of CRT-era puzzlers), land dead with no bounce, and
 * heavy damping lets piles settle instead of jiggling.
 */
export const GRAVITY = 1.8;
export const PIECE = { restitution: 0, friction: 0.45, frictionAir: 0.03, density: 0.001 };
export const WALL = { restitution: 0, friction: 0.5 };
export const MAX_SPEED = 11;

export const COOLDOWN_MS = 450;
export const COOLDOWN_MAX_MS = 2000;
export const RESOLVE_BLOCK_MS = 150;
export const JUST_DROPPED_MS = 1000;
export const SPAWN_GRACE_MS = 60;
export const MERGE_OVERFLOW_GRACE_MS = 300;
export const COMBO_WINDOW_MS = 1200;
export const CHAIN_NO_CONTACT_MS = 3000;

export const SETTLE_SPEED = 0.08;
export const SETTLE_MS = 500;
export const SETTLE_FALLBACK_MS = 4000;

export const AIM_KEY_SPEED = 6;
