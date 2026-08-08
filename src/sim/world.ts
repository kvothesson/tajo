import { Rng } from '../rng';
import { ENEMY_COLOR, C } from '../render/palette';
import { MUTATIONS } from './mutations';
import { T } from './tuning';
import type {
  Enemy,
  EnemyKind,
  Input,
  Mutation,
  MutationId,
  Projectile,
  Vec,
  World,
} from './types';
import {
  add,
  angleDiff,
  angleOf,
  clamp,
  clone,
  dist,
  dist2,
  distToSeg2,
  fromAngle,
  norm,
  scale,
  sub,
  v,
} from './vec';

// ---------------------------------------------------------------- creation

export function createWorld(seed = 1): World {
  const w: World = {
    seed,
    rng: new Rng(seed),
    t: 0,
    frame: 0,
    phase: 'title',
    arena: { w: T.arena.w, h: T.arena.h },

    player: makePlayer(),
    enemies: [],
    projectiles: [],
    particles: [],
    slashes: [],
    burns: [],
    pickups: [],
    texts: [],
    rings: [],

    wave: 0,
    waveActive: false,
    waveTimer: 0,
    spawnQueue: [],
    spawnClock: 0,

    combo: 0,
    comboTimer: 0,
    comboBest: 0,
    score: 0,
    kills: 0,

    mutations: [],
    choices: [],

    shake: 0,
    hitstop: 0,
    flashWhite: 0,
    timeScale: 1,
    deadTimer: 0,
    gridPulse: 0,

    nextId: 1,
    sfx: [],
  };
  return w;
}

function makePlayer() {
  return {
    pos: v(T.arena.w / 2, T.arena.h / 2),
    vel: v(0, 0),
    aim: -Math.PI / 2,
    hp: T.player.maxHp,
    maxHp: T.player.maxHp,
    iframes: 0,
    charges: T.player.maxCharges,
    maxCharges: T.player.maxCharges,
    regen: 0,
    focus: 1,
    focusing: false,
    dashing: false,
    dashDir: v(1, 0),
    dashRemaining: 0,
    dashStart: v(0, 0),
    dashHits: [] as number[],
    recovery: 0,
    stun: 0,
    killsSinceRepair: 0,
    novaReady: true,
    overclock: 0,
    nextOverclock: T.combo.threshold,
  };
}

export function startRun(w: World, seed: number): void {
  w.seed = seed;
  w.rng = new Rng(seed);
  w.t = 0;
  w.phase = 'playing';
  w.player = makePlayer();
  w.enemies = [];
  w.projectiles = [];
  w.particles = [];
  w.slashes = [];
  w.burns = [];
  w.pickups = [];
  w.texts = [];
  w.rings = [];
  w.wave = 0;
  w.waveActive = false;
  w.waveTimer = 0.9;
  w.spawnQueue = [];
  w.spawnClock = 0;
  w.combo = 0;
  w.comboTimer = 0;
  w.comboBest = 0;
  w.score = 0;
  w.kills = 0;
  w.mutations = [];
  w.choices = [];
  w.shake = 0;
  w.hitstop = 0;
  w.flashWhite = 0;
  w.timeScale = 1;
  w.deadTimer = 0;
  w.gridPulse = 0;
  w.nextId = 1;
  w.sfx.push({ t: 'start' });
}

// ---------------------------------------------------------------- mutations

const has = (w: World, id: MutationId): boolean => w.mutations.includes(id);

function dashLength(w: World): number {
  return T.player.dashLen * (has(w, 'long_blade') ? 1.4 : 1);
}

function moveSpeed(w: World): number {
  return T.player.maxSpeed * (has(w, 'momentum') ? 1.25 : 1);
}

function scoreMult(w: World): number {
  const combo = 1 + Math.min(w.combo, 40) * 0.1;
  return combo * (has(w, 'greed') ? 1.5 : 1);
}

// ---------------------------------------------------------------- main step

