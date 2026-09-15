import type { ChannelId } from '@/domain/brand';
import type { PlanSlot, SlotOrigin, SlotStatus } from '@/domain/plan';
import { toDay } from '@/lib/dates';

import { ApiError } from '../contract/errors';
import type { Queryable } from '../db/pool';

interface SlotRow {
  id: string;
  brand_id: string;
  publish_date: string;
  publish_time: string;
  channels: ChannelId[];
  theme_id: string | null;
  idea_id: string | null;
  content_title: string | null;
  status: SlotStatus;
  origin: SlotOrigin;
  created_at: Date;
}

const COLUMNS =
  'id, brand_id, publish_date, publish_time, channels, theme_id, idea_id, content_title, status, origin, created_at';

/** "YYYY-MM-DDTHH:mm" nel fuso dell'app (il processo gira con TZ impostato dalla configurazione). */
export function scheduleKey(now: Date): string {
  return `${toDay(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * La pubblicazione sui canali non esiste ancora: come nel mock, un'uscita programmata
 * il cui orario è passato risulta pubblicata.
 */
export function toSlot(row: SlotRow, now: Date): PlanSlot {
  const due = `${row.publish_date}T${row.publish_time}` < scheduleKey(now);
  return {
    id: row.id,
    brandId: row.brand_id,
    date: row.publish_date,
    time: row.publish_time,
    channels: row.channels,
    themeId: row.theme_id,
    ideaId: row.idea_id,
    contentTitle: row.content_title,
    status: row.status === 'scheduled' && due ? 'published' : row.status,
    origin: row.origin,
    createdAt: row.created_at.toISOString(),
  };
}

/** In ordine di calendario. */
export async function listSlots(db: Queryable, brandId: string, now: Date): Promise<PlanSlot[]> {
  const { rows } = await db.query<SlotRow>(
    `select ${COLUMNS} from presenza.slots where brand_id = $1 order by publish_date, publish_time, created_at`,
    [brandId],
  );
  return rows.map((row) => toSlot(row, now));
}

export async function findSlot(db: Queryable, slotId: string, now: Date): Promise<PlanSlot | null> {
  const { rows } = await db.query<SlotRow>(`select ${COLUMNS} from presenza.slots where id = $1`, [slotId]);
  return rows[0] ? toSlot(rows[0], now) : null;
}

export async function requireSlot(db: Queryable, slotId: string, now: Date): Promise<PlanSlot> {
  const slot = await findSlot(db, slotId, now);
  if (!slot) throw ApiError.notFound('Uscita non trovata.');
  return slot;
}

export type NewSlot = Omit<PlanSlot, 'id' | 'brandId' | 'createdAt'>;

export async function insertSlot(db: Queryable, accountId: string, brandId: string, slot: NewSlot, now: Date): Promise<PlanSlot> {
  const { rows } = await db.query<SlotRow>(
    `insert into presenza.slots
       (brand_id, account_id, publish_date, publish_time, channels, theme_id, idea_id, content_title, status, origin)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning ${COLUMNS}`,
    [
      brandId,
      accountId,
      slot.date,
      slot.time,
      slot.channels,
      slot.themeId,
      slot.ideaId,
      slot.contentTitle ?? null,
      slot.status,
      slot.origin,
    ],
  );
  return toSlot(rows[0], now);
}

/** Riscrive i campi modificabili di un'uscita letta prima. */
export async function saveSlot(db: Queryable, slot: PlanSlot, now: Date): Promise<PlanSlot> {
  const { rows } = await db.query<SlotRow>(
    `update presenza.slots
        set publish_date = $2, publish_time = $3, channels = $4, theme_id = $5, idea_id = $6, content_title = $7, status = $8
      where id = $1
      returning ${COLUMNS}`,
    [slot.id, slot.date, slot.time, slot.channels, slot.themeId, slot.ideaId, slot.contentTitle ?? null, slot.status],
  );
  if (!rows[0]) throw ApiError.notFound('Uscita non trovata.');
  return toSlot(rows[0], now);
}

export async function deleteSlot(db: Queryable, slotId: string): Promise<boolean> {
  const { rowCount } = await db.query('delete from presenza.slots where id = $1', [slotId]);
  return (rowCount ?? 0) > 0;
}
