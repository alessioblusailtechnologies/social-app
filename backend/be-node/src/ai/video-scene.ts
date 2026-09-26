import { z } from 'zod';

import type { Brand } from '@shared/domain/brand';
import { SCENE_SOURCE_LABELS, readScene, type Content, type VideoScene } from '@shared/domain/content';
import { THINKING_STEP, VIDEO_SCENE_STEPS, createStepLog } from '@shared/services/ai-steps';
import type { OnAiSteps } from '@shared/services/types';

import { APP_CONTEXT } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { stepsFromTools } from './steps';
import { describeVideoProfile } from './video-profile';

/**
 * «Non posso girarla»: chi pubblica non riesce a girare una scena, e la regia la rifà con un’altra strada. Il resto
 * del video resta com’è.
 */

const SYSTEM = `${APP_CONTEXT} Qui fai il regista: rifai una scena di un video che chi pubblica non può girare, dentro la regia che c’è già.`;

const sceneSchema = z.object({
  title: z.string(),
  description: z.string().describe('Cosa si vede.'),
  seconds: z.number().int(),
  source: z.enum(['photo', 'broll', 'graphic']),
  overlay: z.string().describe('Il testo a schermo, vuoto se non serve.'),
});

export async function replaceScene(
  engine: AiEngine,
  meta: AiMeta,
  input: { brand: Brand; content: Content; index: number; onSteps?: OnAiSteps },
): Promise<VideoScene> {
  const { brand, content, index, onSteps } = input;
  const log = createStepLog(onSteps);
  const scenes = content.visual.scenes.map(readScene);
  const result = await engine.run({
    ...meta,
    task: 'video-scene',
    generate: false,
    onTool: stepsFromTools(log, { first: VIDEO_SCENE_STEPS.thinking, next: VIDEO_SCENE_STEPS.reflect }),
    schema: sceneSchema,
    system: SYSTEM,
    prompt: [
      `Chi pubblica non può girare la scena ${index + 1}: rifalla con un’altra strada, tenendo il suo posto nella storia.`,
      '',
      content.visual.script ? `## Script\n${content.visual.script}\n` : null,
      '## La regia',
      ...scenes.map(
        (scene, position) =>
          `${position + 1}. ${scene.title} · ${scene.seconds}s · ${SCENE_SOURCE_LABELS[scene.source].toLowerCase()} — ${scene.description}${scene.overlay ? ` — a schermo: «${scene.overlay}»` : ''}`,
      ),
      '',
      '## Le strade',
      '- «photo»: una foto vera del brand messa in movimento;',
      '- «broll»: una clip generata dall’AI. Regge ambienti, oggetti, materiali, luce e atmosfera; quello che il brand vende invece esce alterato;',
      '- «graphic»: solo grafica animata nei colori e nei font del brand.',
      '',
      brand.visual.video ? describeVideoProfile(brand.visual.video) : null,
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  });
  log.drop(THINKING_STEP);

  const scene: VideoScene = {
    title: result.title.trim() || scenes[index].title,
    description: result.description.trim(),
    seconds: Math.min(60, Math.max(1, result.seconds)),
    source: result.source,
    overlay: result.overlay.trim(),
    footage: null,
  };
  log.start('done', VIDEO_SCENE_STEPS.done(SCENE_SOURCE_LABELS[scene.source].toLowerCase()));
  log.finish('done');
  return scene;
}
