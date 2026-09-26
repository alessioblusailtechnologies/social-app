import type { BrandTemplate, TemplateFont } from '@shared/domain/brand';

/**
 * I template del mock, al posto di quelli che scriverebbe il direttore artistico: una foto pura, una foto col titolo
 * sotto, una frase. Servono a vedere il motore dei template senza backend.
 */

export const MOCK_TEMPLATE_FONTS: TemplateFont[] = [
  { family: 'Archivo Black', weights: [400], italic: false },
  { family: 'Inter', weights: [400, 600], italic: false },
];

export const MOCK_TEMPLATES: BrandTemplate[] = [
  {
    id: 'foto-pura',
    name: 'Foto pura',
    use: 'Quando la foto dice tutto: il testo sta nella didascalia del post.',
    fields: [],
    photo: true,
    html: '<img class="photo" src="{{photo}}" alt="">{{#logo}}<img class="logo" src="{{logo}}" alt="">{{/logo}}',
    css: `.photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.logo { position: absolute; right: 48px; bottom: calc(48px + var(--safe-bottom)); width: 96px; height: 96px; object-fit: contain; background: #fff; border-radius: 20px; padding: 10px; }`,
  },
  {
    id: 'foto-titolo',
    name: 'Foto e titolo',
    use: 'La foto in alto e sotto il messaggio in grande: annunci, prodotti, novità.',
    fields: ['headline', 'body'],
    photo: true,
    html: `<div class="wrap"><div class="media"><img src="{{photo}}" alt=""></div><div class="text"><h1 data-fit>{{headline}}</h1>{{#body}}<p>{{body}}</p>{{/body}}</div></div>`,
    css: `.wrap { display: flex; flex-direction: column; height: 100%; padding: calc(56px + var(--safe-top)) 56px calc(56px + var(--safe-bottom)); }
.media { flex: 0 0 58%; overflow: hidden; }
.media img { width: 100%; height: 100%; object-fit: cover; }
.text { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 20px; padding-top: 40px; }
h1 { flex: 1; min-height: 0; overflow: hidden; font-family: 'Archivo Black', sans-serif; font-size: 104px; line-height: 0.95; text-transform: uppercase; color: var(--ink); }
p { font-family: Inter, sans-serif; font-size: 34px; line-height: 1.3; color: var(--ink); opacity: 0.8; }
.ratio-191x1 .wrap { flex-direction: row; gap: 40px; }
.ratio-191x1 .media { flex-basis: 48%; }
.ratio-191x1 .text { padding-top: 0; justify-content: center; }`,
  },
  {
    id: 'frase',
    name: 'Frase',
    use: 'Una frase che si regge da sola, senza foto.',
    fields: ['kicker', 'headline'],
    photo: false,
    html: `<div class="wrap">{{#kicker}}<span class="kicker">{{kicker}}</span>{{/kicker}}<h1 data-fit>{{headline}}</h1><span class="brand">{{brand}}</span></div>`,
    css: `.wrap { display: flex; flex-direction: column; height: 100%; padding: calc(80px + var(--safe-top)) 72px calc(72px + var(--safe-bottom)); background: var(--primary); }
.kicker { font-family: Inter, sans-serif; font-weight: 600; font-size: 28px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); }
h1 { flex: 1; min-height: 0; overflow: hidden; display: flex; align-items: center; font-family: 'Archivo Black', sans-serif; font-size: 120px; line-height: 0.95; text-transform: uppercase; color: var(--ground); }
.brand { font-family: Inter, sans-serif; font-size: 28px; color: var(--ground); opacity: 0.7; }`,
  },
];
