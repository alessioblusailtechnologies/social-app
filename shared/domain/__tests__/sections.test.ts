import { describe, expect, it } from '@jest/globals';

import { changeDraftKind, createEmptyDraft } from '../catalog';
import { completeness, sectionError, sectionStatus, sectionSummary } from '../sections';
import { createThemes } from '../themes';

describe('sectionError', () => {
  it('chiede nome e frase per la sezione identità', () => {
    const draft = createEmptyDraft('person');
    expect(sectionError('identity', draft)).not.toBeNull();
    draft.identity.name = 'Marco';
    draft.identity.pitch = 'Faccio cose.';
    expect(sectionError('identity', draft)).toBeNull();
  });

  it('richiede almeno un canale scelto, non collegato', () => {
    const draft = createEmptyDraft('company');
    expect(sectionError('channels', draft)).not.toBeNull();
    draft.channels.instagram.selected = true;
    expect(sectionError('channels', draft)).toBeNull();
    expect(sectionStatus('channels', draft)).toBe('partial');
  });

  it('richiede temi con un nome', () => {
    const draft = createEmptyDraft('person');
    draft.themes = createThemes(['Uno', '']);
    expect(sectionError('themes', draft)).toBe('Dai un nome a ogni tema.');
  });

  it('le sezioni saltabili non bloccano mai', () => {
    const draft = createEmptyDraft('person');
    expect(sectionError('voice', draft)).toBeNull();
    expect(sectionError('visual', draft)).toBeNull();
    expect(sectionError('references', draft)).toBeNull();
  });
});

describe('completeness', () => {
  it('una bozza vuota vale il mezzo punto della sola identità visiva', () => {
    expect(completeness(createEmptyDraft('person')).percent).toBe(7);
  });
});

describe('sectionSummary', () => {
  it('compone ruolo e azienda per una persona', () => {
    const draft = createEmptyDraft('person');
    Object.assign(draft.identity, { name: 'Marco Sereni', role: 'Founder', company: 'Nodo' });
    expect(sectionSummary('identity', draft)).toBe('Marco Sereni · Founder di Nodo');
  });
});

describe('changeDraftKind', () => {
  it('tiene i testi e azzera obiettivi e pubblico', () => {
    const draft = createEmptyDraft('person');
    draft.identity.name = 'Nodo';
    draft.positioning.goals = ['Trovare clienti'];
    const changed = changeDraftKind(draft, 'company');
    expect(changed.identity).toMatchObject({ kind: 'company', name: 'Nodo' });
    expect(changed.positioning.goals).toEqual([]);
  });
});
