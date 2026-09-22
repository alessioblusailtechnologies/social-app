import { queryOptions, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { BrandDraft, ChannelId, Identity, SectionPatch } from '@/domain/brand';
import type { Content, RewriteInstruction } from '@/domain/content';
import { editDesign, type VisualEdit } from '@/domain/visual';
import type { Idea, IdeaDraft, IdeaFormat, IdeaSource, IdeaStatus } from '@/domain/idea';
import type { PlanRequest, PlanSlot, SlotDraft } from '@/domain/plan';

import { useSignedIn } from './http/session';
import { services } from './index';
import type { AiStep, DirectContentRequest, SlotPatch, VoiceSample, WebsiteInsights, Workspace } from './types';

const planKey = (brandId: string) => ['plan', brandId] as const;
const slotContentKey = (slotId: string) => ['content', 'slot', slotId] as const;
const contentKey = (contentId: string) => ['content', 'id', contentId] as const;
const draftsKey = (brandId: string) => ['content', 'drafts', brandId] as const;
const brandContentsKey = (brandId: string) => ['content', 'brand', brandId] as const;

type Client = ReturnType<typeof useQueryClient>;

/**
 * Un contenuto si legge per id e, se è in un'uscita, anche dall'uscita: si aggiornano entrambe le copie.
 * L'elenco del brand, che usa la Home, si ricarica.
 */
function cacheContent(client: Client, content: Content) {
  client.setQueryData(contentKey(content.id), content);
  if (content.slotId) client.setQueryData(slotContentKey(content.slotId), content);
  client.invalidateQueries({ queryKey: brandContentsKey(content.brandId) });
}

export function useContents(brandId: string | undefined) {
  return useQuery({
    queryKey: brandContentsKey(brandId ?? ''),
    queryFn: () => services.contents.list(brandId ?? ''),
    enabled: Boolean(brandId),
  });
}

/** Mentre il visivo si crea, il contenuto si rilegge: lo stato dei passi sta lì. */
const whileCreating = (content: Content | null | undefined) => (content?.visual.design?.status === 'creating' ? 1500 : false);

export function useSlotContent(slotId: string) {
  return useQuery({
    queryKey: slotContentKey(slotId),
    queryFn: () => services.contents.getForSlot(slotId),
    refetchInterval: (query) => whileCreating(query.state.data),
  });
}

export function useContent(contentId: string) {
  return useQuery({
    queryKey: contentKey(contentId),
    queryFn: () => services.contents.get(contentId),
    refetchInterval: (query) => whileCreating(query.state.data),
  });
}

export function useContentDrafts(brandId: string | undefined) {
  return useQuery({
    queryKey: draftsKey(brandId ?? ''),
    queryFn: () => services.contents.listDrafts(brandId ?? ''),
    enabled: Boolean(brandId),
  });
}

/** Le operazioni sul contenuto aggiornano insieme la bozza, lo stato dell'uscita e le bozze da programmare. */
function useContentWithSlot<V>(brandId: string, run: (variables: V) => Promise<{ content: Content; slot: PlanSlot }>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: ({ content, slot }) => {
      cacheContent(client, content);
      client.setQueryData<PlanSlot[]>(planKey(brandId), (slots) => upsertSlot(slots, slot));
      client.invalidateQueries({ queryKey: draftsKey(brandId) });
    },
  });
}

export function useCreateContent(brandId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: DirectContentRequest) => services.contents.createDirect(brandId, request),
    onSuccess: (content) => {
      cacheContent(client, content);
      client.invalidateQueries({ queryKey: draftsKey(brandId) });
    },
  });
}

export function useCreateContentFromIdea(brandId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) => services.contents.createFromIdea(brandId, ideaId),
    onSuccess: (content) => {
      cacheContent(client, content);
      client.invalidateQueries({ queryKey: draftsKey(brandId) });
    },
  });
}

export function useRegenerateContent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ contentId, format }: { contentId: string; format?: IdeaFormat }) =>
      services.contents.regenerate(contentId, format),
    onSuccess: (content) => cacheContent(client, content),
  });
}

