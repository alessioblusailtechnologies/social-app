import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import { ApiError } from '../contract/errors';

/**
 * Il BE apre pagine indicate dagli utenti (il sito, un link) e le fa aprire all'AI: senza
 * questo controllo chiunque potrebbe fargli leggere servizi interni o i metadati del cloud.
 * Passano solo http e https verso nomi pubblici che non risolvono in indirizzi privati.
 */

const PRIVATE = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv6');
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return PRIVATE.check(address, 'ipv4');
  if (family !== 6) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return mapped ? PRIVATE.check(mapped[1], 'ipv4') : PRIVATE.check(address, 'ipv6');
}

/** "nodo.it" → https://nodo.it/ ; lancia se non è un indirizzo web. */
export function toWebUrl(raw: string): URL {
  const trimmed = raw.trim();
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password) return url;
  } catch {
    /* sotto */
  }
  throw ApiError.invalid('L’indirizzo non è valido.');
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = toWebUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!isIP(host) && !host.includes('.')) throw ApiError.invalid('L’indirizzo non è pubblico.');

  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
  } catch {
    throw ApiError.invalid(`Non trovo ${host}: controlla l’indirizzo.`);
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw ApiError.invalid('L’indirizzo non è pubblico.');
  }
  return url;
}

/**
 * Scarica un testo da un indirizzo pubblico, seguendo i redirect uno alla volta per
 * ricontrollare ogni destinazione, con un tetto di tempo e di dimensione.
 */
export async function fetchPublicText(raw: string, maxBytes: number, timeoutMs = 6000): Promise<{ url: URL; text: string }> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'PresenzaBot/0.1 (+https://presenza.app)', accept: 'text/html,text/css,*/*;q=0.5' },
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`${url.toString()} risponde ${response.status}`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    return { url, text: new TextDecoder().decode(Buffer.concat(chunks)).slice(0, maxBytes) };
  }
  throw new Error('troppi redirect');
}
