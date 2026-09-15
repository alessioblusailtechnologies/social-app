import type { Brand, BrandDraft, BrandSections, SectionKey, SectionPatch } from '@/domain/brand';

import { ApiError } from '../contract/errors';
import type { Queryable } from '../db/pool';

interface BrandRow extends Omit<BrandSections, 'references'> {
  id: string;
  refs: BrandSections['references'];
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, identity, positioning, channels, themes, voice, visual, refs, created_at, updated_at';

/** "references" è una parola riservata di SQL: la colonna si chiama `refs`. */
const SECTION_COLUMNS: Record<SectionKey, string> = {
  identity: 'identity',
  positioning: 'positioning',
  channels: 'channels',
  themes: 'themes',
  voice: 'voice',
  visual: 'visual',
  references: 'refs',
};

export function toBrand(row: BrandRow): Brand {
  return {
    id: row.id,
    identity: row.identity,
    positioning: row.positioning,
    channels: row.channels,
    themes: row.themes,
    voice: row.voice,
    visual: row.visual,
    references: row.refs,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listBrands(db: Queryable, accountId: string): Promise<Brand[]> {
  const { rows } = await db.query<BrandRow>(
    `select ${COLUMNS} from presenza.brands where account_id = $1 order by created_at`,
    [accountId],
  );
  return rows.map(toBrand);
}

export async function findBrand(db: Queryable, brandId: string): Promise<Brand | null> {
  const { rows } = await db.query<BrandRow>(`select ${COLUMNS} from presenza.brands where id = $1`, [brandId]);
  return rows[0] ? toBrand(rows[0]) : null;
}

/** Dentro una transazione con identità "non trovato" copre anche "di un altro account". */
export async function requireBrand(db: Queryable, brandId: string): Promise<Brand> {
  const brand = await findBrand(db, brandId);
  if (!brand) throw ApiError.notFound('Brand non trovato.');
  return brand;
}

export async function insertBrand(db: Queryable, accountId: string, draft: BrandDraft): Promise<Brand> {
  // I jsonb passano da JSON.stringify: un array JavaScript diventerebbe un array Postgres.
  const { rows } = await db.query<BrandRow>(
    `insert into presenza.brands (account_id, identity, positioning, channels, themes, voice, visual, refs)
     values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
     returning ${COLUMNS}`,
    [
      accountId,
      JSON.stringify(draft.identity),
      JSON.stringify(draft.positioning),
      JSON.stringify(draft.channels),
      JSON.stringify(draft.themes),
      JSON.stringify(draft.voice),
      JSON.stringify(draft.visual),
      JSON.stringify(draft.references),
    ],
  );
  return toBrand(rows[0]);
}

export async function updateSection(db: Queryable, brandId: string, patch: SectionPatch): Promise<Brand | null> {
  const { rows } = await db.query<BrandRow>(
    `update presenza.brands set ${SECTION_COLUMNS[patch.key]} = $2::jsonb where id = $1 returning ${COLUMNS}`,
    [brandId, JSON.stringify(patch.value)],
  );
  return rows[0] ? toBrand(rows[0]) : null;
}

export async function deleteBrands(db: Queryable, accountId: string): Promise<void> {
  await db.query('delete from presenza.brands where account_id = $1', [accountId]);
}
