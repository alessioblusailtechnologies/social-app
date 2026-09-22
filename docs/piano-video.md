# Video dei contenuti · piano di sviluppo

Stato: da cominciare, deciso il 2026-09-17. Segue e riusa `docs/piano-visivi.md`.

## Obiettivo

Reel, storie e TikTok fatti in casa: poche clip generate dall'AI, montate dai template del brand. Coerenti tra
loro come le card, e a un costo che regge i ripensamenti — perché è lì che si spende davvero.

Prima famiglia: **b-roll più card del brand**. Clip d'ambiente (il luogo, le mani al lavoro, il dettaglio,
l'atmosfera) con sopra i titoli, i sottotitoli e la chiusura del brand. Niente personaggi ricorrenti, niente
avatar che parlano: vengono dopo, e il dominio è pronto ad accoglierli.

## Principi

- **Il modello video non gira mai il reel.** Produce solo ingredienti: clip mute di 4–6 secondi. Il montaggio —
  testi, logo, sottotitoli, musica, stacchi, durata, ordine — lo fa sempre il brand. Un refuso o un claim da
  cambiare non ricomprano niente.
- **Il testo non sta mai dentro la clip generata.** Sta nell'overlay: font del brand, italiano corretto,
  modificabile all'infinito.
- **Quello che è del brand non si genera: si disegna.** Logo, tipografia, sfondi, forme, dati che si animano,
  transizioni: tutto deterministico, in 3D o in 2D, dentro il nostro renderer. Si compra dal modello solo il
  mondo reale, che non si modella (vedi «Il 3D, e cosa non compriamo»).
- **Prima il fotogramma, poi il video.** Ogni scena nasce da un keyframe fatto con Gemini, con le foto già create
  dal brand come riferimento di stile. Si approva l'immagine (0,067 $) prima di comprare il movimento (0,13 $).
- **Si paga per scena, non per reel.** Ogni scena ha il suo stato e il suo lucchetto: rifarne una non ricompra le
  altre.
- **Due qualità.** 720p muto per provare, 1080p solo quando si approva, e solo per le scene bloccate.
- **Niente parte da solo.** «Crea i fotogrammi», «Anima le scene», «Monta il video» sono tre gesti dell'utente,
  come «Crea il visivo».
- **Le scene da girare restano da girare.** Le `VideoScene` con `source: 'shoot'` non si generano: l'utente carica
  il suo girato, e il montaggio lo tratta come le altre.

## Flusso nell'app

Nella schermata Contenuto, formato video. Il pannello Scene che c'è oggi diventa il pannello **Video**.

1. **«Prepara la bozza»** scrive il testo per canale e lo storyboard — già fa questo — e in più, per ogni scena
   `generated`, **cosa si vede** e **come si muove**. Non genera niente.
2. **«Crea i fotogrammi»**: per ogni scena generata un keyframe con Gemini, in parallelo. Nel pannello ogni scena
   mostra la sua immagine, la durata, la descrizione modificabile e il tipo (*La genero io · Da girare*). Le scene
   da girare mostrano «Carica il tuo girato».
3. Si guardano i fotogrammi e si rifà quello che non va: **«Rifai il fotogramma»**, 0,067 $. È il filtro che
   protegge la spesa vera.
4. **«Anima le scene»**: le clip a 720p mute, una per scena, in coda. Ogni scena ha *‹ Rivedi ›* con il suo
   lettore, **«Rifai questa scena»** (stesso seed, descrizione cambiata) e **«Un'altra ripresa»** (seed nuovo).
   Il **lucchetto** blocca una scena che va bene: non si tocca più e passerà in alta qualità.
5. **«Monta il video»**: `be-render` mette insieme clip, card animate, sottotitoli e musica e restituisce l'MP4
   9:16 di anteprima. Si rimonta quante volte si vuole: non costa AI.
6. **All'approvazione, «Porta in alta qualità»**: si ricomprano in 1080p solo le scene bloccate, e si rimonta.

