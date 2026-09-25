# Video dei contenuti · piano di sviluppo

Stato: rivisto il 2026-09-24, dopo le prime prove con Higgsfield. Sostituisce il piano del 2026-09-17 (b-roll di
Seedance su fal più card del brand). Segue e riusa `docs/piano-visivi.md`.

## Obiettivo

Reel, storie e TikTok che sembrano fatti da chi conosce il brand, non da una macchina. Coerenti tra loro come le
card, e senza il sapore di AI che si sente subito: colori che virano, movimenti di gomma, posti che non esistono.

## Cosa abbiamo imparato

Le prove per un salone di parrucchieri con Higgsfield: il colore dei capelli cambia da un fotogramma all'altro,
il movimento non ha peso, i bordi sfarfallano. Non è un prompt da migliorare. I capelli sono migliaia di fili che
il modello ridisegna a ogni fotogramma, e per un parrucchiere sono **il prodotto**: un colore che vira è una
promessa falsa sul lavoro del salone. Lo stesso vale per il piatto di un ristorante, il gelato, un vestito.

## Principi

- **Il prodotto del cliente non si genera.** Quello che il brand vende si mostra vero: girato dal cliente o dalle
  sue foto. L'AI fa la regia, il contorno, la grafica e il montaggio.
- **L'AI dice cosa girare, il cliente gira.** Le riprese da fare col telefono sono il materiale migliore che
  abbiamo, e l'agente le chiede come le chiederebbe un regista: cosa, da dove, con che luce, quanto dura.
- **Il testo non sta mai dentro una clip generata.** Sta sopra, in Remotion, coi font del brand: si corregge
  all'infinito e non ricompra niente.
- **La coerenza la fa il montaggio.** Stessa correzione colore e stessa grana su tutto, stacchi sul tempo della
  musica, titoli animati dai template del brand, chiusura col logo disegnato e non generato.
- **Decide il modello, dentro il contesto del brand.** Brief, scene e tipo di ogni scena li sceglie l'agente;
  noi gli diamo il profilo del brand e cosa sa fare ogni strumento, non regole per settore.
- **Niente parte da solo.** Ogni passo che costa è un gesto dell'utente, come «Crea il visivo».

## I quattro tipi di scena

La regia divide il video in scene di pochi secondi, e per ognuna l'agente sceglie da dove arriva l'immagine.

| tipo | cosa è | chi lo fa | costo |
|---|---|---|---|
| **girato** (`shoot`) | una ripresa vera, con le istruzioni di cosa inquadrare | il cliente, col telefono | 0 |
| **foto viva** (`photo`) | una foto vera del brand mossa in Remotion: zoom lento, parallasse, tendina prima/dopo | nessun modello | 0 |
| **b-roll** (`broll`) | una clip generata di contorno: ambiente, oggetti, atmosfera, mai il prodotto | Higgsfield | a crediti |
| **grafica** (`graphic`) | solo tipografia animata, logo, forme, dati, nei colori e nei font del brand | Remotion | 0 |

Il **testo a schermo** non è un tipo: è un livello che ogni scena può avere. La **musica** scorre sotto tutto.

Un reel da 20 secondi per il salone:

```
0–3 s    grafica    «3 errori che sbiadiscono il tuo colore»
3–7 s    girato     il phon in controluce               + «1. l'acqua troppo calda»
7–9 s    b-roll     flaconi sul bancone, luce radente   + «2. lo shampoo sbagliato»
9–13 s   girato     la mano che passa tra i capelli     + «3. il sole senza protezione»
13–17 s  foto viva  prima/dopo di una cliente, tendina
17–20 s  grafica    «Prenota la tua consulenza colore» + logo
```

Per una trattoria le proporzioni cambiano da sole: più girato sull'impiattamento, b-roll di sala e cucina,
grafica per il menù. La differenza sta nel profilo video del brand, non nel codice.

## Il profilo video del brand

Scritto una volta dall'agente, accanto alla linea grafica (all'onboarding, o al primo video per i brand che
esistono già), e modificabile dal Profilo. Dice:

- **cosa vende e va mostrato vero**: i capelli, il piatto, il bouquet;
- **cosa si può generare** senza tradire nessuno: l'ambiente, i materiali, la luce;
- **le riprese tipiche da chiedere**, nel mondo del cliente: «il phon in controluce», «l'impiattamento dall'alto»;
- **come si muove il brand**: correzione colore, grana, ritmo, come entrano i titoli;
- **come suona**: genere, velocità, strumenti, atmosfera.

