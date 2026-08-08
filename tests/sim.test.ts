import { describe, expect, it } from 'vitest';
import { T } from '../src/sim/tuning';
import type { Input, World } from '../src/sim/types';
import { createWorld, startRun, step } from '../src/sim/world';
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

function fresh(seed = 7): World {
  const w = createWorld(seed);
  startRun(w, seed);
  return w;
}

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
  it('keeps the player inside the walls', () => {
    const w = fresh();
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
    expect(w.player.pos.x).toBeLessThanOrEqual(T.arena.w - T.arena.pad + 0.001);
    expect(w.player.pos.y).toBeLessThanOrEqual(T.arena.h - T.arena.pad + 0.001);
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
