import type { Brand, BrandKind, Identity } from '@/domain/brand';
import { currentVoiceCard, isConnected } from '@/domain/brand';
import { CHANNELS, imageStyleLabel, kindLabel } from '@/domain/catalog';
import { formatDay, formatWeekdayLong, toDay } from '@/lib/dates';
import { upcomingAnniversaries } from '@/services/mock/idea-generator';

/**
 * Quello che ogni generazione sa del brand: il Brand DNA scritto a parole, con gli id
 * che l'AI deve riusare nelle risposte (temi, canali). Il calcolo delle ricorrenze è lo
 * stesso che usava il generatore finto.
 */

export const APP_CONTEXT =
  'Sei l’assistente di Presenza, l’app che aiuta persone, piccole aziende e agenzie italiane a costruire la loro presenza sui social: dal profilo del brand (chi è, per chi scrive, temi, voce) propone idee, piani e contenuti, che l’utente rilegge e decide.';

export const WRITING_RULES = [
  'Scrivi in italiano semplice e concreto: niente gergo di marketing, niente frasi fatte, niente trattini lunghi.',
  'Non inventare fatti, numeri, nomi di clienti o risultati che il brand non ha dato: quando serve un dato che non conosci, scrivi la frase e metti il dato tra parentesi quadre da completare, per esempio [ore risparmiate al mese].',
].join(' ');

const PERSON: Record<BrandKind, string> = {
  person: 'prima persona singolare: è un personal brand',
  company: 'prima persona plurale: parla a nome dell’azienda e del team',
  client: 'prima persona plurale, a nome del cliente: chi usa l’app ne cura la presenza',
};

const list = (items: readonly string[]) => (items.length > 0 ? items.join(', ') : 'nessuno');

export function describeIdentity(identity: Identity): string {
  const lines = [`Tipo: ${kindLabel(identity.kind)}`, `Nome: ${identity.name || '(non indicato)'}`];
  if (identity.kind === 'person') {
    if (identity.role) lines.push(`Ruolo: ${identity.role}`);
    if (identity.company) lines.push(`Azienda: ${identity.company}`);
  } else if (identity.sector) {
    lines.push(`Settore: ${identity.sector}`);
  }
  if (identity.site) lines.push(`Sito: ${identity.site}`);
  if (identity.pitch) lines.push(`Cosa fa, in una frase: ${identity.pitch}`);
  return lines.join('\n');
}

export function describeBrand(brand: Brand, now: Date): string {
  const { positioning, themes, references, visual } = brand;
  const card = currentVoiceCard(brand.voice);
  const selected = CHANNELS.filter(({ id }) => brand.channels[id].selected);
  const anniversaries = upcomingAnniversaries(brand, now);

  const sections = [
    `## Chi è\n${describeIdentity(brand.identity)}\nPersona grammaticale: ${PERSON[brand.identity.kind]}`,
    [
      '## Obiettivi e pubblico',
      `Obiettivi: ${list(positioning.goals)}`,
      `Pubblico: ${list(positioning.audiences)}`,
      `Contenuti a settimana: ${positioning.postsPerWeek}`,
    ].join('\n'),
    [
      '## Canali su cui pubblica',
      ...(selected.length > 0
        ? selected.map(({ id, name }) => {
            const { handle } = brand.channels[id];
            return `- ${name}, id "${id}"${isConnected(brand.channels[id]) ? `, collegato come ${handle}` : ''}`;
          })
        : ['- nessun canale scelto']),
    ].join('\n'),
    [
      '## Temi',
      ...(themes.length > 0 ? themes.map((theme) => `- id "${theme.id}": ${theme.name}, pesa ${theme.weight}% del piano`) : ['- nessun tema']),
    ].join('\n'),
    card
      ? [
          `## Voce (scheda v${card.version})`,
          `Registro: ${card.register}`,
          `Ritmo: ${card.rhythm}`,
          `Lessico ammesso: ${card.lexicon}`,
          `Da evitare: ${card.avoid}`,
        ].join('\n')
      : '## Voce\nNessuna scheda voce: tono sobrio e concreto, niente emoji né punti esclamativi.',
    `## Stile visivo\nImmagini: ${imageStyleLabel(visual.imageStyle).toLowerCase()}; palette «${visual.palette.name}» (${visual.palette.colors.join(', ')})`,
    [
      '## Riferimenti',
      `Profili da cui imparare: ${list(references.profiles)}`,
      `Fonti dei segnali attive: ${list(references.sources.filter((source) => source.enabled).map((source) => source.label))}`,
      `Date che contano: ${list(references.milestones.map((milestone) => `${milestone.label} (${formatDay(milestone.date)})`))}`,
    ].join('\n'),
  ];

  if (anniversaries.length > 0) {
    sections.push(
      [
        '## Ricorrenze vicine',
        ...anniversaries.map(({ milestone, years, date, daysUntil }) => {
          const when = daysUntil >= 0 ? `fra ${daysUntil} giorni` : `${-daysUntil} giorni fa`;
          return `- ${years} ${years === 1 ? 'anno' : 'anni'} da «${milestone.label}»: il ${formatDay(date)}, ${when}`;
        }),
      ].join('\n'),
    );
  }

  sections.push(`## Oggi\n${formatWeekdayLong(toDay(now))} ${now.getFullYear()}`);
  return sections.join('\n\n');
}

/** Voci brevi proposte dall'AI (temi, pubblici): pulite, senza doppioni, fino a `max`. */
export function cleanLabels(items: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const item of items) {
    const label = item.replace(/\s+/g, ' ').replace(/[.;:,]+$/, '').trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label.charAt(0).toUpperCase() + label.slice(1));
    if (labels.length === max) break;
  }
  return labels;
}
