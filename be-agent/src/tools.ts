import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import type { Brand } from '@/domain/brand';
import { ASPECT_SIZES, brandKit, withDesignTemplates, type Aspect, type CardText } from '@/domain/visual';

import type { ImageGenerator, PhotoAspect } from '../../be-node/src/media/images';
import type { CardRenderer } from '../../be-node/src/media/renderer';
import type { MediaStorage } from '../../be-node/src/media/storage';
import { mediaPath } from '../../be-node/src/visual/files';

/**
 * Gli strumenti che l'agente può usare mentre disegna un visivo, come server MCP in processo.
 *
 * Non sono una scorciatoia intorno a Claude Code: i server MCP sono un meccanismo suo, e questi
 * gli danno accesso a due cose che l'app sa già fare bene e che lui da solo rifarebbe peggio —
 * le foto e la composizione della card. Le chiavi restano di qua: l'agente chiede, noi facciamo.
 *
 * Il secondo strumento è il punto della faccenda. `componi_card` gli restituisce **il PNG**, non un
 * «fatto». Opus guarda le immagini: così vede il titolo che va a capo male o la foto che copre il
 * testo, e rifà l'HTML. È il giro che be-node non può fare, perché genera al buio.
 */

export interface VisualToolsContext {
  accountId: string;
  brand: Brand;
  images: ImageGenerator;
  renderer: CardRenderer;
  storage: MediaStorage;
  log: FastifyBaseLogger;
  /** Le foto create durante la sessione, per percorso: le rilegge chi salva il disegno. */
  photos: Map<string, string>;
}

const ASPECTS = Object.keys(ASPECT_SIZES) as [Aspect, ...Aspect[]];
const PHOTO_ASPECTS: [PhotoAspect, ...PhotoAspect[]] = ['4:5', '9:16', '16:9', '1:1'];

/** I testi della card: gli stessi campi dei template, tutti facoltativi perché ogni layout ne usa alcuni. */
const textShape = {
  kicker: z.string().default(''),
  headline: z.string().default(''),
  body: z.string().default(''),
  value: z.string().default(''),
  author: z.string().default(''),
  items: z.array(z.object({ title: z.string(), body: z.string() })).default([]),
};

export function visualTools(context: VisualToolsContext) {
  return createSdkMcpServer({
    name: 'visivo',
    version: '0.1.0',
    tools: [
      tool(
        'genera_foto',
        'Crea una foto per la card. Usalo solo se il layout che stai disegnando ha una foto. Descrivi cosa si vede in concreto: soggetto, luogo, inquadratura, luce. Niente scritte né loghi nell’immagine. Torna il percorso da passare a componi_card.',
        {
          descrizione: z.string().min(3).describe('Cosa si vede nella foto, in concreto.'),
          formato: z.enum(PHOTO_ASPECTS).default('4:5').describe('Le proporzioni: il layout poi la ritaglia.'),
        },
        async ({ descrizione, formato }) => {
          try {
            const photo = await context.images.generate({
              prompt: descrizione,
              aspectRatio: formato,
              references: [],
              meta: { accountId: context.accountId, brandId: context.brand.id },
            });
            const path = mediaPath(context.accountId, context.brand.id, photo.mimeType);
            await context.storage.upload(path, photo.bytes, photo.mimeType);
            context.photos.set(path, descrizione);
            return {
              content: [
                { type: 'text', text: `Foto pronta. Passa questo percorso a componi_card come fotoPath:\n${path}` },
                { type: 'image', data: Buffer.from(photo.bytes).toString('base64'), mimeType: photo.mimeType },
              ],
            };
          } catch (error) {
            context.log.warn({ err: error }, 'genera_foto non riuscito');
            return {
              content: [{ type: 'text', text: `Non sono riuscito a creare la foto: ${message(error)}. Disegna un layout senza foto.` }],
              isError: true,
            };
          }
        },
      ),

      tool(
        'componi_card',
        'Compone la card e te la restituisce come immagine, così la guardi davvero prima di consegnarla. Chiamalo dopo aver scritto html e css: se qualcosa non torna — testo che esce, titolo spezzato male, foto che copre le parole — correggi e richiama.',
        {
          html: z.string().min(10).describe('Il corpo della card, coi segnaposto {{headline}}, {{photo}}…'),
          css: z.string().min(10).describe('Il foglio di stile del template.'),
          formato: z.enum(ASPECTS).describe('Il rapporto d’immagine del canale.'),
          testi: z.object(textShape).describe('I testi che riempiono i segnaposto.'),
          fotoPath: z.string().nullable().default(null).describe('Il percorso tornato da genera_foto, se il layout ha una foto.'),
        },
        async ({ html, css, formato, testi, fotoPath }) => {
          try {
            const template = { id: 'bozza', name: 'Bozza', use: '', fields: [], photo: Boolean(fotoPath), html, css };
            const kit = withDesignTemplates(brandKit(context.brand), { templates: [template], fonts: [] });
            const photoUrl = fotoPath ? ((await context.storage.sign([fotoPath])).get(fotoPath) ?? null) : null;
            if (fotoPath && !photoUrl) throw new Error('la foto non si firma: controlla il percorso');
            const png = await context.renderer.render({
              kit,
              page: { templateId: 'statement', custom: 'bozza', text: testi as CardText },
              pageIndex: 0,
              pageCount: 1,
              photoUrl,
              cutoutUrl: null,
              aspect: formato,
            });
            return {
              content: [
                { type: 'text', text: 'Ecco la card composta. Guardala: il testo ci sta tutto? I margini reggono? Se sì, consegna questo html e css.' },
                { type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' },
              ],
            };
          } catch (error) {
            context.log.warn({ err: error }, 'componi_card non riuscito');
            return {
              content: [{ type: 'text', text: `Non sono riuscito a comporre la card: ${message(error)}. Controlla l’HTML e riprova.` }],
              isError: true,
            };
          }
        },
      ),
    ],
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
