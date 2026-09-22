import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { currentVoiceCard, type Brand, type ChannelId } from '@/domain/brand';
import { channelName, imageStyleLabel } from '@/domain/catalog';
import type { MediaFile } from '@/domain/visual';

import { MEDIA_EXTENSIONS } from '../../be-node/src/visual/files';
import type { MediaStorage } from '../../be-node/src/media/storage';

/**
 * La cartella di lavoro di un brand: è tutto il contesto che l'agente riceve.
 *
 * Invece di gonfiare il prompt col profilo, qui il profilo diventa *file*, e l'agente se li legge
 * con i suoi strumenti come farebbe in un repo: `BRAND.md` per chi è il brand, `linea/` per i
 * template di card scritti nell'onboarding, `esempi/` per le card che ne sono uscite. Così quando
 * pensa al visivo di un contenuto ha davanti gli stessi visivi che l'utente ha approvato.
 *
 * Si rifà da zero quando il brand cambia (`updatedAt`), così non restano dentro pezzi di un
 * profilo vecchio.
 */

export interface Workspace {
  dir: string;
  /** Cosa c'è dentro, per il messaggio che apre la sessione. */
  summary: string;
}

const built = new Map<string, { updatedAt: string; workspace: Workspace }>();

export async function prepareWorkspace(root: string, brand: Brand, storage: MediaStorage): Promise<Workspace> {
  const known = built.get(brand.id);
  if (known?.updatedAt === brand.updatedAt) return known.workspace;

  const dir = join(root, brand.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const made: string[] = ['`BRAND.md`, il profilo del brand'];
  await writeFile(join(dir, 'BRAND.md'), brandMarkdown(brand), 'utf8');
  await writeFile(join(dir, 'CLAUDE.md'), HOUSE_RULES, 'utf8');

  const templates = brand.visual.line?.templates ?? [];
  if (templates.length > 0) {
    await mkdir(join(dir, 'linea'), { recursive: true });
    for (const template of templates) {
      await writeFile(join(dir, 'linea', `${template.id}.html`), template.html, 'utf8');
      await writeFile(join(dir, 'linea', `${template.id}.css`), template.css, 'utf8');
    }
    made.push(`\`linea/\`, i ${templates.length} template di card del brand in HTML e CSS`);
  }

  const examples = brand.visual.examples ?? [];
  const cards = await saveAll(
    storage,
    join(dir, 'esempi'),
    examples.map((example, index) => ({ file: example.file, name: `${index + 1}-${example.channel}` })),
  );
  if (cards > 0) made.push(`\`esempi/\`, le ${cards} card d'esempio approvate nell'onboarding`);

  const photos = await saveAll(
    storage,
    join(dir, 'esempi', 'foto'),
    examples.map((example, index) => ({ file: example.photo ?? null, name: `${index + 1}-${example.channel}` })),
  );
  if (photos > 0) made.push(`\`esempi/foto/\`, le foto di quelle card`);

  const references = await saveAll(
    storage,
    join(dir, 'riferimenti'),
    (brand.visual.references ?? []).map((file, index) => ({ file, name: `${index + 1}` })),
  );
  if (references > 0) made.push(`\`riferimenti/\`, le immagini da cui è nata la linea grafica`);

  const workspace: Workspace = {
    dir,
    summary: `Sei nella cartella del brand «${brand.identity.name}». Contiene:\n${made.map((line) => `- ${line}`).join('\n')}`,
  };
  built.set(brand.id, { updatedAt: brand.updatedAt, workspace });
  return workspace;
}

/** Scarica dallo Storage quello che c'è; un file che non si scarica si salta senza far fallire tutto. */
async function saveAll(
  storage: MediaStorage,
  dir: string,
  items: readonly { file: MediaFile | null | undefined; name: string }[],
): Promise<number> {
  const wanted = items.filter((item) => item.file?.path);
  if (wanted.length === 0) return 0;
  await mkdir(dir, { recursive: true });
  const saved = await Promise.all(
    wanted.map(async ({ file, name }) => {
      try {
        const stored = await storage.download(file!.path!);
        const extension = MEDIA_EXTENSIONS[stored.contentType] ?? 'bin';
        await writeFile(join(dir, `${name}.${extension}`), stored.bytes);
        return 1;
      } catch {
        return 0;
      }
    }),
  );
  return saved.reduce((total: number, one) => total + one, 0);
}

/** Il `CLAUDE.md` della cartella: le poche cose che valgono sempre, qualunque sia il compito. */
const HOUSE_RULES = `# Come si lavora qui

Questa cartella è il profilo di un brand. Non è un progetto di codice: non ci sono test da far passare
né build da lanciare.

- \`BRAND.md\` dice chi è il brand, come parla e come si vede. Leggilo sempre per primo.
- \`linea/\` sono i template di card scritti per questo brand: HTML e CSS veri, con i segnaposto
  (\`{{headline}}\`, \`{{photo}}\`…). Quando pensi a un visivo, parti da qui.
- \`esempi/\` sono le card già approvate dall'utente. Guardale: sono il metro del risultato giusto.
- \`riferimenti/\` sono le immagini da cui è nata la linea.

Puoi scrivere file di lavoro qui dentro se ti servono. Quello che conta è la risposta finale nella
forma richiesta: i file che lasci non vengono letti da nessuno.
`;

function brandMarkdown(brand: Brand): string {
  const { identity, positioning, channels, themes, voice, visual, references } = brand;
  const lines: string[] = [`# ${identity.name}`, ''];

  const who =
    identity.kind === 'person'
      ? [identity.role, identity.company].filter(Boolean).join(', ')
      : identity.sector;
  lines.push('## Chi è', '');
  lines.push(`- Tipo: ${{ person: 'una persona', company: 'un’azienda', client: 'un cliente' }[identity.kind]}`);
  if (who) lines.push(`- ${identity.kind === 'person' ? 'Ruolo' : 'Settore'}: ${who}`);
  if (identity.site) lines.push(`- Sito: ${identity.site}`);
  if (identity.pitch) lines.push(`- In una frase: ${identity.pitch}`);
  lines.push('');

  lines.push('## Perché pubblica', '');
  for (const goal of positioning.goals) lines.push(`- ${goal}`);
  lines.push('', '### Chi vuole raggiungere', '');
  for (const audience of positioning.audiences) lines.push(`- ${audience}`);
  lines.push('', `Esce ${positioning.postsPerWeek} volte a settimana.`, '');

  const active = (Object.keys(channels) as ChannelId[]).filter((id) => channels[id].selected);
  lines.push('## Canali', '');
  lines.push(active.length > 0 ? active.map((id) => channelName(id)).join(', ') : 'Nessuno scelto.');
  lines.push('');

  if (themes.length > 0) {
    lines.push('## Temi', '');
    for (const theme of themes) {
      const level = { often: 'spesso', sometimes: 'ogni tanto', rarely: 'di rado' }[theme.level ?? 'sometimes'];
      lines.push(`- **${theme.name}** — ${level}, circa il ${theme.weight}% di quello che esce`);
    }
    lines.push('');
  }

  const card = currentVoiceCard(voice);
  if (card) {
    lines.push('## Come parla', '', `Scheda voce, da ${card.sourceLabel}.`, '');
    lines.push(`- **Registro**: ${card.register}`);
    lines.push(`- **Ritmo**: ${card.rhythm}`);
    lines.push(`- **Lessico**: ${card.lexicon}`);
    lines.push(`- **Da evitare**: ${card.avoid}`);
    lines.push('', 'Questa scheda si segue alla lettera: è la voce che l’utente ha riconosciuto come sua.', '');
  }

  lines.push('## Come si vede', '');
  lines.push(`- Palette: ${visual.palette.colors.join(', ')} (principale, secondario, accento, sfondo)`);
  lines.push(`- Stile delle immagini: ${imageStyleLabel(visual.imageStyle)}`);
  if (visual.direction?.summary) lines.push(`- In una frase: ${visual.direction.summary}`);
  if (visual.direction?.photoStyle) lines.push(`- Stile delle foto, per il modello d’immagine: \`${visual.direction.photoStyle}\``);
  if (visual.notes) lines.push(`- Indicazioni dell’utente: ${visual.notes}`);
  lines.push('');

  const line = visual.line;
  if (line) {
    lines.push('### La linea grafica', '');
    lines.push(`- Fondo di tutte le card: ${line.ground}`);
    lines.push(`- Accento: ${line.accent}`);
    if (line.fonts?.length) lines.push(`- Caratteri: ${line.fonts.map((font) => font.family).join(', ')}`);
    if (line.signature) lines.push(`- Firma in basso a sinistra: «${line.signature}»`);
    if (line.address) lines.push(`- In basso a destra: ${line.address}`);
    if (line.band?.description) lines.push(`- Fascia fotografica: ${line.band.description}`);
    if (line.rubrics?.length) {
      lines.push('', '#### Rubriche', '');
      for (const rubric of line.rubrics) lines.push(`- **${rubric.name}** — ${rubric.about}`);
    }
    if (line.copy?.length) {
      lines.push('', '#### Regole dei testi sulle card', '');
      for (const rule of line.copy) lines.push(`- ${rule}`);
    }
    lines.push('');
    if (line.templates?.length) {
      lines.push('#### Template disponibili', '', 'I file stanno in `linea/`.', '');
      for (const template of line.templates) {
        const fields = template.fields.join(', ') || 'nessun testo';
        lines.push(`- \`${template.id}\` (${template.name}) — ${template.use}. Testi: ${fields}.${template.photo ? ' Vuole una foto.' : ''}`);
      }
      lines.push('');
    }
  }

  if (references.profiles.length > 0 || references.milestones.length > 0) {
    lines.push('## Riferimenti', '');
    for (const profile of references.profiles) lines.push(`- Profilo seguito: ${profile}`);
    for (const milestone of references.milestones) lines.push(`- ${milestone.date}: ${milestone.label}`);
    lines.push('');
  }

  return lines.join('\n');
}
