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
    readWebsite: (site, identity, onSteps) => api.stream<WebsiteInsights>('/ai/website/stream', { site, identity }, onSteps),
    suggestThemes: (identity) => api.post<string[]>('/ai/themes', { identity }),
    proposeVisualStyle: (request, onSteps) => api.stream<VisualStyle>('/ai/visual/stream', request, onSteps),
    suggestPositioning: (identity, site, onSteps) =>
      api.stream<PositioningIdeas>(
        '/ai/positioning/stream',
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
    generate: (brandId, count) => api.post<Idea[]>(route`/brands/${brandId}/ideas/generate`, { count }),
    draftFromSource: (brandId, source, variant) =>
      api.post<IdeaDraft[]>(route`/brands/${brandId}/ideas/drafts`, { source, variant }),
    save: (brandId, drafts) => api.post<Idea[]>(route`/brands/${brandId}/ideas`, { drafts }),
    setStatus: (ideaId, status) => api.patch<Idea>(route`/ideas/${ideaId}`, { status }),
  };

  const plan: PlanService = {
    list: (brandId) => api.get<PlanSlot[]>(route`/brands/${brandId}/slots`),
    propose: (brandId, request) => api.post<SlotDraft[]>(route`/brands/${brandId}/plan/proposal`, request),
    confirm: (brandId, drafts) => api.post<PlanSlot[]>(route`/brands/${brandId}/plan/confirm`, { drafts }),
    addIdea: (brandId, ideaId) => api.post<PlanSlot>(route`/brands/${brandId}/plan/ideas`, { ideaId }),
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
    prepare: (slotId, format) => api.post<ContentWithSlot>(route`/slots/${slotId}/content/prepare`, { format }),
    createDirect: (brandId, request) => api.post<Content>(route`/brands/${brandId}/contents`, request),
    createFromIdea: (brandId, ideaId) => api.post<Content>(route`/brands/${brandId}/contents/from-idea`, { ideaId }),
    regenerate: (contentId, format) => api.post<Content>(route`/contents/${contentId}/regenerate`, { format }),
    updateVariant: (contentId, channel, text) =>
      api.put<Content>(route`/contents/${contentId}/variants/${channel}`, { text }),
    rewrite: (contentId, channel, instruction) =>
      api.post<Content>(route`/contents/${contentId}/variants/${channel}/rewrite`, { instruction }),
    approve: (contentId) => api.post<ContentWithSlot>(route`/contents/${contentId}/approve`),
    schedule: (contentId, when) => api.post<ContentWithSlot>(route`/contents/${contentId}/schedule`, when),
    reopen: (contentId) => api.post<ContentWithSlot>(route`/contents/${contentId}/reopen`),
    editVisual: (contentId, edit) => api.put<Content>(route`/contents/${contentId}/visual`, edit),
    proposeVisual: (contentId) => api.post<Content>(route`/contents/${contentId}/visual/propose`),
    createVisual: (contentId) => api.post<Content>(route`/contents/${contentId}/visual/create`),
    regenerateImage: (contentId) => api.post<Content>(route`/contents/${contentId}/visual/image`),
    uploadPhoto: (contentId, dataUri) => api.post<Content>(route`/contents/${contentId}/visual/photo`, { dataUri }),
    refreshVisual: (contentId) => api.post<Content>(route`/contents/${contentId}/visual/refresh`),
  };

  // Il collegamento dei canali resta simulato: nel prodotto vero è un flusso OAuth per canale.
  return { brands, ideas, plan, contents, ai, channels: createMockChannelService() };
}
