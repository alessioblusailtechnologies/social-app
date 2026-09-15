import { describe, expect, it } from 'vitest';

import { createEmptyDraft } from '@/domain/catalog';
import type { Brand } from '@/domain/brand';
import { createThemes } from '@/domain/themes';

import { cleanLabels, describeBrand } from '../src/ai/brand-context';
import { cleanHashtags } from '../src/ai/content';
import { fitChannels } from '../src/ai/ideas';
import { costAtTariff, modelTarget } from '../src/ai/providers';
import { colorsFromHtml, countColors } from '../src/ai/site-colors';
import { isPrivateAddress, toWebUrl } from '../src/lib/public-url';
import { scheduleKey, toSlot } from '../src/data/slots';

function brand(): Brand {
  const draft = createEmptyDraft('company');
  return {
    ...draft,
    id: 'b1',
    createdAt: '',
    updatedAt: '',
    identity: { ...draft.identity, name: 'Forno Aurora', sector: 'Panificio', pitch: 'Pane a lievito madre a Bologna.' },
    channels: { ...draft.channels, instagram: { selected: true, handle: null }, facebook: { selected: true, handle: '@aurora' } },
    themes: createThemes(['Il pane di ogni giorno', 'Dietro il banco']),
  };
}

describe('indirizzi pubblici', () => {
  it('riconosce gli indirizzi privati, locali e mappati', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('completa lo schema e rifiuta quello che non è web', () => {
    expect(toWebUrl('nodo.it').toString()).toBe('https://nodo.it/');
    expect(() => toWebUrl('ftp://nodo.it')).toThrow();
    expect(() => toWebUrl('https://utente:segreto@nodo.it')).toThrow();
  });
});

describe('colori del sito', () => {
  it('pesa theme-color, conta gli stili e trova i fogli collegati', () => {
    const html = `<meta name="theme-color" content="#1f3a5f"><style>a{color:#e9c46a}b{color:#E9C46A}</style>
      <div style="background:#fff"></div><link rel="stylesheet" href="/app.css">`;
    const { counts, stylesheets } = colorsFromHtml(html);
    expect(counts.get('#1F3A5F')).toBe(10);
    expect(counts.get('#E9C46A')).toBe(2);
    expect(counts.get('#FFFFFF')).toBe(1);
    expect(stylesheets).toEqual(['/app.css']);
    expect(countColors(['#abc #aabbcc']).get('#AABBCC')).toBe(2);
  });
});

describe('ripulitura delle risposte AI', () => {
  it('tiene hashtag puliti, senza doppioni e fino al tetto', () => {
    expect(cleanHashtags(['#Pane', 'pane', 'lievito madre', '#Bologna!', '#extra'], 3)).toEqual(['#Pane', '#lievitomadre', '#Bologna']);
  });

  it('pulisce le etichette e toglie i doppioni', () => {
    expect(cleanLabels([' famiglie.', 'Famiglie', '', 'Ristoratori di zona'], 3)).toEqual(['Famiglie', 'Ristoratori di zona']);
  });

  it('restringe i canali a quelli del brand', () => {
    expect(fitChannels(brand(), ['linkedin', 'instagram'], ['post'])).toEqual(['instagram']);
    expect(fitChannels(brand(), ['tiktok'], ['carousel'])).toEqual(['instagram']);
    expect(fitChannels(brand(), [], ['article'])).toEqual(['instagram', 'facebook']);
  });

  it('descrive il brand con gli id dei temi e dei canali', () => {
    const text = describeBrand(brand(), new Date(2026, 8, 15, 10));
    const [first] = brand().themes;
    expect(text).toContain('Forno Aurora');
    expect(text).toContain('pesa 60% del piano');
    expect(text).toContain('id "instagram"');
    expect(text).toContain('collegato come @aurora');
    expect(text).toMatch(/martedì 15 settembre 2026/);
    expect(first.id).toMatch(/^theme_/);
  });
});

describe('uscite', () => {
  const row = {
    id: 's1',
    brand_id: 'b1',
    publish_date: '2026-09-15',
    publish_time: '09:00',
    channels: ['linkedin' as const],
    theme_id: null,
    idea_id: null,
    content_title: null,
    status: 'scheduled' as const,
    origin: 'manual' as const,
    created_at: new Date('2026-09-01T10:00:00Z'),
  };

  it('una programmata col suo orario passato risulta pubblicata', () => {
    expect(scheduleKey(new Date(2026, 8, 15, 8, 5))).toBe('2026-09-15T08:05');
    expect(toSlot(row, new Date(2026, 8, 15, 8, 59)).status).toBe('scheduled');
    expect(toSlot(row, new Date(2026, 8, 15, 9, 1)).status).toBe('published');
    expect(toSlot({ ...row, status: 'toApprove' }, new Date(2026, 8, 16)).status).toBe('toApprove');
  });
});

describe('fornitori del modello', () => {
  const deepseek = { key: 'sk-deepseek-prova', baseUrl: 'https://api.deepseek.com/anthropic' };

  it('un Claude va ad Anthropic, e senza chiave l’AI resta spenta', () => {
    expect(modelTarget('claude-opus-5', { anthropic: 'sk-ant-prova', deepseek })).toEqual({});
    expect(modelTarget('claude-opus-5', { anthropic: undefined, deepseek })).toBeNull();
  });

  it('DeepSeek cambia indirizzo e chiave del processo, e nient’altro', () => {
    const processEnv = { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-ant-prova', CLAUDE_CODE_OAUTH_TOKEN: 'oauth-prova' };
    const target = modelTarget('deepseek-flash', { anthropic: undefined, deepseek }, processEnv);
    expect(target?.env).toEqual({
      PATH: '/usr/bin',
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_API_KEY: 'sk-deepseek-prova',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-flash',
    });
    expect(target?.tariff).toEqual({ input: 0.3, output: 1.2, cache: 0.006 });
    expect(modelTarget('deepseek-flash', { anthropic: 'sk-ant-prova', deepseek: { ...deepseek, key: undefined } })).toBeNull();
  });

  it('il costo al listino tiene a parte la cache', () => {
    const tariff = { input: 0.3, output: 1.2, cache: 0.006 };
    expect(costAtTariff({ input: 1_000_000, output: 100_000, cacheRead: 2_000_000, cacheWrite: 0 }, tariff)).toBe(0.432);
  });
});
