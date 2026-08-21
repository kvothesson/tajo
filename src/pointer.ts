/**
 * Pointer control, kept pure so the scheme can be tested without a browser.
 *
 * A Playable must be playable with touch alone and with a mouse alone, and TAJO was
 * built for a hand on WASD and a hand on the mouse. The bridge is that the game
 * already accepts aiming along the direction of travel, so one stick can drive both.
 *
 * The scheme:
 *   - The first pointer down plants a floating stick. Its offset from where it landed
 *     is the move vector and the aim. Drag past the radius and the origin follows, so
 *     a thumb that wanders never loses its range.
 *   - A press that leaves again without travelling is a tap, and a tap is the dash.
 *   - A second pointer is the dash on press and, if it stays down, the focus. That is
 *     what lets a left thumb keep moving while a right thumb cuts.
 *
 * A mouse only ever has one pointer, so it dashes on press (the host does that, which
 * is why `tapDashes` exists) and moves by dragging.
 */
import type { Vec } from './sim/types';
import { v } from './sim/vec';

export const STICK = {
  /** Travel, in arena units, before a press stops being a tap and becomes a stick. */
  deadzone: 16,
  /** Offset at which the stick is fully deflected. */
  radius: 74,
  /** A press held longer than this is not a tap, however little it moved. */
  tapTime: 0.28,
};

export type StickView = { origin: Vec; at: Vec; radius: number; deadzone: number };

type Touch = {
  id: number;
  origin: Vec;
  at: Vec;
  age: number;
  travelled: boolean;
  /** False when the host already dashed on press, so the release must not dash again. */
  tapDashes: boolean;
};

export class PointerRig {
  private primary: Touch | null = null;
  private secondary: Touch | null = null;

  /** Edge-triggered. Drained by the host each frame, like `Input.dash`. */
  dash = false;

  down(id: number, p: Vec, tapDashes: boolean): void {
    const t: Touch = {
      id,
      origin: v(p.x, p.y),
      at: v(p.x, p.y),
      age: 0,
      travelled: false,
      tapDashes,
    };
    if (this.primary === null) {
      this.primary = t;
      return;
    }
    if (this.secondary === null) {
      this.secondary = t;
      // The second thumb is the dash button: it fires on press, never on release.
      this.dash = true;
    }
  }

  move(id: number, p: Vec): void {
    const t = this.find(id);
    if (t === null) return;
    t.at = v(p.x, p.y);

    const off = v(t.at.x - t.origin.x, t.at.y - t.origin.y);
    const l = Math.hypot(off.x, off.y);
    if (l > STICK.deadzone) t.travelled = true;
    // Past full deflection the origin trails the pointer, so direction stays live.
    if (l > STICK.radius) {
      t.origin = v(t.at.x - (off.x / l) * STICK.radius, t.at.y - (off.y / l) * STICK.radius);
    }
  }

  up(id: number): void {
    const t = this.find(id);
    if (t === null) return;
    if (t.tapDashes && !t.travelled && t.age <= STICK.tapTime) this.dash = true;
    this.clear(id);
  }

  cancel(id: number): void {
    this.clear(id);
  }

  /** Clears every live pointer without firing anything (window blur, run reset). */
  release(): void {
    this.primary = null;
    this.secondary = null;
  }

  tick(dt: number): void {
    if (this.primary !== null) this.primary.age += dt;
    if (this.secondary !== null) this.secondary.age += dt;
  }

  /** Analog: zero inside the deadzone, unit length at full deflection. */
  moveVector(): Vec {
    const t = this.primary;
    if (t === null || !t.travelled) return v(0, 0);
    const off = v(t.at.x - t.origin.x, t.at.y - t.origin.y);
    const l = Math.hypot(off.x, off.y);
    if (l <= STICK.deadzone) return v(0, 0);
    const mag = Math.min((l - STICK.deadzone) / (STICK.radius - STICK.deadzone), 1);
    return v((off.x / l) * mag, (off.y / l) * mag);
  }

  /** Where the stick is pointing, in arena space, or null while it is not deflected. */
  aimPoint(from: Vec): Vec | null {
    const t = this.primary;
    if (t === null || !t.travelled) return null;
    const off = v(t.at.x - t.origin.x, t.at.y - t.origin.y);
    const l = Math.hypot(off.x, off.y);
    if (l <= STICK.deadzone) return null;
    return v(from.x + (off.x / l) * 100, from.y + (off.y / l) * 100);
  }

  /** A held second pointer is the focus. A quick one was a dash and must not slow time. */
  get focusing(): boolean {
    return this.secondary !== null && this.secondary.age > STICK.tapTime;
  }

  stickView(): StickView | null {
    const t = this.primary;
    if (t === null || !t.travelled) return null;
    return {
      origin: v(t.origin.x, t.origin.y),
      at: v(t.at.x, t.at.y),
      radius: STICK.radius,
      deadzone: STICK.deadzone,
    };
  }

  private find(id: number): Touch | null {
    if (this.primary !== null && this.primary.id === id) return this.primary;
    if (this.secondary !== null && this.secondary.id === id) return this.secondary;
    return null;
  }

  private clear(id: number): void {
    if (this.primary !== null && this.primary.id === id) this.primary = null;
    else if (this.secondary !== null && this.secondary.id === id) this.secondary = null;
  }
}
