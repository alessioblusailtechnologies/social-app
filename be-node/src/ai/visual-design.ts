import { z } from 'zod';

import type { Brand, ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import type { Content } from '@/domain/content';
import { ASPECT_SIZES, CARD_LIMITS, aspectFor, type Aspect, type VisualDesign } from '@/domain/visual';

import { createStepLog, type StepLog } from '@/services/ai-steps';
import type { OnAiSteps } from '@/services/types';

import { describeBrand } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { stepsFromTools } from './steps';

/**
 * Il visivo di un contenuto, disegnato da capo.
 *
 * Non sceglie fra i template del brand: ne scrive uno nuovo per *questa* card, guardando le card
 * d'esempio dell'onboarding, che stanno come file nella cartella di lavoro dell'agente. Il modello
 * dei template resta quello del motore (`src/templates/custom.tsx`), perché da lì passano anche
 * l'anteprima dal vivo e Remotion: quello che segue è il suo contratto, ed è stretto per forza —
 * un tag fuori lista viene tolto in silenzio e la card esce sbagliata senza un errore.
 */

const TAGS =
  'div, span, p, h1-h6, img, br, hr, strong, em, b, i, u, s, small, sup, sub, mark, ul, ol, li, figure, figcaption, section, header, footer, article, main, aside, blockquote, e l’SVG inline (svg, g, path, circle, ellipse, rect, line, polyline, polygon, text, tspan, defs, linearGradient, radialGradient, stop, clipPath, mask)';

const SYSTEM = [
  'Disegni la card che accompagna un post sui social. La disegni scrivendo HTML e CSS, come farebbe un art director che sa programmare.',
  '',
  'Il tuo metro sono le card d’esempio del brand, che trovi come immagini nella cartella di lavoro: **guardale prima di scrivere**. Non devi copiarle: devi fare una cosa che sta in quella famiglia. Stessa mano, contenuto diverso.',
  '',
  '## Come si scrive un template',
  '',
  'Il tuo `html` è il corpo della card, senza `<html>` né `<body>`. Il tuo `css` è il foglio che lo veste. Dentro l’HTML metti i segnaposto, che vengono riempiti al momento del disegno:',
  '',
  '- valori: `{{kicker}}` `{{headline}}` `{{body}}` `{{value}}` `{{author}}` `{{brand}}` `{{signature}}` `{{address}}` `{{page}}`',
  '- immagini: `{{photo}}` e `{{logo}}`, da usare solo come `src` di un `<img>`',
  '- liste: `{{#items}}…{{/items}}`, e dentro `{{index}}` (01, 02…), `{{title}}`, `{{body}}`',
  '- condizionali: `{{#campo}}…{{/campo}}` se il campo c’è, `{{^campo}}…{{/campo}}` se manca',
  '',
  '## I limiti, che non sono negoziabili',
  '',
  `- **Tag ammessi**: ${TAGS}. Niente \`<a>\`, \`<table>\`, \`<video>\`, \`<iframe>\`, \`<script>\`. Quello che non è in lista viene tolto senza avvisare.`,
  '- **Niente risorse esterne**: nessun `@import`, nessun `url()` che non sia `data:`. I font non si importano nel CSS: si dichiarano in `fonts` (vedi sotto).',
  '- **Immagini**: solo `{{photo}}` e `{{logo}}`. Un `src` diverso viene scartato.',
  '- **I testi sono già al sicuro**: non scrivere HTML dentro i testi, viene mostrato come testo.',
  '',
  '## La misura della card',
  '',
  `La card è larga 1080 px. L’altezza dipende dal formato: ${Object.entries(ASPECT_SIZES)
    .map(([aspect, size]) => `${aspect} → ${size.height}px`)
    .join(', ')}.`,
  'Hai queste variabili CSS già valorizzate: `--card-w`, `--card-h`, `--primary`, `--secondary`, `--accent`, `--ground`, `--ink`, e in 9:16 anche `--safe-top` e `--safe-bottom` (le zone che l’interfaccia di Instagram e TikTok copre: lì non mettere niente che conti).',
  'Usa i colori del brand da queste variabili, non scriverli a mano.',
  '',
  '## Il testo che non entra',
  '',
  'Un elemento con `data-fit` viene rimpicciolito finché ci sta nel suo contenitore, fino al 35% (o a `data-fit-min`). Serve un contenitore con un’altezza definita. È la rete di sicurezza per i titoli lunghi, non una scusa per non pensare agli spazi.',
  '',
  '## Come si lavora',
  '',
  '1. Guarda le card d’esempio e leggi `BRAND.md`. Se in `linea/` ci sono i template dell’onboarding, aprili: sono la grammatica del brand, scritta.',
  '2. Leggi il testo del post. La card non ripete la prima riga del post: dice la stessa cosa in forma di manifesto.',
  '3. Se il layout ha una foto, chiamati `genera_foto` **prima** di comporre.',
  '4. Scrivi `html` e `css`, poi chiama `componi_card` e **guarda il PNG che ti torna**. Controlla: il titolo va a capo dove vuoi? C’è aria ai bordi? La foto copre parole? Se qualcosa non va, correggi e ricomponi. Un giro di correzione è normale, due sono il massimo: poi consegna quello che hai.',
  '5. Consegna il template, i font che hai usato, i testi e la descrizione della foto.',
  '',
  '## I testi della card',
  '',
  `Corti: kicker ${CARD_LIMITS.kicker} caratteri, headline ${CARD_LIMITS.headline}, body ${CARD_LIMITS.body}, value ${CARD_LIMITS.value}, author ${CARD_LIMITS.author}; nei punti title ${CARD_LIMITS.itemTitle} e body ${CARD_LIMITS.itemBody}, al massimo ${CARD_LIMITS.items} punti.`,
  'I campi che il tuo layout non usa restano stringhe vuote. `value` solo con un numero vero, `author` solo con una citazione vera.',
].join('\n');

/** I 13 layout del motore: il ripiego se il template disegnato non si trovasse. */
const FALLBACK_IDS = ['statement', 'stat', 'list', 'steps', 'quote', 'photo-cover', 'photo-frame', 'photo-only', 'split', 'point', 'closing'] as const;

const cardTextSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  body: z.string(),
  value: z.string(),
  author: z.string(),
  items: z.array(z.object({ title: z.string(), body: z.string() })),
});

