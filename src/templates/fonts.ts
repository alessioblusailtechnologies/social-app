import { createContext, useContext, useEffect, useState } from 'react';

import type { BrandKit } from '@/domain/visual';

/**
 * I caratteri del brand arrivano da Google Fonts: si aspetta il foglio, poi le facce che servono.
 * C'è un tetto di tempo: senza rete la card si disegna lo stesso, con i caratteri di sistema.
 */

const TIMEOUT_MS = 6000;
const loads = new Map<string, Promise<void>>();

type FontsKit = Pick<BrandKit, 'fontsHref' | 'heading' | 'body'>;

export function loadBrandFonts(kit: FontsKit): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const known = loads.get(kit.fontsHref);
  if (known) return known;

  const sheet = new Promise<void>((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = kit.fontsHref;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  const faces = sheet.then(() =>
    Promise.all(
      [`${kit.heading.weight} 48px "${kit.heading.family}"`, `400 48px "${kit.body.family}"`, `600 48px "${kit.body.family}"`].map(
        (face) => document.fonts.load(face).catch(() => []),
      ),
    ),
  );
  const loaded = Promise.race([faces, new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS))]).then(() => undefined);
  loads.set(kit.fontsHref, loaded);
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
  return ready === kit.fontsHref ? `${kit.fontsHref}|pronti` : `${kit.fontsHref}|attesa`;
}

export function useFontsReady(): string {
  return useContext(FontsContext);
}
