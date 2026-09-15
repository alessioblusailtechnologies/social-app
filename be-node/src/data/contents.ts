import type { ChannelId } from '@/domain/brand';
import type { ChannelVariant, Content, ContentStatus, ContentVisual } from '@/domain/content';
import type { IdeaFormat, IdeaSource } from '@/domain/idea';

import { ApiError } from '../contract/errors';
import type { Queryable } from '../db/pool';

interface ContentRow {
  id: string;
  brand_id: string;
  slot_id: string | null;
  idea_id: string | null;
  brief: IdeaSource | null;
  title: string;
  theme_id: string | null;
  channels: ChannelId[];
  format: IdeaFormat;
  variants: ChannelVariant[];
  visual: ContentVisual;
  status: ContentStatus;
  revision: number;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS =
  'id, brand_id, slot_id, idea_id, brief, title, theme_id, channels, format, variants, visual, status, revision, approved_at, created_at, updated_at';

export function toContent(row: ContentRow): Content {
  return {
    id: row.id,
    brandId: row.brand_id,
    slotId: row.slot_id,
    ideaId: row.idea_id,
    brief: row.brief,
    title: row.title,
    themeId: row.theme_id,
    channels: row.channels,
    format: row.format,
    variants: row.variants,
    visual: row.visual,
    status: row.status,
    revision: row.revision,
    approvedAt: row.approved_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listContents(db: Queryable, brandId: string): Promise<Content[]> {
  const { rows } = await db.query<ContentRow>(
    `select ${COLUMNS} from presenza.contents where brand_id = $1 order by created_at`,
    [brandId],
  );
  return rows.map(toContent);
}

/** I contenuti senza uscita, dal più recente. */
export async function listDraftContents(db: Queryable, brandId: string): Promise<Content[]> {
  const { rows } = await db.query<ContentRow>(
    `select ${COLUMNS} from presenza.contents where brand_id = $1 and slot_id is null order by updated_at desc`,
    [brandId],
  );
  return rows.map(toContent);
}

export async function findContent(db: Queryable, contentId: string): Promise<Content | null> {
  const { rows } = await db.query<ContentRow>(`select ${COLUMNS} from presenza.contents where id = $1`, [contentId]);
  return rows[0] ? toContent(rows[0]) : null;
}

export async function requireContent(db: Queryable, contentId: string): Promise<Content> {
  const content = await findContent(db, contentId);
  if (!content) throw ApiError.notFound('Contenuto non trovato.');
  return content;
}

export async function findContentForSlot(db: Queryable, slotId: string): Promise<Content | null> {
  const { rows } = await db.query<ContentRow>(`select ${COLUMNS} from presenza.contents where slot_id = $1`, [slotId]);
  return rows[0] ? toContent(rows[0]) : null;
}

export type ContentFields = Omit<Content, 'id' | 'brandId' | 'createdAt' | 'updatedAt'>;

export async function insertContent(db: Queryable, accountId: string, brandId: string, fields: ContentFields): Promise<Content> {
  const { rows } = await db.query<ContentRow>(
    `insert into presenza.contents
       (brand_id, account_id, slot_id, idea_id, brief, title, theme_id, channels, format, variants, visual, status,
        revision, approved_at)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14)
     returning ${COLUMNS}`,
    [
      brandId,
      accountId,
      fields.slotId,
      fields.ideaId,
      fields.brief ? JSON.stringify(fields.brief) : null,
      fields.title,
      fields.themeId,
      fields.channels,
      fields.format,
      JSON.stringify(fields.variants),
      JSON.stringify(fields.visual),
      fields.status,
      fields.revision,
      fields.approvedAt,
    ],
  );
  return toContent(rows[0]);
}

/** Riscrive i campi modificabili di un contenuto letto prima; `updated_at` lo aggiorna il trigger. */
export async function saveContent(db: Queryable, content: Content): Promise<Content> {
  const { rows } = await db.query<ContentRow>(
    `update presenza.contents
        set slot_id = $2, idea_id = $3, brief = $4::jsonb, title = $5, theme_id = $6, channels = $7, format = $8,
            variants = $9::jsonb, visual = $10::jsonb, status = $11, revision = $12, approved_at = $13
      where id = $1
      returning ${COLUMNS}`,
    [
      content.id,
      content.slotId,
      content.ideaId,
      content.brief ? JSON.stringify(content.brief) : null,
      content.title,
      content.themeId,
      content.channels,
      content.format,
      JSON.stringify(content.variants),
      JSON.stringify(content.visual),
      content.status,
      content.revision,
      content.approvedAt,
    ],
  );
  if (!rows[0]) throw ApiError.notFound('Contenuto non trovato.');
  return toContent(rows[0]);
}

/**
 * Quando un'uscita sparisce o cambia idea: la bozza nata da un'idea non vale più e si
 * elimina, un contenuto creato direttamente torna tra le bozze da programmare.
 */
export async function releaseContentOf(db: Queryable, slotId: string): Promise<void> {
  await db.query('delete from presenza.contents where slot_id = $1 and idea_id is not null', [slotId]);
  await db.query(
    `update presenza.contents set slot_id = null, status = 'draft', approved_at = null where slot_id = $1`,
    [slotId],
  );
}