/** Advances the simulation by exactly `dt` seconds. Pure w.r.t. (world, input). */
export function step(w: World, input: Input, dt: number): void {
  w.frame++;
  w.sfx.length > 400 && (w.sfx.length = 0);

  if (w.hitstop > 0) {
    w.hitstop -= dt;
    w.shake = Math.max(0, w.shake - T.fx.shakeDecay * dt * 0.4);
    return;
  }

  w.t += dt;
  w.shake = Math.max(0, w.shake - T.fx.shakeDecay * dt * (1 + w.shake * 0.08));
  w.flashWhite = Math.max(0, w.flashWhite - dt * 5);
  w.gridPulse = Math.max(0, w.gridPulse - dt * 2.6);

  switch (w.phase) {
    case 'title':
      stepAmbient(w, dt);
      if (input.confirm || input.dash) startRun(w, input.seed >>> 0);
      return;

    case 'choosing':
      stepDecay(w, dt);
      if (input.abandon) {
        w.player.hp = 0;
        w.phase = 'dead';
        w.deadTimer = 0;
        w.sfx.push({ t: 'dead' });
        return;
      }
      if (input.choose >= 0 && input.choose < w.choices.length) {
        const m = w.choices[input.choose]!;
        w.mutations.push(m.id);
        applyMutationImmediate(w, m.id);
        w.choices = [];
        w.phase = 'playing';
        w.waveTimer = 0.7;
        w.sfx.push({ t: 'choose' });
        pushText(w, w.player.pos, m.name, m.color);
      }
      return;

    case 'dead':
      w.deadTimer += dt;
      stepDecay(w, dt);
      stepEnemies(w, dt * 0.5);
      w.timeScale = 0.4;
      if (w.deadTimer > 0.9 && (input.confirm || input.dash)) {
        startRun(w, input.seed >>> 0);
      }
      return;

    case 'playing':
      break;
  }

  if (input.abandon) {
    w.player.hp = 0;
    w.phase = 'dead';
    w.deadTimer = 0;
    w.sfx.push({ t: 'dead' });
    return;
  }

  const realDt = dt / Math.max(w.timeScale, 0.05);

  stepPlayer(w, input, dt, realDt);
  stepEnemies(w, dt);
  stepProjectiles(w, dt);
  stepBurns(w, dt);
  stepPickups(w, dt);
  stepCollisions(w, dt);
  stepWave(w, dt);
  stepDecay(w, dt);

  if (w.comboTimer > 0) {
    w.comboTimer -= dt;
    if (w.comboTimer <= 0) w.combo = 0;
  }

  w.timeScale = w.player.focusing ? T.focus.scale : 1;
}

/** Slow drifting enemies behind the title card. */
function stepAmbient(w: World, dt: number): void {
  if (w.enemies.length < 9 && w.rng.next() < 0.02) {
    const kinds: EnemyKind[] = ['seeker', 'weaver', 'splitter', 'warden', 'spitter', 'bomber'];
    const e = makeEnemy(w, w.rng.pick(kinds), v(w.rng.range(60, w.arena.w - 60), -30));
    e.spawnT = 0;
    e.vel = v(w.rng.range(-14, 14), w.rng.range(22, 46));
    w.enemies.push(e);
  }
  for (const e of w.enemies) {
    e.pos = add(e.pos, scale(e.vel, dt));
    e.phase += dt;
    e.facing += dt * 0.4;
  }
  w.enemies = w.enemies.filter((e) => e.pos.y < w.arena.h + 60);
  stepDecay(w, dt);
  w.timeScale = 1;
}

// ---------------------------------------------------------------- player

