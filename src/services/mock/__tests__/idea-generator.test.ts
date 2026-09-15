import { describe, expect, it } from '@jest/globals';

import type { Idea } from '@/domain/idea';

import { createDemoBrand } from '../fixtures';
import {
  coreOf,
  describeLink,
  draftsFromSource,
  generateIdeaDrafts,
  lowerFirst,
  upcomingAnniversaries,
} from '../idea-generator';

const NOW = new Date(2026, 8, 15);

describe('generateIdeaDrafts', () => {
  const brand = createDemoBrand();

  it('propone il numero richiesto di idee, con titoli unici e canali del brand', () => {
    const drafts = generateIdeaDrafts(brand, [], { count: 8, now: NOW });
    expect(drafts).toHaveLength(8);
    expect(new Set(drafts.map((draft) => draft.title)).size).toBe(8);
    const themeIds = new Set(brand.themes.map((theme) => theme.id));
    const selected = new Set(['linkedin', 'instagram']);
    for (const draft of drafts) {
      expect(draft.source).toBeNull();
      if (draft.themeId) expect(themeIds.has(draft.themeId)).toBe(true);
      for (const channel of draft.channels) expect(selected.has(channel)).toBe(true);
    }
  });

  it('usa le date che contano quando un anniversario è vicino', () => {
    const drafts = generateIdeaDrafts(brand, [], { count: 8, now: NOW });
    const recurrence = drafts.find((draft) => draft.signal.kind === 'recurrence');
    expect(recurrence?.title).toBe('Un anno da «primo assunto»: cosa è cambiato davvero');
  });

  it('non ripropone titoli già presenti', () => {
    const first = generateIdeaDrafts(brand, [], { count: 6, now: NOW });
    const existing = first.map(
      (draft, i): Idea => ({
        ...draft,
        id: `idea_${i}`,
        brandId: brand.id,
        createdAt: NOW.toISOString(),
        status: 'saved',
        decidedAt: null,
      }),
    );
    const second = generateIdeaDrafts(brand, existing, { count: 6, now: NOW });
    const seen = new Set(first.map((draft) => draft.title));
    for (const draft of second) expect(seen.has(draft.title)).toBe(false);
  });
});

describe('upcomingAnniversaries', () => {
  it('trova gli anniversari entro 60 giorni, dal più vicino', () => {
    const [first, second] = upcomingAnniversaries(createDemoBrand(), NOW);
    expect(first).toMatchObject({ years: 1, date: '2026-09-25', daysUntil: 10 });
    expect(second).toMatchObject({ years: 2, date: '2026-10-03', daysUntil: 18 });
  });
});

describe('draftsFromSource', () => {
  const brand = createDemoBrand();

  it('da una nota propone tre tagli diversi e li lega al tema più vicino', () => {
    const source = { kind: 'prompt' as const, text: 'Da marzo il controllo fatture lo fa un modello di AI applicata ai processi.' };
    const drafts = draftsFromSource(brand, source);
    expect(drafts).toHaveLength(3);
    expect(new Set(drafts.map((draft) => draft.angleLabel)).size).toBe(3);
    expect(drafts[0].themeId).toBe(brand.themes[0].id);
    expect(drafts.every((draft) => draft.source === source)).toBe(true);
  });

  it('un altro taglio cambia almeno uno spunto', () => {
    const source = { kind: 'link' as const, url: 'https://www.ilsole24ore.com/art/come-l-ai-cambia-la-contabilita-AFx1', note: '' };
    const first = draftsFromSource(brand, source, 0).map((draft) => draft.angleLabel);
    const other = [1, 2, 3, 4].map((variant) => draftsFromSource(brand, source, variant).map((draft) => draft.angleLabel));
    expect(other.some((labels) => labels.join() !== first.join())).toBe(true);
  });
});

describe('testi', () => {
  it('ricava titolo e dominio da un link', () => {
    expect(describeLink('https://www.ilsole24ore.com/art/come-l-ai-cambia-la-contabilita-AFx1?utm=x')).toEqual({
      host: 'ilsole24ore.com',
      title: 'Come l ai cambia la contabilita',
    });
    expect(describeLink('nodo.it').title).toBe('Articolo di nodo.it');
  });

  it('accorcia la nota alla prima frase', () => {
    expect(coreOf('abbiamo automatizzato le fatture. E poi il resto')).toBe('Abbiamo automatizzato le fatture');
  });

  it('non abbassa le sigle', () => {
    expect(lowerFirst('Founder di PMI')).toBe('founder di PMI');
    expect(lowerFirst('PMI italiane')).toBe('PMI italiane');
  });
});
