/**
 * The arena is not a fixed rectangle.
 *
 * Playables must be playable at every aspect ratio from 9:32 to 32:9 and must not
 * lock orientation, so the arena keeps a constant *area* and borrows its shape from
 * the viewport. Constant area means the fight is the same size everywhere: a phone
 * held upright gets a tall room, a monitor gets a wide one, neither gets more space
 * to run away in. The aspect clamp stops either axis from collapsing into a corridor
 * the dash cannot be aimed down; past the clamp the host letterboxes.
 */
import { T } from './tuning';

export type Arena = { w: number; h: number };

/** The reference landscape arena, for tests and for headless hosts. */
export const DEFAULT_ARENA: Arena = arenaFor(1000, 620);

export function arenaFor(viewW: number, viewH: number): Arena {
  if (!(viewW > 0) || !(viewH > 0)) {
    throw new Error(`arenaFor: viewport must be positive, got ${viewW}x${viewH}`);
  }
  const a = T.arena;
  const aspect = Math.min(Math.max(viewW / viewH, a.minAspect), a.maxAspect);
  const w = Math.round(Math.sqrt(a.area * aspect));
  return { w, h: Math.round(a.area / w) };
}
