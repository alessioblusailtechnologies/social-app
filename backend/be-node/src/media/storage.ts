import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Config } from '../config';
import { ApiError } from '../contract/errors';

/**
 * I file dei visivi (foto, scontorni, PNG) nel bucket privato di Supabase Storage. Nel contenuto resta il
 * percorso; l'indirizzo si firma quando l'API restituisce il contenuto e dura 24 ore.
 */

export interface StoredFile {
  bytes: Uint8Array;
  contentType: string;
}

export interface MediaStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  download(path: string): Promise<StoredFile>;
  /** Firma molti percorsi in una chiamata; un percorso che non si firma resta fuori dalla mappa. */
  sign(paths: readonly string[]): Promise<Map<string, string>>;
  /**
   * Un indirizzo con cui l'app carica un file grosso (un girato) direttamente nel bucket, con un PUT, senza passare
   * dall'API. Vale per quel percorso e basta, e scade in due ore.
   */
  uploadUrl(path: string): Promise<string>;
}

export const SIGNED_URL_SECONDS = 24 * 60 * 60;

const unavailable = () =>
  ApiError.unavailable('MEDIA_UNAVAILABLE', 'Lo spazio per le immagini non è configurato su questo server.');

export const unavailableStorage: MediaStorage = {
  upload: () => Promise.reject(unavailable()),
  download: () => Promise.reject(unavailable()),
  sign: () => Promise.resolve(new Map()),
  uploadUrl: () => Promise.reject(unavailable()),
};

export function supabaseStorage(config: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'MEDIA_BUCKET'>): MediaStorage {
  let client: SupabaseClient | undefined;
  const bucket = () => {
    client ??= createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return client.storage.from(config.MEDIA_BUCKET);
  };

  return {
    async upload(path, bytes, contentType) {
      // Ogni versione ha un percorso nuovo: la cache lunga non mostra mai un file vecchio.
      const { error } = await bucket().upload(path, bytes, { contentType, cacheControl: '31536000', upsert: false });
      if (error) throw new Error(`caricamento di ${path} non riuscito: ${error.message}`);
    },

    async download(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) throw new Error(`lettura di ${path} non riuscita: ${error?.message ?? 'file vuoto'}`);
      return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' };
    },

    async uploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path);
      if (error || !data) throw new Error(`indirizzo di caricamento per ${path} non creato: ${error?.message ?? 'vuoto'}`);
      return data.signedUrl;
    },

    async sign(paths) {
      const unique = [...new Set(paths)];
      if (unique.length === 0) return new Map();
      const { data, error } = await bucket().createSignedUrls(unique, SIGNED_URL_SECONDS);
      if (error) throw new Error(`firma degli indirizzi non riuscita: ${error.message}`);
      const urls = new Map<string, string>();
      for (const entry of data) {
        if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
      }
      return urls;
    },
  };
}
