import { fetchPublicText, toWebUrl } from '../lib/public-url';

/**
 * I colori che il sito dichiara: `theme-color`, gli stili in linea e i primi fogli di stile.
 * L'AI legge le pagine come testo e i colori li perderebbe: glieli si passano già contati.
 * Un sito che non risponde non è un errore, la palette si propone lo stesso.
 */

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const MAX_STYLESHEETS = 2;

function normalizeHex(hex: string): string {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  return `#${full.toUpperCase()}`;
}

export function countColors(texts: readonly string[], counts = new Map<string, number>(), weight = 1): Map<string, number> {
  for (const text of texts) {
    for (const match of text.match(HEX) ?? []) {
      const hex = normalizeHex(match);
      counts.set(hex, (counts.get(hex) ?? 0) + weight);
    }
  }
  return counts;
}

export function colorsFromHtml(html: string): { counts: Map<string, number>; stylesheets: string[] } {
  const counts = new Map<string, number>();
  const themeColor =
    /<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i.exec(html)?.[1];
  if (themeColor) countColors([themeColor], counts, 10);

  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi), ...html.matchAll(/style=["']([^"']+)["']/gi)].map(
    (match) => match[1],
  );
  countColors(inline, counts);

  const stylesheets = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["']?stylesheet/i.test(tag))
    .map((tag) => /href=["']([^"']+)["']/i.exec(tag)?.[1])
    .filter((href): href is string => Boolean(href));
  return { counts, stylesheets };
}

export async function readSiteColors(site: string, limit = 8): Promise<string[]> {
  try {
    const { url, text } = await fetchPublicText(toWebUrl(site).toString(), 600_000);
    const { counts, stylesheets } = colorsFromHtml(text);
    for (const href of stylesheets.slice(0, MAX_STYLESHEETS)) {
      try {
        const sheet = await fetchPublicText(new URL(href, url).toString(), 400_000);
        countColors([sheet.text], counts);
      } catch {
        /* un foglio che non si apre non ferma gli altri */
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([hex]) => hex);
  } catch {
    return [];
  }
}
