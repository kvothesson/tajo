/** Seeded PRNG (mulberry32). The only source of randomness in the sim. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  angle(): number {
    return this.next() * Math.PI * 2;
  }

  /** Deterministic fork so cosmetic bursts never desync gameplay draws. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 0xffffffff));
  }

  get state(): number {
    return this.s;
  }
}
