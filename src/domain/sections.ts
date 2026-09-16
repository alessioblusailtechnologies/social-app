import type { BrandDraft, BrandKind, SectionKey } from './brand';
import { currentVoiceCard, isConnected } from './brand';
import { CHANNELS, imageStyleLabel, typographyName } from './catalog';
import { totalWeight } from './themes';

export type SectionStatus = 'complete' | 'partial' | 'missing';

export const SECTION_KEYS: SectionKey[] = [
  'identity',
  'positioning',
  'channels',
  'themes',
  'voice',
  'visual',
  'references',
];

/** "Riferimenti e fonti" vive solo nel Profilo: toglie un passo prima di vedere valore. */
export const ONBOARDING_SECTION_KEYS: SectionKey[] = SECTION_KEYS.filter((key) => key !== 'references');

/** Passi che l'app può rimediare da sola: hanno "Lo faccio dopo". */
export function isSkippable(key: SectionKey): boolean {
  return key === 'voice' || key === 'visual' || key === 'references';
}

type ByKind = Record<BrandKind, string>;

const same = (text: string): ByKind => ({ person: text, company: text, client: text });

const COPY: Record<SectionKey, { name: ByKind; title: ByKind; subtitle: ByKind }> = {
  identity: {
    name: { person: 'Chi sei', company: 'Chi siete', client: 'Il cliente' },
    title: {
      person: 'Chi sei e cosa fai',
      company: 'Chi siete e cosa fate',
      client: 'Chi è il cliente e cosa fa',
    },
    subtitle: {
      person: 'Serve nei post: nome, ruolo e una frase che dice cosa fai davvero. Se c’è un sito, lo leggo e preparo i passi successivi.',
      company: 'Serve nei post: nome, settore e una frase che dice cosa fa davvero l’azienda. Se c’è un sito, lo leggo e preparo i passi successivi.',
      client: 'Serve nei post: nome, settore e una frase che dice cosa fa davvero il cliente. Se c’è un sito, lo leggo e preparo i passi successivi.',
    },
  },
  positioning: {
    name: same('Obiettivo'),
    title: {
      person: 'Perché pubblichi e per chi',
      company: 'Perché pubblicate e per chi',
      client: 'Perché pubblica e per chi',
    },
    subtitle: {
      person: 'Da qui decido il taglio: un post per founder non somiglia a un post per candidati.',
      company: 'Da qui decido il taglio: un post per chi compra non somiglia a un post per chi cerca lavoro.',
      client: 'Da qui decido il taglio: un post per chi compra non somiglia a un post per chi cerca lavoro.',
    },
  },
  channels: {
    name: same('Canali'),
    title: same('Scegli i canali'),
    subtitle: same(
      'Le proposte si adattano ai canali scelti. Collegarli serve a pubblicare al posto tuo: puoi farlo adesso o più avanti.',
    ),
  },
  themes: {
    name: same('Temi'),
    title: { person: 'I tuoi temi', company: 'I temi del brand', client: 'I temi del cliente' },
    subtitle: same(
      'Il peso dice quanto spazio dare a ognuno nel piano. Quando ne cambi uno, gli altri si ribilanciano da soli.',
    ),
  },
  voice: {
    name: same('Voce'),
    title: { person: 'Come scrivi', company: 'Come scrive il brand', client: 'Come scrive il cliente' },
    subtitle: same(
      'Leggo testi reali e ne ricavo registro, ritmo e lessico. È la parte che fa la differenza.',
    ),
  },
  visual: {
    name: same('Identità'),
    title: {
      person: 'Come vuoi apparire',
      company: 'Come appare il brand',
      client: 'Come appare il cliente',
    },
    subtitle: same(
      'Logo, palette, caratteri e stile delle immagini. Valgono per tutte le card: post, caroselli e copertine.',
    ),
  },
  references: {
    name: same('Riferimenti'),
    title: same('Riferimenti e fonti'),
    subtitle: same(
      'Profili da cui imparare, fonti dei segnali e le date che contano. Servono a proporre idee con un appiglio reale.',
    ),
  },
};

export function sectionCopy(key: SectionKey, kind: BrandKind) {
  const copy = COPY[key];
  return { name: copy.name[kind], title: copy.title[kind], subtitle: copy.subtitle[kind] };
}

/** Motivo per cui non si può proseguire, oppure null. */
export function sectionError(key: SectionKey, draft: BrandDraft): string | null {
  const { identity, positioning, channels, themes } = draft;
  switch (key) {
    case 'identity':
      if (!identity.name.trim() || !identity.pitch.trim()) {
        return identity.kind === 'person'
          ? 'Mi servono almeno il tuo nome e una frase su cosa fai.'
          : 'Mi servono almeno il nome e una frase su cosa fa.';
      }
      return null;
    case 'positioning':
      if (positioning.goals.length === 0) return 'Scegli almeno un obiettivo.';
      if (positioning.audiences.length === 0) return 'Scegli almeno un pubblico.';
      return null;
    case 'channels':
      return CHANNELS.some(({ id }) => channels[id].selected) ? null : 'Scegli almeno un canale.';
    case 'themes':
      if (themes.length === 0) return 'Serve almeno un tema.';
      if (themes.some((theme) => !theme.name.trim())) return 'Dai un nome a ogni tema.';
      if (totalWeight(themes) !== 100) return 'I pesi devono fare 100.';
      return null;
    default:
      return null;
  }
}

