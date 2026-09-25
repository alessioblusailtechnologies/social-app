import type { ChannelId, VoiceCard } from './brand';
import type { IdeaFormat, IdeaSource } from './idea';
import { needsMedia, type MediaFile, type VisualDesign } from './visual';

/**
 * Il contenuto: la bozza che l'AI prepara, con una variante di testo per ogni canale e il
 * visivo adatto al formato. Nasce da un'idea dentro un'uscita del piano, oppure direttamente
 * da una fonte dell'utente; in quel caso entra nel piano quando viene programmato.
 */

export interface ChannelVariant {
  channel: ChannelId;
  text: string;
  hashtags: string[];
  /** Con che formato esce su questo canale: cambia solo il visivo, non il testo. Assente: quello del contenuto. */
  format?: IdeaFormat;
  /** Su questo canale esce senza immagine, solo dove il canale lo permette. */
  withoutImage?: boolean;
}

export interface CarouselSlide {
  title: string;
  body: string;
}

/**
 * Da dove arriva l'immagine di una scena. Il prodotto del brand si mostra vero (girato o foto);
 * il b-roll generato è solo contorno, la grafica è tutta nostra.
 */
export const SCENE_SOURCES = ['shoot', 'photo', 'broll', 'graphic'] as const;

export type SceneSource = (typeof SCENE_SOURCES)[number];

export const SCENE_SOURCE_LABELS: Record<SceneSource, string> = {
  shoot: 'Da girare',
  photo: 'Foto viva',
  broll: 'B-roll',
  graphic: 'Grafica',
};

export interface VideoScene {
  title: string;
  /** Cosa si vede; per un girato, come girarlo. */
  description: string;
  seconds: number;
  source: SceneSource;
  /** Il testo a schermo, sopra l'immagine: vuoto se non ce n'è. */
  overlay: string;
  /** Il materiale vero caricato da chi pubblica: il girato di una scena «shoot», la foto di una «photo». */
  footage?: MediaFile | null;
  /** B-roll: il fotogramma di partenza, da approvare prima di comprare il movimento. */
  frame?: MediaFile | null;
  /** B-roll: la clip generata dal fotogramma. */
  clip?: MediaFile | null;
  /** Va bene così: non si rigenera più, né il fotogramma né la clip. */
  locked?: boolean;
}

/**
 * I canali che non possono far uscire il video adesso: Instagram e TikTok vogliono il montaggio finito, senza cartelli.
 * Programmarlo si può lo stesso: si gira dopo aver deciso cosa girare, ed è la Home a chiederlo.
 */
export function channelsWaitingForVideo(content: Content): ChannelId[] {
  if (content.format !== 'video' || videoReady(content.visual)) return [];
  const skipped = channelsWithoutImage(content);
  return content.channels.filter((channel) => needsMedia(channel) && !skipped.includes(channel));
}

/** Quante generazioni di b-roll si fanno al mese per account: il tetto di spesa, finché non c'è un piano vero. */
export const BROLL_MONTHLY_LIMITS = { frames: 120, clips: 40 } as const;

/**
 * Il montaggio si può pubblicare: c'è, è della regia di adesso, e nessuna scena ha più il cartello. Senza, Instagram e
 * TikTok aspettano, come aspettano la card di un post.
 */
export function videoReady(visual: Pick<ContentVisual, 'script' | 'scenes' | 'cut' | 'musicId'>): boolean {
  const cut = visual.cut ?? null;
  return cut !== null && cut.placeholders === 0 && cut.from === cutKey(visual);
}

/** Cosa si carica per una scena: un video per i girati, una foto per le foto vive. Nulla per le altre. */
export function footageKind(source: SceneSource): 'video' | 'image' | null {
  return source === 'shoot' ? 'video' : source === 'photo' ? 'image' : null;
}

/** I tipi di file accettati come materiale, con quanto possono pesare. */
export const FOOTAGE_TYPES: Record<'video' | 'image', { mimeTypes: readonly string[]; maxBytes: number }> = {
  video: { mimeTypes: ['video/mp4', 'video/quicktime'], maxBytes: 200 * 1024 * 1024 },
  image: { mimeTypes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 10 * 1024 * 1024 },
};

/** Le scene da girare che aspettano ancora il girato. */
export function scenesWaitingFootage(scenes: readonly VideoScene[]): VideoScene[] {
  return scenes.filter((scene) => scene.source === 'shoot' && !scene.footage);
}

/**
 * Le bozze salvate prima dei quattro tipi hanno `source: 'generated'`, che allora voleva dire
 * «testo a schermo o grafica», e nessun `overlay`.
 */