function stepPlayer(w: World, input: Input, dt: number, realDt: number): void {
  const p = w.player;

  p.iframes = Math.max(0, p.iframes - dt);
  p.recovery = Math.max(0, p.recovery - dt);
  p.stun = Math.max(0, p.stun - dt);
  p.overclock = Math.max(0, p.overclock - dt);

  // Aim
  const toAim = sub(input.aimPoint, p.pos);
  if (dist2(toAim, v(0, 0)) > 4) p.aim = angleOf(toAim);

  // Focus (drains in real time so slow-mo cannot be free)
  const wantFocus = input.focus && p.focus > 0 && !p.dashing;
  const drain = T.focus.drain * (has(w, 'focus_battery') ? 0.5 : 1);
  const refill = T.focus.refill * (has(w, 'focus_battery') ? 1.5 : 1);
  if (wantFocus) {
    p.focusing = true;
    p.focus = Math.max(0, p.focus - drain * realDt);
  } else {
    p.focusing = false;
    p.focus = Math.min(1, p.focus + refill * realDt);
  }

  // Charge regen
  if (p.charges < p.maxCharges) {
    p.regen += dt;
    if (p.regen >= T.player.regenTime) {
      p.regen = 0;
      p.charges++;
    }
  } else {
    p.regen = 0;
  }

  // Dash start
  const canDash = !p.dashing && p.recovery <= 0 && p.stun <= 0;
  const freeDash = p.overclock > 0;
  if (input.dash && canDash && (freeDash || p.charges > 0)) {
    if (!freeDash) p.charges--;
    p.dashing = true;
    p.dashDir = fromAngle(p.aim);
    p.dashRemaining = dashLength(w);
    p.dashStart = clone(p.pos);
    p.dashHits = [];
    p.focusing = false;
    w.shake += T.fx.shakeDash;
    w.sfx.push({ t: 'dash' });
    for (let i = 0; i < 8; i++) {
      const a = p.aim + Math.PI + w.rng.range(-0.6, 0.6);
      burstOne(w, p.pos, a, w.rng.range(60, 190), C.cyan, w.rng.range(0.15, 0.35), 2.2);
    }
  }

  if (p.dashing) {
    const speed = dashLength(w) / T.player.dashDur;
    const stepDist = Math.min(speed * dt, p.dashRemaining);
    const prev = clone(p.pos);
    let next = add(p.pos, scale(p.dashDir, stepDist));
    p.dashRemaining -= stepDist;

    // Walls stop the dash.
    const pad = T.arena.pad;
    let hitWall = false;
    if (next.x < pad || next.x > w.arena.w - pad || next.y < pad || next.y > w.arena.h - pad) {
      hitWall = true;
      next = v(clamp(next.x, pad, w.arena.w - pad), clamp(next.y, pad, w.arena.h - pad));
    }
    p.pos = next;

    resolveDashHits(w, prev, next);

    if (hitWall) {
      p.dashRemaining = 0;
      w.shake += 2.4;
      w.rings.push({
        pos: clone(next),
        r: 6,
        maxR: 44,
        life: 0.28,
        maxLife: 0.28,
        color: C.cyan,
      });
    }

    if (p.dashRemaining <= 0.0001) {
      p.dashing = false;
      p.recovery = T.player.recovery * (has(w, 'momentum') ? 0.7 : 1);
      p.vel = scale(p.dashDir, 180);
      w.slashes.push({
        a: clone(p.dashStart),
        b: clone(p.pos),
        life: 0.3,
        maxLife: 0.3,
      });
      if (has(w, 'afterburn')) {
        const total = dist(p.dashStart, p.pos);
        const n = Math.max(2, Math.round(total / 26));
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          w.burns.push({
            pos: v(
              p.dashStart.x + (p.pos.x - p.dashStart.x) * u,
              p.dashStart.y + (p.pos.y - p.dashStart.y) * u,
            ),
            r: 21,
            life: 1.4,
            hits: [],
          });
        }
      }
    }
    return;
  }

  // Walking
  const accel = p.stun > 0 ? 0 : T.player.accel;
  const mv = norm(input.move);
  p.vel = add(p.vel, scale(mv, accel * dt));
  const damp = Math.exp(-T.player.friction * dt);
  p.vel = scale(p.vel, damp);
  const max = moveSpeed(w);
  const sp = Math.hypot(p.vel.x, p.vel.y);
  if (sp > max) p.vel = scale(p.vel, max / sp);
  p.pos = add(p.pos, scale(p.vel, dt));

  const pad = T.arena.pad;
  p.pos.x = clamp(p.pos.x, pad, w.arena.w - pad);
  p.pos.y = clamp(p.pos.y, pad, w.arena.h - pad);
}

