import type { Brand, ChannelId, Theme } from '@/domain/brand';
import { createEmptyDraft, PALETTE_PRESETS } from '@/domain/catalog';
import type { Idea, IdeaFormat } from '@/domain/idea';
import { BEST_TIMES, type PlanSlot, type SlotStatus } from '@/domain/plan';
import { addDays, startOfWeek } from '@/lib/dates';
import { createId } from '@/lib/id';

/**
 * Il piano del profilo di esempio, relativo a `from` (oggi): la settimana scorsa già
 * pubblicata e i prossimi giorni in tutti gli stati, così il calendario non parte vuoto.
 */
export function createDemoPlan(brand: Brand, demoIdeas: Idea[], from: string): { ideas: Idea[]; slots: PlanSlot[] } {
  const [processes, hiring, pricing, backstage] = brand.themes;
  const now = new Date().toISOString();

  const idea = (
    title: string,
    angleLabel: string,
    angle: string,
    theme: Theme,
    formats: IdeaFormat[],
    channels: ChannelId[],
  ): Idea => ({
    id: createId('idea'),
    brandId: brand.id,
    createdAt: now,
    status: 'saved',
    decidedAt: now,
    title,
    angleLabel,
    angle,
    rationale: `«${theme.name}» pesa ${theme.weight}% nel piano.`,
    themeId: theme.id,
    signal: { kind: 'theme', label: theme.name },
    source: null,
    formats,
    channels,
  });

  const august = idea(
    'Tre processi che abbiamo tolto dalla scrivania dei clienti ad agosto',
    'Il caso con i numeri',
    'Tre processi, il tempo risparmiato su ognuno e il cliente che l’ha visto succedere.',
    processes,
    ['carousel'],
    ['instagram', 'linkedin'],
  );
  const interview = idea(
    'Cosa chiediamo davvero in un colloquio tecnico, e cosa non ci interessa',
    'La domanda frequente',
    'Tre domande che facciamo sempre e due che abbiamo smesso di fare, con il perché.',
    hiring,
    ['post'],
    ['linkedin'],
  );
  const hourly = idea(
    'Perché non facciamo preventivi a ore',
    'La tesi controcorrente',
    'Il prezzo a ore premia la lentezza. Spiega come calcoliamo un prezzo a risultato con un esempio.',
    pricing,
    ['post'],
    ['linkedin', 'instagram'],
  );
  const errors = idea(
    'Il modello sbaglia il 3% delle fatture: ecco perché va bene così',
    'La tesi controcorrente',
    'Confronta il 3% del modello con gli errori manuali di prima e racconta come vengono intercettati.',
    processes,
    ['post'],
    ['linkedin'],
  );

  const savedOn = (theme: Theme) =>
    demoIdeas.find((candidate) => candidate.status === 'saved' && candidate.themeId === theme.id) ?? null;

  const monday = startOfWeek(from);
  const slot = (date: string, channels: ChannelId[], theme: Theme, source: Idea | null, status: SlotStatus): PlanSlot => ({
    id: createId('slot'),
    brandId: brand.id,
    date,
    time: BEST_TIMES[channels[0]].time,
    channels,
    themeId: theme.id,
    ideaId: source?.id ?? null,
    status: date < from && source ? 'published' : status,
    origin: 'session',
    createdAt: now,
  });

  return {
    ideas: [august, interview, hourly, errors],
    slots: [
      slot(addDays(monday, -7), ['instagram', 'linkedin'], processes, august, 'published'),
      slot(addDays(monday, -5), ['linkedin'], hiring, interview, 'published'),
      slot(addDays(monday, -3), ['linkedin', 'instagram'], pricing, hourly, 'published'),
      slot(addDays(from, 1), ['linkedin'], processes, errors, 'scheduled'),
      slot(addDays(from, 3), ['instagram', 'linkedin'], backstage, savedOn(backstage), 'toApprove'),
      slot(addDays(from, 6), ['linkedin'], hiring, savedOn(hiring), 'toPrepare'),
      slot(addDays(from, 8), ['instagram'], pricing, null, 'empty'),
    ],
  };
}

