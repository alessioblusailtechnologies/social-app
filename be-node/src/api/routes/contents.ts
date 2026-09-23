import type { FastifyInstance } from 'fastify';

import type { Content } from '@/domain/content';

import {
  directContentSchema,
  formatOptionSchema,
  ideaRefSchema,
  rewriteSchema,
  scheduleSchema,
  variantLayoutSchema,
  variantTextSchema,
} from '../../contract/schemas';
import {
  approveContent,
  createContentFromIdea,
  createDirectContent,
  getContent,
  getSlotContent,
  listBrandContents,
  listBrandDrafts,
  prepareContent,
  regenerateContent,
  reopenContent,
  rewriteContentVariant,
  scheduleContent,
  updateVariantLayout,
  updateVariantText,
  type WithSlot,
} from '../../services/contents';
import type { Deps } from '../../services/deps';
import { signContent, signContents } from '../../visual/files';
import { queueJob } from './jobs';
import { channelFrom, idFrom } from './params';

type BrandParams = { Params: { brandId: string } };
type ContentParams = { Params: { contentId: string } };
type VariantParams = { Params: { contentId: string; channel: string } };

const brandId = (value: string) => idFrom(value, 'Brand non trovato.');
const contentId = (value: string) => idFrom(value, 'Contenuto non trovato.');

export function registerContentRoutes(app: FastifyInstance, deps: Deps): void {
  // Ogni contenuto che esce di qui ha gli indirizzi firmati di foto, scontorno e PNG.
  const one = async (pending: Promise<Content>) => signContent(deps.media.storage, await pending);
  const many = async (pending: Promise<Content[]>) => signContents(deps.media.storage, await pending);
  const withSlot = async (pending: Promise<WithSlot>) => {
    const { content, slot } = await pending;
    return { content: await signContent(deps.media.storage, content), slot };
  };

  app.get<BrandParams>('/api/brands/:brandId/contents', (request) =>
    many(listBrandContents(deps, request.identity, brandId(request.params.brandId))),
  );

  app.get<BrandParams>('/api/brands/:brandId/contents/drafts', (request) =>
    many(listBrandDrafts(deps, request.identity, brandId(request.params.brandId))),
  );

  app.get<ContentParams>('/api/contents/:contentId', (request) =>
    one(getContent(deps, request.identity, contentId(request.params.contentId))),
  );

  app.get<{ Params: { slotId: string } }>('/api/slots/:slotId/content', async (request) => {
    const { content } = await getSlotContent(deps, request.identity, idFrom(request.params.slotId, 'Uscita non trovata.'));
    return { content: content && (await signContent(deps.media.storage, content)) };
  });

  app.post<{ Params: { slotId: string } }>('/api/slots/:slotId/content/prepare', (request) => {
    const { format } = formatOptionSchema.parse(request.body ?? {});
    return withSlot(prepareContent(deps, request.identity, idFrom(request.params.slotId, 'Uscita non trovata.'), format));
  });

  // Le gemelle in coda: scrivere una bozza richiede tempo, e il lavoro va avanti anche se l'app se ne va.
  app.post<{ Params: { slotId: string } }>('/api/slots/:slotId/content/prepare/job', (request, reply) => {
    const { format } = formatOptionSchema.parse(request.body ?? {});
    const slotId = idFrom(request.params.slotId, 'Uscita non trovata.');
    return queueJob(deps, request, reply, { kind: 'content-prepare', input: { slotId, format }, ref: slotId });
  });

  app.post<BrandParams>('/api/brands/:brandId/contents', async (request, reply) => {
    const content = await createDirectContent(
      deps,
      request.identity,
      brandId(request.params.brandId),
      directContentSchema.parse(request.body),
    );
    return reply.code(201).send(await signContent(deps.media.storage, content));
  });

  app.post<BrandParams>('/api/brands/:brandId/contents/job', (request, reply) => {
    const direct = directContentSchema.parse(request.body);
    const id = brandId(request.params.brandId);
    return queueJob(deps, request, reply, { kind: 'content-direct', input: { ...direct, brandId: id }, brandId: id, ref: id });
  });

  app.post<BrandParams>('/api/brands/:brandId/contents/from-idea', async (request, reply) => {
    const { ideaId, channels } = ideaRefSchema.parse(request.body);
    const content = await createContentFromIdea(deps, request.identity, brandId(request.params.brandId), ideaId, channels);
    return reply.code(201).send(await signContent(deps.media.storage, content));
  });

  app.post<BrandParams>('/api/brands/:brandId/contents/from-idea/job', (request, reply) => {
    const { ideaId, channels } = ideaRefSchema.parse(request.body);
    const id = brandId(request.params.brandId);
    return queueJob(deps, request, reply, {
      kind: 'content-from-idea',
      input: { brandId: id, ideaId, ...(channels ? { channels } : {}) },
      brandId: id,
      // Il lavoro si ritrova dall'idea: due idee diverse possono diventare bozze nello stesso momento.
      ref: ideaId,
    });
  });

  app.post<ContentParams>('/api/contents/:contentId/regenerate', (request) => {
    const { format } = formatOptionSchema.parse(request.body ?? {});
    return one(regenerateContent(deps, request.identity, contentId(request.params.contentId), format));
  });

  app.post<ContentParams>('/api/contents/:contentId/regenerate/job', (request, reply) => {
    const { format } = formatOptionSchema.parse(request.body ?? {});
    const id = contentId(request.params.contentId);
    return queueJob(deps, request, reply, { kind: 'content-regenerate', input: { contentId: id, format }, ref: id });
  });

  app.put<VariantParams>('/api/contents/:contentId/variants/:channel', (request) => {
    const { text } = variantTextSchema.parse(request.body);
    return one(
      updateVariantText(deps, request.identity, contentId(request.params.contentId), channelFrom(request.params.channel), text),
    );
  });

  app.patch<VariantParams>('/api/contents/:contentId/variants/:channel', (request) => {
    const layout = variantLayoutSchema.parse(request.body);
    return one(
      updateVariantLayout(
        deps,
        request.identity,
        contentId(request.params.contentId),
        channelFrom(request.params.channel),
        layout,
      ),
    );
  });

  app.post<VariantParams>('/api/contents/:contentId/variants/:channel/rewrite', (request) => {
    const { instruction } = rewriteSchema.parse(request.body);
    return one(
      rewriteContentVariant(
        deps,
        request.identity,
        contentId(request.params.contentId),
        channelFrom(request.params.channel),
        instruction,
      ),
    );
  });

  app.post<VariantParams>('/api/contents/:contentId/variants/:channel/rewrite/job', (request, reply) => {
    const { instruction } = rewriteSchema.parse(request.body);
    const id = contentId(request.params.contentId);
    const channel = channelFrom(request.params.channel);
    return queueJob(deps, request, reply, { kind: 'content-rewrite', input: { contentId: id, channel, instruction }, ref: id });
  });

  app.post<ContentParams>('/api/contents/:contentId/approve', (request) =>
    withSlot(approveContent(deps, request.identity, contentId(request.params.contentId))),
  );

  app.post<ContentParams>('/api/contents/:contentId/schedule', (request) =>
    withSlot(scheduleContent(deps, request.identity, contentId(request.params.contentId), scheduleSchema.parse(request.body))),
  );

  app.post<ContentParams>('/api/contents/:contentId/reopen', (request) =>
    withSlot(reopenContent(deps, request.identity, contentId(request.params.contentId))),
  );
}
