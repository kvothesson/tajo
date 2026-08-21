import { Sound } from './audio/sfx';
import { type Box, type Hud, choiceBoxes, hudButtons, render } from './render/draw';
import { PointerRig } from './pointer';
import { DEFAULT_ARENA, arenaFor } from './sim/arena';
import { T } from './sim/tuning';
import type { Input, World } from './sim/types';
import { createWorld, resizeArena, step } from './sim/world';
import { norm, v } from './sim/vec';

const BEST_KEY = 'tajo.best.v1';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

const world: World = createWorld(1, arenaFor(...viewport()));
const sound = new Sound();

let best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
let paused = false;
let mouseSeen = false;
/** A coarse pointer means a finger, until a mouse actually shows up and says otherwise. */
const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;

const rig = new PointerRig();
const keys = new Set<string>();
const input: Input = {
  move: v(0, 0),
  aimPoint: v(world.arena.w / 2, world.arena.h / 2 - 100),
  dash: false,
  focus: false,
  choose: -1,
  confirm: false,
  seed: 1,
  abandon: false,
};

// ---------------------------------------------------------------- layout

/**
 * A hidden or not-yet-laid-out page reports a 0x0 viewport, and a Playable runs inside
 * an iframe where that is a perfectly normal first frame. Fall back to the reference
 * shape until a real size arrives; the observer below re-runs layout when it does.
 */
function viewport(): [number, number] {
  const vw = window.visualViewport?.width || window.innerWidth;
  const vh = window.visualViewport?.height || window.innerHeight;
  return vw > 0 && vh > 0 ? [vw, vh] : [DEFAULT_ARENA.w, DEFAULT_ARENA.h];
}

/**
 * The arena takes its shape from the viewport, so a resize reshapes the running world
 * rather than rescaling a fixed rectangle. Whatever the aspect clamp does not absorb is
 * letterboxed here.
 */
