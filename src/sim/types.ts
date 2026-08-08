import type { Rng } from '../rng';

export type Vec = { x: number; y: number };

export type EnemyKind =
  | 'seeker'
  | 'weaver'
  | 'splitter'
  | 'shard'
  | 'warden'
  | 'spitter'
  | 'bomber';

export type Enemy = {
  id: number;
  kind: EnemyKind;
  pos: Vec;
  vel: Vec;
  r: number;
  speed: number;
  /** Telegraph countdown. While > 0 the enemy is materialising and is inert. */
  spawnT: number;
  /** Generic per-kind timer (weaver sine phase, spitter cooldown, bomber fuse). */
  timer: number;
  phase: number;
  /** Warden shield normal, radians. */
  facing: number;
  /** Bomber has committed to detonating. */
  arming: boolean;
  /** Visual feedback on a blocked hit. */
  flash: number;
  stun: number;
};

export type Player = {
  pos: Vec;
  vel: Vec;
  aim: number;
  hp: number;
  maxHp: number;
  iframes: number;
  charges: number;
  maxCharges: number;
  regen: number;
  focus: number;
  focusing: boolean;

  /** Dash is distance-driven, not time-driven, so CADENA can extend it mid-flight. */
  dashing: boolean;
  dashDir: Vec;
  dashRemaining: number;
  dashStart: Vec;
  dashHits: number[];

  recovery: number;
  stun: number;
  killsSinceRepair: number;
  novaReady: boolean;
  overclock: number;
  nextOverclock: number;
};

export type Projectile = {
  pos: Vec;
  vel: Vec;
  r: number;
  life: number;
  friendly: boolean;
};

export type Particle = {
  pos: Vec;
  vel: Vec;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
  spin: number;
  rot: number;
};

export type Slash = { a: Vec; b: Vec; life: number; maxLife: number };

export type Burn = { pos: Vec; r: number; life: number; hits: number[] };

export type Pickup = { pos: Vec; life: number; bob: number };

export type FloatText = { pos: Vec; text: string; life: number; color: string; vy: number };

export type Ring = { pos: Vec; r: number; maxR: number; life: number; maxLife: number; color: string };

export type SpawnOrder = { kind: EnemyKind; at: number };

export type MutationId =
  | 'extra_charge'
  | 'long_blade'
  | 'shrapnel'
  | 'afterburn'
  | 'focus_battery'
  | 'bloodline'
  | 'phase'
  | 'siphon'
  | 'momentum'
  | 'chain'
  | 'nova'
  | 'greed';

export type Mutation = {
  id: MutationId;
  name: string;
  desc: string;
  color: string;
};

export type Phase = 'title' | 'playing' | 'choosing' | 'dead';

/** Events drained by the presentation layer each frame. Never read by the sim. */
export type SfxEvent =
  | { t: 'dash' }
  | { t: 'kill'; combo: number }
  | { t: 'block' }
  | { t: 'hurt' }
  | { t: 'boom' }
  | { t: 'shoot' }
  | { t: 'wave'; n: number }
  | { t: 'pickup' }
  | { t: 'overclock' }
  | { t: 'choose' }
  | { t: 'dead' }
  | { t: 'start' };

export type Input = {
  move: Vec;
  aimPoint: Vec;
  /** Edge-triggered. Cleared by the host after the frame's steps. */
  dash: boolean;
  focus: boolean;
  /** -1 = none, else 0..2 */
  choose: number;
  confirm: boolean;
  /** Host-supplied entropy for the next run. The sim never calls Math.random or Date.now. */
  seed: number;
  /** Give up on the current run immediately (R). */
  abandon: boolean;
};

export type World = {
  seed: number;
  rng: Rng;
  t: number;
  frame: number;
  phase: Phase;
  arena: { w: number; h: number };

  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  slashes: Slash[];
  burns: Burn[];
  pickups: Pickup[];
  texts: FloatText[];
  rings: Ring[];

  wave: number;
  waveActive: boolean;
  waveTimer: number;
  spawnQueue: SpawnOrder[];
  spawnClock: number;

  combo: number;
  comboTimer: number;
  comboBest: number;
  score: number;
  kills: number;

  mutations: MutationId[];
  choices: Mutation[];

  shake: number;
  hitstop: number;
  flashWhite: number;
  timeScale: number;
  deadTimer: number;
  gridPulse: number;

  nextId: number;
  sfx: SfxEvent[];
};
