import { z } from 'zod';

import type { Brand } from '@/domain/brand';
import { COVER_TITLE_LIMIT, type Content } from '@/domain/content';
import { TEMPLATE_IDS, templateSpec } from '@/domain/visual';
import { THINKING_STEP, VIDEO_COVER_STEPS, createStepLog } from '@/services/ai-steps';
import type { OnAiSteps } from '@/services/types';

import { ApiError } from '../contract/errors';
import { APP_CONTEXT } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { stepsFromTools } from './steps';

/**
 * La copertina del reel, fatta subito dopo il montaggio: l'agente sceglie il fotogramma, lo rifinisce con Higgsfield
 * (nitidezza, scontorno, fondo, inquadratura), la compone col motore del brand e se la guarda. Per TikTok, che la
 * copertina la prende da un fotogramma, la mette in testa al video.
 *
 * Il prompt dice il compito, cosa c'è e cosa sanno fare gli strumenti; le scelte le fa il modello.
 */

const SYSTEM = `${APP_CONTEXT} Qui fai la copertina di un reel del brand: l’immagine che si vede nella griglia del profilo prima di premere play.`;

const resultSchema = z.object({
  copertina: z.string().describe('Il percorso che `consegna` ti ha restituito per copertina.png.'),
  foto: z.string().describe('Il percorso consegnato dell’immagine su cui è composta.'),
  scontorno: z.string().describe('Il percorso consegnato dello scontorno, se il template lo usa; vuoto altrimenti.'),
  template: z.string(),
  titolo: z.string(),
  sopratitolo: z.string(),
  video: z.string().describe('Il percorso consegnato del montaggio con la copertina in testa; vuoto se non l’hai rifatto.'),
});

export interface CoverOutput {
  file: string;
  photo: string | null;
  cutout: string | null;
  template: string;
  title: string;
  kicker: string;
  video: string | null;
}

export async function coverVideo(
  engine: AiEngine,
  meta: AiMeta,
  input: { brand: Brand; content: Content; cutPath: string; onSteps?: OnAiSteps },
): Promise<CoverOutput> {
  const { brand, content, cutPath, onSteps } = input;
  const log = createStepLog(onSteps);
  const result = await engine.run({
    ...meta,
    task: 'video-cover',
    studio: `video/${content.id}`,
    media: [{ path: cutPath, name: 'montaggio.mp4' }],
    maxTurns: 60,
    onTool: stepsFromTools(log, { first: VIDEO_COVER_STEPS.thinking, next: VIDEO_COVER_STEPS.reflect }),
    schema: resultSchema,
    system: SYSTEM,
    prompt: coverPrompt(brand, content),
  });
  log.drop(THINKING_STEP);

  const own = (path: string, kind: RegExp) => {
    const clean = path.trim().replace(/^\/+/, '');
    return clean.startsWith(`${meta.accountId}/${content.brandId}/`) && kind.test(clean) ? clean : null;
  };
  const file = own(result.copertina, /\.(png|jpe?g|webp)$/i);
  if (!file) throw new ApiError(502, 'AI_FAILED', 'La copertina non è arrivata. Riprova.');
  log.start('done', VIDEO_COVER_STEPS.done);
  log.finish('done');
  return {
    file,
    photo: own(result.foto, /\.(png|jpe?g|webp)$/i),
    cutout: result.scontorno ? own(result.scontorno, /\.(png|webp)$/i) : null,
    template: result.template.trim(),
    title: result.titolo.trim().slice(0, COVER_TITLE_LIMIT),
    kicker: result.sopratitolo.trim().slice(0, 40),
    video: result.video ? own(result.video, /\.(mp4|mov|webm)$/i) : null,
  };
}

function coverPrompt(brand: Brand, content: Content): string {
  const brandTemplates = (brand.visual.line?.templates ?? []).filter((template) => template.photo);
  const engine = TEMPLATE_IDS.map(templateSpec).filter((spec) => spec.image);
  return [
    'Fai la copertina di questo reel. Il montaggio finito è in media/montaggio.mp4, nella cartella del video.',
    '',
    '## Il reel',
    `Titolo del contenuto: ${content.title}`,
    content.visual.headline ? `Il suo aggancio: ${content.visual.headline}` : null,
    content.visual.script ? `Script:\n${content.visual.script}` : null,
    '',
    '## La copertina',
    'Un’immagine 1080 × 1920: intera nella scheda Reels, ritagliata al centro in 3:4 (1080 × 1440) nella griglia del profilo. Quello che conta, soggetto e titolo, sta nella fascia centrale. Il titolo sono poche parole che si leggono in miniatura, nella voce del brand; non è la didascalia.',
    'L’immagine è un fotogramma vero del montaggio (ffmpeg è nel PATH). Poi la rifinisci con Higgsfield, per un risultato premium: nitidezza (un fotogramma di un video compresso è morbido), scontorno del soggetto, un fondo nei colori del brand dietro il soggetto, l’inquadratura allargata se il soggetto non sta nella fascia 3:4. Il soggetto e quello che il brand vende restano i pixel veri del fotogramma: un modello che li ritocca ne cambia colore e forma.',
    '',
    '## I template',
    brandTemplates.length > 0 ? 'Della linea del brand, con la foto:' : null,
    ...brandTemplates.map((template) => `- ${template.id} (${template.name}): ${template.use}`),
    'Del motore:',
    ...engine.map((spec) => `- ${spec.id} (${spec.name}, ${spec.image === 'cutout' ? 'col soggetto scontornato' : 'con la foto'}): ${spec.hint}`),
    'componi_copertina la compone col template che scegli e te la fa vedere.',
    '',
    '## Per TikTok',
    'TikTok la copertina la prende da un fotogramma del video: metti copertina.png in testa al montaggio per un istante (pochi fotogrammi) e consegna il video nuovo.',
    '',
    'Consegna copertina.png, l’immagine su cui l’hai composta (e lo scontorno, se lo usa) e il video, e rispondi coi percorsi.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
