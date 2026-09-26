import { createContext, useContext, useEffect, useState } from 'react';

import type { BrandKit } from '@shared/domain/visual';

/**
 * I caratteri della linea arrivano da Google Fonts: si aspetta il foglio, poi le facce che servono, corsivi compresi.
 * C'è un tetto di tempo: senza rete la card si disegna lo stesso, con i caratteri di sistema.
 */

const TIMEOUT_MS = 6000;
const loads = new Map<string, Promise<void>>();

type FontsKit = Pick<BrandKit, 'fontsHref' | 'faces'> & { fontLinks?: string[] };

/** Un foglio di Google Fonts. Se non si carica (un peso che la famiglia non ha), si riprova con la sola famiglia. */
function stylesheet(href: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const append = (url: string, retry: boolean) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => {
        const bare = url.replace(/(family=[^:&]+):[^&]*/g, '$1');
        if (retry && bare !== url) append(bare, false);
        else resolve();
      };
      document.head.appendChild(link);
    };
    append(href, true);
  });
}

export function loadBrandFonts(kit: FontsKit): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const key = [kit.fontsHref, ...(kit.fontLinks ?? [])].join('|');
  const known = loads.get(key);
  if (known) return known;

  const sheets = Promise.all([kit.fontsHref, ...(kit.fontLinks ?? [])].map(stylesheet));
  const faces = sheets.then(() => Promise.all((kit.faces ?? []).map((face) => document.fonts.load(face).catch(() => []))));
  const loaded = Promise.race([faces, new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS))]).then(() => undefined);
  loads.set(key, loaded);
  return loaded;
}

/** Cambia quando i caratteri sono pronti: chi adatta il testo si rimisura. */
export const FontsContext = createContext('');

export function useFontsKey(kit: FontsKit): string {
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadBrandFonts(kit).then(() => {
      if (alive) setReady(kit.fontsHref);
    });
    return () => {
      alive = false;
    };
  }, [kit]);
  return ready === kit.fontsHref ? `${kit.fontsHref}|${(kit.fontLinks ?? []).length}|pronti` : `${kit.fontsHref}|attesa`;
}

export function useFontsReady(): string {
  return useContext(FontsContext);
}