Casi di confine:

- **Rifai la bozza** rifà testo e storyboard. Le scene già animate restano, con «Il testo è cambiato» e
  «Aggiorna il video»: nulla si ricrea da solo.
- **Ritocchi del testo** toccano la didascalia, non i sottotitoli: quelli hanno il loro campo.
- **Approvazione**: Instagram e TikTok in formato video non si pubblicano senza il montaggio pronto.
- **Contenuto approvato**: il video è bloccato come il testo, si sblocca con «Riapri la bozza».

## Costi

Listino fal del 17/09/2026, 9:16, formula a token `h · w · fps · durata / 1024`.

| ingrediente | prezzo |
|---|---|
| keyframe (Gemini 3.1 Flash Image, 2K) | 0,067 $ |
| clip 5 s · 720p · muta (Seedance 1.5 Pro) | 0,13 $ |
| clip 5 s · 1080p · muta | 0,29 $ |
| clip 5 s · 1080p · con audio del modello | 0,58 $ |
| montaggio | 0 $ di AI |

Un reel vero — 20 secondi, 4 scene, con due ripensamenti sui fotogrammi e due sulle clip:

```
6 keyframe (4 + 2 rifatti)      0,40 $
6 clip 720p (4 + 2 rifatte)     0,78 $
4 clip 1080p, solo le bloccate  1,17 $
montaggi, quanti se ne vuole    0,00 $
                                ------
                                2,35 $
```

Lo stesso reel comprato tutto da Seedance 2.5 (0,473 $/s a 720p) e rifatto due volte fa **28 $**. È tutta qui la
differenza fra un prodotto che si può usare e uno che non si può vendere.

Per confronto, se un giorno servisse la coerenza forte di un personaggio ricorrente: Seedance 2.0
reference-to-video, 0,3024 $/s a 720p (0,1814 $/s con un video di riferimento), fino a 9 immagini di riferimento e
stacchi gestiti dal modello. Resta un'opzione per il futuro, non il motore di base.

**Tetto di spesa.** `ai_usage` registra già il costo per operazione: bastano i task `frame` e `clip`, un budget
mensile per account con blocco, e un contatore nell'app («ti restano N video in alta qualità questo mese»).
Una cache su `(descrizione, movimento, seed, keyframe, durata, risoluzione)` fa sì che premere due volte non
ricompri.

## Il 3D, e cosa non compriamo

Due mondi, e conviene tenerli separati.

**Il mondo del brand lo facciamo in casa, in 3D deterministico.** Sfondi geometrici animati, logo che si muove,
tipografia cinetica, un dato che cresce, mockup, transizioni: niente di tutto questo va chiesto a un modello.
`@remotion/three` fa girare React Three Fiber dentro lo stesso Chromium che abbiamo già acceso
(`chromiumOptions: { gl: 'angle' }` per il render sul server). Il che significa:

- stessi componenti React, stesso bundle, stesso servizio, stesso token: zero infrastruttura nuova;
- **l'anteprima dal vivo nell'app funziona già**: il componente DOM con `'use dom'` mostra la stessa scena che il
  server poi registra. Con Blender questa parità non l'avremmo mai;
- deterministico: stesso input, stesso fotogramma. Ogni ripensamento costa CPU, non dollari;
- `useOffthreadVideoTexture()` mette una clip AI come texture dentro la scena: il b-roll che scorre su una
  superficie del brand.

**Il mondo reale lo compriamo.** Il salone, le mani che lavorano, il piatto, la strada: roba che nessuno modella
in 3D per un post.

### La passata unica alla Blender

L'idea — costruisco la scena in 3D, la rifaccio quante volte voglio gratis, e pago il modello una volta sola per
renderla fotorealistica — funziona davvero, e si chiama video-to-video guidato dalla struttura. Blender ha un
vantaggio secco: i passaggi di **profondità e maschera li esporta lui**, quindi non si paga l'estrazione
(0,04 $/s). La passata costa 0,05 $/s a 480p e 0,10 $/s a 720p (famiglia Wan VACE su fal): 2 $ per venti secondi
a 720p.