function resolveDashHits(w: World, a: Vec, b: Vec): void {
  const p = w.player;
  const reach = T.player.dashRadius;
  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const e = w.enemies[i]!;
    if (e.spawnT > 0) continue;
    if (p.dashHits.includes(e.id)) continue;
    const rr = reach + e.r;
    if (distToSeg2(e.pos, a, b) > rr * rr) continue;

    if (e.kind === 'warden' && !has(w, 'phase')) {
      const toPlayer = angleOf(sub(p.pos, e.pos));
      if (Math.abs(angleDiff(e.facing, toPlayer)) < T.warden.arc) {
        // Blocked.
        p.dashHits.push(e.id);
        p.dashing = false;
        p.dashRemaining = 0;
        p.stun = T.player.blockStun;
        p.recovery = T.player.blockStun;
        p.vel = scale(p.dashDir, -T.player.blockKnock);
        e.flash = 0.35;
        w.shake += 7;
        w.hitstop = Math.max(w.hitstop, 0.06);
        w.sfx.push({ t: 'block' });
        pushText(w, e.pos, 'ESCUDO', C.green);
        w.rings.push({ pos: clone(e.pos), r: e.r, maxR: 52, life: 0.3, maxLife: 0.3, color: C.green });
        return;
      }
    }

    p.dashHits.push(e.id);
    killEnemy(w, i, 'dash');
    if (has(w, 'chain')) p.dashRemaining += T.player.dashLen * 0.3;
  }
}

// ---------------------------------------------------------------- enemies

function makeEnemy(w: World, kind: EnemyKind, pos: Vec): Enemy {
  const base = T.enemy[kind];
  const boost = 1 + Math.min(w.wave * T.wave.speedScale, T.wave.speedScaleMax);
  return {
    id: w.nextId++,
    kind,
    pos: clone(pos),
    vel: v(0, 0),
    r: base.r,
    speed: base.speed * boost,
    spawnT: T.wave.telegraph,
    timer: kind === 'spitter' ? w.rng.range(0.5, T.spitter.cooldown) : 0,
    phase: w.rng.angle(),
    facing: w.rng.angle(),
    arming: false,
    flash: 0,
    stun: 0,
  };
}

function stepEnemies(w: World, dt: number): void {
  const p = w.player;
  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const e = w.enemies[i]!;
    e.flash = Math.max(0, e.flash - dt * 3);
    e.phase += dt;

    if (e.spawnT > 0) {
      e.spawnT -= dt;
      continue;
    }

    const to = sub(p.pos, e.pos);
    const d = Math.hypot(to.x, to.y) || 1;
    const dir = v(to.x / d, to.y / d);

    switch (e.kind) {
      case 'seeker':
      case 'shard':
        e.vel = scale(dir, e.speed);
        break;

      case 'weaver': {
        const perp = v(-dir.y, dir.x);
        const s = Math.sin(e.phase * 6.5 + e.id) * 0.85;
        e.vel = add(scale(dir, e.speed), scale(perp, e.speed * s));
        break;
      }

      case 'splitter':
        e.vel = scale(dir, e.speed);
        break;

      case 'warden': {
        e.vel = scale(dir, e.speed);
        const want = angleOf(to);
        e.facing += clamp(angleDiff(e.facing, want), -T.warden.turnRate * dt, T.warden.turnRate * dt);
        break;
      }

      case 'spitter': {
        const keep = T.spitter.keepDist;
        if (d < keep * 0.85) e.vel = scale(dir, -e.speed);
        else if (d > keep * 1.2) e.vel = scale(dir, e.speed);
        else e.vel = scale(v(-dir.y, dir.x), e.speed * 0.9);
        e.timer -= dt;
        if (e.timer <= 0) {
          e.timer = T.spitter.cooldown;
          w.projectiles.push({
            pos: clone(e.pos),
            vel: scale(dir, T.spitter.bulletSpeed),
            r: T.spitter.bulletR,
            life: 4,
            friendly: false,
          });
          w.sfx.push({ t: 'shoot' });
        }
        break;
      }

      case 'bomber': {
        if (!e.arming && d < T.bomber.trigger) {
          e.arming = true;
          e.timer = T.bomber.fuse;
        }
        e.vel = scale(dir, e.arming ? e.speed * 0.22 : e.speed);
        if (e.arming) {
          e.timer -= dt;
          if (e.timer <= 0) {
            detonate(w, i);
            continue;
          }
        }
        break;
      }
    }

    e.pos = add(e.pos, scale(e.vel, dt));
    const m = 40;
    e.pos.x = clamp(e.pos.x, -m, w.arena.w + m);
    e.pos.y = clamp(e.pos.y, -m, w.arena.h + m);
  }
}

