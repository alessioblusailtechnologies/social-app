import type { FastifyInstance } from 'fastify';

import { draftIdeasSchema, generateIdeasSchema, ideaStatusSchema, saveIdeasSchema } from '../../contract/schemas';
import type { Deps } from '../../services/deps';
import { draftBrandIdeas, generateBrandIdeas, listBrandIdeas, saveBrandIdeas, setIdeaStatus } from '../../services/ideas';
import { queueJob } from './jobs';
import { idFrom } from './params';

type BrandParams = { Params: { brandId: string } };

const brandId = (value: string) => idFrom(value, 'Brand non trovato.');

export function registerIdeaRoutes(app: FastifyInstance, deps: Deps): void {
  app.get<BrandParams>('/api/brands/:brandId/ideas', (request) =>
    listBrandIdeas(deps, request.identity, brandId(request.params.brandId)),
  );

  app.post<BrandParams>('/api/brands/:brandId/ideas/generate', (request) => {
    const { count } = generateIdeasSchema.parse(request.body ?? {});
    return generateBrandIdeas(deps, request.identity, brandId(request.params.brandId), count);
  });

  /** La stessa generazione, in coda: i passi dell'AI (cosa rilegge, cosa cerca, cosa apre) si leggono dal lavoro. */
  app.post<BrandParams>('/api/brands/:brandId/ideas/generate/job', (request, reply) => {
    const { count } = generateIdeasSchema.parse(request.body ?? {});
    const id = brandId(request.params.brandId);
    return queueJob(deps, request, reply, { kind: 'ideas', input: { brandId: id, count }, brandId: id, ref: id });
  });

  app.post<BrandParams>('/api/brands/:brandId/ideas/drafts', (request) => {
    const { source, variant } = draftIdeasSchema.parse(request.body);
    return draftBrandIdeas(deps, request.identity, brandId(request.params.brandId), source, variant);
  });

  app.post<BrandParams>('/api/brands/:brandId/ideas', async (request, reply) => {
    const { drafts } = saveIdeasSchema.parse(request.body);
    return reply.code(201).send(await saveBrandIdeas(deps, request.identity, brandId(request.params.brandId), drafts));
  });

  app.patch<{ Params: { ideaId: string } }>('/api/ideas/:ideaId', (request) => {
    const { status } = ideaStatusSchema.parse(request.body);
    return setIdeaStatus(deps, request.identity, idFrom(request.params.ideaId, 'Idea non trovata.'), status);
  });
}
