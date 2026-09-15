/** "https://www.Nodo.it/" → "nodo.it" */
export function normalizeSite(site: string): string {
  return site
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}
