import type { FastifyInstance } from 'fastify';

import {
  directContentSchema,
  formatOptionSchema,
  ideaRefSchema,
  rewriteSchema,
  scheduleSchema,
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
  updateVariantText,
} from '../../services/contents';
import type { Deps } from '../../services/deps';
import { channelFrom, idFrom } from './params';

type BrandParams = { Params: { brandId: string } };
type ContentParams = { Params: { contentId: string } };
type VariantParams = { Params: { contentId: string; channel: string } };

const brandId = (value: string) => idFrom(value, 'Brand non trovato.');
const contentId = (value: string) => idFrom(value, 'Contenuto non trovato.');

export function registerContentRoutes(app: FastifyInstance, deps: Deps): void {
  app.get<BrandParams>('/api/brands/:brandId/contents', (request) =>
    listBrandContents(deps, request.identity, brandId(request.params.brandId)),
  );

  app.get<BrandParams>('/api/brands/:brandId/contents/drafts', (request) =>
    listBrandDrafts(deps, request.identity, brandId(request.params.brandId)),
  );

  app.get<ContentParams>('/api/contents/:contentId', (request) =>
    getContent(deps, request.identity, contentId(request.params.contentId)),
  );

  app.get<{ Params: { slotId: string } }>('/api/slots/:slotId/content', (request) =>
    getSlotContent(deps, request.identity, idFrom(request.params.slotId, 'Uscita non trovata.')),
  );

  app.post<{ Params: { slotId: string } }>('/api/slots/:slotId/content/prepare', (request) => {
    const { format } = formatOptionSchema.parse(request.body ?? {});
    return prepareContent(deps, request.identity, idFrom(request.params.slotId, 'Uscita non trovata.'), format);
  });

  app.post<BrandParams>('/api/brands/:brandId/contents', async (request, reply) => {
    const content = await createDirectContent(
      deps,
      request.identity,
      brandId(request.params.brandId),
      directContentSchema.parse(request.body),
    );
    return reply.code(201).send(content);
  });

  app.post<BrandParams>('/api/brands/:brandId/contents/from-idea', async (request, reply) => {
    const { ideaId } = ideaRefSchema.parse(request.body);
    return reply.code(201).send(await createContentFromIdea(deps, request.identity, brandId(request.params.brandId), ideaId));
  });

  app.post<ContentParams>('/api/contents/:contentId/regenerate', (request) => {
    const { format } = formatOptionSchema.parse(request.body ?? {});
    return regenerateContent(deps, request.identity, contentId(request.params.contentId), format);
  });

  app.put<VariantParams>('/api/contents/:contentId/variants/:channel', (request) => {
    const { text } = variantTextSchema.parse(request.body);
    return updateVariantText(
      deps,
      request.identity,
      contentId(request.params.contentId),
      channelFrom(request.params.channel),
      text,
    );
  });

  app.post<VariantParams>('/api/contents/:contentId/variants/:channel/rewrite', (request) => {
    const { instruction } = rewriteSchema.parse(request.body);
    return rewriteContentVariant(
      deps,
      request.identity,
      contentId(request.params.contentId),
      channelFrom(request.params.channel),
      instruction,
    );
  });

  app.post<ContentParams>('/api/contents/:contentId/approve', (request) =>
    approveContent(deps, request.identity, contentId(request.params.contentId)),
  );

  app.post<ContentParams>('/api/contents/:contentId/schedule', (request) =>
    scheduleContent(deps, request.identity, contentId(request.params.contentId), scheduleSchema.parse(request.body)),
  );

  app.post<ContentParams>('/api/contents/:contentId/reopen', (request) =>
    reopenContent(deps, request.identity, contentId(request.params.contentId)),
  );
}
