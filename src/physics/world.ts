import Matter from 'matter-js';
import {
  CAN_FLOOR, CAN_LEFT, CAN_RIGHT, CAN_RIM, GRAVITY, MAX_SPEED, PIECE, STEP_MS, WALL, WALL_THICKNESS,
} from '../config/constants';
import { tierDef } from '../config/tiers';

const { Engine, Bodies, Body, Composite } = Matter;

export type MBody = Matter.Body;
export type MEngine = Matter.Engine;

export function createEngine(): MEngine {
  return Engine.create({
    gravity: { x: 0, y: GRAVITY, scale: 0.001 },
    positionIterations: 10,
    velocityIterations: 8,
    enableSleeping: false,
  });
}

/** Adds the can. `tall` extends the walls far above the rim (unused in play; handy for tooling). */
export function addWalls(engine: MEngine, tall: boolean): MBody[] {
  const top = tall ? CAN_RIM - 2000 : CAN_RIM;
  const bottom = CAN_FLOOR + WALL_THICKNESS;
  const h = bottom - top;
  const opts = { isStatic: true, ...WALL, label: 'wall' };
  const walls = [
    Bodies.rectangle(CAN_LEFT - WALL_THICKNESS / 2, top + h / 2, WALL_THICKNESS, h, opts),
    Bodies.rectangle(CAN_RIGHT + WALL_THICKNESS / 2, top + h / 2, WALL_THICKNESS, h, opts),
    Bodies.rectangle((CAN_LEFT + CAN_RIGHT) / 2, CAN_FLOOR + WALL_THICKNESS / 2,
      CAN_RIGHT - CAN_LEFT + WALL_THICKNESS * 2, WALL_THICKNESS, { ...opts, label: 'floor' }),
  ];
  Composite.add(engine.world, walls);
  return walls;
}

export function removeBodies(engine: MEngine, bodies: MBody[]) {
  Composite.remove(engine.world, bodies);
}

export function createPieceBody(engine: MEngine, tier: number, x: number, y: number): MBody {
  const body = Bodies.circle(x, y, tierDef(tier).radius, { ...PIECE, label: `piece-${tier}` });
  Composite.add(engine.world, body);
  return body;
}

export function removeBody(engine: MEngine, body: MBody) {
  Composite.remove(engine.world, body);
}

export function clampSpeeds(bodies: Iterable<MBody>) {
  for (const b of bodies) {
    const s = b.speed;
    if (s > MAX_SPEED) {
      const k = MAX_SPEED / s;
      Body.setVelocity(b, { x: b.velocity.x * k, y: b.velocity.y * k });
    }
  }
}

export function stepEngine(engine: MEngine) {
  Engine.update(engine, STEP_MS);
}

export const setVelocity = (b: MBody, v: { x: number; y: number }) => Body.setVelocity(b, v);