Da sapere prima di innamorarsene:

- **Non è più economica** del b-roll (0,52–1,17 $ per lo stesso reel). Compra *controllo e coerenza*, non un
  prezzo più basso. Quello che diventa gratis è l'iterazione prima della passata finale.
- **Il costo si sposta sull'asset**: nessuno dei nostri clienti ha una scena 3D del suo negozio, e costruirla non
  si automatizza per post. Regge solo con una libreria di scene riusabili parametrizzate dal kit del brand.
- **E sulla macchina**: Blender headless in Docker, EEVEE senza GPU gira in software ed è lento, Cycles su CPU è
  fuori discussione. Servirebbe una macchina con GPU (che Render non dà) e un'immagine più grande di un giga.

Quindi non ora. Ma `VideoShot.clip` non sa da dove arriva la clip: il giorno che servisse un prodotto fisico
riconoscibile o una simulazione vera, la strada si innesta senza toccare il resto.

### Piattaforme che non integriamo

- **Higgsfield**: la cosa che vale sono i movimenti di macchina nominati (dolly, crash zoom, corpo macchina,
  ottica) al posto dei prompt a caso. Ma è a crediti in abbonamento (15 / 39 / 99 $ al mese, che non si cumulano)
  con l'API appoggiata sopra: per un SaaS multi-cliente vuol dire rivendere l'abbonamento di un altro, pagando a
  vuoto i mesi scarichi e andando a muro in quelli pieni. L'idea la copiamo — preset di movimento invece di testo
  libero — il servizio no.
- **MaxFusion**: UGC con attori AI, voci ElevenLabs, prodotto in mano. È la famiglia «avatar che parla», già
  scartata, e per i nostri clienti un finto cliente soddisfatto è un rischio di reputazione oltre che un contenuto
  da etichettare.

## Modello

`ContentVisual` guadagna `video: VideoDesign | null` (nullo per i post), accanto a `design`.

```ts
type VideoQuality = 'draft' | 'final';   // 720p muto · 1080p
type ShotStatus = 'proposed' | 'framing' | 'framed' | 'animating' | 'ready' | 'failed';

interface VideoShot {
  /** Titolo, durata e tipo restano nella VideoScene di pari indice. */
  description: string;      // cosa si vede, modificabile
  motion: string;           // come si muove la camera o il soggetto
  seed: number;             // fisso: si rifà senza cambiare il look
  frame: MediaFile | null;  // il keyframe, da Gemini o caricato
  clip: MediaFile | null;   // la clip, generata o il girato dell'utente
  quality: VideoQuality;    // di che qualità è la clip che c'è adesso
  locked: boolean;          // approvata: non si tocca, e va in alta qualità
  status: ShotStatus;
  error: string | null;
}

interface VideoDesign {
  shots: VideoShot[];              // una per scena, anche per quelle da girare
  captions: boolean;               // sottotitoli dal testo che abbiamo già scritto
  musicId: string | null;          // dalla libreria, non generata
  voice: 'none' | 'tts';
  quality: VideoQuality;           // quella del montaggio attuale
  cut: MediaFile | null;           // l'MP4
  status: 'proposed' | 'working' | 'ready' | 'failed';
  step: 'frame' | 'clip' | 'assemble' | null;
  error: string | null;
}
```

Le descrizioni sono **semantiche**: cosa si vede e come si muove, non «prompt per Seedance». Il prompt vero lo
compone il server, come già fa `photoPrompt`, aggiungendo lo stile del brand.

### Formato

Un solo formato: 9:16, 1080 × 1920 (720 × 1280 in bozza), 24 fps. Instagram e TikTok lo vogliono così; per
Facebook e LinkedIn lo stesso file va bene. Il 1:1 e il 16:9 vengono dopo, se servono.

## Architettura