export function useScheduleContent(brandId: string) {
  return useContentWithSlot(
    brandId,
    ({ contentId, date, time, publishNow }: { contentId: string; date: string; time: string; publishNow?: boolean }) =>
      services.contents.schedule(contentId, { date, time, publishNow }),
  );
}

export function usePrepareContent(brandId: string) {
  return useContentWithSlot(brandId, ({ slotId, format }: { slotId: string; format?: IdeaFormat }) =>
    services.contents.prepare(slotId, format),
  );
}

export function useApproveContent(brandId: string) {
  return useContentWithSlot(brandId, (contentId: string) => services.contents.approve(contentId));
}

export function useReopenContent(brandId: string) {
  return useContentWithSlot(brandId, (contentId: string) => services.contents.reopen(contentId));
}

export function useEditVariant() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ contentId, channel, text }: { contentId: string; channel: ChannelId; text: string }) =>
      services.contents.updateVariant(contentId, channel, text),
    onSuccess: (content) => cacheContent(client, content),
  });
}

export function useRewriteVariant() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ contentId, channel, instruction }: { contentId: string; channel: ChannelId; instruction: RewriteInstruction }) =>
      services.contents.rewrite(contentId, channel, instruction),
    onSuccess: (content) => cacheContent(client, content),
  });
}

/** Cambiare layout o tipo deve sembrare istantaneo: la card cambia prima della risposta. */
export function useEditVisual() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ content, edit }: { content: Content; edit: VisualEdit }) => services.contents.editVisual(content.id, edit),
    onMutate: ({ content, edit }) => {
      const design = content.visual.design;
      if (!design || design.status === 'creating') return;
      cacheContent(client, { ...content, visual: { ...content.visual, design: editDesign(design, edit) } });
    },
    onSuccess: (content) => cacheContent(client, content),
    onError: (_error, { content }) => cacheContent(client, content),
  });
}

export function useProposeVisual() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) => services.contents.proposeVisual(contentId),
    onSuccess: (content) => cacheContent(client, content),
  });
}

export function useCreateVisual() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) => services.contents.createVisual(contentId),
    onSuccess: (content) => cacheContent(client, content),
  });
}

export function useRegenerateImage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) => services.contents.regenerateImage(contentId),
    onSuccess: (content) => cacheContent(client, content),
  });
}

export function useUploadPhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ contentId, dataUri }: { contentId: string; dataUri: string }) => services.contents.uploadPhoto(contentId, dataUri),
    onSuccess: (content) => cacheContent(client, content),
  });
}

export function useRefreshVisual() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) => services.contents.refreshVisual(contentId),
    onSuccess: (content) => cacheContent(client, content),
  });
}

const bySchedule = (a: PlanSlot, b: PlanSlot) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

function upsertSlot(slots: PlanSlot[] | undefined, slot: PlanSlot): PlanSlot[] {
  const list = slots ?? [];
  const next = list.some((candidate) => candidate.id === slot.id)
    ? list.map((candidate) => (candidate.id === slot.id ? slot : candidate))
    : [...list, slot];
  return next.sort(bySchedule);
}

export function usePlan(brandId: string | undefined) {
  return useQuery({
    queryKey: planKey(brandId ?? ''),
    queryFn: () => services.plan.list(brandId ?? ''),
    enabled: Boolean(brandId),
  });
}

/** La proposta della pianificazione: si rifà a ogni cambio di periodo, ritmo o canali e sparisce chiudendo la schermata. */
export function usePlanProposal(brandId: string, request: PlanRequest) {
  return useQuery({
    queryKey: ['planProposal', brandId, request] as const,
    queryFn: () => services.plan.propose(brandId, request),
    gcTime: 0,
  });
}

export function useConfirmPlan(brandId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (drafts: SlotDraft[]) => services.plan.confirm(brandId, drafts),
    onSuccess: (created) =>
      client.setQueryData<PlanSlot[]>(planKey(brandId), (slots) => [...(slots ?? []), ...created].sort(bySchedule)),
  });
}

