# Presenza · backend

API Fastify su Node 24, database Supabase (schema dedicato `presenza`), AI con l'Agent SDK di Claude.
Il dominio non è duplicato: il BE importa `src/domain` e `src/lib` dell'app (`@/…`), quindi la logica del
piano (scheletro, equilibrio dei temi, collocazione delle idee) è la stessa del FE.

## Avvio in locale

```sh
cd be-node
npm install
npm run dev          # http://localhost:3010/api/health
```

L'app parla col BE quando `EXPO_PUBLIC_API_URL` è impostato (`.env.local` alla radice dell'app, per esempio
`EXPO_PUBLIC_API_URL=http://localhost:3010/api`); senza, resta sul mock di sempre.

Altri comandi: `npm run typecheck`, `npm test`, `npm run build` (bundle in `dist/server.mjs`, avvio con `npm start`).

## Database

Il progetto Supabase è quello di sviluppo di Velia (`hcxiloivukbdcfcugksg`), condiviso. Presenza non tocca
`public` né `velia`:

- schema `presenza`, di proprietà del ruolo `presenza_app`, con cui il BE si collega (pooler in modalità sessione);
- ruolo `presenza_user`, senza login: il BE lo assume dentro ogni transazione fatta per conto di un utente
  (`withIdentity`), e lì le policy RLS limitano ogni query alle righe dell'account;
- registro delle migrazioni in `presenza.schema_migrations`, separato da quello di Supabase che è di Velia.

```sh
npm run db:apply      # applica le migrazioni mancanti (Management API)
npm run db:password   # nuova password per presenza_app, scrive DATABASE_URL in .env
```

## Accesso

Supabase Auth con email e password. La registrazione passa dal BE (Admin API, email già confermata: il progetto
non ha un SMTP suo) e crea il profilo in `presenza.accounts`. Un utente di Velia che si registra con la stessa
email e la stessa password riusa l'utenza esistente; senza profilo Presenza l'accesso risponde 403.

Le rotte, tranne `health` e `auth/sign-up|sign-in|refresh`, vogliono `Authorization: Bearer <accessToken>`.

## AI

Ogni generazione è una sessione dell'Agent SDK con output strutturato (schema JSON da Zod) e i soli strumenti
che servono: `WebFetch` per leggere il sito o un link, `WebSearch` per i segnali di attualità delle idee. Nessun
altro strumento, nessuna impostazione dal disco, permessi negati a tutto ciò che non è pre-approvato; gli
indirizzi privati o locali vengono rifiutati prima di aprirli. Ogni sessione ha un tetto di tempo e di spesa, e
il consumo finisce in `presenza.ai_usage`.

Il modello si sceglie con `AI_MODEL`: un Claude da Anthropic, oppure `deepseek-flash` o `deepseek-v4-pro` da DeepSeek
diretta, come in Velia. L'API di DeepSeek è compatibile con quella di Anthropic, quindi la sessione non cambia:
cambiano indirizzo e chiave del processo di Claude Code (`src/ai/providers.ts`). Su DeepSeek `AI_EFFORT` e
`AI_MAX_BUDGET_USD` non valgono, perché l'SDK conta la spesa al listino di Anthropic: restano i tetti di turni e di
tempo, e il costo in `ai_usage` si calcola dai token al listino di punta di DeepSeek (fuori punta è la metà).

Le rotte AI rispondono quando la sessione finisce: da qualche secondo per un ritocco a un paio di minuti per
idee con ricerca sul web.

## Visivi

Le card dei post; il piano completo è in `docs/piano-visivi.md`. La bozza propone il visivo insieme al testo (tipo,
template, testi della card, descrizione della foto): niente si genera finché l'utente non preme «Crea il visivo».

- **Modifiche senza AI** (tipo, layout, testi della card, descrizione): seguono le regole di `src/domain/visual.ts`,
  le stesse del mock. Durante la creazione rispondono 409 `VISUAL_BUSY`, su un contenuto approvato 409
  `CONTENT_APPROVED`. Se la card resta pronta ma i PNG non valgono più, un lavoro `render` li rifà.
- **Creazione in coda**: `…/visual/create` mette il design in `creating` e un lavoro in `presenza.visual_jobs` nella
  stessa transazione. La coda gira nel processo dell'API (`src/visual/runner.ts`, due lavori insieme, presi con
  `for update skip locked`) e fa i passi che mancano: foto con Gemini, scontorno con fal, un PNG per pagina e formato
  con be-render. Dopo ogni passo salva il contenuto, così l'app, che lo rilegge, vede `design.step`. Un errore porta
  il design a `failed` con il messaggio in `design.error`. All'avvio i lavori rimasti a metà da più di 10 minuti
  tornano in coda; quelli chiusi da una settimana si cancellano.