function layout(): void {
  const [availW, availH] = viewport();
  resizeArena(world, arenaFor(availW, availH));

  const { w: AW, h: AH } = world.arena;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.min(availW / AW, availH / AH);
  canvas.style.width = `${Math.floor(AW * scale)}px`;
  canvas.style.height = `${Math.floor(AH * scale)}px`;
  canvas.width = Math.floor(AW * dpr);
  canvas.height = Math.floor(AH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
layout();
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', layout);
window.visualViewport?.addEventListener('resize', layout);
// Catches the first real layout inside an iframe, which fires no window resize event.
new ResizeObserver(layout).observe(document.getElementById('app')!);

function toArena(clientX: number, clientY: number) {
  const r = canvas.getBoundingClientRect();
  return v(
    ((clientX - r.left) / r.width) * world.arena.w,
    ((clientY - r.top) / r.height) * world.arena.h,
  );
}

// ---------------------------------------------------------------- input

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  sound.init();

  if (k === ' ') {
    input.dash = true;
    e.preventDefault();
  }
  if (k === 'enter') input.confirm = true;
  if (k === '1') input.choose = 0;
  if (k === '2') input.choose = 1;
  if (k === '3') input.choose = 2;
  if (k === 'm') sound.toggleMute();
  if (k === 'p') paused = !paused;
  if (k === 'r') {
    if (world.phase === 'dead') input.confirm = true;
    else if (world.phase !== 'title') input.abandon = true;
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => {
  keys.clear();
  rig.release();
});

const hudState = (): Hud => ({
  stick: rig.stickView(),
  muted: sound.muted,
  paused,
  touch: coarse && !mouseSeen,
});

const hit = (b: Box, p: { x: number; y: number }): boolean =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** Returns true when the press landed on a button and must not reach the game. */
function pressButtons(p: { x: number; y: number }): boolean {
  if (world.phase === 'title') return false;
  for (const b of hudButtons(world, paused)) {
    if (!hit(b, p)) continue;
    if (b.id === 'pause') paused = !paused;
    else if (b.id === 'mute') sound.toggleMute();
    else if (b.id === 'restart') {
      paused = false;
      if (world.phase === 'dead') input.confirm = true;
      else input.abandon = true;
    }
    return true;
  }
  return false;
}

canvas.addEventListener('pointermove', (e) => {
  const p = toArena(e.clientX, e.clientY);
  if (e.pointerType === 'mouse') {
    // Hovering is aiming, and only a mouse can hover. A dragging thumb must not also
    // aim at wherever it happens to be on the board.
    mouseSeen = true;
    input.aimPoint = p;
  }
  rig.move(e.pointerId, p);
});

canvas.addEventListener('pointerdown', (e) => {
  sound.init();
  canvas.focus();
  const p = toArena(e.clientX, e.clientY);

  if (e.button === 2) {
    e.preventDefault();
    return;
  }
  if (e.pointerType === 'mouse') {
    mouseSeen = true;
    input.aimPoint = p;
  }

  if (world.phase === 'choosing') {
    choiceBoxes(world).forEach((b, i) => {
      if (hit({ id: String(i), ...b }, p)) input.choose = i;
    });
    return;
  }
  if (pressButtons(p)) return;
  if (paused) return;

  // Outside a run a press is only ever "yes", and the stick would have nothing to move.
  if (world.phase !== 'playing') {
    input.confirm = true;
    return;
  }

  // A mouse has one pointer and dashes on press, the way it always has. A thumb gets
  // the stick instead, and dashes when it lifts without having travelled.
  const isMouse = e.pointerType === 'mouse';
  if (isMouse) {
    input.dash = true;
    input.confirm = true;
  }
  rig.down(e.pointerId, p, !isMouse);
});

canvas.addEventListener('pointerup', (e) => rig.up(e.pointerId));
canvas.addEventListener('pointercancel', (e) => rig.cancel(e.pointerId));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function readHeldInput(dt: number): void {
  rig.tick(dt);

  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  const m = v((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));
  const km = norm(m);
  const keyed = m.x !== 0 || m.y !== 0;

  // A hand on the keyboard wins while it is there; otherwise the stick drives.
  input.move = keyed ? km : rig.moveVector();
  input.focus = keys.has('shift') || mouseButtons.has(2) || rig.focusing;

  const stickAim = rig.aimPoint(world.player.pos);
  if (stickAim !== null) input.aimPoint = stickAim;
  else if (!mouseSeen && keyed) {
    input.aimPoint = v(world.player.pos.x + m.x * 100, world.player.pos.y + m.y * 100);
  }

  if (rig.dash) {
    input.dash = true;
    rig.dash = false;
  }
}

const mouseButtons = new Set<number>();
window.addEventListener('pointerdown', (e) => mouseButtons.add(e.button));
window.addEventListener('pointerup', (e) => mouseButtons.delete(e.button));
window.addEventListener('pointercancel', () => mouseButtons.clear());

// ---------------------------------------------------------------- loop

let last = performance.now();
let acc = 0;
const DT = T.dt;

function frame(now: number): void {
  requestAnimationFrame(frame);

  const realDt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (!paused) {
    readHeldInput(realDt);
    input.seed = (Math.random() * 0xffffffff) >>> 0;
    acc += realDt * world.timeScale;
    let steps = 0;
    while (acc >= DT && steps++ < 6) {
      step(world, input, DT);
      input.dash = false;
      input.confirm = false;
      input.abandon = false;
      input.choose = -1;
      acc -= DT;
    }
    if (steps >= 6) acc = 0;

    for (const ev of world.sfx) sound.play(ev);
    world.sfx.length = 0;

    const danger = Math.min(1, world.enemies.length / 16);
    sound.tick(realDt, world.phase === 'playing', world.wave, danger);

    if (world.score > best) {
      best = world.score;
      localStorage.setItem(BEST_KEY, String(best));
    }
  } else {
    input.dash = false;
    input.confirm = false;
    input.abandon = false;
    input.choose = -1;
  }

  render(ctx, world, best, hudState());
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- debug hook

declare global {
  interface Window {
    __game: {
      world: World;
      input: Input;
      stepN: (n: number) => void;
      /** Dev only: full frames, input included, for driving the controls headlessly. */
      pump: (n?: number) => void;
      setPaused: (p: boolean) => void;
      resetBest: () => void;
      /** Dev only: writes shots/<name>.png via the vite snapshot sink. */
      snap: (name: string) => Promise<string>;
    };
  }
}

window.__game = {
  world,
  input,
  stepN: (n: number) => {
    for (let i = 0; i < n; i++) {
      step(world, input, DT);
      input.dash = false;
      input.confirm = false;
      input.abandon = false;
      input.choose = -1;
    }
  },
  pump: (n = 1) => {
    for (let i = 0; i < n; i++) {
      readHeldInput(DT);
      step(world, input, DT);
      input.dash = false;
      input.confirm = false;
      input.abandon = false;
      input.choose = -1;
    }
  },
  setPaused: (p: boolean) => {
    paused = p;
  },
  resetBest: () => {
    best = 0;
    localStorage.removeItem(BEST_KEY);
  },
  snap: async (name: string) => {
    render(ctx, world, best, hudState());
    const res = await fetch(`/__snap?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      body: canvas.toDataURL('image/png'),
    });
    return res.text();
  },
};