export function useAddIdeaToPlan(brandId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) => services.plan.addIdea(brandId, ideaId),
    onSuccess: (slot) => client.setQueryData<PlanSlot[]>(planKey(brandId), (slots) => upsertSlot(slots, slot)),
  });
}

export function useAddSlot(brandId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: SlotDraft) => services.plan.addSlot(brandId, draft),
    onSuccess: (slot) => client.setQueryData<PlanSlot[]>(planKey(brandId), (slots) => upsertSlot(slots, slot)),
  });
}

export function useUpdateSlot(brandId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, patch }: { slotId: string; patch: SlotPatch }) => services.plan.updateSlot(slotId, patch),
    onSuccess: (slot, { patch }) => {
      client.setQueryData<PlanSlot[]>(planKey(brandId), (slots) => upsertSlot(slots, slot));
      // Con un'idea diversa la bozza non vale più.
      if (patch.ideaId !== undefined) {
        client.invalidateQueries({ queryKey: slotContentKey(slot.id) });
        client.invalidateQueries({ queryKey: draftsKey(brandId) });
        client.invalidateQueries({ queryKey: brandContentsKey(brandId) });
      }
    },
  });
}

export function useRemoveSlot(brandId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => services.plan.removeSlot(slotId),
    onSuccess: (_, slotId) => {
      client.setQueryData<PlanSlot[]>(planKey(brandId), (slots) => (slots ?? []).filter((slot) => slot.id !== slotId));
      client.removeQueries({ queryKey: slotContentKey(slotId) });
      client.invalidateQueries({ queryKey: draftsKey(brandId) });
      client.invalidateQueries({ queryKey: brandContentsKey(brandId) });
    },
  });
}

const ideasKey = (brandId: string) => ['ideas', brandId] as const;

export function useIdeas(brandId: string | undefined) {
  return useQuery({
    queryKey: ideasKey(brandId ?? ''),
    queryFn: () => services.ideas.list(brandId ?? ''),
    enabled: Boolean(brandId),
  });
}

export function useGenerateIdeas(brandId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (count?: number) => services.ideas.generate(brandId, count),
    onSuccess: (created) =>
      client.setQueryData<Idea[]>(ideasKey(brandId), (ideas) => [...created, ...(ideas ?? [])]),
  });
}

export function useDraftIdeas(brandId: string) {
  return useMutation({
    mutationFn: ({ source, variant }: { source: IdeaSource; variant: number }) =>
      services.ideas.draftFromSource(brandId, source, variant),
  });
}

export function useSaveIdeas(brandId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (drafts: IdeaDraft[]) => services.ideas.save(brandId, drafts),
    onSuccess: (created) =>
      client.setQueryData<Idea[]>(ideasKey(brandId), (ideas) => [...created, ...(ideas ?? [])]),
  });
}

export function useSetIdeaStatus(brandId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ideaId, status }: { ideaId: string; status: IdeaStatus }) =>
      services.ideas.setStatus(ideaId, status),
    // Uno swipe deve sembrare istantaneo: la cache si aggiorna prima della risposta.
    onMutate: async ({ ideaId, status }) => {
      await client.cancelQueries({ queryKey: ideasKey(brandId) });
      const previous = client.getQueryData<Idea[]>(ideasKey(brandId));
      client.setQueryData<Idea[]>(ideasKey(brandId), (ideas) =>
        ideas?.map((idea) =>
          idea.id === ideaId
            ? { ...idea, status, decidedAt: status === 'new' ? null : new Date().toISOString() }
            : idea,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(ideasKey(brandId), context.previous);
    },
  });
}

const WORKSPACE_KEY = ['workspace'] as const;

export function useWorkspace() {
  // Con il backend il workspace è dell'account: senza sessione non c'è niente da chiedere.
  const signedIn = useSignedIn();
  return useQuery({ queryKey: WORKSPACE_KEY, queryFn: () => services.brands.getWorkspace(), enabled: signedIn });
}

export function useActiveBrand() {
  const { data } = useWorkspace();
  const brand = data?.brands.find((candidate) => candidate.id === data.activeBrandId) ?? null;
  return { brand, brands: data?.brands ?? [] };
}

