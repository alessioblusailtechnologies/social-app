export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Latenza simulata dei servizi mock, tra `min` e `max` millisecondi. */
export function latency(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