function detonate(w: World, index: number): void {
  const e = w.enemies[index]!;
  const at = clone(e.pos);
  w.enemies.splice(index, 1);

  w.rings.push({ pos: clone(at), r: 10, maxR: T.bomber.blastR, life: 0.4, maxLife: 0.4, color: C.orange });
  for (let i = 0; i < 26; i++) {
    burstOne(w, at, w.rng.angle(), w.rng.range(120, 420), C.orange, w.rng.range(0.25, 0.6), 3);
  }
  w.shake += T.fx.shakeBoom;
  w.hitstop = Math.max(w.hitstop, 0.05);
  w.sfx.push({ t: 'boom' });
  w.gridPulse = 1;

  // The blast is indiscriminate: it clears other enemies too.
  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const o = w.enemies[i]!;
    if (o.spawnT > 0) continue;
    if (dist(o.pos, at) < T.bomber.blastR + o.r) killEnemy(w, i, 'blast');
  }

  const p = w.player;
  if (!p.dashing && p.iframes <= 0 && dist(p.pos, at) < T.bomber.blastR + T.player.r) {
    hurtPlayer(w);
  }
}

// ---------------------------------------------------------------- kills

function killEnemy(w: World, index: number, cause: 'dash' | 'blast' | 'shard' | 'burn'): void {
  const e = w.enemies[index]!;
  w.enemies.splice(index, 1);

  const color = ENEMY_COLOR[e.kind];
  const base = T.enemy[e.kind].score;

  w.combo++;
  w.comboTimer = T.combo.window;
  w.comboBest = Math.max(w.comboBest, w.combo);
  const gained = Math.round(base * scoreMult(w));
  w.score += gained;
  w.kills++;
  w.player.killsSinceRepair++;

  const p = w.player;
  let refund = 1;
  if (has(w, 'siphon') && w.combo >= 8) refund = 2;
  p.charges = Math.min(p.maxCharges, p.charges + refund);

  w.hitstop = Math.max(w.hitstop, T.fx.hitstopKill);
  w.shake += T.fx.shakeKill;
  w.gridPulse = Math.max(w.gridPulse, 0.7);
  w.sfx.push({ t: 'kill', combo: w.combo });

  for (let i = 0; i < 14; i++) {
    burstOne(w, e.pos, w.rng.angle(), w.rng.range(70, 330), color, w.rng.range(0.2, 0.5), 2.6);
  }
  w.rings.push({ pos: clone(e.pos), r: e.r, maxR: e.r + 34, life: 0.24, maxLife: 0.24, color });
  if (w.combo >= 4) pushText(w, e.pos, `+${gained}`, w.combo >= 12 ? C.gold : color);

  if (e.kind === 'splitter') {
    for (let s = 0; s < 2; s++) {
      const child = makeEnemy(w, 'shard', e.pos);
      child.spawnT = 0;
      const a = w.rng.angle();
      child.pos = add(child.pos, fromAngle(a, 14));
      child.vel = fromAngle(a, 160);
      w.enemies.push(child);
    }
  }

  if (has(w, 'shrapnel') && cause !== 'shard') {
    for (let s = 0; s < 5; s++) {
      const a = (s / 5) * Math.PI * 2 + w.rng.range(-0.3, 0.3);
      w.projectiles.push({
        pos: clone(e.pos),
        vel: fromAngle(a, 320),
        r: 6,
        life: 0.75,
        friendly: true,
      });
    }
  }

  if (has(w, 'bloodline') && p.killsSinceRepair >= 12 && p.hp < p.maxHp) {
    p.killsSinceRepair = 0;
    w.pickups.push({ pos: clone(e.pos), life: 12, bob: w.rng.angle() });
  }

  if (w.combo >= p.nextOverclock) {
    p.nextOverclock += T.combo.step;
    p.overclock = T.combo.duration;
    p.charges = p.maxCharges;
    w.flashWhite = 0.5;
    w.shake += 6;
    w.sfx.push({ t: 'overclock' });
    pushText(w, add(p.pos, v(0, -34)), 'OVERCLOCK', C.gold);
  }
}

