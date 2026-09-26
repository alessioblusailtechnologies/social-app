import { createClient } from '@supabase/supabase-js';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import type { BrandDraft } from '@shared/domain/brand';
import { createEmptyDraft } from '@shared/domain/catalog';
import type { Content } from '@shared/domain/content';
import { createThemes } from '@shared/domain/themes';

import type { AiEngine, AiRequest } from '../src/ai/engine';
import type { MediaDeps } from '../src/media';
import { buildApp } from '../src/api/app';
import { unavailableVision } from '../src/media/vision';
import { unavailableDirector } from '../src/ai/art-director';
import { supabaseVerifier } from '../src/api/plugins/auth';
import { config } from '../src/config';
import { closeDb, db } from '../src/db/pool';
import { supabaseAuthGateway } from '../src/services/auth';

/**
 * Il giro completo contro il database e Supabase Auth del file .env, con un'AI finta:
 * due account nuovi, il flusso di brand, idee, piano e contenuti, e la RLS fra i due.
 * Gli account di collaudo si cancellano alla fine (con loro, a cascata, tutti i dati).
 */

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  /* senza .env il giro si salta */
}
const enabled = Boolean(process.env.DATABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const FAKE_OUTPUTS: Record<string, unknown> = {
  ideas: {
    ideas: [
      {
        title: 'Tre numeri sul lievito madre',
        angleLabel: 'Il caso con i numeri',
        angle: 'Ore di lievitazione, farine usate, pagnotte al giorno.',
        rationale: 'Il tema pesa 60% nel piano.',
        themeId: null,
        formats: ['carousel'],
        channels: ['linkedin', 'instagram'],
        signal: { kind: 'theme', label: 'Il pane di ogni giorno' },
      },
      {
        title: 'Una notte al forno',
        angleLabel: 'Il dietro le quinte',
        angle: 'Dalle 3 alle 7, cosa succede prima dell’apertura.',
        rationale: 'Settembre, si riparte.',
        themeId: null,
        formats: ['video'],
        channels: ['instagram'],
        signal: { kind: 'season', label: 'Settembre · calendario' },
      },
    ],
  },
  content: {
    title: 'Il pane che non ha fretta',
    themeId: null,
    headline: 'Il pane che non ha fretta',
    variants: ['linkedin', 'instagram', 'facebook', 'tiktok', 'x'].map((channel) => ({
      channel,
      text: `Testo per ${channel}.`,
      hashtags: ['#pane', 'lievito madre'],
    })),
    slides: [{ title: 'Uno', body: 'Primo punto' }],
    scenes: [],
    visual: {
      kind: 'infographic',
      templateId: 'statement',
      card: { kicker: 'Il pane', headline: 'Il pane che non ha fretta', body: '', value: '', items: [], author: '' },
      imageDescription: 'Pagnotte appena sfornate sul bancone di legno, luce del mattino',
    },
  },
  rewrite: { text: 'Testo più corto.' },
};

const fakeAi: AiEngine & { tasks: string[] } = {
  tasks: [],
  run<S extends z.ZodType>(request: AiRequest<S>): Promise<z.output<S>> {
    this.tasks.push(request.task);
    return Promise.resolve(request.schema.parse(FAKE_OUTPUTS[request.task]));
  },
};

/** Un PNG di un pixel: basta a Storage, scontorno e render finti. */
const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
);

