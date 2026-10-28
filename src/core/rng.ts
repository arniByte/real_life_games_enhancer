// Deterministic RNG (mulberry32). The state lives inside the session so undo/redo
// and tests replay exactly the same rolls.

export interface RngHost {
  rng: number;
}

export function nextRandom(host: RngHost): number {
  let t = (host.rng = (host.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(host: RngHost, min: number, max: number): number {
  return min + Math.floor(nextRandom(host) * (max - min + 1));
}

export function pick<T>(host: RngHost, items: readonly T[]): T {
  return items[Math.floor(nextRandom(host) * items.length)];
}

export function weightedPick<T>(host: RngHost, items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((sum, it) => sum + Math.max(0, weight(it)), 0);
  if (total <= 0) return items[0];
  let roll = nextRandom(host) * total;
  for (const it of items) {
    roll -= Math.max(0, weight(it));
    if (roll < 0) return it;
  }
  return items[items.length - 1];
}

export function shuffle<T>(host: RngHost, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(host) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function freshSeed(): number {
  return (Math.random() * 2 ** 31) | 0;
}