function hurtPlayer(w: World): void {
  const p = w.player;
  if (p.iframes > 0 || p.dashing) return;

  p.hp--;
  p.iframes = T.player.iframes;
  w.combo = 0;
  w.comboTimer = 0;
  p.nextOverclock = T.combo.threshold;
  w.shake += T.fx.shakeHurt;
  w.hitstop = Math.max(w.hitstop, T.fx.hitstopHurt);
  w.flashWhite = 0.7;
  w.sfx.push({ t: 'hurt' });

  for (let i = 0; i < 22; i++) {
    burstOne(w, p.pos, w.rng.angle(), w.rng.range(90, 300), C.red, w.rng.range(0.2, 0.5), 3);
  }
  w.rings.push({ pos: clone(p.pos), r: 12, maxR: 150, life: 0.35, maxLife: 0.35, color: C.red });

  // Panic shove so a swarm cannot chain-hit through the i-frames.
  const lethal = has(w, 'nova') && p.novaReady;
  if (lethal) {
    p.novaReady = false;
    w.rings.push({ pos: clone(p.pos), r: 16, maxR: 210, life: 0.45, maxLife: 0.45, color: C.gold });
    pushText(w, add(p.pos, v(0, -30)), 'NOVA', C.gold);
  }
  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const e = w.enemies[i]!;
    const d = dist(e.pos, p.pos);
    if (d > (lethal ? 210 : 165)) continue;
    if (lethal && e.spawnT <= 0) {
      killEnemy(w, i, 'blast');
      continue;
    }
    const dir = norm(sub(e.pos, p.pos));
    e.pos = add(e.pos, scale(dir, 62));
    e.vel = scale(dir, 200);
  }
  w.projectiles = w.projectiles.filter((b) => b.friendly || dist(b.pos, p.pos) > 150);

  if (p.hp <= 0) {
    w.phase = 'dead';
    w.deadTimer = 0;
    w.shake += 26;
    w.flashWhite = 1;
    w.hitstop = Math.max(w.hitstop, 0.2);
    w.sfx.push({ t: 'dead' });
    for (let i = 0; i < 70; i++) {
      burstOne(w, p.pos, w.rng.angle(), w.rng.range(60, 520), i % 3 ? C.cyan : C.player, w.rng.range(0.4, 1.2), 3.4);
    }
  }
}

// ---------------------------------------------------------------- other bodies

function stepProjectiles(w: World, dt: number): void {
  for (let i = w.projectiles.length - 1; i >= 0; i--) {
    const b = w.projectiles[i]!;
    b.pos = add(b.pos, scale(b.vel, dt));
    b.life -= dt;
    if (b.friendly) b.vel = scale(b.vel, Math.exp(-2.2 * dt));
    const out =
      b.pos.x < -40 || b.pos.x > w.arena.w + 40 || b.pos.y < -40 || b.pos.y > w.arena.h + 40;
    if (b.life <= 0 || out) w.projectiles.splice(i, 1);
  }
}

function stepBurns(w: World, dt: number): void {
  for (let i = w.burns.length - 1; i >= 0; i--) {
    const b = w.burns[i]!;
    b.life -= dt;
    if (b.life <= 0) w.burns.splice(i, 1);
  }
}

function stepPickups(w: World, dt: number): void {
  const p = w.player;
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    const k = w.pickups[i]!;
    k.life -= dt;
    k.bob += dt * 3;
    if (k.life <= 0) {
      w.pickups.splice(i, 1);
      continue;
    }
    if (dist(k.pos, p.pos) < 30) {
      w.pickups.splice(i, 1);
      p.hp = Math.min(p.maxHp, p.hp + 1);
      w.sfx.push({ t: 'pickup' });
      pushText(w, p.pos, 'REPARADO', C.green);
      w.rings.push({ pos: clone(p.pos), r: 10, maxR: 60, life: 0.35, maxLife: 0.35, color: C.green });
    }
  }
}

