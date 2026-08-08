/** Pure colour data. No DOM, safe to import from the sim. */
export const C = {
  bg: '#05060a',
  grid: '#101a2e',
  gridHot: '#1d3a63',
  wall: '#1c2c4a',

  player: '#eafcff',
  cyan: '#46e8ff',
  gold: '#ffd166',
  amber: '#ffb03a',
  orange: '#ff5a2b',
  red: '#ff3b6b',
  magenta: '#ff6ad5',
  violet: '#b06bff',
  green: '#3affa8',

  dim: '#5a6b86',
  text: '#dfe9f5',
} as const;

export const ENEMY_COLOR = {
  seeker: C.red,
  weaver: C.amber,
  splitter: C.violet,
  shard: C.violet,
  warden: C.green,
  spitter: C.magenta,
  bomber: C.orange,
} as const;
