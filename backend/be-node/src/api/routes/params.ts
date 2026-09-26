import type { ChannelId } from '@shared/domain/brand';

import { ApiError } from '../../contract/errors';
import { channelIdSchema, idParam } from '../../contract/schemas';

/** Un id di percorso che non è un uuid è una risorsa che non c'è. */
export function idFrom(value: string, message?: string): string {
  const parsed = idParam.safeParse(value);
  if (!parsed.success) throw ApiError.notFound(message);
  return parsed.data;
}

export function channelFrom(value: string): ChannelId {
  const parsed = channelIdSchema.safeParse(value);
  if (!parsed.success) throw ApiError.notFound('Canale sconosciuto.');
  return parsed.data;
}
