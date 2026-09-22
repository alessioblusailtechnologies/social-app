// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// Il sito di Moonbrand: una landing statica, da Claude Design (Moonbrand Landing).
export default defineConfig({
  // L'indirizzo pubblico serve a canonical e anteprime social (og:url, og:image assolute).
  // Si passa alla build: SITE_URL=https://… npm run build. Senza, quei tag restano fuori.
  site: process.env.SITE_URL || undefined,
  // I font si scaricano alla build e si servono dal sito stesso: niente richieste a Google dal browser.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Poppins',
      cssVariable: '--font-display',
      weights: [500, 600, 700],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['sans-serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Karla',
      cssVariable: '--font-body',
      weights: [400, 500, 600],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
  ],
});
