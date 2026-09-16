# Visivi dei contenuti · piano di sviluppo

Stato: in corso, dal 2026-09-15. Le caselle spuntate sono fatte.

## Obiettivo

Immagini per i post che siano di qualità e coerenti tra loro: card infografiche nello stile del brand, foto generate,
e un misto delle due (infografica con foto o soggetto scontornato). Niente immagini diverse e slegate a ogni post.

## Principi

- **Il modello d'immagine non disegna mai il post.** Produce solo ingredienti: una foto, un soggetto scontornato.
  Il post lo compone sempre un template del brand, in HTML.
- **Il testo non sta mai dentro l'immagine generata.** Sta nel template: font del brand, italiano corretto,
  modificabile.
- **L'AI non inventa layout.** Sceglie un template dal catalogo e ne riempie i testi, dentro limiti precisi.
- **Niente parte da solo.** La bozza propone il visivo, l'utente preme «Crea il visivo». Come per la bozza.
- **Un template, due motori.** Gli stessi componenti React disegnano l'anteprima nell'app e il PNG sul server.

## Flusso nell'app

Nella schermata Contenuto:

1. **«Prepara la bozza»** scrive il testo per canale e, nella stessa chiamata, la **proposta di visivo**: tipo,
   layout, testi della card, descrizione dell'immagine. Non genera niente. Nell'anteprima del post c'è il riquadro
   «Visivo da creare»; sotto il testo e i suoi ritocchi c'è il pannello **Visivo** con la proposta:
   - tipo `Infografica · Foto · Mista`, preselezionato dall'AI; cambiarlo adatta la proposta senza AI;
   - uno schizzo del layout con i testi della card, modificabili;
   - la descrizione dell'immagine (per Foto e Mista), modificabile, oppure «Usa una tua foto»;
   - il bottone **«Crea il visivo»**.
2. **«Crea il visivo»**: nell'anteprima uno scheletro con i passi (*Genero la foto · Scontorno · Compongo*). È un
   lavoro in coda: intanto si può ritoccare il testo.
3. **Visivo pronto**: la card vera nell'anteprima del post. Il pannello diventa quello dei ritocchi: layout
   (‹ 1 di 3 ›, solo ricomposizione), testi della card, immagine (Rigenera · Tua foto · Togli), «Torna alla
   proposta», «Scarica le immagini».

Casi di confine:

- **Rifai la bozza** rifà testo e proposta. Se il visivo era già creato resta, con «Il testo è cambiato» e
  «Aggiorna il visivo»: non si ricrea da solo.
- **Ritocchi del testo** toccano la didascalia, non la card.
- **Cambio formato** rifà la bozza e quindi la proposta.
- **Approvazione**: Instagram e TikTok senza visivo non si pubblicano, il bottone diventa «Crea prima il visivo».
  LinkedIn, Facebook e X possono uscire solo testo, con la nota «Esce senza immagine».
- **Contenuto approvato**: il visivo è bloccato come il testo, si sblocca con «Riapri la bozza».
- **Video**: resta il pannello delle scene. I template animati vengono dopo.

## Modello

### Kit visivo del brand

`Visual` (`src/domain/brand.ts`) guadagna `typography`: una coppia di Google Fonts dal catalogo (licenza OFL).
I brand già salvati senza il campo prendono la coppia di base. Dal Brand DNA si ricava il **kit** che i template
ricevono (`brandKit()` in `src/domain/visual.ts`):

- colori per ruolo (principale, secondario, accento, sfondo) e l'inchiostro leggibile sopra ciascuno;
- font di titoli e testo;
- logo e firma;
- decorazione: forme geometriche con «Geometrico piatto», nessuna altrimenti;
- trattamento foto: desaturato con «Fotografico desaturato», naturale altrimenti.

### Visivo del contenuto

`ContentVisual` (`src/domain/content.ts`) guadagna `design: VisualDesign | null` (nullo per i video):

```ts
type VisualKind = 'infographic' | 'photo' | 'mixed';
type VisualStatus = 'proposed' | 'creating' | 'ready' | 'failed';

interface CardText { kicker: string; headline: string; body: string; value: string; items: CardItem[]; author: string }
interface VisualPage { templateId: TemplateId; text: CardText }
interface VisualImage {
  description: string;
  source: 'generated' | 'upload';
  photoUrl: string | null;   // la foto, generata o caricata
  cutoutUrl: string | null;  // il soggetto scontornato, se un template lo chiede
}
interface VisualDesign {
  kind: VisualKind;
  pages: VisualPage[];        // una per il post, una per slide nel carosello
  image: VisualImage;
  status: VisualStatus;
  step: 'image' | 'cutout' | 'render' | null;
  error: string | null;
  nextPages: VisualPage[] | null;  // testi della bozza rifatta, da applicare con «Aggiorna il visivo»
  renders: VisualRender[];         // i PNG del server, per pagina e formato
}
```

