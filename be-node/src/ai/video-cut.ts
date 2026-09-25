import { z } from 'zod';

import type { BrandTrack } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import { SCENE_SOURCE_LABELS, readScene, videoSeconds, type Content, type VideoScene } from '@/domain/content';
import { THINKING_STEP, VIDEO_CUT_STEPS, createStepLog } from '@/services/ai-steps';
import type { OnAiSteps } from '@/services/types';

import { ApiError } from '../contract/errors';
import { APP_CONTEXT } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { stepsFromTools } from './steps';

/**
 * Il montaggio di un video: l'agente, nella cartella del brand, scrive la composizione Remotion dalla regia, la
 * rende, se la guarda e la consegna. In questa fase non compra niente: dove manca il materiale (il girato da
 * caricare, il b-roll ancora da generare) mette un cartello che dice cosa ci andrà, così il ritmo e la storia si
 * vedono prima di girare.
 *
 * Il prompt dice il compito, la regia e cosa c'è a disposizione; come montarlo lo decide il modello.
 */

const SYSTEM = `${APP_CONTEXT} Qui fai il montatore: monti un video verticale del brand seguendo la regia già approvata dall’utente, nella cartella di lavoro, e lo consegni.`;

const cutSchema = z.object({
  video: z.string().describe('Il percorso che `consegna` ti ha restituito per il montaggio finito.'),
  placeholders: z.number().int().describe('Quante scene hanno il cartello al posto dell’immagine.'),
  seconds: z.number().describe('Quanto dura il video montato, in secondi.'),
  track: z.string().describe('Il file della musica usata, es. «musica-2.mp3»; vuoto se nessuna.'),
});

export interface CutOutput {
  path: string;
  placeholders: number;
  seconds: number;
  /** La traccia del brand usata, se una. */
  trackId: string | null;
}

export async function cutVideo(
  engine: AiEngine,
  meta: AiMeta,
  /** `track`: l'utente ha scelto la traccia (è l'unica in `music`); `none`: la vuole senza; `auto`: sceglie chi monta. */
  input: { content: Content; music: BrandTrack[]; chosen: 'auto' | 'track' | 'none'; onSteps?: OnAiSteps },
): Promise<CutOutput> {
  const { content, music, chosen, onSteps } = input;
  const log = createStepLog(onSteps);
  const result = await engine.run({
    ...meta,
    task: 'video',
    // Solo quello che c'è: le generazioni a pagamento arrivano con un gesto a parte.
    generate: false,
    // Rendere, guardare e correggere chiede più giri di un testo: con 40 un montaggio accurato si è fermato a un passo
    // dalla consegna. Il tetto di spesa per lavoro resta.
    maxTurns: 80,
    // Il suo progetto di montaggio: rimontando lo stesso video si riparte da lì.
    studio: `video/${content.id}`,
    onTool: stepsFromTools(log, { first: VIDEO_CUT_STEPS.thinking, next: VIDEO_CUT_STEPS.reflect }),
    schema: cutSchema,
    system: SYSTEM,
    // Il girato e le foto caricati da chi pubblica, già nella cartella del montaggio.
    media: [...footageFiles(content), ...music.map((track, index) => ({ path: track.file.path!, name: trackName(index) }))].filter(
      (file) => Boolean(file.path),
    ),
    prompt: cutPrompt(content, music, chosen),
  });
  log.drop(THINKING_STEP);

  // Il file lo mette nella libreria `consegna`, con un percorso del brand: niente altro si accetta.
  const path = result.video.trim().replace(/^\/+/, '');
  if (!path.startsWith(`${meta.accountId}/${content.brandId}/`) || !/\.(mp4|webm|mov)$/i.test(path)) {
    throw new ApiError(502, 'AI_FAILED', 'Il montaggio non è arrivato. Riprova.');
  }
  const scenes = content.visual.scenes.length;
  const placeholders = Math.min(scenes, Math.max(0, Math.round(result.placeholders)));
  log.start('done', VIDEO_CUT_STEPS.done(placeholders));
  log.finish('done');
  const used = music.findIndex((_, index) => result.track.includes(trackName(index)));
  return { path, placeholders, seconds: Math.max(1, Math.round(result.seconds)), trackId: used >= 0 ? music[used].id : null };
}

