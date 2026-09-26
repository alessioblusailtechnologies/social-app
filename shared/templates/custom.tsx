import { useLayoutEffect, useRef } from 'react';

import type { BrandTemplate } from '@shared/domain/brand';
import { ASPECT_SIZES, SAFE_AREAS, type Aspect } from '@shared/domain/visual';

import { useFontsReady } from './fonts';
import { pageLabel } from './parts';
import type { CardProps } from './types';

/**
 * Le card coi template scritti per il brand dal direttore artistico, in HTML e CSS: il motore riempie i segnaposti,
 * ripulisce quello che non deve esserci (script, risorse esterne, attributi on*), disegna dentro uno Shadow DOM così il
 * CSS del brand non tocca l'app, fa entrare i testi segnati `data-fit` e avvisa quando foto e caratteri sono pronti.
 */

// ---------------------------------------------------------------------------
// I segnaposti, alla mustache: {{campo}}, {{#campo}}…{{/campo}}, {{^campo}}…{{/campo}}, {{#items}}…{{/items}}
// ---------------------------------------------------------------------------

type Slot = string | Record<string, string>[];
type Slots = Record<string, Slot>;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function fillTemplate(template: string, slots: Slots): string {
  const sections = /{{\s*([#^])\s*([\w-]+)\s*}}([\s\S]*?){{\s*\/\s*\2\s*}}/g;
  const withSections = template.replace(sections, (_, type: string, key: string, inner: string) => {
    const value = slots[key];
    const present = Array.isArray(value) ? value.length > 0 : Boolean(value && String(value).trim());
    if (type === '^') return present ? '' : fillTemplate(inner, slots);
    if (!present) return '';
    if (Array.isArray(value)) return value.map((item) => fillTemplate(inner, { ...slots, ...item })).join('');
    return fillTemplate(inner, slots);
  });
  return withSections.replace(/{{\s*([\w-]+)\s*}}/g, (_, key: string) => {
    const value = slots[key];
    return typeof value === 'string' ? escapeHtml(value) : '';
  });
}

// ---------------------------------------------------------------------------
// La pulizia: solo tag e attributi da impaginazione; immagini solo le nostre o data:, niente risorse esterne
// ---------------------------------------------------------------------------

const TAGS = new Set([
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'br', 'hr', 'strong', 'em', 'b', 'i', 'u', 's', 'small',
  'sup', 'sub', 'mark', 'ul', 'ol', 'li', 'figure', 'figcaption', 'section', 'header', 'footer', 'article', 'main',
  'aside', 'blockquote', 'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text',
  'tspan', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask',
]);

const ATTRIBUTES = new Set([
  'class', 'style', 'alt', 'src', 'data-fit', 'data-fit-min', 'aria-hidden', 'id', 'viewbox', 'd', 'fill', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1',
  'y1', 'x2', 'y2', 'dx', 'dy', 'width', 'height', 'points', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity',
  'fill-rule', 'clip-rule', 'offset', 'stop-color', 'stop-opacity', 'preserveaspectratio', 'xmlns', 'gradientunits',
  'gradienttransform', 'clip-path', 'mask', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'letter-spacing', 'textlength',
]);

/** Il CSS senza risorse esterne: niente @import, niente url() che non sia data: o un riferimento interno. */
export function cleanCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _quote, url: string) => (/^(data:image\/|#)/i.test(url.trim()) ? match : 'none'))
    .replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding/gi, '');
}

function cleanNode(node: Element, allowedUrls: Set<string>) {
  for (const child of [...node.children]) {
    const tag = child.tagName.toLowerCase();
    if (!TAGS.has(tag)) {
      child.remove();
      continue;
    }
    for (const attribute of [...child.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (!ATTRIBUTES.has(name)) child.removeAttribute(attribute.name);
      else if (name === 'src' && !(allowedUrls.has(value) || /^data:image\//i.test(value))) child.removeAttribute(attribute.name);
      else if (name === 'style') child.setAttribute('style', cleanCss(value));
      else if (/url\(/i.test(value) && !/^url\(#[\w-]+\)$/i.test(value.trim())) child.removeAttribute(attribute.name);
    }
    cleanNode(child, allowedUrls);
  }
}

export function cleanHtml(html: string, allowedUrls: Set<string>): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  cleanNode(doc.body, allowedUrls);
  return doc.body.innerHTML;
}

// ---------------------------------------------------------------------------
// Il testo che entra nel suo riquadro
// ---------------------------------------------------------------------------

function fitTexts(root: ParentNode) {
  for (const element of root.querySelectorAll<HTMLElement>('[data-fit]')) {
    element.style.fontSize = '';
    let size = parseFloat(getComputedStyle(element).fontSize) || 48;
    const min = Number(element.dataset.fitMin) || Math.max(12, size * 0.35);
    const overflows = () => element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
    for (let turn = 0; turn < 80 && size > min && overflows(); turn++) {
      size = Math.max(min, size * 0.95);
      element.style.fontSize = `${size}px`;
    }
  }
}

function imagesLoaded(root: ParentNode): Promise<void> {
  const images = [...root.querySelectorAll('img')];
  const each = images.map(
    (image) =>
      new Promise<void>((resolve) => {
        if (image.complete) resolve();
        else {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        }
      }),
  );
  return Promise.race([Promise.all(each).then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, 20_000))]);
}

// ---------------------------------------------------------------------------
// La card
// ---------------------------------------------------------------------------

const RATIO_CLASS: Record<Aspect, string> = { '4:5': 'ratio-4x5', '1:1': 'ratio-1x1', '9:16': 'ratio-9x16', '1.91:1': 'ratio-191x1' };

/** Il reset e la card: il resto lo decide il CSS del template. */
const BASE_CSS = `
:host { all: initial; display: block; position: absolute; inset: 0; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
.card { position: relative; width: var(--card-w); height: var(--card-h); overflow: hidden; background: var(--ground); color: var(--ink); font-family: system-ui, sans-serif; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
img { display: block; max-width: none; }
`;

/** La foto quando non c'è ancora: una luce nei colori del brand, così il template si vede com'è. */
function placeholderPhoto(from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100" height="125" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function CustomCard({ template, card, onReady }: { template: BrandTemplate; card: CardProps; onReady?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const fonts = useFontsReady();
  const { kit, page, aspect, pageIndex, pageCount, photoUrl } = card;
  const { tones } = kit.line;

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
    const photo = photoUrl || placeholderPhoto(tones.accent, tones.ground);
    const logo = kit.logoUrl && /^(https?:|data:image\/)/.test(kit.logoUrl) ? kit.logoUrl : '';
    const { text } = page;
    const slots: Slots = {
      kicker: text.kicker,
      headline: text.headline,
      body: text.body,
      value: text.value,
      author: text.author,
      items: text.items.map((item, i) => ({ index: String(i + 1).padStart(2, '0'), title: item.title, body: item.body })),
      brand: kit.name,
      signature: kit.line.signature,
      address: kit.line.address,
      page: pageLabel(pageIndex, pageCount),
      photo,
      logo,
    };
    const size = ASPECT_SIZES[aspect];
    const safe = SAFE_AREAS[aspect];
    const variables = [
      `--card-w: ${size.width}px`,
      `--card-h: ${size.height}px`,
      `--safe-top: ${aspect === '9:16' ? safe.top : 0}px`,
      `--safe-bottom: ${aspect === '9:16' ? safe.bottom : 0}px`,
      `--primary: ${kit.colors.primary}`,
      `--secondary: ${kit.colors.secondary}`,
      `--accent: ${kit.colors.accent}`,
      `--ground: ${kit.colors.ground}`,
      `--ink: ${tones.ink}`,
    ].join('; ');
    const html = cleanHtml(fillTemplate(template.html, slots), new Set([photo, logo].filter(Boolean)));
    root.innerHTML = `<style>${BASE_CSS}\n${cleanCss(template.css)}</style><div class="card ${RATIO_CLASS[aspect]}" style="${variables}">${html}</div>`;
    fitTexts(root);

    let alive = true;
    void imagesLoaded(root).then(() => {
      if (!alive) return;
      fitTexts(root);
      requestAnimationFrame(() => requestAnimationFrame(() => alive && onReady?.()));
    });
    return () => {
      alive = false;
    };
  }, [template, kit, page, aspect, pageIndex, pageCount, photoUrl, tones, fonts, onReady]);

  return <div ref={host} style={{ position: 'absolute', inset: 0 }} />;
}