/** Idee scritte a mano per il profilo di esempio: più curate di quelle generate. */
export function createDemoIdeas(brand: Brand): Idea[] {
  const [processes, hiring, pricing, backstage] = brand.themes;
  const now = Date.now();
  const meta = (minutesAgo: number, status: Idea['status']) => ({
    id: createId('idea'),
    brandId: brand.id,
    createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
    status,
    decidedAt: status === 'new' ? null : new Date(now - minutesAgo * 30_000).toISOString(),
  });

  return [
    {
      ...meta(10, 'new'),
      title: 'Il controllo fatture lo fa un modello da marzo: prima erano tre giorni al mese di due persone',
      angleLabel: 'Il caso con i numeri',
      angle:
        'Prima e dopo in tre cifre: giorni di lavoro, errori trovati, costo del modello. Chiudi sul fatto che le due persone ora seguono i clienti.',
      rationale:
        '«AI applicata ai processi» pesa 40% nel piano ed è quello che i founder di PMI cercano di più in questo periodo.',
      themeId: processes.id,
      signal: { kind: 'theme', label: processes.name },
      source: null,
      formats: ['carousel', 'post'],
      channels: ['linkedin', 'instagram'],
    },
    {
      ...meta(9, 'new'),
      title: 'Due anni dal primo cliente che ha pagato: cosa è cambiato davvero',
      angleLabel: 'La ricorrenza',
      angle:
        'Racconta com’era quel giorno e mettilo accanto a oggi: un numero di allora, uno di adesso e la decisione che ha fatto la differenza.',
      rationale: 'La ricorrenza cade il 3 ottobre: uscire nella settimana giusta vale più dell’orario perfetto.',
      themeId: backstage.id,
      signal: { kind: 'recurrence', label: 'Primo cliente che ha pagato · 3 ottobre 2026' },
      source: null,
      formats: ['post'],
      channels: ['linkedin'],
    },
    {
      ...meta(8, 'new'),
      title: 'Al primo colloquio facciamo vedere il codice che non funziona. Ecco perché',
      angleLabel: 'La tesi controcorrente',
      angle:
        'Tutti mostrano il meglio ai candidati. Spiega perché mostrare un problema aperto seleziona le persone giuste, con l’esempio dell’ultimo colloquio.',
      rationale: '«Assunzioni e cultura» pesa 30%: serve a trovare le persone giuste mentre crescete.',
      themeId: hiring.id,
      signal: { kind: 'theme', label: hiring.name },
      source: null,
      formats: ['post'],
      channels: ['linkedin'],
    },
    {
      ...meta(7, 'new'),
      title: 'Quanto costa davvero un progetto di AI in una PMI: tre preventivi a confronto',
      angleLabel: 'Il caso con i numeri',
      angle:
        'Tre preventivi reali e anonimi, dal più piccolo al più grande. Per ognuno: cosa includeva, quanto è durato, quando è rientrato l’investimento.',
      rationale: '«Numeri e prezzi» pesa 20%: il prezzo è la domanda che arriva prima di ogni call, meglio rispondere in pubblico.',
      themeId: pricing.id,
      signal: { kind: 'theme', label: pricing.name },
      source: null,
      formats: ['carousel'],
      channels: ['linkedin', 'instagram'],
    },
    {
      ...meta(6, 'new'),
      title: 'Parliamo del rientro e dei budget dell’ultimo trimestre: tre processi da automatizzare prima di dicembre',
      angleLabel: 'Il momento giusto',
      angle: 'Tre processi piccoli e noiosi, ognuno con il tempo che fa risparmiare in un mese. Formato adatto a un carosello.',
      rationale: 'È settembre: il tema è nelle agende dei founder di PMI proprio in queste settimane.',
      themeId: processes.id,
      signal: { kind: 'season', label: 'Settembre · calendario' },
      source: null,
      formats: ['carousel', 'post'],
      channels: ['linkedin', 'instagram'],
    },
    {
      ...meta(5, 'new'),
      title: 'Nella tua rete si chiede se l’AI sostituirà gli amministrativi: rispondi con i numeri di un cliente',
      angleLabel: 'La risposta con un caso',
      angle:
        'Non commentare il commento: porta un episodio concreto e un numero. È il modo più rapido per farti notare da chi già ti conosce.',
      rationale: '14 contatti ne hanno scritto negli ultimi sette giorni.',
      themeId: processes.id,
      signal: { kind: 'network', label: 'La tua rete LinkedIn' },
      source: null,
      formats: ['post'],
      channels: ['linkedin'],
    },
    {
      ...meta(60, 'saved'),
      title: 'Una settimana in produzione: il registro degli errori del modello, giorno per giorno',
      angleLabel: 'Il dietro le quinte',
      angle: 'Cinque giorni, cinque errori veri e come li avete corretti. Mostra che l’AI in produzione è manutenzione, non magia.',
      rationale: '«Dietro le quinte» pesa 10%: poco spazio, ma è il tema che rende credibili tutti gli altri.',
      themeId: backstage.id,
      signal: { kind: 'theme', label: backstage.name },
      source: null,
      formats: ['video', 'carousel'],
      channels: ['instagram', 'linkedin'],
    },
    {
      ...meta(120, 'saved'),
      title: 'Il primo assunto un anno dopo: cosa è cambiato nel modo di lavorare di tutti',
      angleLabel: 'La lezione',
      angle: 'Tre abitudini cambiate con la prima persona in più. Chiudi con una regola che un founder può applicare già domani.',
      rationale: 'Nasce da una tua nota. Si lega a «Assunzioni e cultura», che nel piano pesa 30%.',
      themeId: hiring.id,
      signal: { kind: 'prompt', label: 'Una tua nota' },
      source: { kind: 'prompt', text: 'Il primo assunto un anno dopo: cosa è cambiato per tutti noi' },
      formats: ['post'],
      channels: ['linkedin'],
    },
  ];
}