- **Foto**: il prompt (`src/ai/image-prompt.ts`) unisce la descrizione allo stile del Brand DNA e manda le ultime 3
  foto generate dal brand come riferimento di luce e resa. Mai testo nella foto; per un personal brand niente volti.
- **Storage**: bucket privato `presenza-media`, percorsi `account/brand/uuid.ext`, un file nuovo per ogni versione.
  Nel database resta il percorso con `url` vuoto; ogni risposta con contenuti firma tutti gli indirizzi in una sola
  chiamata, validi 24 ore.
- **Approvazione**: con Instagram o TikTok tra i canali e il visivo non pronto, `approve` e `schedule` rispondono 409
  `VISUAL_MISSING`.

Variabili: `GEMINI_API_KEY` e `IMAGE_MODEL` (di base `gemini-3.1-flash-image`, Nano Banana 2; il Pro è
`gemini-3-pro-image`), `FAL_KEY`, `RENDER_URL` e `RENDER_TOKEN` per be-render, `MEDIA_BUCKET`. Senza la chiave che un
passo richiede, crearlo risponde 503 prima di mettere in coda; le card senza foto funzionano lo stesso. I consumi
finiscono in `ai_usage` con task `image` e `cutout`, al listino indicativo: circa 0,067 $ a foto con Nano Banana 2,
0,134 $ col Pro, fal a tempo di calcolo.

## Contratto

Tutto JSON. Gli errori sono `{ "code": "NOT_FOUND", "message": "…" }`, con lo stato HTTP. I tipi sono quelli di
`src/domain` e `src/services/types.ts` dell'app.

### Sessione

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| GET | `/api/health` | | `{ status: 'ok' }` |
| POST | `/api/auth/sign-up` | `{ email, password, name? }` | 201 `AuthResult` |
| POST | `/api/auth/sign-in` | `{ email, password }` | `AuthResult` |
| POST | `/api/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken, expiresIn }` |
| GET | `/api/auth/me` | | `Account` |

`AuthResult = { accessToken, refreshToken, expiresIn, account: Account }`, `Account = { id, email, name }`,
`expiresIn` in secondi. Codici d'errore: `INVALID_CREDENTIALS` (401), `NO_ACCOUNT` (403), `EMAIL_TAKEN` (409),
`UNAUTHENTICATED` (401, token scaduto o assente).

### Brand

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| GET | `/api/workspace` | | `Workspace` |
| PUT | `/api/workspace/active-brand` | `{ brandId }` | 204 |
| POST | `/api/brands` | `BrandDraft` | 201 `Brand` (diventa attivo) |
| PUT | `/api/brands/:brandId/sections/:key` | `{ value }` | `Brand` |
| POST | `/api/demo` | | 201 `Brand` (profilo di esempio, attivo) |
| DELETE | `/api/demo` | | 204 (elimina tutti i brand dell'account) |

### AI del profilo

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| POST | `/api/ai/website` | `{ site, identity }` | `WebsiteInsights` |
| POST | `/api/ai/website/stream` | `{ site, identity }` | `text/event-stream` di `AiStreamEvent<WebsiteInsights>` |
| POST | `/api/ai/themes` | `{ identity }` | `string[]` |
| POST | `/api/ai/positioning` | `{ identity, site: { site, summary, pitch, themes, audiences } \| null }` | `PositioningIdeas` |
| POST | `/api/ai/voice` | `{ sample, identity }` | `VoiceAnalysis` |
| POST | `/api/media/references` | `{ dataUri }` | `MediaFile` (immagine di riferimento, `account/profilo/…`) |
| POST | `/api/ai/visual/stream` | `VisualStyleRequest` | `text/event-stream` di `AiStreamEvent<VisualStyle>` |

`visual/stream` è lo stile delle card del passo «Come appare»: Gemini (`VISION_MODEL`, con `GEMINI_API_KEY`) guarda le
immagini di riferimento e le indicazioni, sceglie caratteri e stile dal catalogo e scrive i testi di una card di
esempio per canale; be-render le compone. Se be-render non risponde gli esempi arrivano senza PNG (`file: null`) e
l'app li disegna dal vivo. Riferimenti ed esempi si salvano nel brand col solo percorso (dell'account) e si firmano
a ogni lettura del workspace.