export function useCreateBrand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: BrandDraft) => services.brands.createBrand(draft),
    onSuccess: () => client.invalidateQueries({ queryKey: WORKSPACE_KEY }),
  });
}

export function useUpdateSection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, patch }: { brandId: string; patch: SectionPatch }) =>
      services.brands.updateSection(brandId, patch),
    onSuccess: (updated) =>
      client.setQueryData<Workspace>(WORKSPACE_KEY, (workspace) =>
        workspace
          ? { ...workspace, brands: workspace.brands.map((brand) => (brand.id === updated.id ? updated : brand)) }
          : workspace,
      ),
  });
}

export function useSetActiveBrand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (brandId: string) => services.brands.setActiveBrand(brandId),
    onSuccess: (_, brandId) =>
      client.setQueryData<Workspace>(WORKSPACE_KEY, (workspace) =>
        workspace ? { ...workspace, activeBrandId: brandId } : workspace,
      ),
  });
}

export function useLoadDemoBrand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => services.brands.loadDemoBrand(),
    onSuccess: () => client.invalidateQueries({ queryKey: WORKSPACE_KEY }),
  });
}

export function useResetDemo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => services.brands.resetDemo(),
    onSuccess: () => client.invalidateQueries({ queryKey: WORKSPACE_KEY }),
  });
}

/** La lettura del sito con i passi dell'AI, man mano che li fa: `steps` riparte vuoto a ogni lettura. */
export function useReadWebsite() {
  const [steps, setSteps] = useState<AiStep[]>([]);
  const mutation = useMutation({
    mutationFn: ({ site, identity }: { site: string; identity: Identity }) => {
      setSteps([]);
      return services.ai.readWebsite(site, identity, setSteps);
    },
  });
  return { ...mutation, steps };
}

/** Da cosa si propongono obiettivi e pubblico: `key` cambia quando cambia quello che si sa del brand. */
export interface PositioningSource {
  key: string;
  site: WebsiteInsights | null;
}

const positioningStepsKey = (key: string) => ['positioning-steps', key] as const;

/** I passi finiscono in cache accanto al risultato: si vedono anche se la generazione è partita prima del passo. */
function positioningIdeasOptions(client: Client, identity: Identity, source: PositioningSource) {
  return queryOptions({
    queryKey: ['positioning-ideas', source.key],
    queryFn: () =>
      services.ai.suggestPositioning(identity, source.site, (steps) =>
        client.setQueryData(positioningStepsKey(source.key), steps),
      ),
  });
}

/** Obiettivi e pubblico proposti dall'AI, con i passi mentre li prepara: una generazione per contesto. */
export function usePositioningIdeas(identity: Identity, source: PositioningSource | null) {
  const client = useQueryClient();
  const key = source?.key ?? '';
  const ideas = useQuery({
    ...positioningIdeasOptions(client, identity, source ?? { key, site: null }),
    enabled: source !== null,
  });
  const steps = useQuery({ queryKey: positioningStepsKey(key), queryFn: skipToken });
  return { ...ideas, steps: (steps.data as AiStep[] | undefined) ?? [] };
}

/** Si avvia prima di arrivare al passo, così le proposte sono pronte (o quasi) quando si apre. */
export function usePrefetchPositioningIdeas() {
  const client = useQueryClient();
  return (identity: Identity, source: PositioningSource) =>
    client.prefetchQuery(positioningIdeasOptions(client, identity, source));
}

export function useSuggestThemes() {
  return useMutation({ mutationFn: (identity: Identity) => services.ai.suggestThemes(identity) });
}

export function useAnalyzeVoice() {
  return useMutation({
    mutationFn: ({ sample, identity }: { sample: VoiceSample; identity: Identity }) =>
      services.ai.analyzeVoice(sample, identity),
  });
}

export function useConnectChannel() {
  return useMutation({
    mutationFn: ({ channel, identity }: { channel: ChannelId; identity: Identity }) =>
      services.channels.connect(channel, identity),
  });
}
