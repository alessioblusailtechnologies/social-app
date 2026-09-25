import { execFile } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createSdkMcpServer, tool, type HookCallback } from '@anthropic-ai/claude-agent-sdk';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import type { MediaStorage } from '../../be-node/src/media/storage';
import { mediaPath } from '../../be-node/src/visual/files';

/**
 * La sala di montaggio dell'agente.
 *
 * Le clip le gira Higgsfield e arrivano nella cartella di lavoro già scaricate; da lì in poi
 * l'agente fa quello che farebbe chiunque col proprio Claude aperto: ffmpeg da riga di comando,
 * nella sua cartella, con i suoi file. Non c'è un motore di montaggio nostro da imparare.
 *
 * Quello che gli diamo sono le due cose che da solo non può avere: **vedere** quello che ha montato,
 * e **consegnarlo**. La prima è lo stesso giro di `componi_card` — gli si restituisce l'immagine, non
 * un «fatto», così il sottotitolo che esce dal bordo lo vede lui e lo corregge. La seconda è il
 * confine: nella libreria del brand ci scriviamo noi.
 */

const run = promisify(execFile);

/**
 * ffmpeg non va installato: Remotion se lo porta dietro per il suo renderer, e sta già nei
 * `node_modules` di `be-render`. Stessa macchina, stesso Docker, nessuna dipendenza nuova.
 */
export function ffmpegDir(): string | null {
  const modules = fileURLToPath(new URL('../../be-render/node_modules/@remotion/', import.meta.url));
  if (!existsSync(modules)) return null;
  for (const name of readdirSync(modules)) {
    if (!name.startsWith('compositor-')) continue;
    const dir = join(modules, name);
    if (existsSync(join(dir, 'ffmpeg.exe')) || existsSync(join(dir, 'ffmpeg'))) return dir;
  }
  return null;
}

/**
 * L'impalcatura di Remotion nella cartella di lavoro: un progetto vero, con una composizione che
 * l'agente riscrive come riscriverebbe un file qualunque. Il montaggio non è un formato nostro da
 * imparare — è React, e Remotion è già il nostro renderer.
 *
 * Le clip arrivano in `media/`, che è anche la cartella pubblica del progetto: `staticFile('x.mp4')`
 * dentro la composizione prende la clip che Higgsfield ha appena girato.
 */
export async function prepareStudio(dir: string, where = ''): Promise<string> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(join(dir, 'remotion'), { recursive: true });
  await mkdir(join(dir, 'media'), { recursive: true });

  const files: Record<string, string> = {
    'remotion/index.ts': `import { registerRoot } from 'remotion';\nimport { Root } from './Root';\n\nregisterRoot(Root);\n`,
    'remotion/Root.tsx': `import { Composition } from 'remotion';\nimport { Montaggio } from './Montaggio';\n\n/** La durata va tenuta in accordo con quella vera del montaggio: fotogrammi = secondi × fps. */\nexport const Root = () => (\n  <Composition id="montaggio" component={Montaggio} durationInFrames={300} fps={30} width={1080} height={1920} />\n);\n`,
    'remotion/Montaggio.tsx': MONTAGGIO_TSX,
    'MONTAGGIO.md': montaggioMd(dir),
  };
  for (const [name, content] of Object.entries(files)) {
    // `MONTAGGIO.md` è roba nostra e si rinfresca; il resto è lavoro dell'agente, e un montaggio
    // già scritto non si sovrascrive — semmai è il punto da cui riparte.
    if (name !== 'MONTAGGIO.md' && existsSync(join(dir, name))) continue;
    await writeFile(join(dir, name), content, 'utf8');
  }
  return `\`${where}remotion/\`, il progetto con cui si monta il video, e \`${where}MONTAGGIO.md\` che dice come si rende`;
}