`website/stream` fa la stessa lettura e intanto manda i passi dell'AI (indirizzo, colori, ogni pagina aperta):
un evento `data:` con `{ type: 'steps', steps }` a ogni cambio, poi `{ type: 'result', result }` oppure
`{ type: 'error', status, code, message }`. Gli errori di validazione arrivano prima, come risposta normale.
`WebsiteInsights.pitch` è la frase «cosa fai» letta dal sito, vuota se il sito non si apre.

`voice` con `source: 'history'` o `'recording'` risponde 422 `NOT_AVAILABLE`: servono il collegamento vero del
canale e una registrazione vera.

### Idee

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| GET | `/api/brands/:brandId/ideas` | | `Idea[]`, dalla più recente |
| POST | `/api/brands/:brandId/ideas/generate` | `{ count? }` | `Idea[]` (nuove proposte) |
| POST | `/api/brands/:brandId/ideas/drafts` | `{ source, variant? }` | `IdeaDraft[]` (non salvate) |
| POST | `/api/brands/:brandId/ideas` | `{ drafts }` | 201 `Idea[]` (salvate) |
| PATCH | `/api/ideas/:ideaId` | `{ status }` | `Idea` |

### Piano

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| GET | `/api/brands/:brandId/slots` | | `PlanSlot[]`, in ordine di calendario |
| POST | `/api/brands/:brandId/plan/proposal` | `PlanRequest` | `SlotDraft[]` |
| POST | `/api/brands/:brandId/plan/confirm` | `{ drafts }` | 201 `PlanSlot[]` |
| POST | `/api/brands/:brandId/plan/ideas` | `{ ideaId }` | `PlanSlot` |
| POST | `/api/brands/:brandId/slots` | `SlotDraft` | 201 `PlanSlot` |
| PATCH | `/api/slots/:slotId` | `SlotPatch` | `PlanSlot` |
| DELETE | `/api/slots/:slotId` | | 204 |

