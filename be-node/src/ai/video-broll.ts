import { z } from 'zod';

import type { Brand } from '@/domain/brand';
import { readScene, type Content } from '@/domain/content';
import { BROLL_STEPS, THINKING_STEP, createStepLog } from '@/services/ai-steps';
import type { OnAiSteps } from '@/services/types';

import { ApiError } from '../contract/errors';
import { APP_CONTEXT } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { stepsFromTools } from './steps';
import { describeVideoProfile } from './video-profile';

/**
 * Il b-roll di una scena, in due gesti: il fotogramma di partenza, che costa poco e si approva guardandolo, e poi la
 * clip che lo mette in movimento. Li genera l'agente con Higgsfield; i file arrivano nella libreria del brand e qui
 * torna il percorso.
 *
 * Il prompt dice il compito, la scena dentro la regia e il brand; modello, inquadratura e movimento li decide lui.
 */

const SYSTEM = `${APP_CONTEXT} Qui prepari il b-roll di una scena di un video verticale del brand: materiale di contorno, montato poi con testi, grafica e musica del brand.`;

const resultSchema = z.object({
  path: z.string().describe('Il percorso nella libreria del brand del file prodotto.'),
});

interface BrollInput {
  brand: Brand;
  content: Content;
  index: number;
  /** Indirizzi firmati: le foto vere del brand, come riferimento di stile, e il fotogramma da animare. */
  references: string[];
  frameUrl?: string;
  onSteps?: OnAiSteps;
}

export function brollFrame(engine: AiEngine, meta: AiMeta, input: BrollInput): Promise<string> {
  const scene = readScene(input.content.visual.scenes[input.index]);
  return runBroll(engine, meta, input, {
    task: 'video-frame',
    first: BROLL_STEPS.frame,
    done: BROLL_STEPS.frameDone,
    kind: /\.(png|jpe?g|webp)$/i,
    ask: [
      `Prepara il fotogramma di partenza della scena ${input.index + 1}: un’immagine verticale 9:16, senza scritte, da cui poi partirà una clip di ${scene.seconds} secondi.`,
      input.references.length > 0
        ? `Le foto vere del brand, per lo stile (colore, luce, grana), non da copiare:\n${input.references.map((url) => `- ${url}`).join('\n')}`
        : null,
    ],
  });
}

export function brollClip(engine: AiEngine, meta: AiMeta, input: BrollInput): Promise<string> {
  const scene = readScene(input.content.visual.scenes[input.index]);
  return runBroll(engine, meta, input, {
    task: 'video-clip',
    first: BROLL_STEPS.clip,
    done: BROLL_STEPS.clipDone,
    kind: /\.(mp4|webm|mov)$/i,
    ask: [
      `Metti in movimento il fotogramma approvato della scena ${input.index + 1}: una clip verticale 9:16 di ${scene.seconds} secondi, muta (l’audio lo mette il montaggio), che parte da questa immagine:`,
      input.frameUrl ?? '',
      'È materiale per un montaggio: basta una qualità da bozza (720p). Il fotogramma l’utente l’ha già approvato: resta quello.',
    ],
  });
}

async function runBroll(
  engine: AiEngine,
  meta: AiMeta,
  input: BrollInput,
  what: { task: 'video-frame' | 'video-clip'; first: string; done: string; kind: RegExp; ask: (string | null)[] },
): Promise<string> {
  const { brand, content, index, onSteps } = input;
  const log = createStepLog(onSteps);
  const scenes = content.visual.scenes.map(readScene);
  const result = await engine.run({
    ...meta,
    task: what.task,
    onTool: stepsFromTools(log, { first: what.first, next: BROLL_STEPS.reflect }),
    schema: resultSchema,
    system: SYSTEM,
    prompt: [
      ...what.ask,
      '',
      '## La scena',
      `${scenes[index].title} · ${scenes[index].seconds}s — ${scenes[index].description}`,
      scenes[index].overlay ? `Sopra ci andrà il testo «${scenes[index].overlay}».` : null,
      '',
      '## Il resto del video, per il contesto',
      ...scenes.map((scene, position) => (position === index ? null : `${position + 1}. ${scene.title} — ${scene.description}`)),
      '',
      brand.visual.video ? describeVideoProfile(brand.visual.video) : null,
      brand.visual.direction?.photoStyle ? `Lo stile fotografico del brand: ${brand.visual.direction.photoStyle}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  });
  log.drop(THINKING_STEP);

  const path = result.path.trim().replace(/^\/+/, '');
  if (!path.startsWith(`${meta.accountId}/${content.brandId}/`) || !what.kind.test(path)) {
    throw new ApiError(502, 'AI_FAILED', 'Il file non è arrivato. Riprova.');
  }
  log.start('done', what.done);
  log.finish('done');
  return path;
}
