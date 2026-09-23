import type { Brand } from '@/domain/brand';
import type { Content } from '@/domain/content';
import type { Idea, IdeaDraft } from '@/domain/idea';
import type { PlanSlot, SlotDraft } from '@/domain/plan';
import type { MediaFile } from '@/domain/visual';

import { createMockChannelService } from '../mock';
import type {
  AiService,
  BrandService,
  ContentService,
  IdeaService,
  JobService,
  PlanService,
  PositioningIdeas,
  Services,
  VisualStyle,
  VoiceAnalysis,
  WebsiteInsights,
  Workspace,
} from '../types';
import { ApiError, route, type ApiClient } from './client';

type ContentWithSlot = { content: Content; slot: PlanSlot };
type OpenJob = Awaited<ReturnType<JobService['open']>>;

/** I servizi sopra il backend: una rotta per metodo, con le forme di `be-node/README.md`. */
export function createHttpServices(api: ApiClient): Services {
  const brands: BrandService = {
    getWorkspace: () => api.get<Workspace>('/workspace'),
    createBrand: (draft) => api.post<Brand>('/brands', draft),
    updateSection: (brandId, patch) =>
      api.put<Brand>(route`/brands/${brandId}/sections/${patch.key}`, { value: patch.value }),
    setActiveBrand: (brandId) => api.put<void>('/workspace/active-brand', { brandId }),
    loadDemoBrand: () => api.post<Brand>('/demo'),
    resetDemo: () => api.delete('/demo'),
    uploadReference: (_uri, dataUri) => {
      if (!dataUri) return Promise.reject(new ApiError(400, 'INVALID_DATA', 'Non riesco a leggere l’immagine: riprova con un’altra.'));
      return api.post<MediaFile>('/media/references', { dataUri });
    },
  };

  const ai: AiService = {
    readWebsite: (site, identity, onSteps) => api.job<WebsiteInsights>('/ai/website/job', { site, identity }, onSteps),
    suggestThemes: (identity) => api.post<string[]>('/ai/themes', { identity }),
    proposeVisualStyle: (request, onSteps) => api.job<VisualStyle>('/ai/visual/job', request, onSteps),
    suggestPositioning: (identity, site, onSteps) =>
      api.job<PositioningIdeas>(
        '/ai/positioning/job',
        {
          identity,
          site: site && {
            site: site.site,
            summary: site.summary,
            pitch: site.pitch ?? '',
            themes: site.themes,
            audiences: site.audiences,
          },
        },
        onSteps,
      ),
    analyzeVoice: (sample, identity) => api.post<VoiceAnalysis>('/ai/voice', { sample, identity }),
  };

  const ideas: IdeaService = {
    list: (brandId) => api.get<Idea[]>(route`/brands/${brandId}/ideas`),
    generate: (brandId, count, onSteps) =>
      api.job<Idea[]>(route`/brands/${brandId}/ideas/generate/job`, { count }, onSteps),
    draftFromSource: (brandId, source, variant) =>
      api.post<IdeaDraft[]>(route`/brands/${brandId}/ideas/drafts`, { source, variant }),
    save: (brandId, drafts) => api.post<Idea[]>(route`/brands/${brandId}/ideas`, { drafts }),
    setStatus: (ideaId, status) => api.patch<Idea>(route`/ideas/${ideaId}`, { status }),
  };

  const plan: PlanService = {
    list: (brandId) => api.get<PlanSlot[]>(route`/brands/${brandId}/slots`),
    propose: (brandId, request) => api.post<SlotDraft[]>(route`/brands/${brandId}/plan/proposal`, request),
    confirm: (brandId, drafts) => api.post<PlanSlot[]>(route`/brands/${brandId}/plan/confirm`, { drafts }),
    addIdea: (brandId, ideaId, channels) => api.post<PlanSlot>(route`/brands/${brandId}/plan/ideas`, { ideaId, channels }),
    addSlot: (brandId, draft) => api.post<PlanSlot>(route`/brands/${brandId}/slots`, draft),
    updateSlot: (slotId, patch) => api.patch<PlanSlot>(route`/slots/${slotId}`, patch),
    removeSlot: (slotId) => api.delete(route`/slots/${slotId}`),
  };

  const contents: ContentService = {
    list: (brandId) => api.get<Content[]>(route`/brands/${brandId}/contents`),

    async get(contentId) {
      try {
        return await api.get<Content>(route`/contents/${contentId}`);
      } catch (error) {
        // Un contenuto sparito (uscita eliminata, link vecchio) è "nessun contenuto", come nel mock.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },

    getForSlot: async (slotId) =>
      (await api.get<{ content: Content | null }>(route`/slots/${slotId}/content`)).content,
    listDrafts: (brandId) => api.get<Content[]>(route`/brands/${brandId}/contents/drafts`),
    // Scrivere una bozza richiede tempo: si passa dalle rotte a passi, così si vede cosa sta facendo.
    prepare: (slotId, format, onSteps) =>
      api.job<ContentWithSlot>(route`/slots/${slotId}/content/prepare/job`, { format }, onSteps),
    createDirect: (brandId, request, onSteps) =>
      api.job<Content>(route`/brands/${brandId}/contents/job`, request, onSteps),
    createFromIdea: (brandId, ideaId, channels, onSteps) =>
      api.job<Content>(route`/brands/${brandId}/contents/from-idea/job`, { ideaId, channels }, onSteps),
    regenerate: (contentId, format, onSteps) =>
      api.job<Content>(route`/contents/${contentId}/regenerate/job`, { format }, onSteps),
    updateVariant: (contentId, channel, text) =>
      api.put<Content>(route`/contents/${contentId}/variants/${channel}`, { text }),
    setVariantLayout: (contentId, channel, layout) =>
      api.patch<Content>(route`/contents/${contentId}/variants/${channel}`, layout),
    rewrite: (contentId, channel, instruction, onSteps) =>
      api.job<Content>(route`/contents/${contentId}/variants/${channel}/rewrite/job`, { instruction }, onSteps),
    approve: (contentId) => api.post<ContentWithSlot>(route`/contents/${contentId}/approve`),
    schedule: (contentId, when) => api.post<ContentWithSlot>(route`/contents/${contentId}/schedule`, when),
    reopen: (contentId) => api.post<ContentWithSlot>(route`/contents/${contentId}/reopen`),
    editVisual: (contentId, edit) => api.put<Content>(route`/contents/${contentId}/visual`, edit),
    proposeVisual: (contentId) => api.post<Content>(route`/contents/${contentId}/visual/propose`),
    designVisual: (contentId, channels, instruction, onSteps) =>
      api.job<Content>(route`/contents/${contentId}/visual/design/job`, { channels, instruction }, onSteps),
    createVisual: (contentId) => api.post<Content>(route`/contents/${contentId}/visual/create`),
    regenerateImage: (contentId) => api.post<Content>(route`/contents/${contentId}/visual/image`),
    uploadPhoto: (contentId, dataUri) => api.post<Content>(route`/contents/${contentId}/visual/photo`, { dataUri }),
    refreshVisual: (contentId) => api.post<Content>(route`/contents/${contentId}/visual/refresh`),
  };

  /**
   * I lavori dell'AI: non li fa partire (li fanno partire le rotte qui sopra), servono a
   * ritrovarne uno rimasto in corso quando si riapre una schermata.
   */
  const jobs: JobService = {
    open: async ({ kind, ref }) => {
      const query = new URLSearchParams();
      if (kind) query.set('kind', kind);
      if (ref) query.set('ref', ref);
      return (await api.get<{ job: OpenJob }>(`/jobs/open?${query.toString()}`)).job;
    },
    follow: (jobId, onSteps) => api.follow(jobId, onSteps),
    cancel: (jobId) => api.post<void>(route`/jobs/${jobId}/cancel`),
  };

  // Il collegamento dei canali resta simulato: nel prodotto vero è un flusso OAuth per canale.
  return { brands, ideas, plan, contents, ai, jobs, channels: createMockChannelService() };
}
