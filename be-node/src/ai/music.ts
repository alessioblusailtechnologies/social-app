import { z } from 'zod';

import type { Brand } from '@/domain/brand';
import { MUSIC_STEPS, THINKING_STEP, createStepLog } from '@/services/ai-steps';
import type { OnAiSteps } from '@/services/types';

import { ApiError } from '../contract/errors';
import type { TrackPlan } from '../media/music';
import { APP_CONTEXT, describeIdentity } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { stepsFromTools } from './steps';

/**
 * Il piano della musica del brand: poche tracce strumentali di atmosfere diverse, dal «come suona» del profilo video.
 * Il piano dice genere, velocità, strumenti e l'arco di ogni traccia; la compone poi ElevenLabs.
 */

const SYSTEM = `${APP_CONTEXT} Qui scrivi la musica di un brand: le poche tracce strumentali che andranno sotto tutti i suoi video, così suona sempre riconoscibile.`;

const planSchema = z.object({
  tracks: z
    .array(
      z.object({
        mood: z.string().describe('In italiano, l’atmosfera in poche parole, per l’utente e per chi monta.'),
        bpm: z.number().int().describe('La velocità: chi monta fa cadere gli stacchi sul tempo.'),
        styles: z.array(z.string()).describe('In inglese, in termini musicali: genere, bpm, strumenti, atmosfera. Niente nomi di artisti o di brani.'),
        avoid: z.array(z.string()).describe('In inglese, quello che la traccia non deve avere.'),
        sections: z.array(
          z.object({
            name: z.string(),
            styles: z.array(z.string()).describe('In inglese: cosa succede in questa parte.'),
            seconds: z.number(),
          }),
        ),
      }),
    )
    .describe('Da 4 a 6 tracce, di atmosfere diverse ma dello stesso brand.'),
});

export interface PlannedTrack extends TrackPlan {
  mood: string;
  bpm: number;
}

export async function planBrandMusic(engine: AiEngine, meta: AiMeta, brand: Brand, onSteps?: OnAiSteps): Promise<PlannedTrack[]> {
  const log = createStepLog(onSteps);
  const video = brand.visual.video;
  const result = await engine.run({
    ...meta,
    task: 'music-plan',
    generate: false,
    onTool: stepsFromTools(log, { first: MUSIC_STEPS.plan, next: MUSIC_STEPS.reflect }),
    schema: planSchema,
    system: SYSTEM,
    prompt: [
      'Scrivi il piano della musica di questo brand.',
      '',
      '## Il brand',
      describeIdentity(brand.identity),
      video ? `Come suona: ${video.sound}` : null,
      video ? `Come si muovono i suoi video: ${video.look}` : null,
      '',
      '## Come si usa',
      'Ogni video del brand, verticale e lungo 15-40 secondi, ne usa una: chi monta la sceglie, la taglia sulla durata del video e fa cadere gli stacchi sul tempo. Sono strumentali: sotto ci sono testi a schermo, non una voce.',
      'Ogni traccia si compone a sezioni (per esempio un’apertura, il corpo, una chiusura), da 30 a 60 secondi in tutto.',
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  });
  log.drop(THINKING_STEP);

  const plain = (text: string) => text.replace(/\s+/g, ' ').trim();
  const tracks = result.tracks
    .map((track) => ({
      mood: plain(track.mood).slice(0, 120),
      bpm: Math.min(200, Math.max(50, Math.round(track.bpm))),
      styles: track.styles.map(plain).filter(Boolean).slice(0, 12),
      avoid: track.avoid.map(plain).filter(Boolean).slice(0, 8),
      sections: track.sections
        .map((section) => ({
          name: plain(section.name).slice(0, 60) || 'section',
          styles: section.styles.map(plain).filter(Boolean).slice(0, 8),
          seconds: Math.min(60, Math.max(3, section.seconds)),
        }))
        .slice(0, 6),
    }))
    .filter((track) => track.mood && track.sections.length > 0)
    .slice(0, 6);
  if (tracks.length === 0) throw new ApiError(502, 'AI_FAILED', 'Non sono riuscito a pensare la musica. Riprova.');
  return tracks;
}
