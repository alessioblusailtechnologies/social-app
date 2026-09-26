import { ensureBrowser, openBrowser, renderStill, selectComposition } from '@remotion/renderer';

import { ASPECT_SIZES, isTemplateId, type Aspect } from '@shared/domain/visual';
import type { CardProps } from '@shared/templates';

/**
 * Lo scatto delle card con un Chromium sempre aperto: aprirlo a ogni richiesta costerebbe
 * secondi. Se il browser cade, si riapre e si riprova una volta.
 */

type HeadlessBrowser = Awaited<ReturnType<typeof openBrowser>>;

/** Le card orizzontali escono a 1200 px di larghezza, le altre a 1080. */
const SCALE: Partial<Record<Aspect, number>> = { '1.91:1': 1200 / 1080 };

export class InvalidCardError extends Error {}

/** Controlla la forma delle props quanto basta per non far partire uno scatto destinato a fallire. */
export function parseCard(body: unknown): CardProps {
  const card = body as Partial<CardProps> | null;
  const colors = card?.kit?.colors;
  if (!card || typeof card !== 'object') throw new InvalidCardError('corpo mancante');
  if (!colors || ![colors.primary, colors.secondary, colors.accent, colors.ground].every((c) => /^#[0-9A-F]{6}$/i.test(String(c)))) {
    throw new InvalidCardError('kit.colors non valido');
  }
  if (!card.page || !isTemplateId(card.page.templateId) || typeof card.page.text !== 'object') {
    throw new InvalidCardError('page non valida');
  }
  if (!card.aspect || !(card.aspect in ASPECT_SIZES)) throw new InvalidCardError('aspect non valido');
  return {
    kit: card.kit!,
    page: card.page,
    pageIndex: Number(card.pageIndex) || 0,
    pageCount: Number(card.pageCount) || 1,
    photoUrl: typeof card.photoUrl === 'string' ? card.photoUrl : null,
    cutoutUrl: typeof card.cutoutUrl === 'string' ? card.cutoutUrl : null,
    aspect: card.aspect,
  };
}

export interface CardRenderer {
  render(card: CardProps): Promise<Buffer>;
  close(): Promise<void>;
}

export interface RendererOptions {
  serveUrl: string;
  concurrency?: number;
  /** Chromium in più processi regge meglio gli scatti in parallelo su Linux (consigliato da Remotion), ma usa più memoria. */
  multiProcess?: boolean;
}

export async function createRenderer({ serveUrl, concurrency = 2, multiProcess = true }: RendererOptions): Promise<CardRenderer> {
  const launch = () => openBrowser('chrome', { chromiumOptions: { enableMultiProcessOnLinux: multiProcess } });
  await ensureBrowser();
  let browser: HeadlessBrowser = await launch();

  let active = 0;
  const queue: (() => void)[] = [];
  const inSlot = async <T>(run: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await run();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };

  const shoot = async (card: CardProps): Promise<Buffer> => {
    const inputProps = card as unknown as Record<string, unknown>;
    const composition = await selectComposition({ serveUrl, id: 'card', inputProps, puppeteerInstance: browser });
    const { buffer } = await renderStill({
      composition,
      serveUrl,
      inputProps,
      imageFormat: 'png',
      scale: SCALE[card.aspect] ?? 1,
      puppeteerInstance: browser,
      timeoutInMilliseconds: 45_000,
    });
    if (!buffer) throw new Error('scatto senza immagine');
    return buffer;
  };

  return {
    render: (card) =>
      inSlot(async () => {
        try {
          return await shoot(card);
        } catch (error) {
          // Un browser caduto non deve fermare il servizio: se ne apre un altro e si riprova una volta.
          await browser.close({ silent: true }).catch(() => undefined);
          browser = await launch();
          if (error instanceof InvalidCardError) throw error;
          return shoot(card);
        }
      }),
    close: () => browser.close({ silent: true }),
  };
}
