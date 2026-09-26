import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { createRenderer, InvalidCardError, parseCard } from './render';

/**
 * Il servizio di render di Presenza: riceve le props di una card e risponde col PNG. Non ha
 * stato né chiavi: le immagini arrivano come URL già firmati dall'API, che è l'unica a chiamarlo.
 */

const PORT = Number(process.env.PORT) || Number(process.env.RENDER_PORT) || 3020;
const TOKEN = process.env.RENDER_TOKEN || null;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const log = (level: 'info' | 'warn' | 'error', message: string, extra: Record<string, unknown> = {}) =>
  console[level === 'info' ? 'log' : level](JSON.stringify({ level, time: new Date().toISOString(), message, ...extra }));

// In produzione il sito è già costruito (`npm run bundle-site`) e webpack non si carica nemmeno;
// in locale si costruisce all'avvio.
const started = Date.now();
const serveUrl = process.env.RENDER_SERVE_URL || (await (await import('./site')).bundleSite());
// Sul piano gratuito (512 MB) un solo processo di Chromium e uno scatto alla volta.
const lowMemory = process.env.RENDER_LOW_MEMORY === '1';
const renderer = await createRenderer({
  serveUrl,
  concurrency: Number(process.env.RENDER_CONCURRENCY) || (lowMemory ? 1 : 2),
  multiProcess: !lowMemory,
});
log('info', 'render pronto', { serveUrl, ms: Date.now() - started });

function send(response: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  response.end(json);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new InvalidCardError('corpo troppo grande');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new InvalidCardError('JSON non valido');
  }
}

const server = createServer((request, response) => {
  void (async () => {
    const url = request.url?.split('?')[0];
    if (request.method === 'GET' && url === '/health') return send(response, 200, { status: 'ok' });
    if (request.method !== 'POST' || url !== '/render') return send(response, 404, { code: 'NOT_FOUND' });
    if (TOKEN && request.headers['x-render-token'] !== TOKEN) return send(response, 401, { code: 'UNAUTHENTICATED' });

    const begun = Date.now();
    try {
      const card = parseCard(await readJson(request));
      const png = await renderer.render(card);
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length });
      response.end(png);
      log('info', 'card', { template: card.page.templateId, aspect: card.aspect, ms: Date.now() - begun, bytes: png.length });
    } catch (error) {
      if (error instanceof InvalidCardError) return send(response, 400, { code: 'INVALID', message: error.message });
      log('error', 'scatto non riuscito', { err: error instanceof Error ? error.message : String(error) });
      send(response, 500, { code: 'RENDER_FAILED' });
    }
  })();
});

server.listen(PORT, '0.0.0.0', () => log('info', `in ascolto su ${PORT}`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close();
    void renderer.close().finally(() => process.exit(0));
  });
}
