import { describe, expect, it } from 'vitest';
import { T } from '../src/sim/tuning';
import type { Input, World } from '../src/sim/types';
import { PointerRig, STICK } from '../src/pointer';
import { arenaFor } from '../src/sim/arena';
import { createWorld, resizeArena, startRun, step } from '../src/sim/world';
import { v } from '../src/sim/vec';

function blank(): Input {
  return {
    move: v(0, 0),
    aimPoint: v(0, 0),
    dash: false,
    focus: false,
    choose: -1,
    confirm: false,
    seed: 9001,
    abandon: false,
  };
}

function run(w: World, frames: number, mut: (i: Input, f: number) => void = () => {}): void {
  for (let f = 0; f < frames; f++) {
    const i = blank();
    mut(i, f);
    step(w, i, T.dt);
  }
}

function fresh(seed = 7, view?: [number, number]): World {
  const w = createWorld(seed, view ? arenaFor(view[0], view[1]) : undefined);
  startRun(w, seed);
  return w;
}

/** A phone held upright: the shape the reference arena was never designed for. */
const PORTRAIT: [number, number] = [390, 844];

function fingerprint(w: World): string {
  return [
    w.frame,
    w.score,
    w.kills,
    w.combo,
    w.wave,
    w.enemies.length,
    w.player.hp,
    w.player.charges,
    w.player.pos.x.toFixed(4),
    w.player.pos.y.toFixed(4),
    w.enemies.map((e) => `${e.kind}:${e.pos.x.toFixed(2)},${e.pos.y.toFixed(2)}`).join('|'),
  ].join('/');
}