const MONTAGGIO_TSX = `import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';

/**
 * Il montaggio. Questo è un punto di partenza da riscrivere: una scena dopo l'altra, e sopra il
 * testo del brand. Il testo non sta mai dentro la clip generata — sta qui, dove si corregge.
 */

const Titolo = ({ testo }: { testo: string }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [6, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rise = interpolate(frame, [6, 24], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 90 }}>
      <div style={{ opacity, transform: \`translateY(\${rise}px)\`, color: 'white', fontSize: 92, fontWeight: 800, lineHeight: 1.05, textShadow: '0 6px 30px rgba(0,0,0,.55)' }}>
        {testo}
      </div>
    </AbsoluteFill>
  );
};

const scene = [
  // { file: 'la-clip.mp4', durata: 150, testo: 'Quello che si legge' },
];

export const Montaggio = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {scene.map((s) => {
        const start = from;
        from += s.durata;
        return (
          <Sequence key={s.file} from={start} durationInFrames={s.durata}>
            <OffthreadVideo src={staticFile(s.file)} />
            <Titolo testo={s.testo} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
`;

function montaggioMd(dir: string): string {
  const media = join(dir, 'media').replace(/\\/g, '/');
  return `# Come si monta

Le clip girate finiscono in \`media/\`, che è la cartella pubblica del progetto Remotion: dentro la
composizione si chiamano con \`staticFile('nome-del-file.mp4')\`.

Il montaggio si scrive in \`remotion/Montaggio.tsx\` e si rende così:

\`\`\`
npx remotion render remotion/index.ts montaggio out/video.mp4 --codec=h264 --public-dir="${media}"
\`\`\`

La cartella pubblica va indicata **assoluta**, come qui sopra, o non trova le clip.
In \`remotion/Root.tsx\` la durata è in fotogrammi: secondi × 30.

Poi \`guarda\` per vedere com'è venuto — sui momenti che contano, non a caso — e quando va bene
\`consegna\` il file. Quello che resta solo qui dentro, domani non c'è più.

ffmpeg è nel PATH, ma è una build ridotta: sa concatenare, tagliare e ricodificare, **non** sa
sovrapporre (\`overlay\`, \`drawtext\`, \`color\` non ci sono). Tutto quello che si sovrappone si fa
nella composizione.
`;
}

export interface VideoToolsContext {
  accountId: string;
  brandId: string;
  /** La cartella di lavoro: fuori di lì l'agente non legge e non consegna. */
  dir: string;
  storage: MediaStorage;
  log: FastifyBaseLogger;
  /** I file consegnati, per percorso nella libreria: li rilegge chi salva il contenuto. */
  delivered: Map<string, string>;
}

const MAX_BYTES = 256 * 1024 * 1024;

const TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  png: 'image/png',
  jpg: 'image/jpeg',
};

