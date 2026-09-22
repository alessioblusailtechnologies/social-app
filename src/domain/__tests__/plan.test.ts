import { describe, expect, it } from '@jest/globals';

import { formatRange, startOfWeek, weekdayIndex } from '@/lib/dates';
import { createDemoBrand, createDemoIdeas } from '@/services/mock/fixtures';

import {
  allocateThemes,
  balanceHint,
  buildSkeleton,
  fillSkeleton,
  placeIdea,
  themeBalance,
  type PlanSlot,
} from '../plan';

const START = '2026-09-15';

const slot = (overrides: Partial<PlanSlot>): PlanSlot => ({
  id: 'slot_1',
  brandId: 'brand',
  date: START,
  time: '08:30',
  channels: ['linkedin'],
  themeId: null,
  ideaId: null,
  status: 'empty',
  origin: 'manual',
  createdAt: START,
  ...overrides,
});

describe('date', () => {
  it('conta i giorni da lunedì e formatta gli intervalli', () => {
    expect(weekdayIndex('2026-09-15')).toBe(2);
    expect(startOfWeek('2026-09-15')).toBe('2026-09-14');
    expect(formatRange('2026-09-14', '2026-09-20')).toBe('14 – 20 settembre');
    expect(formatRange('2026-09-28', '2026-10-04')).toBe('28 settembre – 4 ottobre');
  });
});

describe('allocateThemes', () => {
  const themes = createDemoBrand().themes; // 40 30 20 10

  it('rispetta i pesi con i resti più alti', () => {
    const order = allocateThemes(themes, 6);
    const counts = themes.map((theme) => order.filter((id) => id === theme.id).length);
    expect(counts).toEqual([2, 2, 1, 1]);
  });

  it('evita lo stesso tema due volte di fila', () => {
    const order = allocateThemes(themes, 10);
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  });
});

describe('buildSkeleton', () => {
  const brand = createDemoBrand();
  const request = { startDate: START, weeks: 2, perWeek: 3, channels: ['linkedin' as const, 'instagram' as const] };

  it('crea ritmo × settimane uscite nei giorni del ritmo', () => {
    const skeleton = buildSkeleton(brand, request, []);
    expect(skeleton.map((draft) => draft.date)).toEqual([
      '2026-09-16',
      '2026-09-18',
      '2026-09-21',
      '2026-09-23',
      '2026-09-25',
      '2026-09-28',
    ]);
    // Venerdì e lunedì LinkedIn non è nei giorni consigliati: esce Instagram.
    expect(skeleton[1].channels).toEqual(['instagram']);
  });

  it('salta i giorni che hanno già un’uscita', () => {
    const existing = [slot({ brandId: brand.id, date: '2026-09-16' })];
    expect(buildSkeleton(brand, request, existing)).toHaveLength(5);
  });
});

describe('fillSkeleton', () => {
  it('usa solo idee salvate dello stesso tema, senza ripeterle', () => {
    const brand = createDemoBrand();
    const ideas = createDemoIdeas(brand);
    const skeleton = buildSkeleton(brand, { startDate: START, weeks: 2, perWeek: 3, channels: ['linkedin', 'instagram'] }, []);
    const filled = fillSkeleton(skeleton, ideas, [], ['linkedin', 'instagram']);
    const assigned = filled.filter((draft) => draft.ideaId !== null);
    expect(assigned.length).toBeGreaterThan(0);
    expect(new Set(assigned.map((draft) => draft.ideaId)).size).toBe(assigned.length);
    for (const draft of assigned) {
      const idea = ideas.find((candidate) => candidate.id === draft.ideaId);
      expect(idea?.status).toBe('saved');
      expect(idea?.themeId).toBe(draft.themeId);
    }
  });
});

describe('equilibrio', () => {
  it('segnala il tema più sotto il suo peso', () => {
    const { themes } = createDemoBrand();
    const slots = [slot({ themeId: themes[0].id }), slot({ themeId: themes[0].id }), slot({ themeId: themes[1].id })];
    const balance = themeBalance(themes, slots);
    expect(balance.map((entry) => entry.planned)).toEqual([67, 33, 0, 0]);
    expect(balanceHint(balance)).toBe('Manca «Numeri e prezzi», che nel profilo esce ogni tanto.');
  });
});

describe('placeIdea', () => {
  const brand = createDemoBrand();
  const idea = createDemoIdeas(brand).find((candidate) => candidate.status === 'saved')!;

  it('riempie la prima uscita vuota dello stesso tema', () => {
    const existing = [slot({ id: 'vuota', brandId: brand.id, date: '2026-09-20', themeId: idea.themeId })];
    expect(placeIdea(brand, idea, existing, START)).toEqual({ slotId: 'vuota' });
  });

  it('altrimenti propone il primo giorno libero adatto al canale', () => {
    const existing = [slot({ brandId: brand.id, date: '2026-09-16', ideaId: 'altra', status: 'toPrepare' })];
    const placement = placeIdea(brand, idea, existing, START);
    expect('draft' in placement && placement.draft.date).toBe('2026-09-18');
  });
});
