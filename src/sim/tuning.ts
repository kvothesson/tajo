/**
 * Every number that affects feel lives here.
 * Change values in this file, never inline in world.ts.
 */
export const T = {
  /**
   * The arena borrows its shape from the viewport but keeps a constant `area`,
   * so a portrait phone and a widescreen monitor fight the same amount of room.
   * `minAspect`/`maxAspect` stop either axis from collapsing into a corridor;
   * past the clamp the host letterboxes. 1000x620 is the reference landscape.
   */
  arena: { area: 1000 * 620, minAspect: 0.5, maxAspect: 2.2, pad: 26 },

  dt: 1 / 60,

  player: {
    r: 11,
    accel: 2600,
    maxSpeed: 235,
    friction: 11,
    maxHp: 3,
    iframes: 1.15,
    maxCharges: 3,
    regenTime: 2.2,
    dashLen: 205,
    dashDur: 0.085,
    dashRadius: 20,
    recovery: 0.075,
    /** Push-back and stun when a Warden shield eats the dash. */
    blockKnock: 240,
    blockStun: 0.22,
  },

  focus: {
    scale: 0.3,
    drain: 0.5,
    refill: 0.3,
    minToStart: 0.12,
  },

  combo: {
    window: 2.0,
    /** Combo needed for the first Overclock, then every `step` after. */
    threshold: 8,
    step: 8,
    duration: 3.2,
  },

  /** Baseline stats per enemy kind. Speed scales mildly with wave. */
  enemy: {
    seeker: { r: 13, speed: 74, cost: 1, score: 10 },
    weaver: { r: 11, speed: 138, cost: 1.5, score: 15 },
    splitter: { r: 17, speed: 56, cost: 2, score: 20 },
    shard: { r: 8, speed: 168, cost: 0, score: 8 },
    warden: { r: 16, speed: 48, cost: 3, score: 35 },
    spitter: { r: 12, speed: 62, cost: 2.5, score: 25 },
    bomber: { r: 15, speed: 96, cost: 3, score: 30 },
  },

  warden: {
    /** Half-angle of the shield arc, radians. */
    arc: 1.15,
    turnRate: 1.5,
  },

  spitter: {
    keepDist: 265,
    cooldown: 2.3,
    bulletSpeed: 190,
    bulletR: 7,
  },

  bomber: {
    trigger: 96,
    fuse: 1.05,
    blastR: 128,
  },

  wave: {
    /** Budget = base + wave*growth + wave^curve * curveMul. Superlinear on purpose. */
    base: 4,
    growth: 2.6,
    curve: 1.6,
    curveMul: 0.35,
    /**
     * Enemies arrive in bursts, not one at a time: a single drip lets a competent
     * player kill each arrival before the next, and the arena never fills up.
     */
    spawnGap: 1.0,
    spawnGapDecay: 0.03,
    spawnGapMin: 0.45,
    burstBase: 1,
    burstPerWave: 0.25,
    burstMax: 5,
    maxAlive: 30,
    /** Enemies never materialise closer than this to the HUD corners or the player. */
    spawnPad: 62,
    spawnClear: 230,
    breather: 1.4,
    telegraph: 0.65,
    speedScale: 0.014,
    speedScaleMax: 0.65,
    /** Offer a mutation every N waves. */
    mutationEvery: 3,
  },

  fx: {
    hitstopKill: 0.045,
    hitstopHurt: 0.13,
    shakeKill: 3.2,
    shakeHurt: 15,
    shakeBoom: 11,
    shakeDash: 1.6,
    shakeDecay: 7.5,
    maxParticles: 700,
  },

  score: {
    waveBonus: 60,
  },
} as const;
