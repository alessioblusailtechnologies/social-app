/**
 * Prova in locale: scatta ogni template in 4:5 e alcuni negli altri formati, con una linea di esempio, e salva i PNG
 * in `out/`. Serve a guardare le card, non è un test.
 *
 *   npm run try                         tutti i template, linea scura in stile editoriale
 *   npm run try -- stat quote           solo quelli indicati
 *   TRY_LINE=chiara npm run try         la linea chiara di un forno
 *   TRY_PHOTO=percorso.jpg npm run try  una foto vera al posto di quella finta
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { BrandLine, Visual } from '@/domain/brand';
import { PALETTE_PRESETS } from '@/domain/catalog';
import { SINGLE_TEMPLATES, TEMPLATES, brandKit, emptyCardText, type Aspect, type CardText, type TemplateId } from '@/domain/visual';
import { templateFallback } from '@/domain/line';
import { sampleCutout, samplePhoto } from '@/services/mock/sample-images';
import { MOCK_TEMPLATE_FONTS, MOCK_TEMPLATES } from '@/services/mock/templates';

import { createRenderer } from '../src/render';
import { bundleSite, PACKAGE_ROOT } from '../src/site';

const LOGO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90"><rect width="90" height="90" rx="22" fill="#FF6B35"/><circle cx="45" cy="45" r="20" fill="#1C2150"/></svg>',
)}`;

const LINES: Record<string, { identity: { name: string; site: string }; visual: Visual; text: CardText }> = {
  scura: {
    identity: { name: 'Velia', site: 'sonovelia.it' },
    visual: {
      logoUri: null,
      palette: { id: 'custom', name: 'Velia', colors: ['#14181D', '#2A3038', '#7F97C4', '#FFFFFF'], origin: 'custom' },
      imageStyle: 'desaturated-photo',
      typography: 'fraunces',
      signature: false,
      line: {
        ground: '#14181D',
        accent: '#7F97C4',
        voice: { font: 'newsreader', weight: 400, italic: true },
        title: { font: 'newsreader', weight: 400, italic: false },
        label: { font: 'ibm-plex-mono', weight: 400, italic: false, spaced: true },
        text: { font: 'source-serif', weight: 400, italic: false },
        signature: 'sono Velia.',
        address: 'sonovelia.it',
        band: null,
        rubrics: [],
        copy: [],
      } satisfies BrandLine,
    },
    text: {
      ...emptyCardText(),
      kicker: 'sotto il cofano',
      headline: 'Decine di prodotti a confronto, la fonte in ogni casella.',
      body: 'Garanzie, massimali e franchigie fianco a fianco.',
      value: '54',
      author: 'Giulia, agente a Brescia',
      items: [
        { title: 'Franchigia', body: 'La parte di danno che resta a carico dell’assicurato.' },
        { title: 'Massimale', body: 'Il tetto oltre il quale la compagnia non paga.' },
        { title: 'Rivalsa', body: 'Il diritto di farsi restituire quanto pagato.' },
      ],
    },
  },
  // La composizione di una testata: foto in alto nei margini, frase grande sotto, solo il marchio in basso.
  testata: {
    identity: { name: 'Velia', site: 'sonovelia.it' },
    visual: {
      logoUri: null,
      palette: { id: 'custom', name: 'Velia', colors: ['#14181D', '#2A3038', '#7F97C4', '#FFFFFF'], origin: 'custom' },
      imageStyle: 'natural-photo',
      typography: 'fraunces',
      signature: false,
      line: {
        photo: 'block',
        inset: true,
        kicker: false,
        footer: 'mark',
        anchor: 'bottom',
        ground: '#F2F0EB',
        accent: '#2A3038',
        voice: { font: 'source-serif', weight: 400, italic: false },
        title: { font: 'source-serif', weight: 500, italic: false },
        label: { font: 'inter', weight: 500, italic: false, spaced: false },
        text: { font: 'inter', weight: 400, italic: false },
        signature: 'Velia',
        address: 'sonovelia.it',
        band: null,
        rubrics: [],
        copy: [],
      } satisfies BrandLine,
    },
    text: {
      ...emptyCardText(),
      kicker: 'la memoria',
      headline: 'Velia entra negli studi che gestiscono migliaia di polizze.',
      body: 'La fonte in ogni risposta, dalla prima domanda.',
      value: '54',
      author: 'Giulia, agente a Brescia',
      items: [
        { title: 'Franchigia', body: 'La parte di danno che resta a carico dell’assicurato.' },
        { title: 'Massimale', body: 'Il tetto oltre il quale la compagnia non paga.' },
        { title: 'Rivalsa', body: 'Il diritto di farsi restituire quanto pagato.' },
      ],
    },
  },
  chiara: {
    identity: { name: 'Forno Ferri', site: 'fornoferri.it' },
    visual: {
      logoUri: LOGO,
      palette: PALETTE_PRESETS[0],
      imageStyle: 'natural-photo',
      typography: 'fraunces',
      signature: true,
      line: {
        ground: '#F4F0E8',
        accent: '#FF6B35',
        voice: { font: 'fraunces', weight: 500, italic: false },
        title: { font: 'fraunces', weight: 600, italic: false },
        label: { font: 'dm-mono', weight: 500, italic: false, spaced: false },
        text: { font: 'dm-sans', weight: 400, italic: false },
        signature: 'Forno Ferri, dal 1962',
        address: 'fornoferri.it',
        band: null,
        rubrics: [],
        copy: [],
      } satisfies BrandLine,
    },
    text: {
      ...emptyCardText(),
      kicker: 'dal banco',
      headline: 'Il pane buono ha bisogno di tempo, non di fretta.',
      body: 'Ventiquattro ore di lievitazione, ogni notte.',
      value: '24 ore',
      author: 'Marta Ferri',
      items: [
        { title: 'Lievito madre', body: 'Rinfrescato ogni mattina alle cinque.' },
        { title: 'Farine del Mugello', body: 'Da un mulino a trenta chilometri.' },
        { title: 'Forno a legna', body: 'Acceso dalle tre, sempre.' },
      ],
    },
  },
};

// I template del mock, per provare il motore dei template scritti per il brand: TRY_LINE=template.
LINES.template = {
  ...LINES.chiara,
  visual: { ...LINES.chiara.visual, line: { ...LINES.chiara.visual.line!, templates: MOCK_TEMPLATES, fonts: MOCK_TEMPLATE_FONTS } },
};

const chosen = LINES[process.env.TRY_LINE ?? 'scura'] ?? LINES.scura;
const photoUrl = process.env.TRY_PHOTO
  ? `data:image/jpeg;base64,${readFileSync(process.env.TRY_PHOTO).toString('base64')}`
  : null;
const base = brandKit(chosen);
const kit = brandKit({
  ...chosen,
  visual: { ...chosen.visual, line: { ...chosen.visual.line!, band: { description: '', photo: { path: null, url: photoUrl ?? samplePhoto(base, 'fascia') } } } },
});

const only = new Set(process.argv.slice(2));
const custom = chosen.visual.line?.templates ?? [];
const jobs: { templateId: TemplateId; custom?: string; aspect: Aspect }[] = custom.length > 0
  ? custom.flatMap((template) => (['4:5', '1:1', '9:16', '1.91:1'] as Aspect[]).map((aspect) => ({ templateId: templateFallback(template), custom: template.id, aspect })))
  : [
  ...TEMPLATES.map((spec) => ({ templateId: spec.id, aspect: '4:5' as Aspect })),
  ...SINGLE_TEMPLATES.filter((spec) => ['statement', 'list', 'steps', 'photo-cover', 'split', 'cutout-statement'].includes(spec.id)).flatMap((spec) =>
    (['1:1', '9:16', '1.91:1'] as Aspect[]).map((aspect) => ({ templateId: spec.id, aspect })),
  ),
].filter((job) => only.size === 0 || only.has(job.custom ?? job.templateId));

const outDir = path.join(PACKAGE_ROOT, 'out');
mkdirSync(outDir, { recursive: true });

const renderer = await createRenderer({ serveUrl: await bundleSite() });
try {
  for (const { templateId, custom: customId, aspect } of jobs) {
    const started = Date.now();
    const png = await renderer.render({
      kit,
      page: { templateId, ...(customId && { custom: customId }), text: chosen.text },
      pageIndex: templateId === 'point' ? 2 : templateId === 'closing' ? 5 : 0,
      pageCount: templateId === 'point' || templateId === 'closing' ? 6 : 1,
      photoUrl: photoUrl ?? samplePhoto(kit, templateId),
      cutoutUrl: sampleCutout(),
      aspect,
    });
    const file = path.join(outDir, `${customId ?? templateId}-${aspect.replace(':', 'x')}.png`);
    writeFileSync(file, png);
    console.log(`${path.basename(file)}  ${Date.now() - started} ms`);
  }
} finally {
  await renderer.close();
}
