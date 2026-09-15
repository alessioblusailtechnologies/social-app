/**
 * Contratti dei servizi. Le schermate dipendono solo da queste interfacce:
 * quando arriva il backend si sostituiscono le implementazioni in services/index.ts.
 */
import type {
  Brand,
  BrandDraft,
  ChannelId,
  Identity,
  Palette,
  SectionPatch,
  VoiceCard,
  VoiceSource,
} from '@/domain/brand';
import type { Content, RewriteInstruction } from '@/domain/content';
import type { Idea, IdeaDraft, IdeaFormat, IdeaSource, IdeaStatus } from '@/domain/idea';
import type { PlanRequest, PlanSlot, SlotDraft } from '@/domain/plan';

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
}

export interface WebsiteInsights {
  site: string;
  /** Cosa ho capito, in una frase. */
  summary: string;
  themes: string[];
  audiences: string[];
  palette: Palette;
}

export interface VoiceSample {
  source: VoiceSource;
  texts?: string;
  channel?: ChannelId;
}

export type VoiceAnalysis = Omit<VoiceCard, 'version' | 'createdAt'>;

export interface AiService {
  readWebsite(site: string, identity: Identity): Promise<WebsiteInsights>;
  suggestThemes(identity: Identity): Promise<string[]>;
  analyzeVoice(sample: VoiceSample, identity: Identity): Promise<VoiceAnalysis>;
}

export interface ChannelService {
  /** Nel prodotto reale è un flusso OAuth. */
  connect(channel: ChannelId, identity: Identity): Promise<{ handle: string }>;
}

export interface IdeaService {
  /** Tutte le idee del brand, dalla più recente. */
  list(brandId: string): Promise<Idea[]>;
  /** L'AI propone nuove idee dal contesto del brand: finiscono tra le proposte. */
  generate(brandId: string, count?: number): Promise<Idea[]>;
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
  /** "Aggiungi al piano" da un'idea: riempie un'uscita vuota adatta o ne crea una. */
  addIdea(brandId: string, ideaId: string): Promise<PlanSlot>;
  addSlot(brandId: string, draft: SlotDraft): Promise<PlanSlot>;
  updateSlot(slotId: string, patch: SlotPatch): Promise<PlanSlot>;
  removeSlot(slotId: string): Promise<void>;
}

export interface DirectContentRequest {
  source: IdeaSource;
  channels: ChannelId[];
  format: IdeaFormat;
}

export interface ContentService {
  get(contentId: string): Promise<Content | null>;
  getForSlot(slotId: string): Promise<Content | null>;
  /** Contenuti creati direttamente e non ancora programmati. */
  listDrafts(brandId: string): Promise<Content[]>;
  /** Prepara (o rifà) la bozza dall'idea dell'uscita, che passa a "Da approvare". */
  prepare(slotId: string, format?: IdeaFormat): Promise<{ content: Content; slot: PlanSlot }>;
  /** Nuovo contenuto senza idea né uscita: la bozza nasce dalla fonte. */
  createDirect(brandId: string, request: DirectContentRequest): Promise<Content>;
  /** Rifà la bozza di un contenuto creato direttamente, con un altro taglio o formato. */
  regenerate(contentId: string, format?: IdeaFormat): Promise<Content>;
  updateVariant(contentId: string, channel: ChannelId, text: string): Promise<Content>;
  rewrite(contentId: string, channel: ChannelId, instruction: RewriteInstruction): Promise<Content>;
  /** Approva un contenuto che è già in un'uscita: l'uscita passa a "Programmata". */
  approve(contentId: string): Promise<{ content: Content; slot: PlanSlot }>;
  /** Approva un contenuto creato direttamente e lo mette nel piano; con `publishNow` esce subito. */
  schedule(
    contentId: string,
    when: { date: string; time: string; publishNow?: boolean },
  ): Promise<{ content: Content; slot: PlanSlot }>;
  /** Torna in bozza: l'uscita passa di nuovo a "Da approvare". */
  reopen(contentId: string): Promise<{ content: Content; slot: PlanSlot }>;
}

export interface Services {
  brands: BrandService;
  ideas: IdeaService;
  plan: PlanService;
  contents: ContentService;
  ai: AiService;
  channels: ChannelService;
}
