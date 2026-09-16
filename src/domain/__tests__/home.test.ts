import { describe, expect, it } from '@jest/globals';

import type { Content, VideoScene } from '../content';
import { homeSummary, homeTasks } from '../home';
import type { PlanSlot } from '../plan';

const TODAY = '2026-09-15';

const slot = (overrides: Partial<PlanSlot>): PlanSlot => ({
  id: 'slot',
  brandId: 'brand',
  date: TODAY,
  time: '08:30',
  channels: ['linkedin'],
  themeId: null,
  ideaId: null,
  status: 'empty',
  origin: 'manual',
  createdAt: TODAY,
  ...overrides,
});

const content = (overrides: Partial<Content>): Content => ({
  id: 'content',
  brandId: 'brand',
  slotId: null,
  ideaId: null,
  brief: null,
  title: 'Titolo',
  themeId: null,
  channels: ['linkedin'],
  format: 'post',
  variants: [],
  visual: { headline: '', slides: [], scenes: [], design: null },
  status: 'draft',
  revision: 0,
  createdAt: TODAY,
  updatedAt: TODAY,
  approvedAt: null,
  ...overrides,
});

const scenes: VideoScene[] = [
  { title: 'Apertura', description: '', seconds: 4, source: 'shoot' },
  { title: 'Il punto', description: '', seconds: 8, source: 'shoot' },
  { title: 'Chiusura', description: '', seconds: 3, source: 'generated' },
];

describe('homeTasks', () => {
  it('mette in fila quello che tocca all’utente: prima le uscite passate, in fondo le bozze senza data', () => {
    const slots = [
      slot({ id: 'dopo', date: '2026-09-20', status: 'toPrepare', ideaId: 'idea' }),
      slot({ id: 'lontana', date: '2026-09-23', status: 'empty' }),
      slot({ id: 'scaduta', date: '2026-09-14', status: 'toApprove', ideaId: 'idea' }),
      slot({ id: 'domani', date: '2026-09-16', status: 'empty' }),
      slot({ id: 'uscita', date: '2026-09-14', status: 'published', ideaId: 'idea' }),
      slot({ id: 'pronta', date: '2026-09-16', status: 'scheduled', ideaId: 'idea' }),
    ];
    const tasks = homeTasks(slots, [content({ id: 'bozza' })], TODAY);
    expect(tasks.map((task) => task.slot?.id ?? task.content?.id)).toEqual(['scaduta', 'domani', 'dopo', 'bozza']);
    expect(tasks.map((task) => task.kind)).toEqual(['approve', 'fill', 'prepare', 'schedule']);
    expect(tasks.map((task) => task.late)).toEqual([true, false, false, false]);
  });

  it('ricorda le scene da girare dei video, anche quando sono già programmati', () => {
    const slots = [
      slot({ id: 'video', date: '2026-09-17', status: 'scheduled', ideaId: 'idea' }),
      slot({ id: 'post', date: '2026-09-18', status: 'scheduled', ideaId: 'idea' }),
    ];
    const contents = [
      content({ id: 'c1', slotId: 'video', format: 'video', visual: { headline: '', slides: [], scenes, design: null }, status: 'approved' }),
      content({ id: 'c2', slotId: 'post', status: 'approved' }),
    ];
    const tasks = homeTasks(slots, contents, TODAY);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: 'shoot', scenesToShoot: 2 });
  });
});

describe('homeSummary', () => {
  it('dice cosa esce oggi e quanti contenuti aspettano l’approvazione', () => {
    expect(homeSummary([], TODAY)).toBe('Oggi non esce niente. Niente da approvare.');
    const slots = [
      slot({ id: 'a', status: 'published', ideaId: 'idea' }),
      slot({ id: 'b', time: '18:30', status: 'scheduled', ideaId: 'idea' }),
      slot({ id: 'c', date: '2026-09-17', status: 'toApprove', ideaId: 'idea' }),
      slot({ id: 'd', date: '2026-10-30', status: 'toApprove', ideaId: 'idea' }),
    ];
    expect(homeSummary(slots, TODAY)).toBe('Oggi escono 2 contenuti. 1 contenuto aspetta la tua approvazione.');
  });
});