export function sectionStatus(key: SectionKey, draft: BrandDraft): SectionStatus {
  switch (key) {
    case 'identity':
    case 'positioning':
    case 'themes':
      return sectionError(key, draft) ? 'missing' : 'complete';
    case 'channels': {
      const selected = CHANNELS.filter(({ id }) => draft.channels[id].selected);
      if (selected.length === 0) return 'missing';
      return selected.some(({ id }) => isConnected(draft.channels[id])) ? 'complete' : 'partial';
    }
    case 'voice':
      return draft.voice.cards.length > 0 ? 'complete' : 'missing';
    case 'visual':
      return draft.visual.logoUri ? 'complete' : 'partial';
    case 'references': {
      const { profiles, milestones } = draft.references;
      return profiles.length > 0 || milestones.length > 0 ? 'complete' : 'missing';
    }
  }
}

export function completeness(draft: BrandDraft) {
  const statuses = SECTION_KEYS.map((key) => ({ key, status: sectionStatus(key, draft) }));
  const score = statuses.reduce(
    (sum, { status }) => sum + (status === 'complete' ? 1 : status === 'partial' ? 0.5 : 0),
    0,
  );
  return { percent: Math.round((score / SECTION_KEYS.length) * 100), statuses };
}

/** Perché conviene completare una sezione non completa. */
export function sectionHint(key: SectionKey, status: SectionStatus): string {
  if (status === 'complete') return '';
  switch (key) {
    case 'channels':
      return status === 'partial'
        ? 'Collega almeno un canale: serve per pubblicare al posto tuo.'
        : 'Scegli su quali canali pubblicare.';
    case 'voice':
      return 'Fammi leggere qualche testo: è la parte che fa la differenza.';
    case 'visual':
      return 'Carica il logo: lo uso come firma sulle immagini generate.';
    case 'references':
      return 'Aggiungi riferimenti e date: danno un appiglio reale alle idee.';
    default:
      return 'Mancano informazioni essenziali.';
  }
}

export function identityLine(draft: BrandDraft): string {
  const { kind, name, role, company, sector } = draft.identity;
  if (kind !== 'person') return [name, sector].filter(Boolean).join(' · ');
  const job = role && company ? `${role} di ${company}` : role || company;
  return [name, job].filter(Boolean).join(' · ');
}

/** Una riga di sintesi per sezione: riepilogo dell'onboarding e anteprime del Profilo. */
export function sectionSummary(key: SectionKey, draft: BrandDraft): string {
  switch (key) {
    case 'identity':
      return identityLine(draft) || 'Da completare';
    case 'positioning': {
      const { goals, audiences, postsPerWeek } = draft.positioning;
      const parts = [goals.join(', '), audiences.length ? `per ${audiences.join(', ')}` : ''];
      parts.push(`${postsPerWeek} ${postsPerWeek === 1 ? 'uscita' : 'uscite'} a settimana`);
      return parts.filter(Boolean).join(' · ');
    }
    case 'channels': {
      const selected = CHANNELS.filter(({ id }) => draft.channels[id].selected);
      if (selected.length === 0) return 'Nessun canale scelto';
      return selected
        .map(({ id, name }) => `${name} ${isConnected(draft.channels[id]) ? 'collegato' : 'da collegare'}`)
        .join(' · ');
    }
    case 'themes':
      return draft.themes.length
        ? draft.themes.map((theme) => `${theme.name} ${theme.weight}%`).join(' · ')
        : 'Nessun tema';
    case 'voice': {
      const card = currentVoiceCard(draft.voice);
      return card ? `Scheda v${card.version} da ${card.sourceLabel}` : 'Da completare: nessun testo analizzato';
    }
    case 'visual': {
      const { logoUri, palette, imageStyle, typography, signature } = draft.visual;
      return [
        logoUri ? 'Logo caricato' : 'Nessun logo',
        palette.name.toLowerCase(),
        `caratteri ${typographyName(typography).toLowerCase()}`,
        imageStyleLabel(imageStyle).toLowerCase(),
        signature && logoUri ? 'firma visiva' : '',
      ]
        .filter(Boolean)
        .join(' · ');
    }
    case 'references': {
      const { profiles, sources, milestones } = draft.references;
      const enabled = sources.filter((source) => source.enabled).length;
      return `${profiles.length} ${profiles.length === 1 ? 'profilo' : 'profili'} · ${enabled} fonti · ${milestones.length} ${milestones.length === 1 ? 'data' : 'date'}`;
    }
  }
}
