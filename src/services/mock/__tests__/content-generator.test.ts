import { describe, expect, it } from '@jest/globals';

import { currentVoiceCard } from '@/domain/brand';
import { checkVoice, numbersToDigits, CHANNEL_LIMITS } from '@/domain/content';

import { generateContent, rewriteText } from '../content-generator';
import { createDemoBrand, createDemoIdeas } from '../fixtures';

const brand = createDemoBrand();
const idea = createDemoIdeas(brand).find((candidate) => candidate.status === 'saved')!;
const card = currentVoiceCard(brand.voice);

describe('generateContent', () => {
  it('scrive una variante per canale, coerente con la scheda voce', () => {
    const content = generateContent(brand, idea, ['linkedin', 'instagram', 'x'], 'post', 0);
    expect(content.variants.map((variant) => variant.channel)).toEqual(['linkedin', 'instagram', 'x']);
    for (const variant of content.variants) {
      expect(variant.text.length).toBeGreaterThan(20);
      expect(variant.text).not.toContain('!');
      expect(variant.text.length).toBeLessThanOrEqual(CHANNEL_LIMITS[variant.channel]);
    }
    const linkedin = content.variants[0];
    expect(checkVoice(linkedin.text, card).notes.every((note) => note.ok)).toBe(true);
    expect(linkedin.hashtags).toHaveLength(3);
  });

  it('prepara le slide per un carosello e le scene per un video', () => {
    expect(generateContent(brand, idea, ['instagram'], 'carousel', 0).visual.slides.length).toBeGreaterThanOrEqual(4);
    const scenes = generateContent(brand, idea, ['instagram'], 'video', 0).visual.scenes;
    expect(scenes.some((scene) => scene.source === 'shoot')).toBe(true);
    expect(scenes.some((scene) => scene.source === 'generated')).toBe(true);
  });

  it('una nuova revisione cambia almeno una frase', () => {
    const texts = [0, 1, 2, 3].map(
      (revision) => generateContent(brand, idea, ['linkedin'], 'post', revision).variants[0].text,
    );
    expect(new Set(texts).size).toBeGreaterThan(1);
  });
});

describe('rewriteText', () => {
  const text = 'Primo paragrafo.\n\nTuttavia forse il secondo è lungo.\n\nTerzo paragrafo.\n\nChiusura.';

  it('accorcia, rende diretto, aggiunge un numero, chiude con una domanda, alleggerisce', () => {
    expect(rewriteText(text, 'Più corto', 's').split('\n\n')).toEqual(['Primo paragrafo.', 'Chiusura.']);
    expect(rewriteText(text, 'Più diretto', 's')).not.toContain('forse');
    expect(rewriteText(text, 'Aggiungi un numero', 's')).toMatch(/\d+%/);
    expect(rewriteText(text, 'Chiudi con una domanda', 's').trim().endsWith('?')).toBe(true);
    expect(rewriteText(text, 'Meno formale', 's')).toContain('Però');
  });
});

describe('checkVoice', () => {
  it('segnala parole da evitare, esclamativi e numeri in lettere', () => {
    const check = checkVoice('Un risultato rivoluzionario! Tre clienti in più.', card);
    const warnings = check.notes.filter((note) => !note.ok).map((note) => note.text);
    expect(warnings.join(' ')).toContain('«rivoluzionario»');
    expect(warnings.join(' ')).toContain('esclamativi');
    expect(warnings.join(' ')).toContain('in lettere');
    expect(check.score).toBeLessThan(70);
  });

  it('converte i numeri senza toccare il verbo essere', () => {
    expect(numbersToDigits('Tre clienti e sei pronto')).toBe('3 clienti e sei pronto');
  });
});
