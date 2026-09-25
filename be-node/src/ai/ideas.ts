import { z } from 'zod';

import type { Brand, ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import { ideaPreferences, SIGNAL_LABELS, type Idea, type IdeaDraft, type IdeaFormat, type IdeaSource } from '@/domain/idea';
import { selectedChannels } from '@/domain/plan';
import { createStepLog, IDEAS_STEPS, THINKING_STEP } from '@/services/ai-steps';
import { describeLink } from '@/services/mock/idea-generator';
import type { OnAiSteps } from '@/services/types';

import { channelIdSchema, formatSchema } from '../contract/schemas';
import { assertPublicUrl } from '../lib/public-url';
import { APP_CONTEXT, WRITING_RULES, describeBrand } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { stepsFromTools } from './steps';

/** Le idee: proposte dal Brand DNA e dalle scelte passate, oppure spunti da una fonte dell'utente. */

const FORMAT_CHANNELS: Record<IdeaFormat, ChannelId[]> = {
  post: ['linkedin', 'instagram', 'facebook', 'x'],
  carousel: ['linkedin', 'instagram'],
  video: ['instagram', 'tiktok', 'linkedin'],
  article: ['linkedin'],
};

/** I canali proposti, ristretti a quelli del brand; se non ne resta nessuno, quelli adatti ai formati. */
export function fitChannels(brand: Brand, proposed: readonly ChannelId[], formats: readonly IdeaFormat[]): ChannelId[] {
  const allowed = selectedChannels(brand);
  const chosen = [...new Set(proposed)].filter((channel) => allowed.includes(channel));
  if (chosen.length > 0) return chosen;
  const fitting = allowed.filter((channel) => formats.some((format) => FORMAT_CHANNELS[format].includes(channel)));
  return fitting.length > 0 ? fitting : allowed;
}

const SYSTEM = [
  APP_CONTEXT,
  'Qui proponi idee di contenuto. Un’idea è il punto di partenza di un post, un carosello, un video o un articolo: che cosa raccontare, con quale taglio e perché ha senso per questo brand adesso.',
  WRITING_RULES,
  '',
  'Ogni idea ha:',
  '- title: l’idea in una frase specifica, massimo 110 caratteri, con la voce del brand (vedi la persona grammaticale);',
  '- angleLabel: il nome del taglio in 2-4 parole, per esempio «Il caso con i numeri», «La tesi controcorrente», «Il dietro le quinte», «La domanda frequente», «Prima e dopo», «La ricorrenza», «Il commento», «Il momento giusto»;',
  '- angle: come svilupparla, in due o tre frasi pratiche (quali dati o esempi mostrare, come aprire, come chiudere);',
  '- rationale: perché ha senso adesso, in una frase che cita il segnale (quanto spesso esce il tema nel piano, la data, la notizia, il periodo), senza percentuali;',
  '- themeId: l’id di uno dei temi del brand, come scritto nell’elenco; null solo se non ne tocca nessuno;',
  '- formats: 1 o 2 formati adatti tra post, carousel, video, article;',
  '- channels: gli id dei canali del brand adatti ai formati (carousel: linkedin e instagram; video: instagram, tiktok e linkedin; article: linkedin; post: tutti).',
].join('\n');

const IDEA_FIELDS = {
  title: z.string(),
  angleLabel: z.string(),
  angle: z.string(),
  rationale: z.string(),
  themeId: z.string().nullable(),
  formats: z.array(formatSchema),
  channels: z.array(channelIdSchema),
};

type RawIdea = { [K in keyof typeof IDEA_FIELDS]: z.output<(typeof IDEA_FIELDS)[K]> };

function toDraft(brand: Brand, raw: RawIdea, signal: IdeaDraft['signal'], source: IdeaSource | null): IdeaDraft {
  const formats: IdeaFormat[] = raw.formats.length > 0 ? [...new Set(raw.formats)].slice(0, 2) : ['post'];
  return {
    title: raw.title.trim().slice(0, 300),
    angleLabel: raw.angleLabel.trim().slice(0, 120),
    angle: raw.angle.trim().slice(0, 2000),
    rationale: raw.rationale.trim().slice(0, 1000),
    themeId: brand.themes.some((theme) => theme.id === raw.themeId) ? raw.themeId : null,
    signal: { kind: signal.kind, label: signal.label.trim().slice(0, 200) },
    source,
    formats,
    channels: fitChannels(brand, raw.channels, formats),
  };
}

const generatedSchema = z.object({
  ideas: z.array(
    z.object({
      ...IDEA_FIELDS,
      signal: z.object({
        kind: z.enum(['theme', 'trend', 'recurrence', 'season']),
        label: z.string(),
      }),
    }),
  ),
});

export async function generateIdeas(
  engine: AiEngine,
  meta: AiMeta,
  brand: Brand,
  existing: readonly Idea[],
  count: number,
  now: Date,
  onSteps?: OnAiSteps,
): Promise<IdeaDraft[]> {
  const log = createStepLog(onSteps);
  const channels = selectedChannels(brand).map(channelName);
  log.start(
    'context',
    IDEAS_STEPS.context(brand.identity.name),
    [`${brand.themes.length} ${brand.themes.length === 1 ? 'tema' : 'temi'}`, channels.join(', ')].filter(Boolean).join(' · '),
  );
  log.finish('context');
  const preferences = ideaPreferences(existing);
  const themeName = (id: string) => brand.themes.find((theme) => theme.id === id)?.name ?? id;
  const score = (value: number) => `${value > 0 ? '+' : ''}${String(value).replace('.', ',')}`;
  const recent = (status: Idea['status']) =>
    existing
      .filter((idea) => idea.status === status)
      .slice(0, 12)
      .map((idea) => `- ${idea.title}`);
  const saved = recent('saved');
  const discarded = recent('discarded');

  const result = await engine.run({
    ...meta,
    task: 'ideas',
    tools: ['WebSearch', 'WebFetch'],
    schema: generatedSchema,
    system: SYSTEM,
    onTool: stepsFromTools(log, { first: IDEAS_STEPS.plan, next: IDEAS_STEPS.reflect }),
    prompt: [
      `Proponi ${count} idee nuove per questo brand.`,
      [
        'Da dove nascono (signal):',
        '- kind «theme»: un tema del brand; label è il nome del tema;',
        '- kind «trend»: una notizia o una discussione di queste settimane che riguarda il pubblico del brand; label è la fonte o l’argomento seguito da « · questa settimana». Cercala sul web partendo dalle fonti attive: al massimo due idee da trend, e solo se hai trovato davvero la notizia;',
        '- kind «recurrence»: una delle ricorrenze vicine; label è il nome della data seguito da « · » e il giorno. Se ce n’è una, almeno un’idea è su quella;',
        '- kind «season»: il periodo dell’anno; label è il mese seguito da « · calendario».',
        'Distribuisci le idee sui temi secondo quanto spesso escono nel piano, corretto dalle scelte passate: più spazio ai temi e ai segnali con punteggio alto, meno a quelli con punteggio negativo. Niente idee uguali o quasi uguali a quelle già proposte.',
      ].join('\n'),
      describeBrand(brand, now),
      [
        '## Scelte passate',
        preferences.decided > 0
          ? [
              `Idee decise: ${preferences.decided}, tenute ${preferences.saved}.`,
              `Punteggio dei temi (+1 per ogni idea tenuta, -0,5 per ogni scartata): ${[...preferences.themeScores].map(([id, value]) => `${themeName(id)} ${score(value)}`).join('; ') || 'nessuno'}`,
              `Punteggio dei segnali: ${[...preferences.signalScores].map(([kind, value]) => `${SIGNAL_LABELS[kind as Idea['signal']['kind']] ?? kind} ${score(value)}`).join('; ') || 'nessuno'}`,
            ].join('\n')
          : 'Nessuna idea ancora decisa.',
        ...(saved.length > 0 ? ['Tenute di recente:', ...saved] : []),
        ...(discarded.length > 0 ? ['Scartate di recente:', ...discarded] : []),
      ].join('\n'),
      existing.length > 0
        ? ['## Già proposte: non ripeterle', ...existing.slice(0, 60).map((idea) => `- ${idea.title}`)].join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
  });

  const taken = new Set(existing.map((idea) => idea.title.trim().toLowerCase()));
  const drafts: IdeaDraft[] = [];
  for (const raw of result.ideas) {
    const draft = toDraft(brand, raw, raw.signal, null);
    const key = draft.title.toLowerCase();
    if (!draft.title || taken.has(key)) continue;
    taken.add(key);
    drafts.push(draft);
    if (drafts.length === count) break;
  }
  log.drop(THINKING_STEP);
  log.start('write', IDEAS_STEPS.write(drafts.length), drafts[0]?.title);
  log.finish('write');
  return drafts;
}

function sourceSignal(source: IdeaSource): IdeaDraft['signal'] {
  if (source.kind === 'prompt') return { kind: 'prompt', label: 'Una tua nota' };
  if (source.kind === 'link') return { kind: 'link', label: describeLink(source.url).host };
  if (source.kind === 'material') return { kind: 'prompt', label: `${source.files.length} tra foto e video` };
  return {
    kind: 'document',
    label: source.size ? `${source.name} · ${Math.max(1, Math.round(source.size / 45_000))} pagine` : source.name,
  };
}

/** La fonte a parole, con quello che l'AI può e non può farne. */
export function describeSource(source: IdeaSource): string {
  const note = 'note' in source && source.note.trim() ? source.note.trim() : '';
  if (source.kind === 'prompt') return ['## La fonte: una nota dell’utente', '"""', source.text, '"""'].join('\n');
  if (source.kind === 'link') {
    return [
      '## La fonte: un link',
      `Indirizzo: ${source.url}`,
      'Aprilo e leggi l’articolo. Se non si apre, lavora da quello che dicono l’indirizzo e la nota, senza inventare il contenuto.',
      note ? `Cosa ha colpito l’utente: ${note}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (source.kind === 'material') return describeMaterial(source);
  return [
    '## La fonte: un documento',
    `Nome del file: ${source.name}`,
    'Del documento conosci solo il nome e la nota: non inventarne il contenuto, proponi tagli che l’utente può sviluppare con il documento in mano.',
    note ? `Cosa ha colpito l’utente: ${note}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const time = (seconds: number) => `${Math.round(seconds * 10) / 10} s`;

/**
 * Il materiale di chi pubblica, file per file, col catalogo che ne ha fatto l'analisi: i momenti dei video coi tempi,
 * e quello che non si può usare. Chi scrive la regia sceglie da qui, indicando il numero del file e il pezzo.
 */
function describeMaterial(source: Extract<IdeaSource, { kind: 'material' }>): string {
  const files = source.files.map((file, index) => {
    const length = file.kind === 'video' && file.catalog?.seconds ? `, ${time(file.catalog.seconds)}` : '';
    const head = `File ${index + 1} (${file.kind === 'video' ? `video${length}` : 'foto'}), «${file.name}»`;
    if (!file.catalog) return `${head}: non sono riuscito a guardarlo, non usarlo.`;
    return [
      `${head}: ${file.catalog.summary}`,
      ...file.catalog.shots.map(
        (shot) =>
          `   ${time(shot.start)}–${time(shot.end)}: ${shot.what}${shot.usable ? '' : ' [non usabile]'}${shot.faces ? ' [volti riconoscibili]' : ''}`,
      ),
      file.catalog.audio ? `   Audio: ${file.catalog.audio}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });
  return [
    '## La fonte: il materiale di chi pubblica',
    source.note.trim()
      ? `Cosa vuole raccontare: ${source.note.trim()}`
      : 'Non ha detto cosa vuole raccontare: trova tu il taglio guardando cosa c’è.',
    'Sono foto e video veri, girati da chi pubblica: è da qui che si mostra quello che il brand vende. La storia nasce da quello che c’è.',
    ...files,
    '',
    'In un video, una scena girata («shoot») o una foto viva («photo») prende il suo materiale da un file: indicalo in material col numero del file e, per un video, il pezzo da usare (start e end in secondi, dentro un momento usabile; per una foto 0 e 0). Una scena senza materiale adatto resta da girare, con le indicazioni per farlo, o diventa grafica o b-roll di contorno.',
    'In un carosello, ogni slide può avere la sua foto: indica in photo il numero di una foto.',
  ].join('\n');
}

const sourceSchema = z.object({ ideas: z.array(z.object(IDEA_FIELDS)) });

export async function draftIdeasFromSource(
  engine: AiEngine,
  meta: AiMeta,
  brand: Brand,
  source: IdeaSource,
  variant: number,
  now: Date,
): Promise<IdeaDraft[]> {
  if (source.kind === 'link') await assertPublicUrl(source.url);

  const result = await engine.run({
    ...meta,
    task: 'source-ideas',
    tools: source.kind === 'link' ? ['WebFetch'] : [],
    schema: sourceSchema,
    system: SYSTEM,
    prompt: [
      'Da questa fonte proponi 3 idee di contenuto per il brand, con tre tagli diversi fra loro.',
      variant > 0 ? `È la richiesta numero ${variant + 1} sulla stessa fonte: scegli tagli diversi da quelli più ovvi.` : '',
      'Nel rationale di ogni idea di’ da dove nasce e a quale tema si lega, per esempio «Dal link che hai condiviso. Si lega a «Numeri e prezzi», che nel piano esce ogni tanto.»',
      describeSource(source),
      describeBrand(brand, now),
    ]
      .filter(Boolean)
      .join('\n\n'),
  });

  const signal = sourceSignal(source);
  return result.ideas
    .slice(0, 3)
    .map((raw) => toDraft(brand, raw, signal, source))
    .filter((draft) => draft.title);
}
