/**
 * Contratti dei servizi. Le schermate dipendono solo da queste interfacce:
 * quando arriva il backend si sostituiscono le implementazioni in services/index.ts.
 */
import type {
  Brand,
  BrandDraft,
  BrandLine,
  ChannelId,
  Identity,
  ImageStyle,
  Palette,
  SectionPatch,
  TypographyId,
  Visual,
  VisualDirection,
  VisualExample,
  VoiceCard,
  VoiceSource,
} from '@/domain/brand';
import type { Content, RewriteInstruction } from '@/domain/content';
import type { Idea, IdeaDraft, IdeaFormat, IdeaSource, IdeaStatus } from '@/domain/idea';
import type { PlanRequest, PlanSlot, SlotDraft } from '@/domain/plan';
import type { MediaFile, VisualEdit } from '@/domain/visual';

export interface Workspace {
  brands: Brand[];
  activeBrandId: string | null;
}

export interface BrandService {
  getWorkspace(): Promise<Workspace>;
  /** Crea il brand e lo rende attivo. */
  createBrand(draft: BrandDraft): Promise<Brand>;
  updateSection(brandId: string, patch: SectionPatch): Promise<Brand>;
  setActiveBrand(brandId: string): Promise<void>;
  loadDemoBrand(): Promise<Brand>;
  resetDemo(): Promise<void>;
  /** Un'immagine di riferimento (data URI o file locale): torna col percorso nello storage e l'indirizzo firmato. */
  uploadReference(uri: string, dataUri: string | null): Promise<MediaFile>;
}

export interface WebsiteInsights {
  site: string;
  /** Cosa ho capito, in una frase. */
  summary: string;
  /** Cosa fa il brand in una frase, come la chiede il profilo; vuota se il sito non si è aperto. */
  pitch: string;
  themes: string[];
  audiences: string[];
  palette: Palette;
}

/** Da cosa nasce lo stile delle card: chi è il brand, i temi, la palette, i riferimenti e le indicazioni. */
export interface VisualStyleRequest {
  identity: Identity;
  themes: string[];
  visual: Visual;
  /** Un esempio per canale, nel suo formato. */
  channels: ChannelId[];
  /** Per chi scrive e cosa vuole ottenere: le rubriche e i testi degli esempi partono da qui. */
  goals?: string[];
  audiences?: string[];
  /** La scheda voce, se c'è già: i testi delle card la seguono. */
  voice?: VoiceCard | null;
  /** Quello che la lettura del sito ha capito del brand. */
  siteSummary?: string;
  /**
   * Riparte da capo anche se la linea c'è già. Senza, con una linea già fatta e un'indicazione scritta, si corregge
   * quella linea e il resto (foto compresa) resta.
   */
  restart?: boolean;
}

/** La linea grafica costruita dall'AI e le card di esempio che la mostrano. */
export interface VisualStyle {
  typography: TypographyId;
  imageStyle: ImageStyle;
  direction: VisualDirection;
  line: BrandLine;
  examples: VisualExample[];
}

/** Obiettivi e pubblico proposti per il profilo, i più adatti prima. */
export interface PositioningIdeas {
  goals: string[];
  audiences: string[];
  /** Quelli che sceglierei: entrano già selezionati se l'utente non ha ancora scelto. */
  picked: { goals: string[]; audiences: string[] };
}

/** Un passo di una generazione che lavora sul web, mentre succede: la lettura del sito li mostra uno per uno. */
export interface AiStep {
  id: string;
  /** Cosa fa, in italiano: «Apro la pagina Chi siamo». */
  label: string;
  /** L'indirizzo aperto, la ricerca fatta, quello che ha trovato. */
  detail?: string;
  status: 'running' | 'done' | 'failed';
}

/** Chi guarda una generazione a passi: riceve ogni volta la lista intera. */
export type OnAiSteps = (steps: AiStep[]) => void;

/** Gli eventi di una risposta a passi del backend: i passi man mano, poi il risultato o l'errore. */
export type AiStreamEvent<T> =
  | { type: 'steps'; steps: AiStep[] }
  | { type: 'result'; result: T }
  | { type: 'error'; status: number; code: string; message: string };

export interface VoiceSample {
  source: VoiceSource;
  texts?: string;
  channel?: ChannelId;
}

export type VoiceAnalysis = Omit<VoiceCard, 'version' | 'createdAt'>;

export interface AiService {
  readWebsite(site: string, identity: Identity, onSteps?: OnAiSteps): Promise<WebsiteInsights>;
  suggestThemes(identity: Identity): Promise<string[]>;
  /** Obiettivi e pubblico su misura: dalla frase su cosa fa il brand e, se c'è, dalla lettura del sito. */
  suggestPositioning(identity: Identity, site: WebsiteInsights | null, onSteps?: OnAiSteps): Promise<PositioningIdeas>;
  /** Guarda i riferimenti, sceglie caratteri e stile e compone una card di esempio per canale. */
  proposeVisualStyle(request: VisualStyleRequest, onSteps?: OnAiSteps): Promise<VisualStyle>;
  analyzeVoice(sample: VoiceSample, identity: Identity): Promise<VoiceAnalysis>;
}

export interface ChannelService {
  /** Nel prodotto reale è un flusso OAuth. */
  connect(channel: ChannelId, identity: Identity): Promise<{ handle: string }>;
}

export interface IdeaService {
  /** Tutte le idee del brand, dalla più recente. */
  list(brandId: string): Promise<Idea[]>;
  /** L'AI propone nuove idee dal contesto del brand: finiscono tra le proposte. `onSteps` riceve i passi man mano. */
  generate(brandId: string, count?: number, onSteps?: OnAiSteps): Promise<Idea[]>;
  /** Spunti da una fonte dell'utente: non si salvano finché non li scegli. */
  draftFromSource(brandId: string, source: IdeaSource, variant?: number): Promise<IdeaDraft[]>;
  save(brandId: string, drafts: IdeaDraft[]): Promise<Idea[]>;
  setStatus(ideaId: string, status: IdeaStatus): Promise<Idea>;
}