/** Storage in memoria, foto, scontorno e composizione finti: si contano le chiamate. */
const files = new Map<string, Uint8Array>();
const mediaCalls = { images: 0, cutout: 0, render: 0 };
/** Acceso, be-render finto risponde col PNG; spento, fallisce come un servizio che non c'è. */
const renderer = { down: false };
const fakeMedia: MediaDeps = {
  storage: {
    upload: (path, bytes) => {
      files.set(path, bytes);
      return Promise.resolve();
    },
    download: (path) => {
      const bytes = files.get(path);
      return bytes ? Promise.resolve({ bytes, contentType: 'image/png' }) : Promise.reject(new Error('file mancante'));
    },
    sign: (paths) => Promise.resolve(new Map(paths.filter((path) => files.has(path)).map((path) => [path, `https://firmato.test/${path}`]))),
    uploadUrl: (path) => Promise.resolve(`https://carica.test/${path}`),
  },
  music: { available: false, compose: () => Promise.reject(new Error('non serve')) },
  footage: { available: false, catalog: () => Promise.reject(new Error('non serve')) },
  images: {
    available: true,
    generate: () => {
      mediaCalls.images += 1;
      return Promise.resolve({ bytes: PNG, mimeType: 'image/png' });
    },
  },
  cutout: {
    available: true,
    cut: () => {
      mediaCalls.cutout += 1;
      return Promise.resolve({ bytes: PNG, mimeType: 'image/png' });
    },
  },
  renderer: {
    render: () => {
      mediaCalls.render += 1;
      return renderer.down ? Promise.reject(new Error('be-render non risponde')) : Promise.resolve(PNG);
    },
  },
  vision: unavailableVision,
  director: unavailableDirector,
};

