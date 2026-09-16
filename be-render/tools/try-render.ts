/**
 * Prova in locale: scatta ogni template in 4:5 e alcuni negli altri formati, con un brand di
 * esempio, e salva i PNG in `out/`. Serve a guardare le card, non è un test.
 *
 *   npm run try                 tutti i template
 *   npm run try -- stat quote   solo quelli indicati
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PALETTE_PRESETS } from '@/domain/catalog';
import type { TypographyId } from '@/domain/brand';
import { SINGLE_TEMPLATES, TEMPLATES, brandKit, emptyCardText, type Aspect, type CardText, type TemplateId } from '@/domain/visual';
import { sampleCutout, samplePhoto } from '@/services/mock/sample-images';

import { createRenderer } from '../src/render';
import { bundleSite, PACKAGE_ROOT } from '../src/site';

const LOGO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 90"><rect width="90" height="90" rx="22" fill="#FF6B35"/><text x="112" y="62" font-family="Arial" font-weight="700" font-size="48" fill="#1C2150">Forno</text></svg>',
)}`;

const typography = (process.env.TRY_TYPE as TypographyId | undefined) ?? 'space-grotesk';
const kit = brandKit({
  identity: { name: 'Forno Ferri' },
  visual: { logoUri: LOGO, palette: PALETTE_PRESETS[0], imageStyle: 'flat-geometric', typography, signature: true },
});

const TEXT: CardText = {
  ...emptyCardText(),
  kicker: 'Prezzi e margini',
  headline: 'Il preventivo si scrive dal margine, non dal prezzo del vicino',
  body: 'Ogni settimana rifacevamo i conti a mano. Adesso partiamo da quanto deve restare.',
  value: '3 ore',
  author: 'Giulia Ferri',
  items: [
    { title: 'Il margine', body: 'Decidi prima quanto deve restare' },
    { title: 'Le ore vere', body: 'Conta sopralluoghi e telefonate' },
    { title: 'Lo sconto', body: 'Solo dopo una domanda precisa' },
    { title: 'Il modello', body: 'Lo stesso foglio per ogni cliente' },
  ],
};

const only = new Set(process.argv.slice(2));
const jobs: { templateId: TemplateId; aspect: Aspect }[] = [
  ...TEMPLATES.map((spec) => ({ templateId: spec.id, aspect: '4:5' as Aspect })),
  ...SINGLE_TEMPLATES.filter((spec) => ['statement', 'list', 'steps', 'photo-cover', 'split', 'cutout-statement'].includes(spec.id)).flatMap((spec) =>
    (['1:1', '9:16', '1.91:1'] as Aspect[]).map((aspect) => ({ templateId: spec.id, aspect })),
  ),
].filter((job) => only.size === 0 || only.has(job.templateId));

const outDir = path.join(PACKAGE_ROOT, 'out');
mkdirSync(outDir, { recursive: true });

const renderer = await createRenderer({ serveUrl: await bundleSite() });
try {
  for (const { templateId, aspect } of jobs) {
    const started = Date.now();
    const png = await renderer.render({
      kit,
      page: { templateId, text: TEXT },
      pageIndex: templateId === 'point' ? 2 : templateId === 'closing' ? 5 : 0,
      pageCount: templateId === 'point' || templateId === 'closing' ? 6 : 1,
      photoUrl: samplePhoto(kit, templateId),
      cutoutUrl: sampleCutout(),
      aspect,
    });
    const file = path.join(outDir, `${templateId}-${aspect.replace(':', 'x')}.png`);
    writeFileSync(file, png);
    console.log(`${path.basename(file)}  ${Date.now() - started} ms`);
  }
} finally {
  await renderer.close();
}
