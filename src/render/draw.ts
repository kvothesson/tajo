import { MUT } from '../sim/mutations';
import { T } from '../sim/tuning';
import type { Enemy, World } from '../sim/types';
import { add, angleOf, clamp, fromAngle, scale, sub } from '../sim/vec';
import { C, ENEMY_COLOR } from './palette';

type Ctx = CanvasRenderingContext2D;

const FONT = 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace';

export function render(ctx: Ctx, w: World, best: number): void {
  const { w: AW, h: AH } = w.arena;

  ctx.save();
  ctx.clearRect(0, 0, AW, AH);

  // Background
  const g = ctx.createRadialGradient(AW / 2, AH * 0.45, 40, AW / 2, AH * 0.5, AH * 1.05);
  g.addColorStop(0, '#0a1122');
  g.addColorStop(1, C.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, AW, AH);

  // Screen shake
  const s = w.shake;
  if (s > 0.05) {
    const a = w.t * 61;
    ctx.translate(Math.sin(a * 1.7) * s, Math.cos(a * 2.3) * s);
  }

  drawGrid(ctx, w);
  drawWalls(ctx, w);

  ctx.globalCompositeOperation = 'lighter';

  drawBurns(ctx, w);
  drawRings(ctx, w);
  drawSlashes(ctx, w);
  drawPickups(ctx, w);
  drawParticles(ctx, w);
  for (const e of w.enemies) drawEnemy(ctx, e);
  drawProjectiles(ctx, w);
  if (w.phase !== 'dead' && w.phase !== 'title') drawPlayer(ctx, w);
  drawTexts(ctx, w);

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  drawVignette(ctx, AW, AH);

  if (w.flashWhite > 0.01) {
    ctx.fillStyle = `rgba(220,245,255,${w.flashWhite * 0.35})`;
    ctx.fillRect(0, 0, AW, AH);
  }

  if (w.phase !== 'title') drawHud(ctx, w, best);
  if (w.phase === 'title') drawTitle(ctx, w, best);
  if (w.phase === 'choosing') drawChoices(ctx, w);
  if (w.phase === 'dead') drawDead(ctx, w, best);
}

// ---------------------------------------------------------------- helpers

function glow(ctx: Ctx, color: string, width: number, draw: () => void, halo = 0.22): void {
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = halo;
  ctx.lineWidth = width * 3.4;
  draw();
  ctx.globalAlpha = 1;
  ctx.lineWidth = width;
  draw();
}

function poly(ctx: Ctx, pts: { x: number; y: number }[], close = true): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  if (close) ctx.closePath();
  ctx.stroke();
}

