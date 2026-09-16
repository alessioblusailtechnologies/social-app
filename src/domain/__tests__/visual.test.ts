import { describe, expect, it } from '@jest/globals';

import { PALETTE_PRESETS } from '../catalog';
import type { Visual } from '../brand';
import {
  brandKit,
  channelsWaitingForVisual,
  chooseTemplate,
  cleanCardText,
  contrastRatio,
  creationSteps,
  editDesign,
  emptyCardText,
  inkOn,
  layoutOptions,
  proposeDesign,
  redoDesign,
  refreshDesign,
  toEdit,
  VisualBusyError,
  withUploadedPhoto,
  withoutPhoto,
  type CardText,
  type VisualDesign,
} from '../visual';

const text = (overrides: Partial<CardText>): CardText => ({ ...emptyCardText(), ...overrides });

const slides = [
  { title: 'Tre errori nel preventivo', body: 'Quello che vediamo ogni settimana' },
  { title: 'Il margine a occhio', body: 'Si parte dal prezzo del vicino' },
  { title: 'Le ore dimenticate', body: 'Sopralluoghi e telefonate non entrano' },
  { title: 'Lo sconto facile', body: 'Arriva prima della domanda' },
  { title: 'Come facciamo noi', body: 'Scrivici per il modello' },
];

const post = (overrides: Partial<Parameters<typeof proposeDesign>[0]> = {}) =>
  proposeDesign(
    { kind: 'infographic', templateId: null, text: text({ headline: 'Il preventivo si scrive dal margine' }), imageDescription: 'Mani su un banco', ...overrides },
    'post',
    [],
  )!;

const ready = (design: VisualDesign): VisualDesign => ({
  ...design,
  status: 'ready',
  image: { ...design.image, photo: { path: null, url: 'foto' }, cutout: { path: null, url: 'soggetto' } },
});

describe('proposeDesign', () => {
  it('un post ha una pagina, un video nessun visivo', () => {
    expect(post().pages).toHaveLength(1);
    expect(post().status).toBe('proposed');
    expect(proposeDesign({ kind: 'infographic', templateId: null, text: text({ headline: 'x' }), imageDescription: '' }, 'video', [])).toBeNull();
  });

  it('il carosello ha una pagina per slide: copertina, punti e chiusura', () => {
    const design = proposeDesign({ kind: 'photo', templateId: 'photo-cover', text: text({ headline: 'Copertina' }), imageDescription: '' }, 'carousel', slides)!;
    expect(design.pages.map((page) => page.templateId)).toEqual(['photo-cover', 'point', 'point', 'point', 'closing']);
    expect(design.pages[1].text.headline).toBe('Il margine a occhio');
  });

  it('un template che non va con tipo e testi cede al più adatto', () => {
    expect(post({ templateId: 'stat' }).pages[0].templateId).toBe('statement');
    expect(post({ kind: 'photo', templateId: 'statement' }).pages[0].templateId).toBe('photo-cover');
  });
});

describe('layoutOptions', () => {
  it('con un numero mette prima il dato, con i punti la lista', () => {
    expect(layoutOptions('infographic', text({ headline: 'ore perse', value: '3 ore' }))[0].id).toBe('stat');
    const items = [1, 2, 3].map((n) => ({ title: '', body: `Punto ${n}` }));
    expect(layoutOptions('infographic', text({ headline: 'Tre errori', items }))[0].id).toBe('list');
  });

  it('i passi vogliono un titolo per ogni punto', () => {
    const untitled = [1, 2, 3].map((n) => ({ title: '', body: `Punto ${n}` }));
    expect(layoutOptions('infographic', text({ headline: 'Come', items: untitled })).map((spec) => spec.id)).not.toContain('steps');
    expect(chooseTemplate('infographic', text({ headline: 'Come', items: untitled }), 'steps')).toBe('list');
  });
});

describe('cleanCardText', () => {
  it('taglia all’ultima parola intera e scarta i punti vuoti', () => {
    const clean = cleanCardText(text({ kicker: 'Una etichetta decisamente troppo lunga per stare', items: [{ title: ' ', body: '' }] }));
    expect(clean.kicker.length).toBeLessThanOrEqual(32);
    expect(clean.kicker.endsWith(' ')).toBe(false);
    expect(clean.items).toEqual([]);
  });
});

describe('creationSteps', () => {
  it('un soggetto scontornato vuole la foto, lo scontorno e la composizione', () => {
    const mixed = post({ kind: 'mixed', templateId: 'cutout-statement' });
    expect(creationSteps(mixed)).toEqual(['image', 'cutout', 'render']);
    const uploaded = withUploadedPhoto(mixed, { path: null, url: 'mia' });
    expect(creationSteps(uploaded)).toEqual(['cutout', 'render']);
    expect(creationSteps(post())).toEqual(['render']);
  });
});