describe('determinism', () => {
  it('same seed and same inputs produce an identical world', () => {
    const script = (i: Input, f: number) => {
      i.move = v(Math.sin(f / 37), Math.cos(f / 23));
      i.aimPoint = v(500 + Math.cos(f / 19) * 300, 310 + Math.sin(f / 17) * 200);
      i.dash = f % 29 === 0;
      i.focus = f % 97 < 20;
      i.choose = 0;
    };
    const a = fresh(1234);
    const b = fresh(1234);
    run(a, 1800, script);
    run(b, 1800, script);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(a.frame).toBe(1800);
  });

  it('different seeds diverge', () => {
    const a = fresh(1);
    const b = fresh(2);
    run(a, 900);
    run(b, 900);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});

describe('dash', () => {
  it('kills an enemy it passes through and refunds the charge', () => {
    const w = fresh();
    w.enemies = [];
    w.spawnQueue = [];
    w.player.pos = v(200, 300);
    w.player.charges = 2;
    w.enemies.push({
      id: 999,
      kind: 'seeker',
      pos: v(280, 300),
      vel: v(0, 0),
      r: 13,
      speed: 0,
      spawnT: 0,
      timer: 0,
      phase: 0,
      facing: 0,
      arming: false,
      flash: 0,
      stun: 0,
    });

    run(w, 12, (i, f) => {
      i.aimPoint = v(900, 300);
      i.dash = f === 0;
    });

    expect(w.enemies.find((e) => e.id === 999)).toBeUndefined();
    expect(w.kills).toBe(1);
    expect(w.combo).toBe(1);
    expect(w.player.charges).toBe(2); // spent one, refunded one
    expect(w.score).toBeGreaterThan(0);
  });

  it('costs a charge and cannot fire with none', () => {
    const w = fresh();
    w.enemies = [];
    w.spawnQueue = [];
    w.player.charges = 1;
    run(w, 1, (i) => {
      i.aimPoint = v(900, 310);
      i.dash = true;
    });
    expect(w.player.charges).toBe(0);
    const posAfter = { ...w.player.pos };
    run(w, 20, (i) => {
      i.aimPoint = v(900, 310);
      i.dash = true;
    });
    // Only the first dash moved him; the rest were refused (no charges, nothing killed).
    expect(w.player.charges).toBe(0);
    expect(Math.abs(w.player.pos.x - posAfter.x)).toBeLessThan(T.player.dashLen);
  });

  it('is blocked by a warden shield facing the player', () => {
    const w = fresh();
    w.enemies = [];
    w.spawnQueue = [];
    w.player.pos = v(300, 300);
    w.enemies.push({
      id: 500,
      kind: 'warden',
      pos: v(400, 300),
      vel: v(0, 0),
      r: 16,
      speed: 0,
      spawnT: 0,
      timer: 0,
      phase: 0,
      facing: Math.PI, // shield points back at the player
      arming: false,
      flash: 0,
      stun: 0,
    });
    run(w, 10, (i, f) => {
      i.aimPoint = v(900, 300);
      i.dash = f === 0;
    });
    expect(w.enemies.find((e) => e.id === 500)).toBeDefined();
    expect(w.kills).toBe(0);
    expect(w.player.stun).toBeGreaterThan(0);
  });
});

describe('arena', () => {
  function shovePlayerAtTheWalls(w: World): void {
    run(w, 600, (i) => {
      i.move = v(-1, -1);
    });
    expect(w.player.pos.x).toBeGreaterThanOrEqual(T.arena.pad - 0.001);
    expect(w.player.pos.y).toBeGreaterThanOrEqual(T.arena.pad - 0.001);

    run(w, 600, (i, f) => {
      i.move = v(1, 1);
      i.aimPoint = v(5000, 5000);
      i.dash = f % 5 === 0;
    });
    expect(w.player.pos.x).toBeLessThanOrEqual(w.arena.w - T.arena.pad + 0.001);
    expect(w.player.pos.y).toBeLessThanOrEqual(w.arena.h - T.arena.pad + 0.001);
  }

  it('keeps the player inside the walls', () => {
    shovePlayerAtTheWalls(fresh());
  });

  it('keeps the player inside the walls in portrait too', () => {
    shovePlayerAtTheWalls(fresh(7, PORTRAIT));
  });

  it('spawns inside the arena in portrait', () => {
    const w = fresh(5, PORTRAIT);
    let seen = 0;
    for (let f = 0; f < 1200; f++) {
      step(w, blank(), T.dt);
      for (const e of w.enemies) {
        if (e.spawnT > T.wave.telegraph - T.dt * 1.5) {
          seen++;
          expect(e.pos.x).toBeGreaterThanOrEqual(T.wave.spawnPad - 0.001);
          expect(e.pos.x).toBeLessThanOrEqual(w.arena.w - T.wave.spawnPad + 0.001);
          expect(e.pos.y).toBeLessThanOrEqual(w.arena.h - T.wave.spawnPad + 0.001);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('arenaFor', () => {
  it('holds the area constant and borrows the viewport shape', () => {
    for (const [vw, vh] of [[1000, 620], [390, 844], [1920, 1080], [800, 800]]) {
      const a = arenaFor(vw!, vh!);
      // Rounding to whole units is the only slack allowed.
      expect(a.w * a.h).toBeGreaterThan(T.arena.area * 0.995);
      expect(a.w * a.h).toBeLessThan(T.arena.area * 1.005);
    }
    expect(arenaFor(1000, 620)).toEqual({ w: 1000, h: 620 });
    expect(arenaFor(390, 844).h).toBeGreaterThan(arenaFor(390, 844).w);
    expect(arenaFor(1920, 1080).w).toBeGreaterThan(arenaFor(1000, 620).w);
  });

  it('clamps the extremes so neither axis becomes a corridor', () => {
    // 9:32 and 32:9, the ends of the range Playables asks for.
    const tall = arenaFor(9, 32);
    const wide = arenaFor(32, 9);
    expect(tall.w / tall.h).toBeCloseTo(T.arena.minAspect, 2);
    expect(wide.w / wide.h).toBeCloseTo(T.arena.maxAspect, 2);
  });

  it('throws on a viewport that cannot exist', () => {
    expect(() => arenaFor(0, 600)).toThrow();
    expect(() => arenaFor(600, Number.NaN)).toThrow();
  });
});

describe('resizeArena', () => {
  it('keeps the run going and remaps everything to the same relative spot', () => {
    const w = fresh(11);
    // Play until the arena actually holds something worth remapping.
    for (let f = 0; f < 900 && w.enemies.length < 2; f++) {
      const i = blank();
      i.move = v(1, 0);
      step(w, i, T.dt);
    }
    expect(w.enemies.length).toBeGreaterThanOrEqual(2);

    // Off-centre but clear of the walls, so the remap is what is under test and
    // not the clamp that follows it.
    w.player.pos = v(w.arena.w * 0.3, w.arena.h * 0.7);

    const before = {
      score: w.score,
      wave: w.wave,
      kills: w.kills,
      hp: w.player.hp,
      enemies: w.enemies.length,
      relX: w.player.pos.x / w.arena.w,
      relY: w.player.pos.y / w.arena.h,
      enemyRel: w.enemies.map((e) => [e.pos.x / w.arena.w, e.pos.y / w.arena.h] as const),
    };

    resizeArena(w, arenaFor(PORTRAIT[0], PORTRAIT[1]));

    expect(w.score).toBe(before.score);
    expect(w.wave).toBe(before.wave);
    expect(w.kills).toBe(before.kills);
    expect(w.player.hp).toBe(before.hp);
    expect(w.enemies.length).toBe(before.enemies);
    expect(w.player.pos.x / w.arena.w).toBeCloseTo(before.relX, 5);
    expect(w.player.pos.y / w.arena.h).toBeCloseTo(before.relY, 5);
    w.enemies.forEach((e, i) => {
      expect(e.pos.x / w.arena.w).toBeCloseTo(before.enemyRel[i]![0], 5);
      expect(e.pos.y / w.arena.h).toBeCloseTo(before.enemyRel[i]![1], 5);
    });

    // And the run survives being played on afterwards.
    run(w, 300, (i, f) => {
      i.move = v(0, 1);
      i.dash = f % 20 === 0;
    });
    expect(w.player.pos.x).toBeLessThanOrEqual(w.arena.w - T.arena.pad + 0.001);
    expect(w.player.pos.y).toBeLessThanOrEqual(w.arena.h - T.arena.pad + 0.001);
  });

  it('never leaves the player outside the new walls', () => {
    const w = fresh(3);
    run(w, 400, (i) => {
      i.move = v(1, 1);
    });
    resizeArena(w, arenaFor(9, 32));
    expect(w.player.pos.x).toBeLessThanOrEqual(w.arena.w - T.arena.pad + 0.001);
    expect(w.player.pos.y).toBeLessThanOrEqual(w.arena.h - T.arena.pad + 0.001);
  });

  it('rejects an impossible arena', () => {
    expect(() => resizeArena(fresh(), { w: 0, h: 400 })).toThrow();
  });
});

describe('waves', () => {
  it('starts wave 1 and eventually queues enemies', () => {
    const w = fresh();
    run(w, 200);
    expect(w.wave).toBe(1);
    expect(w.enemies.length + w.spawnQueue.length).toBeGreaterThan(0);
  });

  it('offers mutations after the third wave is cleared', () => {
    const w = fresh(42);
    // Clear waves by deleting everything the sim spawns.
    for (let f = 0; f < 4000 && w.phase === 'playing'; f++) {
      w.enemies.length = 0;
      w.spawnQueue.length = 0;
      step(w, blank(), T.dt);
    }
    expect(w.phase).toBe('choosing');
    expect(w.wave).toBe(T.wave.mutationEvery);
    expect(w.choices.length).toBe(3);
  });
});

describe('pressure', () => {
  it('later waves send bigger budgets and bigger bursts', () => {
    const early = fresh(3);
    run(early, 120);
    const earlyQueued = early.spawnQueue.length + early.enemies.length;

    const late = fresh(3);
    // Skip ahead by clearing each wave the instant it starts.
    for (let f = 0; f < 6000 && late.wave < 12; f++) {
      late.enemies.length = 0;
      const i = blank();
      i.choose = 0;
      step(late, i, T.dt);
    }
    // Let wave 12 actually queue up.
    late.enemies.length = 0;
    run(late, 10, (i) => {
      i.choose = 0;
    });
    const lateQueued = late.spawnQueue.length + late.enemies.length;

    expect(late.wave).toBeGreaterThanOrEqual(12);
    expect(lateQueued).toBeGreaterThan(earlyQueued * 3);
  });

  it('spawns never land under the HUD corners', () => {
    const w = fresh(5);
    let seen = 0;
    for (let f = 0; f < 1200; f++) {
      step(w, blank(), T.dt);
      for (const e of w.enemies) {
        if (e.spawnT > T.wave.telegraph - T.dt * 1.5) {
          seen++;
          expect(e.pos.x).toBeGreaterThanOrEqual(T.wave.spawnPad - 0.001);
          expect(e.pos.y).toBeGreaterThanOrEqual(T.wave.spawnPad - 0.001);
          expect(e.pos.x).toBeLessThanOrEqual(w.arena.w - T.wave.spawnPad + 0.001);
          expect(e.pos.y).toBeLessThanOrEqual(w.arena.h - T.wave.spawnPad + 0.001);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('damage', () => {
  it('a touching enemy costs one hit point, then i-frames protect', () => {
    const w = fresh();
    w.spawnQueue = [];
    w.enemies = [
      {
        id: 1,
        kind: 'seeker',
        pos: v(w.player.pos.x + 4, w.player.pos.y),
        vel: v(0, 0),
        r: 13,
        speed: 0,
        spawnT: 0,
        timer: 0,
        phase: 0,
        facing: 0,
        arming: false,
        flash: 0,
        stun: 0,
      },
    ];
    const hp0 = w.player.hp;
    run(w, 30);
    expect(w.player.hp).toBe(hp0 - 1);
    expect(w.player.iframes).toBeGreaterThan(0);
  });

  it('abandoning ends the run on the spot', () => {
    const w = fresh();
    run(w, 200);
    expect(w.phase).toBe('playing');
    run(w, 1, (i) => {
      i.abandon = true;
    });
    expect(w.phase).toBe('dead');
    expect(w.player.hp).toBe(0);
  });

  it('running out of hit points ends the run', () => {
    const w = fresh();
    w.player.hp = 1;
    w.spawnQueue = [];
    w.enemies = [
      {
        id: 1,
        kind: 'seeker',
        pos: { ...w.player.pos },
        vel: v(0, 0),
        r: 13,
        speed: 0,
        spawnT: 0,
        timer: 0,
        phase: 0,
        facing: 0,
        arming: false,
        flash: 0,
        stun: 0,
      },
    ];
    run(w, 40);
    expect(w.phase).toBe('dead');
  });
});

describe('pointer', () => {
  const at = (x: number, y: number) => v(x, y);

  it('a press that never travels is a tap, and a tap is the dash', () => {
    const r = new PointerRig();
    r.down(1, at(200, 200), true);
    r.tick(0.1);
    r.move(1, at(204, 203));
    r.up(1);
    expect(r.dash).toBe(true);
  });

  it('a press held too long is not a tap', () => {
    const r = new PointerRig();
    r.down(1, at(200, 200), true);
    r.tick(STICK.tapTime + 0.05);
    r.up(1);
    expect(r.dash).toBe(false);
  });

  it('a drag is a stick, not a tap', () => {
    const r = new PointerRig();
    r.down(1, at(200, 200), true);
    r.move(1, at(200 + STICK.radius, 200));
    const m = r.moveVector();
    expect(m.x).toBeCloseTo(1, 5);
    expect(m.y).toBeCloseTo(0, 5);
    r.up(1);
    expect(r.dash).toBe(false);
  });

  it('is analog: half deflection walks, full deflection runs', () => {
    const r = new PointerRig();
    r.down(1, at(0, 0), true);
    const half = STICK.deadzone + (STICK.radius - STICK.deadzone) / 2;
    r.move(1, at(0, half));
    expect(Math.hypot(r.moveVector().x, r.moveVector().y)).toBeCloseTo(0.5, 5);
    r.move(1, at(0, STICK.radius * 4));
    expect(Math.hypot(r.moveVector().x, r.moveVector().y)).toBeCloseTo(1, 5);
  });

  it('inside the deadzone it neither moves nor aims', () => {
    const r = new PointerRig();
    r.down(1, at(100, 100), true);
    r.move(1, at(100 + STICK.radius, 100));
    r.move(1, at(100 + STICK.deadzone - 1, 100));
    expect(r.moveVector()).toEqual(v(0, 0));
    expect(r.aimPoint(v(0, 0))).toBeNull();
  });

  it('drags the origin along past full deflection, so direction stays live', () => {
    const r = new PointerRig();
    r.down(1, at(0, 0), true);
    r.move(1, at(400, 0));
    // A thumb that wandered far right and then swept up. Measured from where the press
    // landed this would read 45 degrees; measured from the trailed origin it reads up,
    // which is the direction the thumb actually swept.
    r.move(1, at(400, -400));
    const m = r.moveVector();
    expect(m.y).toBeLessThan(-0.95);
    expect(Math.abs(m.x)).toBeLessThan(0.25);
  });

  it('aims along the stick, one hundred units out from the player', () => {
    const r = new PointerRig();
    r.down(1, at(0, 0), true);
    r.move(1, at(0, -STICK.radius));
    const aim = r.aimPoint(v(500, 300))!;
    expect(aim.x).toBeCloseTo(500, 5);
    expect(aim.y).toBeCloseTo(200, 5);
  });

  it('a second pointer dashes on press and holds the focus, a quick one does not', () => {
    const r = new PointerRig();
    r.down(1, at(100, 100), true);
    r.move(1, at(160, 100));

    r.down(2, at(400, 400), true);
    expect(r.dash).toBe(true);
    expect(r.focusing).toBe(false);
    r.tick(STICK.tapTime + 0.01);
    expect(r.focusing).toBe(true);

    // And the stick under the other thumb never stopped working.
    expect(r.moveVector().x).toBeGreaterThan(0);
    r.up(2);
    expect(r.focusing).toBe(false);
  });

  it('does not dash twice for a mouse, which already dashed on press', () => {
    const r = new PointerRig();
    r.down(1, at(200, 200), false);
    r.tick(0.05);
    r.up(1);
    expect(r.dash).toBe(false);
  });

  it('a cancelled pointer fires nothing and leaves no stick behind', () => {
    const r = new PointerRig();
    r.down(1, at(200, 200), true);
    r.move(1, at(300, 200));
    r.cancel(1);
    expect(r.dash).toBe(false);
    expect(r.moveVector()).toEqual(v(0, 0));
    expect(r.stickView()).toBeNull();
  });

  it('release clears every live pointer', () => {
    const r = new PointerRig();
    r.down(1, at(0, 0), true);
    r.move(1, at(100, 0));
    r.down(2, at(300, 300), true);
    r.dash = false;
    r.release();
    r.tick(1);
    expect(r.focusing).toBe(false);
    expect(r.moveVector()).toEqual(v(0, 0));
    expect(r.dash).toBe(false);
  });
});

describe('analog movement', () => {
  it('a half-deflected stick tops out slower than a full one', () => {
    const speedFor = (mag: number): number => {
      const w = fresh();
      w.spawnQueue = [];
      w.enemies = [];
      run(w, 240, (i) => {
        i.move = v(mag, 0);
      });
      return Math.hypot(w.player.vel.x, w.player.vel.y);
    };
    const half = speedFor(0.5);
    const full = speedFor(1);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full * 0.75);
  });

  it('an over-long move vector is clamped, not amplified', () => {
    const w = fresh();
    w.spawnQueue = [];
    w.enemies = [];
    run(w, 240, (i) => {
      i.move = v(9, 0);
    });
    const fast = Math.hypot(w.player.vel.x, w.player.vel.y);

    const w2 = fresh();
    w2.spawnQueue = [];
    w2.enemies = [];
    run(w2, 240, (i) => {
      i.move = v(1, 0);
    });
    expect(fast).toBeCloseTo(Math.hypot(w2.player.vel.x, w2.player.vel.y), 5);
  });
});
