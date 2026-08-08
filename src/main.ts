import { Sound } from './audio/sfx';
import { choiceBoxes, render } from './render/draw';
import { T } from './sim/tuning';
import type { Input, World } from './sim/types';
import { createWorld, step } from './sim/world';
import { norm, v } from './sim/vec';

const BEST_KEY = 'tajo.best.v1';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

const world: World = createWorld(1);
const sound = new Sound();

let best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
let paused = false;
let mouseSeen = false;

const keys = new Set<string>();
const input: Input = {
  move: v(0, 0),
  aimPoint: v(T.arena.w / 2, T.arena.h / 2 - 100),
  dash: false,
  focus: false,
  choose: -1,
  confirm: false,
  seed: 1,
  abandon: false,
};

// ---------------------------------------------------------------- layout

function layout(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const aspect = T.arena.w / T.arena.h;
  const availW = window.innerWidth;
  const availH = window.innerHeight;
  let cssW = availW;
  let cssH = cssW / aspect;
  if (cssH > availH) {
    cssH = availH;
    cssW = cssH * aspect;
  }
  canvas.style.width = `${Math.floor(cssW)}px`;
  canvas.style.height = `${Math.floor(cssH)}px`;
  canvas.width = Math.floor(T.arena.w * dpr);
  canvas.height = Math.floor(T.arena.h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
layout();
window.addEventListener('resize', layout);

function toArena(clientX: number, clientY: number) {
  const r = canvas.getBoundingClientRect();
  return v(
    ((clientX - r.left) / r.width) * T.arena.w,
    ((clientY - r.top) / r.height) * T.arena.h,
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
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('pointermove', (e) => {
  mouseSeen = true;
  input.aimPoint = toArena(e.clientX, e.clientY);
});

canvas.addEventListener('pointerdown', (e) => {
  sound.init();
  canvas.focus();
  mouseSeen = true;
  input.aimPoint = toArena(e.clientX, e.clientY);
  if (e.button === 2) {
    e.preventDefault();
    return;
  }
  if (world.phase === 'choosing') {
    const p = toArena(e.clientX, e.clientY);
    choiceBoxes(world).forEach((b, i) => {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) input.choose = i;
    });
    return;
  }
  input.dash = true;
  input.confirm = true;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function readHeldInput(): void {
  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  const m = v((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));
  input.move = norm(m);
  input.focus = keys.has('shift') || mouseButtons.has(2);

  // Keyboard-only players aim along the stick.
  if (!mouseSeen && (m.x !== 0 || m.y !== 0)) {
    input.aimPoint = v(world.player.pos.x + m.x * 100, world.player.pos.y + m.y * 100);
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
    readHeldInput();
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

  render(ctx, world, best);

  if (paused) {
    ctx.fillStyle = 'rgba(5,6,10,0.7)';
    ctx.fillRect(0, 0, T.arena.w, T.arena.h);
    ctx.font = '700 32px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#dfe9f5';
    ctx.fillText('PAUSA', T.arena.w / 2, T.arena.h / 2);
  }
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- debug hook

declare global {
  interface Window {
    __game: {
      world: World;
      input: Input;
      stepN: (n: number) => void;
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
  setPaused: (p: boolean) => {
    paused = p;
  },
  resetBest: () => {
    best = 0;
    localStorage.removeItem(BEST_KEY);
  },
  snap: async (name: string) => {
    render(ctx, world, best);
    const res = await fetch(`/__snap?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      body: canvas.toDataURL('image/png'),
    });
    return res.text();
  },
};