export type SlotPatch = Partial<Pick<PlanSlot, 'date' | 'time' | 'channels' | 'ideaId' | 'themeId' | 'status'>>;

export interface PlanService {
  /** Le uscite del brand, in ordine di calendario. */
  list(brandId: string): Promise<PlanSlot[]>;
  /** Scheletro del periodo già riempito con le idee salvate: niente si salva finché non confermi. */
  propose(brandId: string, request: PlanRequest): Promise<SlotDraft[]>;
  confirm(brandId: string, drafts: SlotDraft[]): Promise<PlanSlot[]>;
  /** "Aggiungi al piano" da un'idea: riempie un'uscita vuota adatta o ne crea una, sui canali scelti. */
  addIdea(brandId: string, ideaId: string, channels?: readonly ChannelId[]): Promise<PlanSlot>;
  addSlot(brandId: string, draft: SlotDraft): Promise<PlanSlot>;
  updateSlot(slotId: string, patch: SlotPatch): Promise<PlanSlot>;
  removeSlot(slotId: string): Promise<void>;
}

export interface DirectContentRequest {
  source: IdeaSource;
  channels: ChannelId[];
  format: IdeaFormat;
}

/** Come esce il contenuto su un canale: riguarda il visivo, non il testo. */
export interface VariantLayout {
  format?: IdeaFormat;
  withoutImage?: boolean;
}

export interface ContentService {
  /** Tutti i contenuti del brand, con o senza uscita. */
  list(brandId: string): Promise<Content[]>;
  get(contentId: string): Promise<Content | null>;
  getForSlot(slotId: string): Promise<Content | null>;
  /** Contenuti creati direttamente e non ancora programmati. */
  listDrafts(brandId: string): Promise<Content[]>;
  /** Prepara (o rifà) la bozza dall'idea dell'uscita, che passa a "Da approvare". */
  prepare(slotId: string, format?: IdeaFormat, onSteps?: OnAiSteps): Promise<{ content: Content; slot: PlanSlot }>;
  /** Nuovo contenuto senza idea né uscita: la bozza nasce dalla fonte. */
  createDirect(brandId: string, request: DirectContentRequest, onSteps?: OnAiSteps): Promise<Content>;
  /** Bozza scritta subito da un'idea, senza passare dal piano: entra nel piano quando viene programmata. */
  createFromIdea(brandId: string, ideaId: string, channels?: readonly ChannelId[], onSteps?: OnAiSteps): Promise<Content>;
  /**
   * Rifà la bozza di un contenuto che non viene da un'uscita, con un altro taglio o formato:
   * dall'idea se c'è, altrimenti dalla richiesta dell'utente.
   */
  regenerate(contentId: string, format?: IdeaFormat, onSteps?: OnAiSteps): Promise<Content>;
  updateVariant(contentId: string, channel: ChannelId, text: string): Promise<Content>;
  /** Come esce il contenuto su un canale: formato del visivo e uscita senza immagine. Il testo non si tocca. */
  setVariantLayout(contentId: string, channel: ChannelId, layout: VariantLayout): Promise<Content>;
  /** Ritocca il testo di un canale: un suggerimento pronto o una richiesta scritta dall'utente. */
  rewrite(contentId: string, channel: ChannelId, instruction: RewriteInstruction, onSteps?: OnAiSteps): Promise<Content>;
  /** Approva un contenuto che è già in un'uscita: l'uscita passa a "Programmata". */
  approve(contentId: string): Promise<{ content: Content; slot: PlanSlot }>;
  /** Approva un contenuto creato direttamente e lo mette nel piano; con `publishNow` esce subito. */
  schedule(
    contentId: string,
    when: { date: string; time: string; publishNow?: boolean },
  ): Promise<{ content: Content; slot: PlanSlot }>;
  /** Torna in bozza: l'uscita passa di nuovo a "Da approvare". */
  reopen(contentId: string): Promise<{ content: Content; slot: PlanSlot }>;
  /** Modifiche al visivo senza AI: tipo, layout, testi della card, descrizione della foto. */
  editVisual(contentId: string, edit: VisualEdit): Promise<Content>;
  /** Per le bozze nate prima dei visivi: una proposta fatta dai testi della bozza, senza AI. */
  proposeVisual(contentId: string): Promise<Content>;
  /**
   * Disegna la card da capo: guarda le card d'esempio del brand e scrive un layout per questo
   * contenuto. `channels` dice per quali formati deve reggere; vuoto = tutti quelli del contenuto.
   */
  designVisual(
    contentId: string,
    channels: ChannelId[],
    instruction?: string,
    onSteps?: OnAiSteps,
  ): Promise<Content>;
  /** Crea il visivo proposto (foto se serve, scontorno, composizione). Risponde subito, a creazione avviata. */
  createVisual(contentId: string): Promise<Content>;
  /** Rifà solo la foto con la stessa descrizione, tenendo layout e testi. */
  regenerateImage(contentId: string): Promise<Content>;
  /** Una foto dell'utente, come data URI, al posto di quella generata. */
  uploadPhoto(contentId: string, dataUri: string): Promise<Content>;
  /** Mette nella card i testi della bozza rifatta. */
  refreshVisual(contentId: string): Promise<Content>;
}

export interface Services {
  brands: BrandService;
  ideas: IdeaService;
  plan: PlanService;
  contents: ContentService;
  ai: AiService;
  channels: ChannelService;
}