export function readScene(scene: Omit<VideoScene, 'source' | 'overlay'> & { source: string; overlay?: string }): VideoScene {
  const source = (SCENE_SOURCES as readonly string[]).includes(scene.source) ? (scene.source as SceneSource) : 'graphic';
  return { ...scene, source, overlay: scene.overlay ?? '' };
}

/** La durata del video, dalla regia. */
export function videoSeconds(scenes: readonly VideoScene[]): number {
  return scenes.reduce((sum, scene) => sum + scene.seconds, 0);
}

/** Il video montato dall'agente: l'MP4, e quante scene hanno ancora il cartello al posto dell'immagine. */
export interface VideoCut {
  file: MediaFile;
  /** Le scene col cartello: girati da caricare, b-roll da generare, foto che mancano. */
  placeholders: number;
  seconds: number;
  /** La traccia della musica del brand usata: nulla senza musica, assente nei montaggi di prima. */
  trackId?: string | null;
  /** Di quale regia è il montaggio (`cutKey`): se la regia cambia, va rimontato. */
  from: string;
  madeAt: string;
}

/** L'impronta di script e regia: la confronta chi deve dire «la regia è cambiata, rimonta». */
export function cutKey(visual: Pick<ContentVisual, 'script' | 'scenes' | 'musicId'>): string {
  // Del materiale conta quale file è, non l'indirizzo firmato, che cambia a ogni lettura.
  // Il fotogramma e il lucchetto non cambiano il montaggio; la clip sì.
  const scenes = visual.scenes
    .map(readScene)
    .map(({ footage, frame: _frame, clip, locked: _locked, ...scene }) => ({
      ...scene,
      footage: footage?.path ?? footage?.url ?? null,
      // Solo se c'è: così i montaggi fatti prima delle clip non risultano da rifare.
      ...(clip && { clip: clip.path ?? clip.url }),
    }));
  // La scelta della musica solo quando c'è: «la sceglie chi monta» non cambia i montaggi di prima.
  const text = JSON.stringify([visual.script ?? '', scenes, ...(visual.musicId !== undefined ? [visual.musicId] : [])]);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

export interface ContentVisual {
  /** Titolo della copertina o della prima slide. */
  headline: string;
  slides: CarouselSlide[];
  /** Lo script del video: aggancio, sviluppo e chiusura in poche righe. Vuoto negli altri formati. */
  script: string;
  /** La regia del video, scena per scena. */
  scenes: VideoScene[];
  /** Il montaggio, quando l'utente lo chiede: resta anche se la regia cambia, e allora va rifatto. */
  cut?: VideoCut | null;
  /**
   * La musica del video, tra le tracce del brand: assente, la sceglie chi monta; `null`, senza musica; un id, quella
   * traccia.
   */
  musicId?: string | null;
  /**
   * Le card del post: proposta con la bozza, create quando l'utente lo chiede. Nulla per i video e
   * per le bozze nate prima dei visivi (vedi `fallbackDesign`).
   */
  design: VisualDesign | null;
}

export type ContentStatus = 'draft' | 'approved';

export interface Content {
  id: string;
  brandId: string;
  /** L'uscita del piano; nulla finché un contenuto creato direttamente non viene programmato. */
  slotId: string | null;
  /** L'idea di partenza; nulla per i contenuti creati direttamente. */
  ideaId: string | null;
  /** Quello che l'utente ha scritto o condiviso, per i contenuti creati direttamente. */
  brief: IdeaSource | null;
  title: string;
  themeId: string | null;
  channels: ChannelId[];
  format: IdeaFormat;
  variants: ChannelVariant[];
  visual: ContentVisual;
  status: ContentStatus;
  /** Quante volte la bozza è stata rifatta da capo. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

/** Il formato con cui il contenuto esce su un canale: quello scelto per il canale, o quello del contenuto. */
export function variantFormat(content: Content, channel: ChannelId): IdeaFormat {
  const variant = content.variants.find((candidate) => candidate.channel === channel);
  return variant?.format ?? content.format;
}

/**
 * I formati che si possono dare a un canale senza rifare la bozza: cambiano solo il visivo.
 * Un video ha bisogno delle scene e un carosello delle slide, che nascono col testo: quelli
 * si ottengono rifacendo la bozza, non da qui.
 */
export function renderableFormats(format: IdeaFormat): IdeaFormat[] {
  if (format === 'video') return ['video'];
  if (format === 'carousel') return ['carousel', 'post', 'article'];
  return ['post', 'article'];
}

/** I canali che escono senza immagine per scelta. */
export function channelsWithoutImage(content: Content): ChannelId[] {
  return content.variants.filter((variant) => variant.withoutImage).map((variant) => variant.channel);
}

/** I ritocchi pronti, che stanno nella barra sotto il testo come suggerimenti. */
export const REWRITE_INSTRUCTIONS = [
  'Più corto',
  'Più diretto',
  'Aggiungi un numero',
  'Chiudi con una domanda',
  'Meno formale',
] as const;

/** Un ritocco: un suggerimento pronto oppure la richiesta scritta dall'utente com'è. */
export type RewriteInstruction = string;

/** Quanto può essere lunga una richiesta di ritocco scritta a mano. */
export const REWRITE_LIMIT = 240;

export const CHANNEL_LIMITS: Record<ChannelId, number> = {
  linkedin: 3000,
  instagram: 2200,
  facebook: 5000,
  tiktok: 2200,
  x: 280,
};

// "sei" resta fuori: in italiano è anche un verbo.
const NUMBER_WORDS: Record<string, string> = {
  due: '2',
  tre: '3',
  quattro: '4',
  cinque: '5',
  sette: '7',
  otto: '8',
  nove: '9',
  dieci: '10',
};

const NUMBER_PATTERN = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi');

/** "Tre numeri" → "3 numeri", come chiede una voce che scrive i numeri in cifre. */
export function numbersToDigits(text: string): string {
  return text.replace(NUMBER_PATTERN, (word) => NUMBER_WORDS[word.toLowerCase()]);
}

/** Le parole tra «» di un campo della scheda voce. */
export function quotedWords(text: string): string[] {
  return [...text.matchAll(/«([^»]+)»/g)].map((match) => match[1].toLowerCase());
}

export interface VoiceNote {
  ok: boolean;
  text: string;
}

export interface VoiceCheck {
  score: number;
  notes: VoiceNote[];
}

function averageSentenceLength(text: string): number {
  const body = text.replace(/#\S+/g, ' ');
  const sentences = body.split(/[.!?\n]+/).filter((sentence) => sentence.trim().split(/\s+/).length > 1);
  const words = sentences.reduce((sum, sentence) => sum + sentence.trim().split(/\s+/).length, 0);
  return sentences.length > 0 ? words / sentences.length : 0;
}

/**
 * Controllo di coerenza con la scheda voce, fatto con regole semplici sul testo:
 * si ricalcola a ogni modifica, anche su quello che scrive l'utente.
 */
export function checkVoice(text: string, card: VoiceCard | null, limit?: number): VoiceCheck {
  if (!card) {
    return {
      score: 70,
      notes: [{ ok: false, text: 'Manca la scheda voce: completala nel Profilo per un controllo preciso.' }],
    };
  }

  const lower = text.toLowerCase();
  const notes: VoiceNote[] = [];

  const avoided = quotedWords(card.avoid).filter((word) => lower.includes(word));
  notes.push(
    avoided.length > 0
      ? { ok: false, text: `Contiene parole da evitare: ${avoided.map((word) => `«${word}»`).join(', ')}.` }
      : { ok: true, text: 'Nessuna parola della lista da evitare.' },
  );

  if (/esclamativ/i.test(card.avoid)) {
    notes.push(
      text.includes('!')
        ? { ok: false, text: 'Ci sono punti esclamativi, che la tua voce evita.' }
        : { ok: true, text: 'Nessun punto esclamativo.' },
    );
  }

  if (/emoji/i.test(card.avoid) && /[\uD83C-\uD83E][\uDC00-\uDFFF]/.test(text)) {
    notes.push({ ok: false, text: 'Ci sono emoji, che la tua voce evita.' });
  }

  if (/frasi corte/i.test(card.rhythm)) {
    const average = averageSentenceLength(text);
    notes.push(
      average <= 18
        ? { ok: true, text: 'Frasi corte, come nella scheda voce.' }
        : { ok: false, text: `Frasi lunghe, in media ${Math.round(average)} parole: la tua voce le preferisce corte.` },
    );
  }

  if (/in cifre/i.test(card.lexicon) && NUMBER_PATTERN.test(text)) {
    notes.push({ ok: false, text: 'Alcuni numeri sono scritti in lettere: la tua voce li vuole in cifre.' });
  }
  NUMBER_PATTERN.lastIndex = 0;

  const lexicon = quotedWords(card.lexicon).filter((word) => lower.includes(word));
  if (lexicon.length > 0) {
    notes.push({ ok: true, text: `Usa il tuo lessico: ${lexicon.map((word) => `«${word}»`).join(', ')}.` });
  }

  if (limit !== undefined && text.length > limit) {
    notes.push({ ok: false, text: `Supera il limite di ${limit} caratteri del canale.` });
  }

  const warnings = notes.filter((note) => !note.ok).length;
  return { score: Math.max(40, 100 - warnings * 15 - (lexicon.length > 0 ? 0 : 4)), notes };
}