describe('editDesign', () => {
  it('passare a Mista da un visivo pronto riporta alla proposta', () => {
    const current: VisualDesign = { ...post(), status: 'ready' };
    const next = editDesign(current, { ...toEdit(current), kind: 'mixed' });
    expect(next.status).toBe('proposed');
    expect(next.pages[0].templateId).toBe('split');
  });

  it('cambiare la descrizione butta la foto generata ma non quella caricata', () => {
    const generated = ready(post({ kind: 'photo' }));
    expect(editDesign(generated, { ...toEdit(generated), description: 'Altro' }).image.photo).toBeNull();
    const uploaded = withUploadedPhoto(post({ kind: 'photo' }), { path: null, url: 'mia' });
    expect(editDesign(uploaded, { ...toEdit(uploaded), description: 'Altro' }).image.photo?.url).toBe('mia');
  });

  it('cambiare solo i testi tiene il visivo pronto e svuota i PNG', () => {
    const current: VisualDesign = {
      ...ready(post()),
      renders: [{ page: 0, aspect: '4:5', file: { path: 'a.png', url: 'a' } }],
    };
    const edit = toEdit(current);
    const next = editDesign(current, { ...edit, pages: [{ ...edit.pages[0], text: text({ headline: 'Nuovo titolo' }) }] });
    expect(next.status).toBe('ready');
    expect(next.renders).toEqual([]);
  });

  it('durante la creazione non si modifica', () => {
    const creating: VisualDesign = { ...post(), status: 'creating' };
    expect(() => editDesign(creating, toEdit(creating))).toThrow(VisualBusyError);
    expect(() => withoutPhoto(creating)).toThrow(VisualBusyError);
  });
});

describe('redoDesign e refreshDesign', () => {
  it('un visivo creato resta e aspetta i testi nuovi, nel suo layout', () => {
    const created: VisualDesign = { ...ready(post({ kind: 'infographic', templateId: 'statement' })) };
    const proposed = post({ text: text({ headline: 'Tre ore a settimana', value: '3 ore' }) });
    const redone = redoDesign(created, proposed)!;
    expect(redone.status).toBe('ready');
    expect(redone.nextPages?.[0].text.headline).toBe('Tre ore a settimana');

    const refreshed = refreshDesign(redone);
    expect(refreshed.nextPages).toBeNull();
    expect(refreshed.pages[0].templateId).toBe('statement');
    expect(refreshed.pages[0].text.value).toBe('3 ore');
  });

  it('una proposta mai creata si sostituisce, tenendo la foto se c’era', () => {
    const proposed = post({ text: text({ headline: 'Nuova' }) });
    expect(redoDesign(post(), proposed)).toBe(proposed);
    const withPhoto = { ...post({ kind: 'photo' }), image: { ...post().image, photo: { path: null, url: 'foto' } } };
    expect(redoDesign(withPhoto, proposed)?.image.photo?.url).toBe('foto');
  });
});

describe('channelsWaitingForVisual', () => {
  it('Instagram e TikTok aspettano il visivo, LinkedIn no', () => {
    expect(channelsWaitingForVisual('post', ['linkedin', 'instagram', 'tiktok'], post())).toEqual(['instagram', 'tiktok']);
    expect(channelsWaitingForVisual('post', ['instagram'], { ...post(), status: 'ready' })).toEqual([]);
    expect(channelsWaitingForVisual('video', ['tiktok'], null)).toEqual([]);
  });
});

describe('brandKit', () => {
  const visual: Visual = { logoUri: null, palette: PALETTE_PRESETS[0], imageStyle: 'flat-geometric', typography: 'fraunces', signature: true };

  it('un brand salvato prima dei caratteri prende la coppia di base, e senza logo niente firma', () => {
    const legacy = { ...visual } as Partial<Visual>;
    delete legacy.typography;
    const kit = brandKit({ identity: { name: 'Forno' }, visual: legacy as Visual });
    expect(kit.heading.family).toBe('Inter Tight');
    expect(kit.signature).toBe(false);
    expect(kit.fontsHref).toContain('family=Inter:wght@400;600');
  });

  it('l’inchiostro si legge su ogni fondo delle palette di base', () => {
    for (const palette of PALETTE_PRESETS) {
      const kit = brandKit({ identity: { name: 'Forno' }, visual: { ...visual, palette } });
      for (const background of Object.values(kit.colors)) {
        expect(contrastRatio(inkOn(background, kit), background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
