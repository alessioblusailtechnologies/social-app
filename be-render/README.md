# Presenza · render

Il servizio che trasforma una card del brand in PNG. Usa [Remotion](https://www.remotion.dev) con un Chromium
sempre aperto e gli stessi template dell'app (`src/templates`): quello che l'utente vede nell'anteprima è quello
che esce qui. Il perché e il resto del flusso sono in `docs/piano-visivi.md`.

Non ha stato né chiavi: lo chiama solo l'API (`be-node`), che gli passa le props della card con le immagini già
firmate e salva il PNG su Storage.

## Avvio in locale

```sh
cd be-render
npm install
npm run dev          # http://localhost:3020/health
```

Al primo avvio scarica Chrome Headless Shell (circa 110 MB) e costruisce il sito Remotion (una ventina di secondi).
Poi ogni card esce in circa mezzo secondo.

`npm run try` scatta ogni template con un brand di esempio e salva i PNG in `out/`: serve a guardare le card
quando si tocca un layout. `npm run try -- stat quote` fa solo quelli indicati; `TRY_TYPE=fraunces npm run try`
cambia i caratteri.

## Contratto

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| GET | `/health` | | `{ status: 'ok' }` |
| POST | `/render` | `CardProps` (`src/templates/types.ts`) | `image/png` |

`CardProps = { kit, page, pageIndex, pageCount, photoUrl, cutoutUrl, aspect }`. Le card sono larghe 1080 px,
tranne le orizzontali (`1.91:1`) che escono a 1200 × 628. Con `RENDER_TOKEN` impostato la richiesta vuole l'header
`x-render-token`; errori `400 INVALID` (props da scartare), `401`, `500 RENDER_FAILED`.

## Variabili

| Variabile | Default | |
|---|---|---|
| `PORT` o `RENDER_PORT` | `3020` | |
| `RENDER_TOKEN` | nessuno | lo stesso impostato nell'API |
| `RENDER_SERVE_URL` | costruito all'avvio | il sito già costruito con `npm run bundle-site` (`build/site`) |
| `RENDER_CONCURRENCY` | `2` | scatti in parallelo sullo stesso browser |

## Produzione

`npm run build` compila server e costruttore del sito in `dist/`, `npm run bundle-site` costruisce il sito in
`build/site`, `npm start` avvia con `RENDER_SERVE_URL=build/site`. Il sito include `src/templates` e `src/domain`
dell'app, quindi si costruisce dalla radice del repo. Chromium vuole almeno 2 GB di memoria.

## Da sapere

- **Licenza Remotion**: gratis per chi ha fino a 3 dipendenti e per la valutazione; per un'azienda più grande serve
  la Company License (vedi `docs/piano-visivi.md`, «Decisioni aperte»).
- I caratteri arrivano da Google Fonts e le foto dagli URL firmati: il servizio deve poter uscire su internet.
- React è quello di questo pacchetto anche per i template, che stanno fuori (`src/site.ts`): due copie romperebbero
  gli hook.