/** Il profilo degli artboard: Marco Sereni, founder di Nodo. */
export function createDemoBrand(): Brand {
  const now = new Date().toISOString();
  const draft = createEmptyDraft('person');
  return {
    ...draft,
    id: createId('brand'),
    createdAt: now,
    updatedAt: now,
    identity: {
      kind: 'person',
      name: 'Marco Sereni',
      role: 'Founder',
      company: 'Nodo',
      sector: '',
      site: 'nodo.it',
      pitch: 'Mettiamo l’AI nei processi noiosi delle PMI italiane, partendo da dove il dolore è misurabile.',
    },
    positioning: {
      goals: ['Autorevolezza nel settore', 'Trovare clienti'],
      audiences: ['Founder di PMI', 'Direttori operativi'],
      postsPerWeek: 3,
    },
    channels: {
      ...draft.channels,
      linkedin: { selected: true, handle: '@marcosereni' },
      instagram: { selected: true, handle: null },
    },
    themes: [
      { id: createId('theme'), name: 'AI applicata ai processi', weight: 40, color: '#2F3452' },
      { id: createId('theme'), name: 'Assunzioni e cultura', weight: 30, color: '#FF6B35' },
      { id: createId('theme'), name: 'Numeri e prezzi', weight: 20, color: '#D9E05B' },
      { id: createId('theme'), name: 'Dietro le quinte', weight: 10, color: '#6DD47E' },
    ],
    voice: {
      cards: [
        {
          version: 1,
          createdAt: '2026-09-12T09:30:00.000Z',
          source: 'history',
          sourceLabel: '38 post di LinkedIn',
          register:
            'Diretto e concreto, prima persona plurale quando parli dell’azienda. Nessuna domanda retorica in apertura.',
          rhythm: 'Frasi corte, un concetto per paragrafo, tre o quattro blocchi. Chiudi su un fatto, non su un invito.',
          lexicon: '«in produzione», «processo», «margine», numeri sempre in cifre.',
          avoid: '«rivoluzionario», «game changer», «unlockare», emoji, esclamativi.',
        },
      ],
    },
    visual: {
      logoUri: null,
      palette: PALETTE_PRESETS[0],
      imageStyle: 'flat-geometric',
      typography: 'space-grotesk',
      signature: true,
    },
    references: {
      profiles: ['linkedin.com/in/ellenberg', '@pieromolino'],
      sources: draft.references.sources,
      milestones: [
        { id: createId('milestone'), label: 'Primo cliente che ha pagato', date: '2024-10-03' },
        { id: createId('milestone'), label: 'Primo assunto', date: '2025-09-25' },
      ],
    },
  };
}