export function videoTools(context: VideoToolsContext) {
  const ffmpeg = ffmpegDir();

  return createSdkMcpServer({
    name: 'montaggio',
    version: '0.1.0',
    tools: [
      tool(
        'guarda',
        'Ti restituisce dei fotogrammi di un video della cartella di lavoro, così lo vedi davvero prima di consegnarlo. Usalo sul montaggio finito e anche sulle singole clip: il testo ci sta tutto? lo stacco cade dove volevi? la clip mostra quello che avevi chiesto? Se qualcosa non va, rifai e riguarda.',
        {
          file: z.string().describe('Il file nella cartella di lavoro, es. «montaggio.mp4».'),
          secondi: z
            .array(z.number().min(0))
            .min(1)
            .max(6)
            .describe('A che secondo prendere i fotogrammi. Scegli i momenti che contano, non a caso.'),
        },
        async ({ file, secondi }) => {
          if (!ffmpeg) return problem('Su questa macchina non trovo ffmpeg: il montaggio non si può fare.');
          try {
            const path = inside(context.dir, file);
            const shots = [];
            for (const second of secondi) {
              const { stdout } = await run(join(ffmpeg, 'ffmpeg'), ['-ss', String(second), '-i', path, '-frames:v', '1', '-f', 'image2', '-c:v', 'png', '-'], {
                encoding: 'buffer',
                maxBuffer: 32 * 1024 * 1024,
              });
              if (stdout.byteLength > 0) {
                shots.push({ second, data: stdout.toString('base64') });
              }
            }
            if (shots.length === 0) throw new Error('nessun fotogramma: il file è vuoto o più corto di così');
            return {
              content: [
                { type: 'text' as const, text: `${file}: ecco i fotogrammi ai secondi ${shots.map((shot) => shot.second).join(', ')}.` },
                ...shots.map((shot) => ({ type: 'image' as const, data: shot.data, mimeType: 'image/png' })),
              ],
            };
          } catch (error) {
            return problem(`Non sono riuscito a guardare ${file}: ${message(error)}`);
          }
        },
      ),

      tool(
        'consegna',
        'Mette un file della cartella di lavoro nella libreria del brand e ti torna il percorso da indicare nella risposta. Consegna il montaggio finito e le clip delle singole scene: quello che resta solo nella cartella di lavoro, domani non c’è più.',
        {
          file: z.string().describe('Il file nella cartella di lavoro.'),
          cosa: z.string().describe('Cos’è, in poche parole: «il montaggio finito», «la scena 2».'),
        },
        async ({ file, cosa }) => {
          try {
            const path = inside(context.dir, file);
            const extension = file.split('.').pop()?.toLowerCase() ?? '';
            const type = TYPES[extension];
            if (!type) throw new Error(`non so cos’è un file .${extension}`);

            const bytes = await readFile(path);
            if (bytes.byteLength > MAX_BYTES) throw new Error(`pesa ${Math.round(bytes.byteLength / 1024 / 1024)} MB, troppo`);

            const stored = mediaPath(context.accountId, context.brandId, type);
            await context.storage.upload(stored, bytes, type);
            context.delivered.set(stored, cosa);
            context.log.info({ file, path: stored, mb: Math.round(bytes.byteLength / 1024 / 1024) }, 'file consegnato nella libreria');
            return { content: [{ type: 'text' as const, text: `Consegnato. Nella risposta indica questo percorso:\n${stored}` }] };
          } catch (error) {
            return problem(`Non sono riuscito a consegnare ${file}: ${message(error)}`);
          }
        },
      ),
    ],
  });
}

/**
 * Non si esce senza aver consegnato.
 *
 * Girare una clip richiede minuti, e un agente abituato a parlare con qualcuno se la cava dicendo
 * «ricontrollo tra due minuti» — poi chiude la sessione, e non c'è nessuno che lo richiami: le clip
 * restano pagate e il video non esiste. Qui la chiusura viene rifiutata finché non è arrivato
 * qualcosa nella libreria. Il tetto dei tentativi evita di girare a vuoto se è bloccato davvero;
 * oltre, comanda `maxTurns`.
 */
export function deliverBeforeLeaving(context: { delivered: Map<string, string>; log: FastifyBaseLogger }, max = 3): HookCallback {
  let blocked = 0;
  return async (input) => {
    if (input.hook_event_name !== 'Stop' || context.delivered.size > 0 || blocked >= max) return {};
    blocked += 1;
    context.log.info({ tentativo: blocked }, 'uscita rimandata: non è stato consegnato niente');
    return {
      decision: 'block',
      reason:
        'Non hai ancora consegnato niente, e questa sessione non ha nessuno dall’altra parte: se te ne vai adesso, ' +
        'le clip restano pagate e il video non esiste. Se i lavori non sono finiti aspettali con jobs_wait, che tiene ' +
        'aperta la chiamata; poi monta, guarda com’è venuto e consegna.',
    };
  };
}

/** Dentro la cartella di lavoro e basta: un percorso che esce di lì non si apre. */
function inside(dir: string, file: string): string {
  const path = isAbsolute(file) ? resolve(file) : resolve(dir, file);
  const root = resolve(dir);
  if (path !== root && !path.startsWith(root + sep)) throw new Error('è fuori dalla cartella di lavoro');
  return path;
}

function problem(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
