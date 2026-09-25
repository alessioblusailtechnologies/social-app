import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { isSectionKey, type SectionPatch } from '@/domain/brand';

import { ApiError } from '../../contract/errors';
import { brandDraftSchema, materialUploadSchema, sectionSchemas } from '../../contract/schemas';
import type { Deps } from '../../services/deps';
import { materialUploadUrl } from '../../services/material';
import {
  chooseActiveBrand,
  createBrand,
  getWorkspace,
  loadDemoBrand,
  resetDemo,
  updateBrandSection,
} from '../../services/workspace';
import { queueJob } from './jobs';
import { idFrom } from './params';

const activeBrandSchema = z.object({ brandId: z.string() });
const sectionBodySchema = z.object({ value: z.unknown() });

export function registerWorkspaceRoutes(app: FastifyInstance, deps: Deps): void {
  app.get('/api/workspace', (request) => getWorkspace(deps, request.identity));

  app.put('/api/workspace/active-brand', async (request, reply) => {
    const { brandId } = activeBrandSchema.parse(request.body);
    await chooseActiveBrand(deps, request.identity, idFrom(brandId, 'Brand non trovato.'));
    return reply.code(204).send();
  });

  app.post('/api/brands', async (request, reply) => {
    const brand = await createBrand(deps, request.identity, brandDraftSchema.parse(request.body));
    return reply.code(201).send(brand);
  });

  app.put<{ Params: { brandId: string; key: string } }>('/api/brands/:brandId/sections/:key', (request) => {
    const { key } = request.params;
    if (!isSectionKey(key)) throw ApiError.notFound('Sezione sconosciuta.');
    const { value } = sectionBodySchema.parse(request.body);
    const patch = { key, value: sectionSchemas[key].parse(value) } as SectionPatch;
    return updateBrandSection(deps, request.identity, idFrom(request.params.brandId, 'Brand non trovato.'), patch);
  });

  /** Dove caricare un file del materiale, per la creazione «dal tuo materiale». */
  app.post<{ Params: { brandId: string } }>('/api/brands/:brandId/material/upload', (request) =>
    materialUploadUrl(deps, request.identity, idFrom(request.params.brandId, 'Brand non trovato.'), materialUploadSchema.parse(request.body)),
  );

  /** «Rifai la musica»: una libreria nuova di tracce del brand. In coda, coi passi: sono minuti. */
  app.post<{ Params: { brandId: string } }>('/api/brands/:brandId/music/job', (request, reply) => {
    const brandId = idFrom(request.params.brandId, 'Brand non trovato.');
    return queueJob(deps, request, reply, { kind: 'brand-music', input: { brandId }, brandId, ref: brandId });
  });

  app.post('/api/demo', async (request, reply) => {
    const brand = await loadDemoBrand(deps, request.identity);
    return reply.code(201).send(brand);
  });

  app.delete('/api/demo', async (request, reply) => {
    await resetDemo(deps, request.identity);
    return reply.code(204).send();
  });
}
