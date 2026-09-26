/**
 * Che immagine è davvero, letta dai primi byte.
 *
 * Il selettore di immagini dice il tipo guardando il nome del file, e sbaglia spesso: le
 * immagini salvate da internet sono WebP con l'aria di un JPEG. Il backend invece controlla la
 * firma dei byte, e un tipo dichiarato a caso gli fa rifiutare un file buono. Quindi il tipo lo
 * guardiamo qui, prima di mandarlo.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

/** I primi byte, decodificati a mano: basta l'inizio, non serve leggere tutta l'immagine. */
function firstBytes(base64: string, count: number): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of base64) {
    const value = ALPHABET.indexOf(char);
    // Gli a capo e gli spazi dentro il base64 non contano.
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      if (bytes.length >= count) break;
    }
  }
  return bytes;
}

/** PNG, JPEG o WebP: gli unici tre che il backend accetta. Null per tutto il resto (HEIC, AVIF, GIF…). */
export function imageType(base64: string): ImageType | null {
  const bytes = firstBytes(base64, 12);
  if (bytes.length < 12) return null;
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes[0] === 0x89 && text(1, 4) === 'PNG') return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** L'immagine come data URI col tipo vero, o null se è un formato che il backend non legge. */
export function imageDataUri(base64: string): string | null {
  const type = imageType(base64);
  return type ? `data:${type};base64,${base64}` : null;
}

/**
 * Quello che restituisce il selettore: il base64 quando c'è, altrimenti l'indirizzo, che sul web
 * è già un data URI. In entrambi i casi il tipo lo rileggiamo dai byte.
 */
export function pickedImageDataUri(picked: { base64?: string | null; uri?: string | null }): string | null {
  if (picked.base64) return imageDataUri(picked.base64);
  const uri = picked.uri ?? '';
  const comma = uri.indexOf(',');
  if (!uri.startsWith('data:') || comma < 0) return null;
  return imageDataUri(uri.slice(comma + 1));
}
