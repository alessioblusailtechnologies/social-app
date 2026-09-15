import type { FastifyInstance } from 'fastify';

import { analyzeVoice, readWebsite, suggestThemes } from '../../ai/profile';
import { themesRequestSchema, voiceRequestSchema, websiteRequestSchema } from '../../contract/schemas';
import { aiMeta, type Deps } from '../../services/deps';

/** L'AI del profilo: lavora sull'identità che l'utente sta scrivendo, prima che il brand esista. */
export function registerAiRoutes(app: FastifyInstance, deps: Deps): void {
  app.post('/api/ai/website', (request) => {
    const { site, identity } = websiteRequestSchema.parse(request.body);
    return readWebsite(deps.ai, aiMeta(request.identity), site, identity);
  });

  app.post('/api/ai/themes', (request) => {
    const { identity } = themesRequestSchema.parse(request.body);
    return suggestThemes(deps.ai, aiMeta(request.identity), identity);
  });

  app.post('/api/ai/voice', (request) => {
    const { sample, identity } = voiceRequestSchema.parse(request.body);
    return analyzeVoice(deps.ai, aiMeta(request.identity), sample, identity);
  });
}