function ngon(cx: number, cy: number, r: number, n: number, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function text(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'left',
  weight = 700,
): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// ---------------------------------------------------------------- layers

function drawGrid(ctx: Ctx, w: World): void {
  const step = 40;
  const hot = w.gridPulse;
  ctx.lineWidth = 1;
  ctx.strokeStyle = hot > 0.02 ? mix(C.grid, C.gridHot, hot) : C.grid;
  ctx.globalAlpha = 0.55 + hot * 0.35;
  ctx.beginPath();
  for (let x = step; x < w.arena.w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, w.arena.h);
  }
  for (let y = step; y < w.arena.h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(w.arena.w, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawWalls(ctx: Ctx, w: World): void {
  const pad = T.arena.pad;
  ctx.globalCompositeOperation = 'lighter';
  glow(
    ctx,
    w.phase === 'playing' && w.player.overclock > 0 ? C.gold : C.wall,
    2,
    () => {
      ctx.beginPath();
      ctx.rect(pad - 8, pad - 8, w.arena.w - (pad - 8) * 2, w.arena.h - (pad - 8) * 2);
      ctx.stroke();
    },
    0.18,
  );
  ctx.globalCompositeOperation = 'source-over';
}

function drawBurns(ctx: Ctx, w: World): void {
  for (const b of w.burns) {
    const a = clamp(b.life / 1.4, 0, 1);
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = C.orange;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.r * (0.6 + a * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRings(ctx: Ctx, w: World): void {
  for (const r of w.rings) {
    const u = 1 - r.life / r.maxLife;
    const rad = r.r + (r.maxR - r.r) * (1 - (1 - u) * (1 - u));
    ctx.globalAlpha = (1 - u) * 0.9;
    glow(ctx, r.color, 2.5, () => {
      ctx.beginPath();
      ctx.arc(r.pos.x, r.pos.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

function drawSlashes(ctx: Ctx, w: World): void {
  for (const s of w.slashes) {
    const u = s.life / s.maxLife;
    ctx.globalAlpha = u;
    glow(ctx, C.cyan, 3 + u * 5, () => {
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;

  const p = w.player;
  if (p.dashing) {
    glow(ctx, C.cyan, 5, () => {
      ctx.beginPath();
      ctx.moveTo(p.dashStart.x, p.dashStart.y);
      ctx.lineTo(p.pos.x, p.pos.y);
      ctx.stroke();
    }, 0.22);
  }
}

function drawParticles(ctx: Ctx, w: World): void {
  for (const q of w.particles) {
    const u = q.life / q.maxLife;
    ctx.globalAlpha = u * u;
    ctx.fillStyle = q.color;
    const sz = q.size * (0.4 + u * 0.9);
    ctx.save();
    ctx.translate(q.pos.x, q.pos.y);
    ctx.rotate(q.rot);
    ctx.fillRect(-sz, -sz * 0.5, sz * 2, sz);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawPickups(ctx: Ctx, w: World): void {
  for (const k of w.pickups) {
    const pulse = 1 + Math.sin(k.bob * 2) * 0.12;
    const fade = k.life < 3 ? 0.35 + Math.abs(Math.sin(k.life * 8)) * 0.65 : 1;
    ctx.globalAlpha = fade;
    glow(ctx, C.green, 2.4, () => {
      poly(ctx, ngon(k.pos.x, k.pos.y, 12 * pulse, 4, k.bob * 0.6));
      ctx.beginPath();
      ctx.moveTo(k.pos.x - 6, k.pos.y);
      ctx.lineTo(k.pos.x + 6, k.pos.y);
      ctx.moveTo(k.pos.x, k.pos.y - 6);
      ctx.lineTo(k.pos.x, k.pos.y + 6);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

function drawProjectiles(ctx: Ctx, w: World): void {
  for (const b of w.projectiles) {
    const col = b.friendly ? C.amber : C.magenta;
    glow(ctx, col, 2.2, () => {
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      const tail = scale(b.vel, -0.035);
      ctx.beginPath();
      ctx.moveTo(b.pos.x, b.pos.y);
      ctx.lineTo(b.pos.x + tail.x, b.pos.y + tail.y);
      ctx.stroke();
    });
  }
}

function drawEnemy(ctx: Ctx, e: Enemy): void {
  const col = ENEMY_COLOR[e.kind];
  const { x, y } = e.pos;

  if (e.spawnT > 0) {
    const u = 1 - e.spawnT / T.wave.telegraph;
    ctx.globalAlpha = 0.25 + u * 0.5;
    glow(ctx, col, 1.6, () => {
      ctx.beginPath();
      ctx.arc(x, y, e.r + 16 * (1 - u), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, e.r * u, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    return;
  }

  const heading = angleOf(e.vel.x || e.vel.y ? e.vel : fromAngle(e.facing));
  const flashCol = e.flash > 0 ? C.player : col;
  const lw = 2.4;

  switch (e.kind) {
    case 'seeker':
    case 'shard': {
      const r = e.r;
      const pts = [
        add(e.pos, fromAngle(heading, r * 1.25)),
        add(e.pos, fromAngle(heading + 2.5, r)),
        add(e.pos, fromAngle(heading - 2.5, r)),
      ];
      glow(ctx, flashCol, lw, () => poly(ctx, pts));
      break;
    }
    case 'weaver': {
      glow(ctx, flashCol, lw, () => {
        poly(ctx, ngon(x, y, e.r * 1.25, 4, heading));
        poly(ctx, ngon(x, y, e.r * 0.5, 4, heading + Math.PI / 4));
      });
      break;
    }
    case 'splitter': {
      glow(ctx, flashCol, lw, () => {
        poly(ctx, ngon(x, y, e.r, 6, e.phase * 0.7));
        poly(ctx, ngon(x, y, e.r * 0.45, 6, -e.phase * 1.1));
      });
      break;
    }
    case 'spitter': {
      const charge = 1 - clamp(e.timer / T.spitter.cooldown, 0, 1);
      glow(ctx, flashCol, lw, () => {
        poly(ctx, ngon(x, y, e.r, 4, Math.PI / 4 + e.phase * 0.4));
        ctx.beginPath();
        ctx.arc(x, y, e.r * 0.35 + charge * e.r * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      });
      break;
    }
    case 'warden': {
      glow(ctx, flashCol, lw, () => {
        ctx.beginPath();
        ctx.arc(x, y, e.r, 0, Math.PI * 2);
        ctx.stroke();
      });
      // Shield arc: the only safe angle is behind it.
      glow(ctx, e.flash > 0 ? C.player : C.green, 4.5, () => {
        ctx.beginPath();
        ctx.arc(x, y, e.r + 9, e.facing - T.warden.arc, e.facing + T.warden.arc);
        ctx.stroke();
      }, 0.3);
      break;
    }
    case 'bomber': {
      const pulse = e.arming
        ? 1 + Math.sin(e.phase * 34) * 0.3
        : 1 + Math.sin(e.phase * 4) * 0.08;
      glow(ctx, e.arming ? C.player : flashCol, lw + (e.arming ? 1.4 : 0), () => {
        ctx.beginPath();
        ctx.arc(x, y, e.r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        poly(ctx, ngon(x, y, e.r * 0.45 * pulse, 3, e.phase * 5));
      });
      if (e.arming) {
        const u = 1 - clamp(e.timer / T.bomber.fuse, 0, 1);
        ctx.globalAlpha = 0.15 + u * 0.4;
        glow(ctx, C.orange, 1.6, () => {
          ctx.beginPath();
          ctx.arc(x, y, T.bomber.blastR * (0.35 + u * 0.65), 0, Math.PI * 2);
          ctx.stroke();
        }, 0.12);
        ctx.globalAlpha = 1;
      }
      break;
    }
  }
}

function drawPlayer(ctx: Ctx, w: World): void {
  const p = w.player;
  const blink = p.iframes > 0 && Math.floor(p.iframes * 22) % 2 === 0;
  if (blink) return;

  const col = p.overclock > 0 ? C.gold : p.stun > 0 ? C.red : C.player;
  const r = T.player.r;
  const pts = [
    add(p.pos, fromAngle(p.aim, r * 1.6)),
    add(p.pos, fromAngle(p.aim + 2.45, r * 1.05)),
    add(p.pos, fromAngle(p.aim + Math.PI, r * 0.45)),
    add(p.pos, fromAngle(p.aim - 2.45, r * 1.05)),
  ];
  glow(ctx, col, 2.6, () => poly(ctx, pts), 0.3);

  if (p.overclock > 0) {
    ctx.globalAlpha = 0.5 + Math.sin(w.t * 24) * 0.25;
    glow(ctx, C.gold, 1.6, () => {
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, r + 10 + Math.sin(w.t * 12) * 2, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  // Aim guide, longest while focusing.
  if (!p.dashing) {
    const reach = T.player.dashLen * (w.mutations.includes('long_blade') ? 1.4 : 1);
    const ready = p.charges > 0 || p.overclock > 0;
    const tip = add(p.pos, fromAngle(p.aim, reach));
    ctx.globalAlpha = p.focusing ? 0.55 : ready ? 0.2 : 0.08;
    ctx.setLineDash(p.focusing ? [] : [7, 9]);
    glow(ctx, ready ? C.cyan : C.dim, p.focusing ? 2 : 1.2, () => {
      ctx.beginPath();
      ctx.moveTo(p.pos.x + Math.cos(p.aim) * (r + 6), p.pos.y + Math.sin(p.aim) * (r + 6));
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
    }, 0.1);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function drawTexts(ctx: Ctx, w: World): void {
  for (const x of w.texts) {
    const u = clamp(x.life / 0.9, 0, 1);
    ctx.globalAlpha = u;
    text(ctx, x.text, x.pos.x, x.pos.y, 15, x.color, 'center');
  }
  ctx.globalAlpha = 1;
}

function drawVignette(ctx: Ctx, W: number, H: number): void {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- hud

/** Enemies spawn near the edges, so the HUD needs its own backdrop to stay legible. */
function panel(ctx: Ctx, x: number, y: number, wd: number, ht: number): void {
  ctx.fillStyle = 'rgba(4,6,12,0.72)';
  ctx.beginPath();
  const r = 8;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + wd, y, x + wd, y + ht, r);
  ctx.arcTo(x + wd, y + ht, x, y + ht, r);
  ctx.arcTo(x, y + ht, x, y, r);
  ctx.arcTo(x, y, x + wd, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawHud(ctx: Ctx, w: World, best: number): void {
  const p = w.player;
  const W = w.arena.w;
  const pad = 30;

  panel(ctx, pad - 12, pad - 18, Math.max(108, p.maxCharges * 15 + 20), 79);
  panel(ctx, W / 2 - 62, pad - 16, 124, 32);
  panel(ctx, W - pad - 122, pad - 18, 134, 52);
  if (w.mutations.length > 0) {
    panel(ctx, pad - 12, w.arena.h - pad - (w.mutations.length - 1) * 15 - 12, 120, w.mutations.length * 15 + 10);
  }

  // HP
  for (let i = 0; i < p.maxHp; i++) {
    const on = i < p.hp;
    ctx.globalAlpha = on ? 1 : 0.2;
    ctx.strokeStyle = on ? C.red : C.dim;
    ctx.fillStyle = C.red;
    ctx.lineWidth = 2;
    const x = pad + i * 20;
    const y = pad;
    ctx.beginPath();
    ctx.moveTo(x, y + 7);
    ctx.lineTo(x + 7, y - 5);
    ctx.lineTo(x + 14, y + 7);
    ctx.closePath();
    if (on) ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Dash charges
  for (let i = 0; i < p.maxCharges; i++) {
    const on = i < p.charges;
    const x = pad + i * 15;
    const y = pad + 20;
    ctx.fillStyle = p.overclock > 0 ? C.gold : on ? C.cyan : '#16283c';
    ctx.fillRect(x, y, 10, 16);
  }
  if (p.charges < p.maxCharges) {
    const u = p.regen / T.player.regenTime;
    const x = pad + p.charges * 15;
    ctx.fillStyle = 'rgba(70,232,255,0.35)';
    ctx.fillRect(x, pad + 20 + 16 * (1 - u), 10, 16 * u);
  }

  // Focus
  ctx.fillStyle = '#16283c';
  ctx.fillRect(pad, pad + 42, 84, 5);
  ctx.fillStyle = p.focusing ? C.violet : '#5f7fb5';
  ctx.fillRect(pad, pad + 42, 84 * p.focus, 5);

  // Wave
  text(ctx, `OLA ${w.wave}`, W / 2, pad, 18, C.text, 'center');
  if (!w.waveActive && w.phase === 'playing') {
    ctx.globalAlpha = 0.6;
    text(ctx, 'siguiente...', W / 2, pad + 20, 12, C.dim, 'center');
    ctx.globalAlpha = 1;
  }

  // Score
  text(ctx, String(w.score).padStart(6, '0'), W - pad, pad, 24, C.text, 'right');
  ctx.globalAlpha = 0.55;
  text(ctx, `MEJOR ${Math.max(best, w.score)}`, W - pad, pad + 22, 12, C.dim, 'right');
  ctx.globalAlpha = 1;

  // Combo
  if (w.combo >= 2) {
    const u = clamp(w.comboTimer / T.combo.window, 0, 1);
    const big = 22 + Math.min(w.combo, 25) * 1.1;
    const col = w.combo >= T.combo.threshold ? C.gold : C.cyan;
    ctx.globalAlpha = 0.35 + u * 0.65;
    text(ctx, `x${w.combo}`, W / 2, 68, big, col, 'center');
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = col;
    ctx.fillRect(W / 2 - 45, 68 + big * 0.55, 90 * u, 3);
    ctx.globalAlpha = 1;
  }

  // Mutations acquired
  w.mutations.forEach((id, i) => {
    const m = MUT[id];
    const y = w.arena.h - pad - (w.mutations.length - 1 - i) * 15;
    ctx.globalAlpha = 0.8;
    text(ctx, m.name, pad, y, 11, m.color, 'left');
  });
  ctx.globalAlpha = 1;
}

function drawTitle(ctx: Ctx, w: World, best: number): void {
  const W = w.arena.w;
  const H = w.arena.h;
  ctx.fillStyle = 'rgba(5,6,10,0.72)';
  ctx.fillRect(0, 0, W, H);

  const bob = Math.sin(w.t * 1.6) * 3;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, C.cyan, 3, () => {
    ctx.beginPath();
    ctx.moveTo(W / 2 - 210, H * 0.3 + 46 + bob);
    ctx.lineTo(W / 2 + 210, H * 0.3 + 46 + bob);
    ctx.stroke();
  }, 0.3);
  ctx.restore();

  text(ctx, 'TAJO', W / 2, H * 0.3 + bob, 86, C.player, 'center', 800);
  ctx.globalAlpha = 0.65;
  text(ctx, 'no tenés arma. sos el arma.', W / 2, H * 0.3 + 74 + bob, 15, C.cyan, 'center', 500);
  ctx.globalAlpha = 1;

  const lines = [
    ['WASD', 'moverse'],
    ['MOUSE', 'apuntar'],
    ['CLICK / ESPACIO', 'tajo (mata lo que atraviesa)'],
    ['CLICK DER. / SHIFT', 'foco (ralentiza el tiempo)'],
    ['R / P / M', 'reiniciar · pausa · silencio'],
    ['', ''],
    ['cada muerte', 'devuelve una carga'],
    ['sin muertes', 'sin cargas'],
  ];
  lines.forEach((l, i) => {
    const y = H * 0.55 + i * 22;
    ctx.globalAlpha = 0.9;
    text(ctx, l[0]!, W / 2 - 16, y, 13, C.gold, 'right', 700);
    ctx.globalAlpha = 0.62;
    text(ctx, l[1]!, W / 2 + 16, y, 13, C.text, 'left', 500);
  });
  ctx.globalAlpha = 1;

  const pulse = 0.55 + Math.abs(Math.sin(w.t * 2.6)) * 0.45;
  ctx.globalAlpha = pulse;
  text(ctx, 'CLICK PARA EMPEZAR', W / 2, H - 62, 18, C.gold, 'center');
  ctx.globalAlpha = 1;

  if (best > 0) {
    ctx.globalAlpha = 0.5;
    text(ctx, `mejor puntaje: ${best}`, W / 2, H - 34, 12, C.dim, 'center', 500);
    ctx.globalAlpha = 1;
  }
}

function drawChoices(ctx: Ctx, w: World): void {
  const W = w.arena.w;
  const H = w.arena.h;
  ctx.fillStyle = 'rgba(5,6,10,0.92)';
  ctx.fillRect(0, 0, W, H);

  text(ctx, 'MUTACIÓN', W / 2, H * 0.22, 30, C.text, 'center', 800);
  ctx.globalAlpha = 0.55;
  text(ctx, 'elegí una  ·  1 / 2 / 3  o click', W / 2, H * 0.22 + 28, 13, C.dim, 'center', 500);
  ctx.globalAlpha = 1;

  const boxes = choiceBoxes(w);
  w.choices.forEach((m, i) => {
    const b = boxes[i]!;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, m.color, 2, () => {
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.stroke();
    }, 0.16);
    ctx.restore();

    text(ctx, String(i + 1), b.x + 16, b.y + 22, 14, m.color, 'left');
    text(ctx, m.name, b.x + b.w / 2, b.y + 58, 21, m.color, 'center', 800);

    const words = m.desc.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      if ((cur + ' ' + word).trim().length > 22) {
        lines.push(cur.trim());
        cur = word;
      } else cur += ' ' + word;
    }
    lines.push(cur.trim());
    ctx.globalAlpha = 0.75;
    lines.forEach((ln, j) => {
      text(ctx, ln, b.x + b.w / 2, b.y + 98 + j * 19, 13, C.text, 'center', 500);
    });
    ctx.globalAlpha = 1;
  });
}

export function choiceBoxes(w: World): { x: number; y: number; w: number; h: number }[] {
  const bw = 250;
  const bh = 180;
  const gap = 26;
  const total = 3 * bw + 2 * gap;
  const x0 = (w.arena.w - total) / 2;
  const y = w.arena.h * 0.38;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (bw + gap), y, w: bw, h: bh }));
}

function drawDead(ctx: Ctx, w: World, best: number): void {
  const W = w.arena.w;
  const H = w.arena.h;
  const fade = clamp(w.deadTimer / 0.7, 0, 1);
  ctx.fillStyle = `rgba(5,6,10,${0.8 * fade})`;
  ctx.fillRect(0, 0, W, H);
  if (fade < 0.25) return;

  const record = w.score > best;
  text(ctx, 'CAÍDO', W / 2, H * 0.3, 58, C.red, 'center', 800);

  const rows: [string, string][] = [
    ['PUNTAJE', String(w.score)],
    ['OLA', String(w.wave)],
    ['MUERTES', String(w.kills)],
    ['COMBO MÁX.', `x${w.comboBest}`],
  ];
  rows.forEach((r, i) => {
    const y = H * 0.44 + i * 26;
    ctx.globalAlpha = 0.55;
    text(ctx, r[0], W / 2 - 14, y, 14, C.dim, 'right', 500);
    ctx.globalAlpha = 1;
    text(ctx, r[1], W / 2 + 14, y, 16, C.text, 'left');
  });

  if (record) {
    ctx.globalAlpha = 0.6 + Math.abs(Math.sin(w.t * 4)) * 0.4;
    text(ctx, 'RÉCORD NUEVO', W / 2, H * 0.44 + 4 * 26 + 12, 16, C.gold, 'center');
    ctx.globalAlpha = 1;
  }

  const pulse = 0.5 + Math.abs(Math.sin(w.t * 2.6)) * 0.5;
  ctx.globalAlpha = pulse * clamp((w.deadTimer - 0.9) / 0.4, 0, 1);
  text(ctx, 'CLICK PARA OTRA', W / 2, H - 66, 18, C.gold, 'center');
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- colour util

function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export { sub };