```
App ─ pannello Video: scene, fotogrammi, lettore per scena, montaggio finale
 │
 └─► API (be-node) ── storyboard + descrizioni nella bozza (Agent SDK)
        │            ── coda presenza.visual_jobs: 'frame' | 'clip' | 'assemble'
        │                 ├─ Gemini: keyframe (come le foto delle card)
        │                 ├─ fal Seedance 1.5 Pro: image-to-video, coda asincrona
        │                 └─ be-render: MP4 ──► Supabase Storage (presenza-media)
        └─ contenuti con URL firmati
be-render ─ overlay animati con Remotion + montaggio con ffmpeg
```

- **Un lavoro per scena.** `visual_jobs.kind` guadagna `'frame'`, `'clip'` e `'assemble'`. Il parallelismo e il
  rework granulare vengono gratis dalla coda che c'è già, con `for update skip locked` e la ripresa dopo un
  riavvio.
- **Chiamate lunghe.** Una clip ci mette 1–3 minuti: serve la **coda asincrona di fal** (`queue.submit` più
  polling), non la chiamata sincrona che usiamo per BiRefNet. Il timeout del lavoro sale, e l'app — che rilegge
  ogni due secondi — mostra a che punto è ogni scena.
- **`media/video.ts`**: un `VideoGenerator` con la stessa forma di `ImageGenerator` e `CutoutService` —
  `available`, `generate()`, consumi in `ai_usage`, `assertPublicUrl` sul risultato. Stessa `FAL_KEY` dello
  scontorno.
- **Il confine dentro be-render.** Due pezzi separati, apposta:
  - **overlay**: Remotion disegna solo la parte animata del brand (titolo, sottotitoli, firma, chiusura) come
    WebM con canale alpha, o come PNG con alpha nella prima fase. Pochi secondi di render, non venti. È anche il
    posto dove entra il 3D, con `@remotion/three` e `chromiumOptions: { gl: 'angle' }`.
  - **montaggio**: ffmpeg concatena le clip, sovrappone gli overlay, mette la musica e codifica l'MP4.

  Così Chromium non deve disegnare seicento fotogrammi (tempi e memoria crollano) e, se la licenza Remotion
  diventasse un problema, si sostituisce solo l'overlay: il montaggio resta dov'è.
- **Storage**: stesso bucket privato `presenza-media`, stessi percorsi `account/brand/uuid.mp4`, stessa firma
  alla lettura.

