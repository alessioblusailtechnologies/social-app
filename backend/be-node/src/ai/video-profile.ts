import { z } from 'zod';

import { currentVoiceCard, type Brand, type BrandVideo } from '@shared/domain/brand';
import { channelName } from '@shared/domain/catalog';
import { selectedChannels } from '@shared/domain/plan';
import { THINKING_STEP, VIDEO_PROFILE_STEPS, createStepLog } from '@shared/services/ai-steps';
import type { OnAiSteps, VideoProfileRequest } from '@shared/services/types';

import { ApiError } from '../contract/errors';
import { APP_CONTEXT, describeIdentity } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { stepsFromTools } from './steps';

/**
 * Il profilo video del brand: cosa si mostra vero, cosa si può generare, le riprese da chiedere, come si muove e
 * come suona. Lo legge chi fa la regia di ogni video, ed è lì che un parrucchiere e una trattoria diventano diversi.
 *
 * Il prompt dice il compito, il brand e cosa sanno fare gli strumenti del video; il resto lo decide il modello.
 */

const SYSTEM = `${APP_CONTEXT} Qui scrivi il profilo video di un brand: come si racconta nei reel, nelle storie e su TikTok. Lo rilegge l’utente, e lo usa chi farà la regia di ogni video.`;

const profileSchema = z.object({
  real: z.string().describe('Quello che il brand vende o fa, e che nei video si mostra sempre vero.'),
  generated: z.string().describe('Quello che si può generare senza tradire nessuno.'),
  shots: z.array(z.string()).describe('Da 4 a 8 riprese tipiche da chiedere a chi pubblica, ognuna in una riga: cosa, da dove, con che luce.'),
  look: z.string().describe('Come si muovono i video del brand: colore, grana, ritmo, come entrano i titoli.'),
  sound: z.string().describe('Come suona la musica del brand, strumentale: genere, velocità, strumenti, atmosfera. Senza nomi di artisti o di brani.'),
});

/** Il profilo dalla richiesta dell'onboarding (il brand non esiste ancora) o da un brand salvato. */
export function videoRequestFrom(brand: Brand): VideoProfileRequest {
  return {
    identity: brand.identity,
    themes: brand.themes.map((theme) => theme.name).filter(Boolean),
    visual: brand.visual,
    channels: selectedChannels(brand),
    goals: brand.positioning.goals,
    audiences: brand.positioning.audiences,
    voice: currentVoiceCard(brand.voice),
  };
}

export async function writeVideoProfile(
  engine: AiEngine,
  meta: AiMeta,
  request: VideoProfileRequest,
  onSteps?: OnAiSteps,
): Promise<BrandVideo> {
  const log = createStepLog(onSteps);
  const result = await engine.run({
    ...meta,
    task: 'video-profile',
    // Nella cartella del brand l'agente può guardare le card e le foto già approvate.
    onTool: stepsFromTools(log, { first: VIDEO_PROFILE_STEPS.thinking, next: VIDEO_PROFILE_STEPS.reflect }),
    schema: profileSchema,
    system: SYSTEM,
    prompt: videoPrompt(request),
  });
  log.drop(THINKING_STEP);

  const plain = (text: string) => text.replace(/\s+/g, ' ').trim();
  const profile: BrandVideo = {
    real: plain(result.real).slice(0, 1000),
    generated: plain(result.generated).slice(0, 1000),
    shots: result.shots.map(plain).filter(Boolean).slice(0, 8).map((shot) => shot.slice(0, 300)),
    look: plain(result.look).slice(0, 1000),
    sound: plain(result.sound).slice(0, 600),
  };
  if (!profile.real || profile.shots.length === 0) {
    throw new ApiError(502, 'AI_FAILED', 'Non sono riuscito a scrivere il profilo video. Riprova.');
  }
  log.start('done', VIDEO_PROFILE_STEPS.done, `${profile.shots.length} riprese da chiedere`);
  log.finish('done');
  return profile;
}

/** Il profilo video per chi fa la regia di un contenuto. */
export function describeVideoProfile(video: BrandVideo): string {
  return [
    '## Come si racconta in video',
    `Si mostra sempre vero: ${video.real}`,
    `Si può generare: ${video.generated}`,
    'Riprese tipiche da chiedere:',
    ...video.shots.map((shot) => `- ${shot}`),
    `Come si muove: ${video.look}`,
    `Come suona: ${video.sound}`,
  ].join('\n');
}

const list = (items: readonly string[] | undefined) => (items && items.length > 0 ? items.join(', ') : 'non indicati');

function videoPrompt(request: VideoProfileRequest): string {
  const { identity, visual, voice } = request;
  return [
    'Scrivi il profilo video di questo brand.',
    '',
    '## Il brand',
    describeIdentity(identity),
    `Temi: ${list(request.themes)}`,
    `Obiettivi: ${list(request.goals)}`,
    `Pubblico: ${list(request.audiences)}`,
    `Canali: ${request.channels.map(channelName).join(', ') || 'non indicati'}`,
    request.siteSummary ? `Dal sito: ${request.siteSummary}` : null,
    voice ? `Voce: registro ${voice.register}; ritmo ${voice.rhythm}` : null,
    `Palette: ${visual.palette.colors.join(', ')} (principale, secondario, accento, sfondo).`,
    visual.direction?.summary ? `Le card: ${visual.direction.summary}` : null,
    visual.direction?.photoStyle ? `Le foto: ${visual.direction.photoStyle}` : null,
    '',
    '## Come si fanno i video',
    'Ogni video è diviso in scene di pochi secondi, e ogni scena prende l’immagine da una di queste strade:',
    '- girato: lo riprende chi pubblica, col telefono, seguendo le indicazioni che gli diamo;',
    '- foto viva: una foto vera del brand, mossa con zoom lenti, parallasse, tendine fra un prima e un dopo;',
    '- b-roll: una clip generata da un modello video. Regge ambienti, oggetti, materiali, luce e atmosfera; le persone, le mani al lavoro e quello che il brand vende escono alterati da un fotogramma all’altro (un colore di capelli che vira, un piatto che cambia forma);',
    '- grafica: tipografia animata, logo, forme e dati, nei colori e nei caratteri del brand.',
    'Il testo a schermo sta sopra, mai dentro le immagini; lo stesso colore e la stessa grana passano su tutte le scene al montaggio. Sotto c’è una musica strumentale generata, la stessa famiglia di tracce per tutti i video del brand.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}
