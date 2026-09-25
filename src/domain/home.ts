import { addDays } from '@/lib/dates';

import { scenesWaitingFootage, type Content } from './content';
import type { PlanSlot, SlotStatus } from './plan';

/**
 * La Home mette in fila quello che tocca all'utente nei prossimi giorni: bozze da approvare,
 * uscite da preparare o da riempire, video con scene da girare e contenuti ancora senza data.
 * Quello che è già programmato esce da solo e non è un compito.
 */

/** Quanti giorni avanti guarda la Home. */
export const HOME_HORIZON_DAYS = 7;

export type HomeTaskKind = 'approve' | 'prepare' | 'fill' | 'shoot' | 'schedule';

export interface HomeTask {
  kind: HomeTaskKind;
  /** Nulla per i contenuti creati direttamente e non ancora programmati. */
  slot: PlanSlot | null;
  content: Content | null;
  /** Il giorno dell'uscita è passato senza che sia uscita. */
  late: boolean;
  /** Le scene del video che deve girare chi pubblica. */
  scenesToShoot: number;
}

const OPEN_STATUSES: Partial<Record<SlotStatus, HomeTaskKind>> = {
  toApprove: 'approve',
  toPrepare: 'prepare',
  empty: 'fill',
};

const bySchedule = (a: PlanSlot, b: PlanSlot) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

export function scenesToShoot(content: Content | null): number {
  if (!content || content.format !== 'video') return 0;
  // Una scena girata e caricata non è più un compito.
  return scenesWaitingFootage(content.visual.scenes).length;
}

/** In ordine di calendario, così le uscite passate e non uscite vengono prima; in fondo le bozze senza data. */
export function homeTasks(slots: readonly PlanSlot[], contents: readonly Content[], today: string): HomeTask[] {
  const horizon = addDays(today, HOME_HORIZON_DAYS);
  const dated: HomeTask[] = [];
  for (const slot of [...slots].sort(bySchedule)) {
    if (slot.date > horizon) continue;
    const content = contents.find((candidate) => candidate.slotId === slot.id) ?? null;
    const scenes = scenesToShoot(content);
    const kind = OPEN_STATUSES[slot.status];
    if (kind) dated.push({ kind, slot, content, late: slot.date < today, scenesToShoot: scenes });
    else if (slot.status === 'scheduled' && scenes > 0) {
      dated.push({ kind: 'shoot', slot, content, late: false, scenesToShoot: scenes });
    }
  }

  const undated = contents
    .filter((content) => content.slotId === null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((content): HomeTask => ({ kind: 'schedule', slot: null, content, late: false, scenesToShoot: scenesToShoot(content) }));

  return [...dated, ...undated];
}

/** La riga sotto la data: cosa esce oggi e quanti contenuti aspettano l'approvazione. */
export function homeSummary(slots: readonly PlanSlot[], today: string): string {
  const horizon = addDays(today, HOME_HORIZON_DAYS);
  const out = slots.filter(
    (slot) => slot.date === today && (slot.status === 'scheduled' || slot.status === 'published'),
  ).length;
  const approvals = slots.filter((slot) => slot.status === 'toApprove' && slot.date <= horizon).length;

  const first = out === 0 ? 'Oggi non esce niente' : out === 1 ? 'Oggi esce 1 contenuto' : `Oggi escono ${out} contenuti`;
  const second =
    approvals === 0
      ? 'Niente da approvare'
      : approvals === 1
        ? '1 contenuto aspetta la tua approvazione'
        : `${approvals} contenuti aspettano la tua approvazione`;
  return `${first}. ${second}.`;
}
