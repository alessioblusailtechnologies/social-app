# website · il sito di Moonbrand

Landing statica in Astro 7, dal mock di Claude Design «Moonbrand Landing». Ha il suo `package.json` e i suoi
`node_modules`: l'app Expo non la vede (Metro, Jest e il `tsconfig` della radice la escludono).

```sh
cd website
npm install
npm run dev      # http://localhost:4321
npm run check    # astro check: tipi e template
npm run build    # sito statico in dist/
```

## Dove si cambia cosa

- `src/site.ts`: titolo e descrizione della scheda, link a App Store, Google Play, privacy, termini e supporto
  (finché non esistono restano `#`).
- `src/components/`: una sezione per file, nell'ordine di `src/pages/index.astro`. Testi, piani e FAQ stanno
  in cima al componente che li mostra.
- `src/styles/global.css`: colori, pulsanti e misure comuni.
- `astro.config.mjs`: i font (Poppins per i titoli, Karla per il testo), scaricati alla build e serviti dal sito.

## Build per la produzione

`SITE_URL=https://indirizzo-del-sito npm run build`: con l'indirizzo pubblico la pagina ha anche canonical e
anteprima social (`og:image` da `public/og.png`). Senza, quei tag restano fuori.

Favicon, `apple-touch-icon.png` e `og.png` in `public/` sono ricavati dal logo in `src/assets/moonbrand-logo.png`.