Nella cartella di lavoro diventa `VIDEO.md`, e l'agente lo legge come legge `BRAND.md`. Per i settori misti (il
salone che vende anche prodotti, il ristorante col cocktail bar) è l'agente a scriverlo giusto, caso per caso.

## Flusso nell'app: il Video Studio

Nella schermata Contenuto, formato video, il passo del visivo diventa il **Video Studio**.

1. **«Prepara la bozza»** scrive i testi per canale e, per il video, **lo script** (l'aggancio, lo sviluppo, la
   chiusura, in poche righe) e **la regia**: le scene con tipo, durata, cosa si vede e testo a schermo. Solo
   testo, costa poco. Ogni scena resta modificabile, tipo compreso.
2. **«Monta il video»**: l'agente monta subito, anche senza girati. Dove manca una ripresa mette un cartello
   («qui: il phon da dietro, 4 s»). Si vedono ritmo e storia prima di girare una sola scena.
3. **I girati**: ogni scena `shoot` ha «Carica il girato». La Home ha già il compito «da girare» (`scenesToShoot`).
   Su ogni scena girata c'è anche **«Non posso girarla»**: l'agente la rifà come foto viva, grafica o b-roll di
   contorno, mai inventando il prodotto.
4. **Il b-roll**, con un gesto esplicito: prima il fotogramma (Nano Banana Pro, con le foto del brand come
   riferimento), poi il movimento. Si approva l'immagine prima di comprare la clip; ogni scena si rifà da sola e
   si può bloccare col lucchetto.
5. **Si rimonta** quante volte si vuole: il montaggio non costa generazioni.

Casi di confine, come per le card:

- **Rifai la bozza** rifà script e regia; le clip e i girati già caricati restano finché la scena esiste.
- **Approvazione**: Instagram e TikTok in formato video non si pubblicano senza un montaggio senza cartelli.
- **Contenuto approvato**: il video è bloccato come il testo, si sblocca con «Riapri la bozza».

## Musica

**ElevenLabs Music**, verificato il 2026-09-24:

- API ufficiale, a consumo **0,15 $ al minuto**; licenza commerciale dal piano Starter, l'output è nostro;
- `force_instrumental` garantisce tracce senza voce; da 3 s a 10 min; `composition_plan` per sezioni (intro,
  crescendo, chiusura); `seed` e audio di riferimento sui modelli v2 e v2.5;
- nessuna esclusività: tracce simili possono uscire ad altri. Per un sottofondo va bene;
- vietati nei prompt nomi di artisti, titoli e testi: il suono si descrive in termini musicali;
- non restituisce BPM né battiti.

Come la usiamo:

- **una libreria per brand, non una traccia per video**: 4–6 tracce strumentali di stati d'animo diversi,
  generate al primo video dal «come suona» del profilo. La prima fa da riferimento per le altre. Un brand che
  suona sempre uguale è riconoscibile, e si paga una volta (meno di 1 $);
- **la velocità è fissata nel piano della traccia**, così il montaggio fa cadere gli stacchi sul tempo;
- niente voci cantate: sono la parte più finta della musica generata.

Suno è stato scartato: non ha un'API pubblica, e i servizi che la simulano passano da account Suno senza
trasferire i diritti commerciali.

## Architettura

```
App ─ Video Studio: script, regia, girati, lettore del montaggio
 │
 └─► API (be-node, avviata da be-agent)
        ├─ bozza: script + regia nell'output strutturato (Agent SDK)
        ├─ coda: lavori video per contenuto
        └─ be-agent, compito 'video', nella cartella del brand:
             ├─ BRAND.md, VIDEO.md, linea/, esempi/, media/ (girati e foto del brand)
             ├─ Higgsfield (MCP): fotogrammi e b-roll, i file copiati nella libreria
             ├─ ElevenLabs: le tracce del brand
             ├─ remotion/: il montaggio lo scrive l'agente, in React
             └─ guarda · consegna: vede i fotogrammi, mette l'MP4 nella libreria
```

- Il montaggio è già dove serve: `be-agent/src/video.ts` prepara il progetto Remotion nella cartella di lavoro,
  ffmpeg è quello di Remotion, `guarda` gli restituisce i fotogrammi e `consegna` porta il file nella libreria.
  Un hook `Stop` non lo lascia uscire senza aver consegnato.