const designSchema = z.object({
  name: z.string().describe('Il nome del layout per l’utente, due o tre parole, es. «Foto e titolo».'),
  html: z.string().describe('Il corpo della card, coi segnaposto.'),
  css: z.string().describe('Il foglio di stile.'),
  photo: z.boolean().describe('Il layout usa {{photo}}.'),
  fields: z.array(z.string()).describe('I campi di testo che il layout mostra, es. ["kicker","headline"].'),
  fonts: z
    .array(z.object({ family: z.string(), weights: z.array(z.number().int()), italic: z.boolean() }))
    .describe('Le famiglie di Google Fonts usate nel CSS. Quelle non dichiarate qui non vengono caricate.'),
  fallback: z.enum(FALLBACK_IDS).describe('Il layout del motore più simile, come riserva.'),
  text: cardTextSchema,
  imageDescription: z.string().describe('Cosa si vede nella foto; stringa vuota se il layout non ne ha.'),
  photoPath: z.string().nullable().describe('Il percorso tornato da genera_foto, se l’hai usato.'),
});

export type DesignOutput = z.infer<typeof designSchema>;

export interface DesignVisualInput {
  brand: Brand;
  content: Content;
  /**
   * I canali per cui la card deve reggere. Il disegno è uno solo — il contenuto ne ha uno — ma esce
   * in tutti i formati che questi canali chiedono: l'agente deve saperlo mentre lo pensa, altrimenti
   * disegna per il verticale e in quadrato si rompe.
   */
  channels: readonly ChannelId[];
  instruction?: string | undefined;
  onSteps?: OnAiSteps | undefined;
}

/** I passi di un disegno: quello che l'utente vede scorrere mentre aspetta. */
const DESIGN_STEPS = {
  look: 'Guardo le card che hai approvato',
  read: (channel: string) => `Rileggo il testo per ${channel}`,
  think: 'Penso a come dirlo in una card',
  next: 'Ragiono su quello che ho visto',
} as const;

export async function designVisual(
  engine: AiEngine,
  meta: AiMeta,
  { brand, content, channels, instruction, onSteps }: DesignVisualInput,
): Promise<DesignOutput> {
  const main = channels[0] ?? content.channels[0];
  const log: StepLog = createStepLog(onSteps);
  log.start('look', DESIGN_STEPS.look);
  log.finish('look');
  log.start('read', DESIGN_STEPS.read(channels.map(channelName).join(' e ')));
  log.finish('read');

  const variant = content.variants.find((candidate) => candidate.channel === main) ?? content.variants[0];
  const aspects = [...new Set(channels.map((channel) => aspectFor(channel, content.format)))];
  const sizes = aspects.map((aspect) => `${aspect} (${ASPECT_SIZES[aspect].width}×${ASPECT_SIZES[aspect].height})`).join(', ');

  return engine.run({
    ...meta,
    task: 'visual-design',
    schema: designSchema,
    system: SYSTEM,
    onTool: stepsFromTools(log, { first: DESIGN_STEPS.think, next: DESIGN_STEPS.next }),
    prompt: [
      `Disegna la card per ${channels.map(channelName).join(' e ')}.`,
      aspects.length > 1
        ? `Lo stesso layout esce in più formati: ${sizes}. Deve reggere in tutti — provali con componi_card, non solo il primo.`
        : `Formato ${sizes}.`,
      '',
      '## Il post',
      `Titolo di lavorazione: ${content.title}`,
      '',
      variant?.text ?? '',
      '',
      instruction ? `## Cosa ti chiede l’utente\n${instruction}\n` : '',
      describeBrand(brand, new Date()),
    ]
      .filter(Boolean)
      .join('\n'),
  });
}

/** Dal disegno dell'agente al visivo salvato: un template che vive nel contenuto, non nel brand. */
export function designFromOutput(output: DesignOutput, previous: VisualDesign | null): VisualDesign {
  const id = 'disegnato';
  const template = {
    id,
    name: output.name,
    use: '',
    fields: output.fields,
    photo: output.photo,
    html: output.html,
    css: output.css,
  };
  return {
    kind: output.photo ? 'photo' : 'infographic',
    pages: [{ templateId: output.fallback, custom: id, text: output.text }],
    templates: [template],
    fonts: output.fonts,
    image: {
      description: output.imageDescription,
      source: 'generated',
      photo: output.photoPath ? { path: output.photoPath, url: '' } : (previous?.image.photo ?? null),
      cutout: null,
    },
    status: 'proposed',
    step: null,
    error: null,
    nextPages: null,
    renders: [],
  };
}