/** Il nome del materiale di una scena nella cartella del montaggio: «scena-2.mp4». */
function footageName(index: number, path: string): string {
  return `scena-${index + 1}.${path.split('.').pop() ?? 'bin'}`;
}

/** Il file vero di una scena: il girato o la foto di chi pubblica, o la clip del b-roll. */
function materialOf(scene: VideoScene): string | null {
  return (scene.source === 'broll' ? scene.clip?.path : scene.footage?.path) ?? null;
}

function footageFiles(content: Content): { path: string; name: string }[] {
  return content.visual.scenes.map(readScene).flatMap((scene, index) => {
    const path = materialOf(scene);
    return path ? [{ path, name: footageName(index, path) }] : [];
  });
}

/** Il nome di una traccia del brand nella cartella del montaggio: «musica-1.mp3». */
function trackName(index: number): string {
  return `musica-${index + 1}.mp3`;
}

function cutPrompt(content: Content, music: BrandTrack[], chosen: 'auto' | 'track' | 'none'): string {
  const scenes = content.visual.scenes.map(readScene);
  return [
    'Monta questo video seguendo la regia.',
    '',
    `## Il contenuto`,
    `Titolo: ${content.title}`,
    `Esce su: ${content.channels.map(channelName).join(', ')}`,
    content.visual.script ? `Script:\n${content.visual.script}` : null,
    '',
    `## La regia, ${videoSeconds(scenes)} secondi`,
    ...scenes.map((scene, index) =>
      [
        `${index + 1}. ${scene.title} · ${scene.seconds}s · ${SCENE_SOURCE_LABELS[scene.source].toLowerCase()}`,
        `   Cosa si vede: ${scene.description}`,
        scene.overlay ? `   Testo a schermo: «${scene.overlay}»` : null,
        materialOf(scene)
          ? `   ${scene.source === 'broll' ? 'Clip generata' : 'Materiale caricato'}: media/${footageName(index, materialOf(scene)!)}${
              scene.trim && scene.source === 'shoot' ? `, il pezzo da ${scene.trim.start} a ${scene.trim.end} s` : ''
            }`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    ),
    '',
    '## Cosa c’è a disposizione',
    '- Grafica e testo a schermo li disegni tu nella composizione, coi colori e i caratteri del brand (BRAND.md, i CSS in linea/).',
    '- Girati: quelli che il cliente ha caricato sono in media/, indicati scena per scena; gli altri non ci sono ancora. Del girato usa il pezzo indicato, se c’è: viene dall’analisi del materiale già fatta, momento per momento; altrimenti prendi il migliore per la durata della scena.',
    '- B-roll: le clip già generate sono in media/, indicate scena per scena; le altre non ci sono ancora, e in questo montaggio non si generano.',
    '- Foto vive: se il cliente ha caricato la foto della scena è in media/; altrimenti le foto vere del brand sono in esempi/foto/ e riferimenti/, e se una va bene la puoi muovere, se no la scena aspetta la sua.',
    'Dove l’immagine manca metti un cartello nello stile del brand che dice cosa ci andrà (per un girato, l’indicazione di ripresa), così chi guarda capisce già ritmo e storia. Il testo a schermo della scena resta sopra, come nel video finito.',
    music.length > 0
      ? [
          chosen === 'track'
            ? 'La musica l’ha scelta l’utente, ed è in media/: tagliala sulla durata del video con una chiusura pulita, e fai cadere gli stacchi sul tempo (un battito ogni 60/bpm secondi).'
            : 'La musica del brand, strumentale, in media/: scegline una che vada col video, tagliala sulla sua durata con una chiusura pulita, e fai cadere gli stacchi sul tempo (un battito ogni 60/bpm secondi).',
          ...music.map((track, index) => `- media/${trackName(index)}: ${track.mood}, ${track.bpm} bpm, ${track.seconds} s`),
          'Nella risposta indica quale hai usato.',
        ].join('\n')
      : chosen === 'none'
        ? 'Niente musica: l’utente vuole questo video senza.'
        : 'Niente musica: il brand non ne ha ancora.',
    '',
    'Quando il montaggio va bene, consegnalo e rispondi col percorso, quante scene hanno il cartello e quanto dura.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