describe.skipIf(!enabled)('API contro il database', () => {
  let app: FastifyInstance;
  const stamp = Date.now().toString(36);
  const password = `Collaudo-${stamp}-presenza!`;
  const created: string[] = [];
  let tokenA = '';
  let tokenB = '';
  let brandId = '';

  const call = (token: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, ...(payload && { payload }), headers: { authorization: `Bearer ${token}` } });
  const json = <T>(response: LightMyRequestResponse, status: number): T => {
    expect(response.statusCode, response.body).toBe(status);
    return response.json<T>();
  };

  beforeAll(async () => {
    const settings = config();
    app = buildApp({
      logger: false,
      pool: db(),
      verifyToken: supabaseVerifier(settings),
      auth: supabaseAuthGateway(settings),
      ai: () => fakeAi,
      media: () => fakeMedia,
    });
    await app.ready();
  });

  afterAll(async () => {
    const settings = config();
    const admin = createClient(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const id of created) await admin.auth.admin.deleteUser(id);
    await app?.close();
    await closeDb();
  });

  it('registra due account e rifiuta credenziali e token sbagliati', async () => {
    for (const label of ['a', 'b']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up',
        payload: { email: `collaudo+${stamp}-${label}@presenza-collaudo.it`, password, name: `Collaudo ${label}` },
      });
      const body = json<{ accessToken: string; account: { id: string; name: string } }>(response, 201);
      created.push(body.account.id);
      if (label === 'a') tokenA = body.accessToken;
      else tokenB = body.accessToken;
    }

    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up',
      payload: { email: `collaudo+${stamp}-a@presenza-collaudo.it`, password: 'unaltrapassword' },
    });
    expect(json<{ code: string }>(again, 409).code).toBe('EMAIL_TAKEN');

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      payload: { email: `collaudo+${stamp}-a@presenza-collaudo.it`, password: 'sbagliata' },
    });
    expect(json<{ code: string }>(wrong, 401).code).toBe('INVALID_CREDENTIALS');

    const signedIn = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      payload: { email: `COLLAUDO+${stamp}-a@presenza-collaudo.it`, password },
    });
    expect(json<{ account: { name: string } }>(signedIn, 200).account.name).toBe('Collaudo a');

    expect((await app.inject({ method: 'GET', url: '/api/workspace' })).statusCode).toBe(401);
    expect((await call('non-un-token', 'GET', '/api/workspace')).statusCode).toBe(401);
    expect(json<{ id: string }>(await call(tokenA, 'GET', '/api/auth/me'), 200).id).toBe(created[0]);
  });

  it('crea il brand, lo modifica e lo tiene lontano dall’altro account', async () => {
    expect(json(await call(tokenA, 'GET', '/api/workspace'), 200)).toEqual({ brands: [], activeBrandId: null });

    const draft: BrandDraft = createEmptyDraft('company');
    draft.identity = { ...draft.identity, name: 'Forno Aurora', pitch: 'Pane a lievito madre a Bologna.' };
    draft.channels.linkedin.selected = true;
    draft.channels.instagram.selected = true;
    draft.themes = createThemes(['Il pane di ogni giorno', 'Dietro il banco']);

    const brand = json<{ id: string; themes: { id: string }[] }>(await call(tokenA, 'POST', '/api/brands', draft), 201);
    brandId = brand.id;
    const workspace = json<{ brands: unknown[]; activeBrandId: string }>(await call(tokenA, 'GET', '/api/workspace'), 200);
    expect(workspace.activeBrandId).toBe(brandId);
    expect(workspace.brands).toHaveLength(1);

    const updated = json<{ positioning: { postsPerWeek: number } }>(
      await call(tokenA, 'PUT', `/api/brands/${brandId}/sections/positioning`, {
        value: { goals: ['Vendere di più'], audiences: ['Famiglie'], postsPerWeek: 2 },
      }),
      200,
    );
    expect(updated.positioning.postsPerWeek).toBe(2);
    expect((await call(tokenA, 'PUT', `/api/brands/${brandId}/sections/positioning`, { value: { goals: 3 } })).statusCode).toBe(400);

    // L'altro account non vede il brand e non può toccarlo.
    expect(json(await call(tokenB, 'GET', '/api/workspace'), 200)).toEqual({ brands: [], activeBrandId: null });
    expect((await call(tokenB, 'PUT', `/api/brands/${brandId}/sections/identity`, { value: draft.identity })).statusCode).toBe(404);
    expect((await call(tokenB, 'GET', `/api/brands/${brandId}/ideas`)).statusCode).toBe(404);
    expect((await call(tokenB, 'PUT', '/api/workspace/active-brand', { brandId })).statusCode).toBe(404);
  });

  it('idee, piano e contenuti seguono il flusso dell’app', async () => {
    const ideas = json<{ id: string; status: string; channels: string[] }[]>(
      await call(tokenA, 'POST', `/api/brands/${brandId}/ideas/generate`, { count: 2 }),
      200,
    );
    expect(ideas.map((idea) => idea.status)).toEqual(['new', 'new']);
    expect(ideas[1].channels).toEqual(['instagram']);
    const saved = json<{ status: string; decidedAt: string }>(
      await call(tokenA, 'PATCH', `/api/ideas/${ideas[0].id}`, { status: 'saved' }),
      200,
    );
    expect(saved.status).toBe('saved');
    expect(saved.decidedAt).toBeTruthy();
    expect((await call(tokenB, 'PATCH', `/api/ideas/${ideas[0].id}`, { status: 'discarded' })).statusCode).toBe(404);

    const proposal = json<{ date: string }[]>(
      await call(tokenA, 'POST', `/api/brands/${brandId}/plan/proposal`, {
        startDate: '2030-01-07',
        weeks: 1,
        perWeek: 2,
        channels: ['linkedin'],
      }),
      200,
    );
    expect(proposal.length).toBeGreaterThan(0);
    const slots = json<{ id: string; status: string; origin: string }[]>(
      await call(tokenA, 'POST', `/api/brands/${brandId}/plan/confirm`, { drafts: proposal }),
      201,
    );
    expect(slots.every((slot) => slot.origin === 'session')).toBe(true);

    const placed = json<{ id: string; ideaId: string; status: string }>(
      await call(tokenA, 'POST', `/api/brands/${brandId}/plan/ideas`, { ideaId: ideas[0].id }),
      200,
    );
    expect(placed.ideaId).toBe(ideas[0].id);
    expect(placed.status).toBe('toPrepare');

    const prepared = json<{ content: { id: string; revision: number; variants: { hashtags: string[] }[] }; slot: { status: string } }>(
      await call(tokenA, 'POST', `/api/slots/${placed.id}/content/prepare`, {}),
      200,
    );
    expect(prepared.slot.status).toBe('toApprove');
    expect(prepared.content.variants[0].hashtags).toEqual(['#pane', '#lievitomadre']);
    const again = json<{ content: { id: string; revision: number } }>(
      await call(tokenA, 'POST', `/api/slots/${placed.id}/content/prepare`, { format: 'carousel' }),
      200,
    );
    expect(again.content.id).toBe(prepared.content.id);
    expect(again.content.revision).toBe(1);

    const contentId = prepared.content.id;
    const rewritten = json<{ variants: { text: string }[] }>(
      await call(tokenA, 'POST', `/api/contents/${contentId}/variants/linkedin/rewrite`, { instruction: 'Più corto' }),
      200,
    );
    expect(rewritten.variants.find(Boolean)?.text).toBeDefined();
    // La bozza propone una card; crearla è un lavoro in coda, che qui si esegue a mano.
    const creating = json<Content>(await call(tokenA, 'POST', `/api/contents/${contentId}/visual/create`), 200);
    expect(creating.visual.design?.status).toBe('creating');
    await app.visualRunner.runPending();
    expect(json<{ slot: { status: string } }>(await call(tokenA, 'POST', `/api/contents/${contentId}/approve`), 200).slot.status).toBe('scheduled');
    expect(json<{ slot: { status: string } }>(await call(tokenA, 'POST', `/api/contents/${contentId}/reopen`), 200).slot.status).toBe('toApprove');
    expect((await call(tokenB, 'GET', `/api/contents/${contentId}`)).statusCode).toBe(404);

    // Cambiare idea all'uscita invalida la bozza nata dall'idea.
    const changed = json<{ status: string }>(await call(tokenA, 'PATCH', `/api/slots/${placed.id}`, { ideaId: null }), 200);
    expect(changed.status).toBe('empty');
    expect(json(await call(tokenA, 'GET', `/api/slots/${placed.id}/content`), 200)).toEqual({ content: null });

    const direct = json<{ id: string; slotId: null; title: string }>(
      await call(tokenA, 'POST', `/api/brands/${brandId}/contents`, {
        source: { kind: 'prompt', text: 'Abbiamo cambiato farina: racconto perché' },
        channels: ['linkedin', 'instagram'],
        format: 'post',
      }),
      201,
    );
    expect(direct.title).toBe('Il pane che non ha fretta');
    expect(json<unknown[]>(await call(tokenA, 'GET', `/api/brands/${brandId}/contents/drafts`), 200)).toHaveLength(1);
    // Instagram non pubblica senza immagine: prima il visivo.
    json(await call(tokenA, 'POST', `/api/contents/${direct.id}/visual/create`), 200);
    await app.visualRunner.runPending();
    const scheduled = json<{ content: { slotId: string; status: string }; slot: { id: string; status: string; contentTitle: string } }>(
      await call(tokenA, 'POST', `/api/contents/${direct.id}/schedule`, { date: '2030-01-10', time: '18:30', publishNow: true }),
      200,
    );
    expect(scheduled.slot.status).toBe('published');
    expect(scheduled.slot.contentTitle).toBe(direct.title);
    expect(scheduled.content.status).toBe('approved');

    // Togliere l'uscita riporta il contenuto diretto tra le bozze.
    expect((await call(tokenA, 'DELETE', `/api/slots/${scheduled.slot.id}`)).statusCode).toBe(204);
    const back = json<{ slotId: string | null; status: string }>(await call(tokenA, 'GET', `/api/contents/${direct.id}`), 200);
    expect(back).toMatchObject({ slotId: null, status: 'draft' });

    expect(fakeAi.tasks).toEqual(['ideas', 'content', 'content', 'rewrite', 'content']);
  });

  it('il visivo: modifiche senza AI, creazione in coda, foto caricata e indirizzi firmati', async () => {
    const content = json<Content>(
      await call(tokenA, 'POST', `/api/brands/${brandId}/contents`, {
        source: { kind: 'prompt', text: 'Il forno di notte' },
        channels: ['linkedin', 'instagram'],
        format: 'post',
      }),
      201,
    );
    const url = `/api/contents/${content.id}`;
    const proposed = content.visual.design!;
    expect(proposed).toMatchObject({ status: 'proposed', kind: 'infographic' });
    expect(proposed.pages[0].templateId).toBe('statement');

    // Instagram non pubblica senza immagine.
    const when = { date: '2030-02-01', time: '09:00' };
    expect(json<{ code: string }>(await call(tokenA, 'POST', `${url}/schedule`, when), 409).code).toBe('VISUAL_MISSING');

    // Mista con soggetto scontornato: cambia senza AI.
    const edit = {
      kind: 'mixed',
      pages: [{ templateId: 'cutout-statement', text: proposed.pages[0].text }],
      description: 'Una pagnotta intera',
      source: 'generated',
      reopen: false,
    };
    const edited = json<Content>(await call(tokenA, 'PUT', `${url}/visual`, edit), 200);
    expect(edited.visual.design).toMatchObject({ status: 'proposed', kind: 'mixed' });
    expect(edited.visual.design?.pages[0].templateId).toBe('cutout-statement');

    const creating = json<Content>(await call(tokenA, 'POST', `${url}/visual/create`), 200);
    expect(creating.visual.design).toMatchObject({ status: 'creating', step: 'image' });
    expect(json<{ code: string }>(await call(tokenA, 'PUT', `${url}/visual`, edit), 409).code).toBe('VISUAL_BUSY');
    expect((await call(tokenB, 'POST', `${url}/visual/create`)).statusCode).toBe(404);

    const before = { ...mediaCalls };
    // Due lavori: la creazione (foto e scontorno) e poi i PNG da scaricare.
    expect(await app.visualRunner.runPending()).toBe(2);
    expect(mediaCalls).toEqual({ images: before.images + 1, cutout: before.cutout + 1, render: before.render + 1 });

    const ready = json<Content>(await call(tokenA, 'GET', url), 200).visual.design!;
    expect(ready.status).toBe('ready');
    expect(ready.image.photo?.url).toMatch(/^https:\/\/firmato\.test\//);
    expect(ready.image.cutout?.url).toMatch(/^https:\/\/firmato\.test\//);
    // LinkedIn e Instagram vogliono tutti e due il 4:5: un PNG solo.
    expect(ready.renders).toHaveLength(1);
    expect(ready.renders[0].file.url).toMatch(/^https:\/\/firmato\.test\//);

    // Una foto dell'utente al posto di quella generata: lo scontorno si rifà creando.
    const dataUri = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`;
    const uploaded = json<Content>(await call(tokenA, 'POST', `${url}/visual/photo`, { dataUri }), 200).visual.design!;
    expect(uploaded).toMatchObject({ status: 'proposed', image: { source: 'upload', cutout: null } });
    expect((await call(tokenA, 'POST', `${url}/visual/photo`, { dataUri: 'data:text/plain;base64,aGVsbG8=' })).statusCode).toBe(400);

    // Senza be-render il visivo è pronto lo stesso: l'app disegna la card, mancano solo i PNG da scaricare.
    renderer.down = true;
    json(await call(tokenA, 'POST', `${url}/visual/create`), 200);
    expect(await app.visualRunner.runPending()).toBe(2);
    renderer.down = false;
    expect(mediaCalls.images).toBe(before.images + 1);
    const withoutPng = json<Content>(await call(tokenA, 'GET', url), 200).visual.design!;
    expect(withoutPng).toMatchObject({ status: 'ready', error: null, renders: [] });
    const scheduled = json<{ content: { status: string } }>(await call(tokenA, 'POST', `${url}/schedule`, when), 200);
    expect(scheduled.content.status).toBe('approved');
  });

  it('carica e azzera il profilo di esempio', async () => {
    const demo = json<{ id: string }>(await call(tokenB, 'POST', '/api/demo'), 201);
    const slots = json<{ status: string }[]>(await call(tokenB, 'GET', `/api/brands/${demo.id}/slots`), 200);
    expect(slots).toHaveLength(7);
    const contents = json<{ status: string }[]>(await call(tokenB, 'GET', `/api/brands/${demo.id}/contents`), 200);
    expect(contents.length).toBe(5);
    expect(json<unknown[]>(await call(tokenB, 'GET', `/api/brands/${demo.id}/ideas`), 200)).toHaveLength(12);

    expect((await call(tokenB, 'DELETE', '/api/demo')).statusCode).toBe(204);
    expect(json(await call(tokenB, 'GET', '/api/workspace'), 200)).toEqual({ brands: [], activeBrandId: null });
    // L'azzeramento di B non tocca A.
    expect(json<{ brands: unknown[] }>(await call(tokenA, 'GET', '/api/workspace'), 200).brands).toHaveLength(1);
  });
});
