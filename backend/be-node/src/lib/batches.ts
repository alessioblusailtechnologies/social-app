/** Come `Promise.all`, ma non più di `size` alla volta; l'ordine dei risultati resta quello della lista. */
export async function inBatches<T, R>(items: readonly T[], size: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}