- Higgsfield entra con il token della sessione del CLI (`higgsfield auth login`), e l'agente vede solo i tool che
  generano (63 su 69): niente pubblicazioni su TikTok, acquisti o esecuzione di codice remoto.
- **Storage**: stesso bucket privato `presenza-media`, percorsi `account/brand/uuid.ext`, firmati alla lettura.

## Modello

```ts
type SceneSource = 'shoot' | 'photo' | 'broll' | 'graphic';

interface VideoScene {
  title: string;
  description: string;   // cosa si vede; per un girato, come girarlo
  seconds: number;
  source: SceneSource;
  overlay: string;       // il testo a schermo, vuoto se non ce n'è
}

interface ContentVisual {
  // ...
  script: string;        // lo script del video, vuoto negli altri formati
  scenes: VideoScene[];
}
```

Le bozze salvate prima di questo piano hanno `source: 'generated'`, che allora voleva dire «testo a schermo o
grafica»: si leggono come `graphic`.

Nelle fasi dopo, ogni scena guadagna i suoi file (il girato, il fotogramma, la clip, lo stato, il lucchetto) e il
contenuto un `VideoCut` con l'MP4 montato, lo stato del lavoro e la traccia usata.

## Costi

Da misurare al primo giro vero con Higgsfield: è a crediti in abbonamento, e il prezzo di una clip dipende dal
modello che l'agente sceglie. Quello che sappiamo già:

| ingrediente | prezzo |
|---|---|
| script e regia | una bozza di testo |
| girato, foto viva, grafica, montaggio | 0 $ di generazioni |
| libreria musicale del brand, 6 tracce da 1 min | circa 0,90 $, una volta |
| b-roll | crediti Higgsfield, da misurare |

La scelta dei tipi di scena è anche la leva del costo: un video fatto di girati, foto e grafica non compra niente.

**Tetto di spesa.** `ai_usage` registra già il costo per operazione: servono un budget per video e uno mensile
per account, i modelli di Higgsfield ammessi, e un contatore nell'app.

## Fasi

### Fase 1 · Script e regia

- [x] dominio: `SceneSource` a quattro tipi, testo a schermo, script; le bozze vecchie si leggono
- [x] la bozza scrive script e regia coi quattro tipi
- [x] mock allineato
- [x] Video Studio nell'app: script, scene con tipo, durata e testo a schermo

### Fase 2 · Profilo video del brand

- [x] `brand.visual.video` nel dominio, e nel Profilo (sezione Visivo) da correggere a mano o rifare
- [x] si scrive con la prima linea, in parallelo; al primo video per i brand che non ce l'hanno, prima della regia
- [x] la regia della bozza lo riceve nel prompt; `VIDEO.md` nella cartella di lavoro dell'agente

### Fase 3 · Montaggio con i cartelli

- [x] il lavoro `video-cut` in coda, con i passi visibili come gli altri; ripreso se si esce e si rientra
- [x] «Monta il video»: l'agente monta grafica, testi e cartelli al posto del materiale mancante, senza Higgsfield
  (`generate: false`), in una sottocartella per contenuto (`video/<id>/`)
- [x] il lettore nel Video Studio (`expo-video`), l'MP4 firmato alla lettura; «la regia è cambiata» con `cutKey`

### Fase 4 · I girati del cliente

- [x] «Carica il girato» (o la foto, per una foto viva) per scena, dal Video Studio; il compito «da girare» della
  Home porta lì e conta solo le scene senza girato. Il file va dritto nel bucket con un indirizzo firmato di
  caricamento (`storage.uploadUrl`), poi si conferma il percorso: un girato non passa dall'API
- [x] «Non posso girarla»: la scena rifatta dalla regia con un altro tipo (lavoro `video-scene`, coi passi)
- [x] il materiale caricato arriva nella cartella del montaggio (`media/scena-N.ext`); le foto del brand sono già
  in `esempi/foto/` e `riferimenti/`

Il materiale si carica e il video si rimonta anche a contenuto approvato: si gira dopo aver deciso cosa girare, ed
è proprio la Home a chiederlo per le uscite programmate. Cambiare la regia («Non posso girarla», rifare la bozza)
resta bloccato fino a «Riapri la bozza». La regola «niente video pubblicato coi cartelli» arriva con la Fase 5: oggi
bloccherebbe ogni video con una scena di b-roll, che non si può ancora generare.

