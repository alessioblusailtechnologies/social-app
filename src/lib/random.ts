/**
 * PRNG deterministico, identico a quello di PatternGrid nel design system:
 * a parità di seed la composizione è la stessa del mock HTML.
 */
export function createRng(seed: number): () => number {
  let state = ((seed || 1) * 2654435761) % 2147483647;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

/** Hash FNV-1a ridotto a un seed piccolo, così il PRNG resta preciso. */
export function seedFromString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 99991) + 1;
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function sample<T>(rng: () => number, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  while (result.length < count && pool.length > 0) {
    result.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return result;
}
