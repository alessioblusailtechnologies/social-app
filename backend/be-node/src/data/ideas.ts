import type { ChannelId } from '@shared/domain/brand';
import type { Idea, IdeaDraft, IdeaFormat, IdeaSource, IdeaStatus } from '@shared/domain/idea';

import { ApiError } from '../contract/errors';
import type { Queryable } from '../db/pool';

interface IdeaRow {
  id: string;
  brand_id: string;
  title: string;
  angle_label: string;
  angle: string;
  rationale: string;
  theme_id: string | null;
  signal: Idea['signal'];
  source: IdeaSource | null;
  formats: IdeaFormat[];
  channels: ChannelId[];
  status: IdeaStatus;
  decided_at: Date | null;
  created_at: Date;
}

const COLUMNS =
  'id, brand_id, title, angle_label, angle, rationale, theme_id, signal, source, formats, channels, status, decided_at, created_at';

export function toIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    brandId: row.brand_id,
    title: row.title,
    angleLabel: row.angle_label,
    angle: row.angle,
    rationale: row.rationale,
    themeId: row.theme_id,
    signal: row.signal,
    source: row.source,
    formats: row.formats,
    channels: row.channels,
    status: row.status,
    decidedAt: row.decided_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

/** Dalla più recente, come le vuole la sezione Idee. */
export async function listIdeas(db: Queryable, brandId: string): Promise<Idea[]> {
  const { rows } = await db.query<IdeaRow>(
    `select ${COLUMNS} from presenza.ideas where brand_id = $1 order by created_at desc`,
    [brandId],
  );
  return rows.map(toIdea);
}

export async function findIdea(db: Queryable, ideaId: string): Promise<Idea | null> {
  const { rows } = await db.query<IdeaRow>(`select ${COLUMNS} from presenza.ideas where id = $1`, [ideaId]);
  return rows[0] ? toIdea(rows[0]) : null;
}

export async function requireIdea(db: Queryable, ideaId: string): Promise<Idea> {
  const idea = await findIdea(db, ideaId);
  if (!idea) throw ApiError.notFound('Idea non trovata.');
  return idea;
}

export interface NewIdea {
  draft: IdeaDraft;
  status: IdeaStatus;
  createdAt: Date;
  decidedAt: Date | null;
}

export async function insertIdea(db: Queryable, accountId: string, brandId: string, idea: NewIdea): Promise<Idea> {
  const { draft } = idea;
  const { rows } = await db.query<IdeaRow>(
    `insert into presenza.ideas
       (brand_id, account_id, title, angle_label, angle, rationale, theme_id, signal, source, formats, channels,
        status, decided_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14)
     returning ${COLUMNS}`,
    [
      brandId,
      accountId,
      draft.title,
      draft.angleLabel,
      draft.angle,
      draft.rationale,
      draft.themeId,
      JSON.stringify(draft.signal),
      draft.source ? JSON.stringify(draft.source) : null,
      draft.formats,
      draft.channels,
      idea.status,
      idea.decidedAt,
      idea.createdAt,
    ],
  );
  return toIdea(rows[0]);
}

/** Un gruppo di idee nello stesso momento: un millisecondo di scarto tiene l'ordine in cui arrivano. */
export async function insertDrafts(
  db: Queryable,
  accountId: string,
  brandId: string,
  drafts: readonly IdeaDraft[],
  status: IdeaStatus,
  now: Date,
): Promise<Idea[]> {
  const created: Idea[] = [];
  for (const [index, draft] of drafts.entries()) {
    created.push(
      await insertIdea(db, accountId, brandId, {
        draft,
        status,
        createdAt: new Date(now.getTime() - index),
        decidedAt: status === 'new' ? null : now,
      }),
    );
  }
  return created;
}

export async function updateIdeaStatus(db: Queryable, ideaId: string, status: IdeaStatus, now: Date): Promise<Idea | null> {
  const { rows } = await db.query<IdeaRow>(
    `update presenza.ideas set status = $2, decided_at = $3 where id = $1 returning ${COLUMNS}`,
    [ideaId, status, status === 'new' ? null : now],
  );
  return rows[0] ? toIdea(rows[0]) : null;
}