### Fase 5 · B-roll

- [x] fotogramma prima, clip dopo, con un gesto per ciascuno (lavori `video-frame` e `video-clip`): l'agente riceve
  le foto del brand e il fotogramma come indirizzi firmati, genera con Higgsfield, e non esce finché non è arrivato
  un file (`waitBeforeLeaving`)
- [x] rifai il fotogramma (butta la clip), un'altra ripresa, lucchetto; il montaggio usa le clip
- [x] tetto per account: fotogrammi e clip riusciti nel mese, contati in `ai_usage` (`BROLL_MONTHLY_LIMITS`)
- [x] la regola «niente video coi cartelli» vale per **pubblicare adesso** su Instagram e TikTok; programmare si può
  (si gira dopo aver programmato, è la Home a chiederlo)
- [ ] i crediti veri di Higgsfield: `ai_usage` oggi registra il costo di Claude, non quello della clip
- [ ] le due qualità: 720p per provare, 1080p per le scene bloccate

### Fase 6 · Musica

- [x] ElevenLabs Music (`media/music.ts`, `composition_plan`, `force_instrumental`): la libreria del brand
  (`brand.visual.music`, 4–6 tracce) dal «come suona» del profilo. Il piano lo scrive l'agente (`music-plan`), le
  tracce si compongono in parallelo; consumi in `ai_usage` (task `music`, 0,15 $/min)
- [x] nasce al primo montaggio se manca (se non riesce, si monta senza); dal Profilo si ascolta e si rifà
  (lavoro `brand-music`, lettore `expo-audio`)
- [x] velocità nel piano della traccia; chi monta sceglie la traccia, la taglia e fa cadere gli stacchi sul tempo;
  il montaggio ricorda quale ha usato (`cut.trackId`)
- [x] la musica nel Video Studio: la riga «Musica» del montaggio dice quale suona, la fa ascoltare e la cambia
  (`content.visual.musicId`: assente = sceglie chi monta, `null` = senza, un id = quella traccia). Cambiarla non
  costa generazioni: il montaggio risulta da rifare (la scelta entra in `cutKey`)

### Fase 7 · Deploy

- [ ] macchina per il montaggio (Remotion e ffmpeg non girano sui 512 MB gratuiti)
- [ ] la sessione di Higgsfield su un server senza nessuno davanti
- [ ] `render.yaml`, `.env.example`, README

## Decisioni aperte

1. **Licenza ElevenLabs.** I termini parlano di accordi a parte per chi rivende o incorpora i loro servizi per
   terzi (sezione 17, «OEM Terms»). Una mail per sapere se un'app che mette la musica nei video che consegna ai
   suoi clienti ci rientra. Nel frattempo si sviluppa.
2. **Licenza Remotion.** Gratuita fino a 3 persone; il piano «for Automators» (minimo 100 $ al mese) è pensato
   per chi genera video per i propri utenti. Una mail sola che chieda se l'uso di un'app come questa sta nella
   licenza gratuita.
3. **Higgsfield in un SaaS.** Un solo account a crediti, con la sessione del CLI che ruota il token: regge per
   sviluppare. Per la produzione vanno chiariti i termini di rivendita e cosa succede nei mesi pieni.
4. **Voce fuori campo.** Per ora no: testo a schermo e musica. Il TTS italiano c'è (Higgsfield porta ElevenLabs
   e altri), ma è un capitolo a parte.
5. **Audio di tendenza su TikTok.** Aiuta la diffusione, ma non passa da noi. Per ora solo la musica del brand.

## Rischi e limiti

- **Persone generate.** Un finto cliente o un finto titolare è un rischio di reputazione. Persone solo di spalle,
  mani o lontane; i volti veri solo dal girato del cliente.
- **Deriva fra le scene di b-roll**: il fotogramma di partenza la contiene, ma due clip restano due riprese. Per
  il contorno va bene, e la correzione colore comune del montaggio fa il resto.
- **Il cliente che non gira**: il video non deve dipendere da lui. Con «Non posso girarla» ogni scena ha
  un'alternativa, e un video di sole foto vive e grafica resta un video vero.
- **Tempi**: il montaggio sono minuti, il b-roll anche. Il pannello deve mostrare i passi, e il lavoro deve
  sopravvivere a un riavvio (la coda lo fa già).
- **Dati fuori dall'UE**: clip e musica passano da Higgsfield ed ElevenLabs.