### Contenuti

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| GET | `/api/brands/:brandId/contents` | | `Content[]` |
| GET | `/api/brands/:brandId/contents/drafts` | | `Content[]` (senza uscita, dal più recente) |
| GET | `/api/contents/:contentId` | | `Content` (404 se non c'è) |
| GET | `/api/slots/:slotId/content` | | `{ content: Content \| null }` |
| POST | `/api/slots/:slotId/content/prepare` | `{ format? }` | `{ content, slot }` |
| POST | `/api/brands/:brandId/contents` | `DirectContentRequest` | 201 `Content` |
| POST | `/api/brands/:brandId/contents/from-idea` | `{ ideaId }` | 201 `Content` |
| POST | `/api/contents/:contentId/regenerate` | `{ format? }` | `Content` |
| PUT | `/api/contents/:contentId/variants/:channel` | `{ text }` | `Content` |
| POST | `/api/contents/:contentId/variants/:channel/rewrite` | `{ instruction }` | `Content` |
| POST | `/api/contents/:contentId/approve` | | `{ content, slot }` |
| POST | `/api/contents/:contentId/schedule` | `{ date, time, publishNow? }` | `{ content, slot }` |
| POST | `/api/contents/:contentId/reopen` | | `{ content, slot }` |

`approve` e `schedule` rispondono 409 `VISUAL_MISSING` quando un canale che non pubblica senza immagine aspetta il
visivo.

### Visivo

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| PUT | `/api/contents/:contentId/visual` | `VisualEdit` | `Content` |
| POST | `/api/contents/:contentId/visual/propose` | | `Content` (proposta senza AI per le bozze nate prima) |
| POST | `/api/contents/:contentId/visual/create` | | `Content` (`creating`, lavoro in coda) |
| POST | `/api/contents/:contentId/visual/image` | | `Content` (rifà solo la foto) |
| POST | `/api/contents/:contentId/visual/photo` | `{ dataUri }` | `Content` (PNG, JPEG o WebP fino a 3 MB) |
| POST | `/api/contents/:contentId/visual/refresh` | | `Content` (testi della bozza rifatta nella card) |

`VisualEdit = { kind, pages: [{ templateId, text }], description, source, reopen }`. Codici d'errore: `VISUAL_BUSY`
(409), `CONTENT_APPROVED` (409), `IMAGES_UNAVAILABLE` e `CUTOUT_UNAVAILABLE` (503).

Il collegamento dei canali (`ChannelService.connect`) resta simulato nell'app: nel prodotto vero è un flusso
OAuth per canale, che non passa da qui.

## Deploy su Render

`render.yaml`, alla radice del repo, descrive due servizi:

- `presenza-api`: questo BE, per ora sul piano free, regione Francoforte. Si costruisce dalla radice del repo
  (`cd be-node && npm ci --include=dev && npm run build`) perché il bundle include `src/` dell'app; si avvia con
  `node be-node/dist/server.mjs`, health check su `/api/health`. Riparte solo quando cambiano `be-node/` o i file
  dell'app che il bundle importa.
- `presenza-render`: il servizio che compone i PNG delle card (`be-render/`), in Docker dalla radice del repo. Per
  ora è un web service gratuito: 512 MB, un solo scatto alla volta, si addormenta dopo 15 minuti. I servizi gratuiti
  non ricevono dalla rete privata, quindi l'API lo chiama dall'indirizzo pubblico (`RENDER_URL`, scritto in
  `render.yaml`: se Render assegna un altro sottodominio va corretto lì) con il segreto `RENDER_TOKEN`, che Render
  genera e passa all'API. Se un PNG non arriva il visivo resta pronto, senza «Scarica le immagini». Per l'uso vero
  serve il piano standard da 2 GB. Vedi `be-render/README.md`.
- `presenza-app`: l'export web di Expo come sito statico, con `EXPO_PUBLIC_API_URL` scritta nel bundle al momento
  della build.

Primo avvio:

1. Render → *New* → *Blueprint* → repo `alessioblusailtechnologies/social-app`, ramo `master`.
2. Render chiede i valori `sync: false`: `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
   `DATABASE_URL`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY` e `FAL_KEY`,
   da copiare da `be-node/.env`. Su un Blueprint già
   creato Render non chiede i `sync: false` aggiunti dopo: si inseriscono dal pannello del servizio.
3. Se i nomi `presenza-api` o `presenza-app` sono già presi, Render assegna un altro sottodominio: si correggono
   `CORS_ORIGINS` e `EXPO_PUBLIC_API_URL` in `render.yaml` (non nel pannello: la sync del Blueprint li riscriverebbe)
   e si pusha.
4. Controllo: `https://presenza-api.onrender.com/api/health` risponde `{"status":"ok"}`, poi una registrazione
   dall'app.

Da sapere:

- il piano free si addormenta dopo 15 minuti senza richieste, e la prima risposta dopo può metterci un minuto;
- ha 512 MB di memoria, e ogni generazione AI avvia un processo di Claude Code: due generazioni insieme possono
  esaurirla. Per l'uso vero serve almeno il piano da 2 GB;
- le migrazioni non girano al deploy: si applicano da locale con `npm run db:apply`, prima di pushare il codice che
  le usa.

## Test

`npm test` fa due giri. `test/unit.spec.ts` prova le funzioni pure. `test/api.spec.ts` gira contro il database e
Supabase Auth del `.env`, con un'AI finta: registra due account di collaudo, percorre brand, idee, piano e contenuti,
controlla che un account non veda le righe dell'altro e alla fine cancella le due utenze (con loro, a cascata, i dati).

## Limiti noti

- **Pubblicazione**: non esiste. Come nel mock, un'uscita programmata il cui orario è passato risulta pubblicata.
- **Canali**: il collegamento è simulato, quindi «Leggi lo storico» della voce risponde `NOT_AVAILABLE`; lo stesso
  vale per la registrazione vocale, che nell'app è finta.
- **Documenti come fonte**: il file non viene caricato, l'AI conosce solo il nome e la nota.
- **Logo**: `logoUri` si salva così com'è; un percorso locale del telefono non si vede su un altro dispositivo.
  Serve il caricamento su Storage.
- **Registrazione**: l'email non si verifica, quindi ci si può registrare con un indirizzo non proprio. Va bene per
  lo sviluppo, non per la produzione.
- **Tempi**: le rotte AI rispondono a generazione finita. Dietro un proxy con timeout di 100 secondi, come
  Cloudflare, le idee con ricerca sul web vanno spostate su un job con polling.
- **File dei visivi**: le versioni vecchie di foto e PNG restano nel bucket; manca la pulizia dei file non più usati.
- **Logo nei PNG**: passa a be-render solo se è un indirizzo https o un data URI; un percorso del telefono resta fuori
  finché il logo non va su Storage. Cambiare palette o caratteri del brand non ricompone le card già create.
- **Profilo di esempio**: le card delle uscite approvate risultano pronte ma senza PNG.
- **DeepSeek**: i server sono in Cina. Con un modello `deepseek-*` l'indirizzo del sito, il profilo del brand e i
  testi escono dall'UE: per clienti veri va deciso, o si torna a un Claude.