I testi della card sono **semantici** (titolo, dato, punti…), non legati a un template: per questo «Cambia
layout» passa tra i template compatibili senza chiamare l'AI.

### Catalogo dei template

| Id | Nome | Tipo | Serve | Immagine |
|---|---|---|---|---|
| `statement` | Frase | infografica | titolo | |
| `stat` | Dato | infografica | numero, titolo | |
| `list` | Lista | infografica | titolo, 3–5 punti | |
| `steps` | Passi | infografica | titolo, 3–4 passi | |
| `quote` | Citazione | infografica | testo, autore | |
| `photo-cover` | Titolo sulla foto | foto | titolo | foto |
| `photo-frame` | Foto con fascia | foto | titolo | foto |
| `photo-only` | Solo foto | foto | | foto |
| `cutout-statement` | Frase con soggetto | mista | titolo | scontornata |
| `cutout-stat` | Dato con soggetto | mista | numero, titolo | scontornata |
| `split` | Metà foto | mista | titolo | foto |
| `point` | Punto del carosello | carosello | titolo, testo | |
| `closing` | Chiusura del carosello | carosello | titolo | |

Carosello: la prima pagina usa un template singolo (con l'indicatore di scorrimento), le centrali `point`,
l'ultima `closing`.

### Formati per canale

| Canale | Proporzione | PNG |
|---|---|---|
| Instagram, Facebook, LinkedIn | 4:5 | 1080 × 1350 |
| X | 1:1 | 1080 × 1080 |
| TikTok | 9:16 | 1080 × 1920 |
| Articolo (copertina) | 1.91:1 | 1200 × 628 |

I template lavorano a 1080 px di larghezza; l'anteprima li scala, quindi l'adattamento del testo è lo stesso.

## Architettura

```
App ─ anteprima dal vivo: src/templates in un componente DOM di Expo
 │
 └─► API (be-node) ── proposta nella bozza (Agent SDK)
        │            ── coda presenza.visual_jobs, eseguita nel processo dell'API
        │                 ├─ Gemini: foto (Nano Banana 2)
        │                 ├─ fal BiRefNet: scontorno
        │                 └─ be-render: PNG ──► Supabase Storage (presenza-media)
        └─ contenuti con URL firmati
be-render ─ Remotion + Chromium sempre acceso, senza stato: props del template → PNG
```

- **`src/templates/`**: componenti React DOM (niente React Native), con adattamento del testo, forme, firma e
  trattamento foto. Importano solo `src/domain/visual.ts`.
- **Nell'app** i template girano in un componente DOM di Expo (`'use dom'`): sul web sono componenti normali, sul
  telefono stanno in una WebView. Anteprima istantanea, anche sul mock, senza passare dal server.
- **`be-render/`**: pacchetto a parte con Remotion, per non mettere Chromium nel processo dell'API. Una
  composizione `Still` monta gli stessi template; attende font e immagini prima dello scatto.
- **Coda**: una riga per lavoro, presa con `for update skip locked`; al riavvio i lavori rimasti a metà tornano in
  coda. Lo stato visibile all'app sta nel contenuto (`design.status`, `design.step`), che l'app rilegge ogni due
  secondi mentre crea.
- **Storage**: bucket privato `presenza-media`, percorsi `account/brand/uuid.png`; il contenuto salva i
  percorsi e l'API li firma quando lo restituisce.

## Contratto API (nuove rotte)

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| PUT | `/api/contents/:contentId/visual` | `VisualEdit` | `Content` (modifiche senza AI; 409 durante la creazione) |
| POST | `/api/contents/:contentId/visual/propose` | | `Content` (proposta senza AI per le bozze nate prima) |
| POST | `/api/contents/:contentId/visual/create` | | `Content` (`creating`, il lavoro parte) |
| POST | `/api/contents/:contentId/visual/image` | | `Content` (rigenera solo la foto) |
| POST | `/api/contents/:contentId/visual/photo` | `{ dataUri }` | `Content` (usa una tua foto) |
| POST | `/api/contents/:contentId/visual/refresh` | | `Content` (applica i testi della bozza rifatta) |

`be-render`: `POST /render` con `{ kit, page, pageIndex, pageCount, image, aspect }` e `x-render-token` →
`image/png`.

## Fasi

### Fase 1 · Dominio e template

- [x] `src/domain/visual.ts`: tipi, catalogo, formati per canale, compatibilità, normalizzazione della proposta,
      regole di approvazione, kit del brand
- [x] `Visual.typography` e catalogo dei caratteri, con valore di base per i brand già salvati
- [x] `src/templates/`: i 13 template, testo che si adatta, forme, firma, trattamento foto
- [x] test del dominio

### Fase 2 · Flusso nell'app, sul mock

- [x] `ContentVisual.design`; la proposta nasce con la bozza nel mock
- [x] servizi: modifica del visivo, creazione con i passi, rigenera la foto, tua foto, aggiorna il visivo
- [x] `VisualCanvas`, componente DOM per l'anteprima dal vivo
- [x] pannello Visivo: proposta → creazione → ritocchi
- [x] anteprima del post con il visivo vero, regole di approvazione, avviso «Il testo è cambiato»
- [x] Profilo: scelta dei caratteri con l'anteprima di una card

### Fase 3 · Servizio di render

- [x] `be-render/`: composizione `Still` con `src/templates`, bundle, Chromium sempre acceso, `POST /render`
- [x] attesa di font e immagini prima dello scatto
- [x] prova in locale di ogni template in ogni formato (`npm run try`), con i layout corretti dove non reggevano

### Fase 4 · Backend

- [x] migrazione: `presenza.visual_jobs` e bucket `presenza-media` (applicata al progetto di sviluppo)
- [x] proposta nella bozza (`writeContent`) con il catalogo dei template nel prompt
- [x] rotte del visivo e coda dei lavori con ripresa dopo un riavvio
- [x] Storage con URL firmati alla lettura
- [x] servizi HTTP dell'app e rilettura durante la creazione
- [x] test con generatore, scontorno e render finti (`npm test`, 20 verdi)
- [x] giro vero in locale: bozza → Foto → Gemini → Storage → be-render → `ready` in 18 s → approvazione

### Fase 5 · Immagini AI

- [x] Gemini: descrizione + stile del brand + le foto già create dal brand come riferimento di stile
      (`gemini-3.1-flash-image`, `generateContent`, verificato dal vivo: ~14 s, 0,067 $)
- [ ] scontorno con BiRefNet su fal: scritto, **non verificato** (manca `FAL_KEY`)
- [x] foto dell'utente: caricamento (PNG, JPEG, WebP fino a 3 MB); lo scontorno segue la voce sopra
- [x] consumi in `ai_usage` (`image`, `cutout`)

### Fase 6 · Deploy

- [x] `be-render/Dockerfile` e servizio privato `presenza-render` in `render.yaml`, con indirizzo e token presi
      dal servizio
- [x] `render.yaml`, `.env.example` e README
- [ ] primo deploy: dipende dal piano a pagamento e dalla licenza Remotion (vedi «Decisioni aperte»)

### Dopo

- carosello in PDF per LinkedIn (documento)
- scheda stile con moodboard caricata dall'utente
- logo su Storage (oggi `logoUri` resta sul dispositivo)
- controlli automatici sul PNG: contrasto misurato sulla foto, margini di sicurezza per canale
- template animati per le scene `generated` dei video, con Remotion
- pubblicazione vera con i PNG

## Decisioni aperte

1. **Licenza Remotion.** Gratis fino a 3 dipendenti e per la valutazione. Per un'app che fa render per i clienti
   c'è il piano Automators ($0,01 a render, minimo $100 al mese): va chiesto a Remotion se gli still contano.
   Alternativa senza licenza per le sole immagini: Satori o una schermata con Playwright.
2. **`FAL_KEY`** per lo scontorno. Senza, i template con soggetto scontornato non si creano e la proposta li evita.
3. **`GEMINI_API_KEY`**: in locale presa da assieme; su Render va inserita dal pannello.
4. **Piano Render** per `be-render`: Chromium vuole almeno 2 GB, quindi un piano a pagamento.

## Rischi e limiti

- L'anteprima sul telefono gira in WebKit (iOS), il PNG in Chromium: l'adattamento del testo può differire di
  poco. Fa fede il PNG.
- Le foto di Gemini portano la filigrana invisibile SynthID.
- Per un personal brand non si genera il volto della persona: si carica la sua foto e la si scontorna.
- DeepSeek resta il modello dei testi: la descrizione dell'immagine esce dall'UE come il resto della bozza.