function stepCollisions(w: World, _dt: number): void {
  const p = w.player;

  // Friendly shrapnel and burn trails clear enemies.
  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const e = w.enemies[i]!;
    if (e.spawnT > 0) continue;

    let killed = false;
    for (let j = w.projectiles.length - 1; j >= 0 && !killed; j--) {
      const b = w.projectiles[j]!;
      if (!b.friendly) continue;
      if (dist2(b.pos, e.pos) < (b.r + e.r) * (b.r + e.r)) {
        w.projectiles.splice(j, 1);
        killEnemy(w, i, 'shard');
        killed = true;
      }
    }
    if (killed) continue;

    for (const bn of w.burns) {
      if (bn.hits.includes(e.id)) continue;
      if (dist2(bn.pos, e.pos) < (bn.r + e.r) * (bn.r + e.r)) {
        bn.hits.push(e.id);
        killEnemy(w, i, 'burn');
        break;
      }
    }
  }

  if (p.dashing || p.iframes > 0) return;

  for (const e of w.enemies) {
    if (e.spawnT > 0) continue;
    if (dist2(e.pos, p.pos) < (e.r + T.player.r) * (e.r + T.player.r)) {
      hurtPlayer(w);
      return;
    }
  }

  for (let i = w.projectiles.length - 1; i >= 0; i--) {
    const b = w.projectiles[i]!;
    if (b.friendly) continue;
    if (dist2(b.pos, p.pos) < (b.r + T.player.r) * (b.r + T.player.r)) {
      w.projectiles.splice(i, 1);
      hurtPlayer(w);
      return;
    }
  }
}

// ---------------------------------------------------------------- waves

const UNLOCK: { wave: number; kind: EnemyKind }[] = [
  { wave: 1, kind: 'seeker' },
  { wave: 2, kind: 'weaver' },
  { wave: 3, kind: 'splitter' },
  { wave: 4, kind: 'spitter' },
  { wave: 5, kind: 'warden' },
  { wave: 6, kind: 'bomber' },
];

function stepWave(w: World, dt: number): void {
  if (!w.waveActive) {
    w.waveTimer -= dt;
    if (w.waveTimer <= 0) startWave(w, w.wave + 1);
    return;
  }

  w.spawnClock -= dt;
  const gap = Math.max(T.wave.spawnGapMin, T.wave.spawnGap - w.wave * T.wave.spawnGapDecay);
  if (w.spawnQueue.length > 0 && w.spawnClock <= 0 && w.enemies.length < T.wave.maxAlive) {
    const burst = Math.min(
      T.wave.burstMax,
      Math.floor(T.wave.burstBase + w.wave * T.wave.burstPerWave),
    );
    for (let i = 0; i < burst && w.enemies.length < T.wave.maxAlive; i++) {
      const order = w.spawnQueue.shift();
      if (!order) break;
      spawnAtEdge(w, order.kind);
    }
    w.spawnClock = gap;
  }

  if (w.spawnQueue.length === 0 && w.enemies.length === 0) {
    w.waveActive = false;
    const bonus = T.score.waveBonus * w.wave;
    w.score += bonus;
    pushText(w, v(w.arena.w / 2, w.arena.h / 2 - 60), `OLA ${w.wave} LIMPIA  +${bonus}`, C.gold);
    w.player.novaReady = true;

    if (w.wave % T.wave.mutationEvery === 0) {
      w.choices = rollChoices(w);
      if (w.choices.length > 0) {
        w.phase = 'choosing';
        return;
      }
    }
    w.waveTimer = T.wave.breather;
  }
}

function startWave(w: World, n: number): void {
  w.wave = n;
  w.waveActive = true;
  w.spawnClock = 0.35;
  w.spawnQueue = [];

  const pool = UNLOCK.filter((u) => u.wave <= n).map((u) => u.kind);
  let budget =
    T.wave.base + n * T.wave.growth + Math.pow(n, T.wave.curve) * T.wave.curveMul;
  const guard = 400;
  let i = 0;
  while (budget > 0 && i++ < guard) {
    const affordable = pool.filter((k) => T.enemy[k].cost <= budget + 0.5);
    if (affordable.length === 0) break;
    // Later waves lean on the heavier kinds.
    const weighted: EnemyKind[] = [];
    for (const k of affordable) {
      const late = T.enemy[k].cost >= 2 ? Math.min(3, 1 + (n - 3) * 0.4) : 1;
      const reps = Math.max(1, Math.round(late));
      for (let r = 0; r < reps; r++) weighted.push(k);
    }
    const kind = w.rng.pick(weighted);
    budget -= T.enemy[kind].cost;
    w.spawnQueue.push({ kind, at: 0 });
  }

  // Shuffle so the drip feed is not sorted by pick order.
  for (let j = w.spawnQueue.length - 1; j > 0; j--) {
    const k = w.rng.int(0, j);
    const tmp = w.spawnQueue[j]!;
    w.spawnQueue[j] = w.spawnQueue[k]!;
    w.spawnQueue[k] = tmp;
  }

  if (has(w, 'greed')) w.player.charges = Math.min(w.player.charges, 1);

  w.sfx.push({ t: 'wave', n });
  pushText(w, v(w.arena.w / 2, 96), `OLA ${n}`, C.cyan);
}

