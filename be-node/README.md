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

Le rotte AI rispondono quando la sessione finisce: da qualche secondo per un ritocco a un paio di minuti per
idee con ricerca sul web.

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
| POST | `/api/ai/themes` | `{ identity }` | `string[]` |
| POST | `/api/ai/voice` | `{ sample, identity }` | `VoiceAnalysis` |

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

Il collegamento dei canali (`ChannelService.connect`) resta simulato nell'app: nel prodotto vero è un flusso
OAuth per canale, che non passa da qui.

## Deploy su Render

`render.yaml`, alla radice del repo, descrive due servizi:

- `presenza-api`: questo BE, per ora sul piano free, regione Francoforte. Si costruisce dalla radice del repo
  (`cd be-node && npm ci --include=dev && npm run build`) perché il bundle include `src/` dell'app; si avvia con
  `node be-node/dist/server.mjs`, health check su `/api/health`. Riparte solo quando cambiano `be-node/` o i file
  dell'app che il bundle importa.
- `presenza-app`: l'export web di Expo come sito statico, con `EXPO_PUBLIC_API_URL` scritta nel bundle al momento
  della build.

Primo avvio:

1. Render → *New* → *Blueprint* → repo `alessioblusailtechnologies/social-app`, ramo `master`.
2. Render chiede i valori `sync: false`: `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
   `DATABASE_URL` e `ANTHROPIC_API_KEY`, da copiare da `be-node/.env`.
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
