import type { FastifyInstance } from 'fastify';

import { confirmPlanSchema, ideaRefSchema, planRequestSchema, slotDraftSchema, slotPatchSchema } from '../../contract/schemas';
import type { Deps } from '../../services/deps';
import { addIdeaToPlan, addSlot, confirmPlan, listPlan, proposePlan, removeSlot, updateSlot } from '../../services/plan';
import { idFrom } from './params';

type BrandParams = { Params: { brandId: string } };
type SlotParams = { Params: { slotId: string } };

const brandId = (value: string) => idFrom(value, 'Brand non trovato.');
const slotId = (value: string) => idFrom(value, 'Uscita non trovata.');

export function registerPlanRoutes(app: FastifyInstance, deps: Deps): void {
  app.get<BrandParams>('/api/brands/:brandId/slots', (request) =>
    listPlan(deps, request.identity, brandId(request.params.brandId)),
  );

  app.post<BrandParams>('/api/brands/:brandId/plan/proposal', (request) =>
    proposePlan(deps, request.identity, brandId(request.params.brandId), planRequestSchema.parse(request.body)),
  );

  app.post<BrandParams>('/api/brands/:brandId/plan/confirm', async (request, reply) => {
    const { drafts } = confirmPlanSchema.parse(request.body);
    return reply.code(201).send(await confirmPlan(deps, request.identity, brandId(request.params.brandId), drafts));
  });

  app.post<BrandParams>('/api/brands/:brandId/plan/ideas', (request) => {
    const { ideaId, channels } = ideaRefSchema.parse(request.body);
    return addIdeaToPlan(deps, request.identity, brandId(request.params.brandId), ideaId, channels);
  });

  app.post<BrandParams>('/api/brands/:brandId/slots', async (request, reply) => {
    const slot = await addSlot(deps, request.identity, brandId(request.params.brandId), slotDraftSchema.parse(request.body));
    return reply.code(201).send(slot);
  });

  app.patch<SlotParams>('/api/slots/:slotId', (request) =>
    updateSlot(deps, request.identity, slotId(request.params.slotId), slotPatchSchema.parse(request.body)),
  );

  app.delete<SlotParams>('/api/slots/:slotId', async (request, reply) => {
    await removeSlot(deps, request.identity, slotId(request.params.slotId));
    return reply.code(204).send();
  });
}