function spawnAtEdge(w: World, kind: EnemyKind): void {
  const pad = T.wave.spawnPad;
  let pos = v(0, 0);
  for (let tries = 0; tries < 12; tries++) {
    const side = w.rng.int(0, 3);
    if (side === 0) pos = v(w.rng.range(pad, w.arena.w - pad), pad);
    else if (side === 1) pos = v(w.arena.w - pad, w.rng.range(pad, w.arena.h - pad));
    else if (side === 2) pos = v(w.rng.range(pad, w.arena.w - pad), w.arena.h - pad);
    else pos = v(pad, w.rng.range(pad, w.arena.h - pad));
    if (dist(pos, w.player.pos) > T.wave.spawnClear) break;
  }
  w.enemies.push(makeEnemy(w, kind, pos));
}

function rollChoices(w: World): Mutation[] {
  const owned = new Set(w.mutations);
  const pool = MUTATIONS.filter((m) => !owned.has(m.id));
  const out: Mutation[] = [];
  const bag = [...pool];
  while (out.length < 3 && bag.length > 0) {
    const i = w.rng.int(0, bag.length - 1);
    out.push(bag[i]!);
    bag.splice(i, 1);
  }
  return out;
}

function applyMutationImmediate(w: World, id: MutationId): void {
  const p = w.player;
  if (id === 'extra_charge') {
    p.maxCharges++;
    p.charges = p.maxCharges;
  }
  if (id === 'nova') p.novaReady = true;
}

// ---------------------------------------------------------------- fx bodies

function stepDecay(w: World, dt: number): void {
  for (let i = w.particles.length - 1; i >= 0; i--) {
    const q = w.particles[i]!;
    q.life -= dt;
    if (q.life <= 0) {
      w.particles.splice(i, 1);
      continue;
    }
    q.pos = add(q.pos, scale(q.vel, dt));
    q.vel = scale(q.vel, Math.exp(-q.drag * dt));
    q.rot += q.spin * dt;
  }
  for (let i = w.slashes.length - 1; i >= 0; i--) {
    const s = w.slashes[i]!;
    s.life -= dt;
    if (s.life <= 0) w.slashes.splice(i, 1);
  }
  for (let i = w.rings.length - 1; i >= 0; i--) {
    const r = w.rings[i]!;
    r.life -= dt;
    if (r.life <= 0) w.rings.splice(i, 1);
  }
  for (let i = w.texts.length - 1; i >= 0; i--) {
    const x = w.texts[i]!;
    x.life -= dt;
    x.pos.y += x.vy * dt;
    x.vy *= Math.exp(-2.4 * dt);
    if (x.life <= 0) w.texts.splice(i, 1);
  }
}

function burstOne(
  w: World,
  pos: Vec,
  angle: number,
  speed: number,
  color: string,
  life: number,
  size: number,
): void {
  if (w.particles.length >= T.fx.maxParticles) w.particles.shift();
  w.particles.push({
    pos: clone(pos),
    vel: fromAngle(angle, speed),
    life,
    maxLife: life,
    size,
    color,
    drag: 3.4,
    spin: w.rng.range(-9, 9),
    rot: w.rng.angle(),
  });
}

function pushText(w: World, pos: Vec, text: string, color: string): void {
  w.texts.push({ pos: v(pos.x, pos.y - 16), text, life: 0.9, color, vy: -46 });
}

// ---------------------------------------------------------------- exposed helpers

export function comboMultiplier(w: World): number {
  return scoreMult(w);
}

export function ownedMutations(w: World): MutationId[] {
  return w.mutations;
}

export type { Projectile };
