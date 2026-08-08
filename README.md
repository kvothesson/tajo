# TAJO

An arcade roguelite where you have no weapon. The dash *is* the weapon.

Every kill refunds a dash charge, so the game is a chain: stop killing and you run out of
moves. Clear waves, take a mutation every three, see how far you get.

```bash
npm install && npm run dev
```

Then open <http://localhost:5178>.

## Controls

| | |
|---|---|
| `WASD` | move |
| mouse | aim |
| left click / `Space` | tajo (kills everything the line crosses) |
| right click / `Shift` | foco (slows time while the meter lasts) |
| `1` `2` `3` | pick a mutation |
| `R` | restart · `P` pause · `M` mute |

## The rules that make it a game

- Three dash charges, one passive refill every 2.2s. **Each kill refunds one.**
- A combo chain that decays in 2 seconds. Every 8 links triggers **OVERCLOCK**: free dashes
  for 3.2 seconds.
- Three hit points. Taking damage shoves the swarm off you and resets the combo.
- Six enemy types, each answered differently:
  - **Buscador** walks at you. Free charge.
  - **Tejedor** weaves; lead it.
  - **Divisor** splits into two fast shards.
  - **Escupidor** keeps its distance and shoots. Dash through the bullet.
  - **Guardián** has a shield arc. Hit it from behind or the dash bounces and stuns you.
  - **Bombardero** arms when close and levels everything in the blast, enemies included.
    Bait it into a crowd, or kill it before the fuse.
- Twelve mutations, three offered every third wave, never repeated in a run.

## Nothing in here is an asset

No images, no audio files, no fonts. Every shape is drawn with canvas paths from code and
every sound is synthesised through Web Audio at runtime, including the music, whose tempo
tracks the wave number. The whole build is source.

## Project shape

See [CLAUDE.md](CLAUDE.md) for the rules the code holds itself to. Short version: the
simulation in `src/sim/` is pure and seeded, rendering is a read-only view of it, and
`npm test` runs the entire game headlessly with no browser.

```bash
npm test        # 13 sim tests, ~1s
npm run typecheck
npm run build
```

### Verifying visually without a person

`npm run dev` mounts a screenshot sink. From the page console:

```js
__game.setPaused(true)
__game.stepN(600)              // advance 10 seconds of simulation
await __game.snap('probe')     // writes shots/probe.png
```

That is how every frame in this repo was checked.
