# TAJO

Arcade roguelite. Top-down arena, no gun: the dash *is* the weapon. Every kill refunds a
dash charge, so the game is a chain: stop killing and you run out of moves.

## Hard rules

- `src/sim/**` is pure. No DOM, no `Date.now()`, no `Math.random()`, no canvas.
  The only randomness is `Rng` (seeded, `src/rng.ts`).
- No binary assets, ever. Every sprite is drawn from code, every sound is synthesised
  in `src/audio/sfx.ts`. If you are about to add a `.png`, `.wav` or a font file, stop.
- Feel constants live in `src/sim/tuning.ts`. Never inline a magic number in `world.ts`.
- Every gameplay change needs a test in `tests/sim.test.ts`.
- Run `npm run typecheck` and `npm test` before claiming anything works.
- Never write a fallback that swallows a failure. Throw.

## Layout

```
src/rng.ts            seeded PRNG
src/pointer.ts        touch/mouse stick + tap state machine (pure)
src/sim/arena.ts      viewport shape -> arena rectangle (pure)
src/sim/tuning.ts     every number that affects feel
src/sim/types.ts      world shape
src/sim/vec.ts        vector maths
src/sim/mutations.ts  mutation catalogue (data only)
src/sim/world.ts      createWorld / startRun / step  <- the whole game
src/render/palette.ts colour data (pure, importable from sim)
src/render/draw.ts    canvas 2D, reads the world, never mutates it
src/audio/sfx.ts      Web Audio synthesis + procedural music
src/main.ts           canvas, input, fixed-timestep loop, debug hook
tests/sim.test.ts     headless, no browser
```

## Arena contract

The arena is **not** a fixed rectangle. `arenaFor(viewW, viewH)` gives it a constant
area (`T.arena.area`) and the viewport's aspect, clamped to `minAspect`/`maxAspect`;
the host letterboxes whatever the clamp leaves over. Read the size from `w.arena`,
never from `T.arena` (which only carries `area`, the clamps and `pad`).

`resizeArena(w, arena)` reshapes a live world: everything positional is remapped to the
same relative spot, radii and speeds do not scale. A resize must never end a run.

## Controls contract

Every interaction must be reachable with touch alone and with a mouse alone. Nothing may
be keyboard-only, so anything new that binds a key also needs a pointer target.

`PointerRig` owns the pointer scheme and is pure: the first pointer is a floating stick
driving move and aim, a press that leaves without travelling is a tap and taps dash, a
second pointer dashes on press and holds the focus. A mouse dashes on press instead (the
host passes `tapDashes: false`) and moves by dragging, so the desktop feel is untouched.

`input.move` is clamped to length 1, not normalised: the stick is analog and a half
deflection must walk. Keyboard input still arrives as unit vectors, so nothing changed
for it.

Pointer targets that are drawn must be hit-tested from the same function that drew them
(`choiceBoxes`, `hudButtons`), never from coordinates copied into the host.

## Loop contract

Fixed timestep of 1/60. `main.ts` accumulates `realDt * world.timeScale`, so slow-motion
(the FOCO ability) changes how many sim steps run per frame, never the step size.
`step(world, input, dt)` is the whole game tick. Edge-triggered inputs (`dash`, `confirm`,
`choose`) are cleared by the host after each step.

`world.sfx` is a drain-once event queue read by `main.ts`. The sim never reads it back.

## Debug

`window.__game` is exposed in the browser:

```js
__game.pump(120)         // 2 seconds of *full* frames, held input included
__game.setPaused(true)
__game.world.player.hp = 99
__game.stepN(120)        // advance 2 seconds headlessly
__game.resetBest()
```

## Commands

```
npm run dev        vite on :5178
npm test           vitest, headless sim only
npm run typecheck  tsc --noEmit
```