## Contratto API (nuove rotte)

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| PUT | `/api/contents/:id/video` | `VideoEdit` | `Content` (descrizioni, sottotitoli, musica; senza AI) |
| POST | `/api/contents/:id/video/frames` | | `Content` (keyframe di tutte le scene generate) |
| POST | `/api/contents/:id/video/shots/:i/frame` | | `Content` (rifà un keyframe) |
| POST | `/api/contents/:id/video/shots/:i/clip` | `{ take: 'same' o 'new' }` | `Content` (anima una scena) |
| POST | `/api/contents/:id/video/shots/:i/upload` | `{ dataUri }` | `Content` (il girato dell'utente) |
| POST | `/api/contents/:id/video/animate` | | `Content` (anima le scene che non hanno clip) |
| POST | `/api/contents/:id/video/assemble` | | `Content` (monta) |
| POST | `/api/contents/:id/video/final` | | `Content` (1080p delle scene bloccate, poi rimonta) |

`be-render`: `POST /reel` con `{ kit, shots: [{ clipUrl, seconds, overlay }], captions, musicId, aspect }` e
`x-render-token` → `video/mp4`.

## Fasi

### Fase 1 · Dominio

- [ ] `src/domain/video.ts`: tipi, formato, formule di costo, passi della creazione, regole di approvazione
- [ ] `ContentVisual.video` e storyboard con descrizione e movimento
- [ ] test del dominio

### Fase 2 · Flusso nell'app, sul mock

- [ ] pannello Video: scene con fotogramma, lettore, lucchetto, ripresa nuova
- [ ] clip e montaggio finti nel mock, con i passi e l'avanzamento
- [ ] anteprima del post col video, regole di approvazione

### Fase 3 · Generazione

- [ ] keyframe con Gemini, riusando `photoPrompt` e le foto del brand come riferimento
- [ ] `media/video.ts`: Seedance 1.5 Pro su fal, coda asincrona, 720p e 1080p
- [ ] coda: lavori `frame`, `clip`, `assemble`, uno per scena
- [ ] consumi in `ai_usage` (`frame`, `clip`) e tetto per account

### Fase 4 · Montaggio

- [ ] `be-render`: `POST /reel`, overlay Remotion con alpha, montaggio ffmpeg, sottotitoli, musica
- [ ] ffmpeg nel Dockerfile, prova in locale di un reel intero

### Fase 4 bis · Il brand in movimento (3D)

- [ ] `@remotion/three` in `be-render` e `gl: 'angle'`; una scena di prova che regge il render headless
- [ ] due o tre scene parametrizzate dal kit: sfondo geometrico, titolo in tipografia cinetica, chiusura col logo
- [ ] le stesse scene nell'anteprima dal vivo dell'app (`'use dom'`), come già fanno le card

### Fase 5 · Deploy

- [ ] piano a pagamento per `be-render` (2 GB) e tempi della coda
- [ ] `render.yaml`, `.env.example`, README

## Decisioni aperte

1. **Licenza Remotion.** La licenza gratuita vale «per individui e aziende fino a 3 persone», senza iscrizione:
   se siamo dentro quella soglia copre i video come già copre i PNG, e non aggiungiamo un rischio nuovo. Il piano
   «Remotion for Automators» (0,01 $ a render, **minimo 100 $ al mese**) è pensato per le app che generano video
   per i propri utenti, che è quello che siamo: la soglia è sulle persone, la descrizione è sull'uso, e le due
   cose non combaciano. Va mandata **una sola email** a Remotion che chiede tutte e due le cose — se gli still
   contano e se l'overlay animato di un'app come questa sta nella licenza gratuita. Nel frattempo si parte, e il
   confine overlay/montaggio tiene aperta la porta.
2. **Macchina.** Il montaggio non gira sui 512 MB gratuiti: piano standard da 2 GB e 25 $ al mese. I tempi
   passano da secondi a minuti.
3. **`FAL_KEY`**: già aperta per lo scontorno, qui diventa obbligatoria.
4. **Musica**: una libreria con licenza chiara (poche tracce scelte, non generate) da mettere su Storage.
5. **Voce**: per ora nessuna. Il TTS italiano è un capitolo a parte, e i sottotitoli coprono già la comprensione
   senza audio, che è come si guardano i reel.
6. **Blender e la passata guidata**: rimandata, non scartata. Si riapre quando un cliente porta un prodotto
   fisico riconoscibile, o quando la libreria di scene riusabili vale il lavoro di costruirla. Prima di allora
   servono una macchina con GPU e qualcuno che modelli.

## Rischi e limiti

- **L'audio del modello non si compra**: raddoppia il prezzo, non è controllabile e in italiano non è affidabile.
  Le clip si chiedono mute.
- **Deriva fra le scene**: il keyframe e il seed fisso la contengono, ma due scene restano due riprese diverse.
  Per il b-roll va benissimo; per una storia con un personaggio riconoscibile no, e lì servirà Seedance 2.x.
- **Tempi**: un reel da quattro scene sono 3–5 minuti di attesa. Il pannello deve dirlo, e il lavoro deve
  sopravvivere a un riavvio (la coda lo fa già).
- **Filigrane**: i keyframe di Gemini portano SynthID invisibile. Se le clip di fal escano con una filigrana
  visibile va verificato al primo giro vero, prima di costruirci sopra.
- **Dati fuori dall'UE**: le clip passano da fal e da un modello ByteDance, come i testi passano da DeepSeek.
- **Volti**: per un personal brand non si genera il volto della persona. Si carica il suo girato, oppure la scena
  resta `shoot`.
