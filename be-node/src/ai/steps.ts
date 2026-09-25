import { pageStep, searchStep, THINKING_STEP, type StepLog } from '@/services/ai-steps';

import type { ToolEvent } from './engine';

/**
 * Traduce gli strumenti che la sessione usa nei passi che l'utente vede: ogni pagina aperta o ricerca fatta
 * è un passo, e quando nessuno strumento lavora c'è un passo di passaggio in fondo («Ragiono su quello che ho
 * letto») che sparisce appena ne parte un altro. Il primo passo di passaggio si apre subito.
 */
export function stepsFromTools(log: StepLog, thinking: { first: string; next: string }): (event: ToolEvent) => void {
  const running = new Set<string>();
  log.start(THINKING_STEP, thinking.first);
  return (event) => {
    if (event.type === 'start') {
      log.drop(THINKING_STEP);
      running.add(event.id);
      const step = toolStep(event.tool, event.input);
      log.start(event.id, step.label, step.detail);
      return;
    }
    if (!running.delete(event.id)) return;
    log.finish(event.id, { failed: !event.ok });
    if (running.size === 0) log.start(THINKING_STEP, thinking.next);
  };
}

const MAX_DETAIL = 60;

/** L'ultimo pezzo di un percorso: all'utente interessa il nome del file, non dove sta. */
function fileName(value: unknown): string {
  const path = String(value ?? '').replace(/[\\/]+$/, '');
  return path.split(/[\\/]/).pop() || 'un file';
}

function shorten(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_DETAIL ? `${clean.slice(0, MAX_DETAIL - 1).trimEnd()}…` : clean;
}

/**
 * Le parole di ogni strumento. Oltre alle pagine e alle ricerche ci sono gli strumenti nativi di Claude Code,
 * che usa il motore di `be-agent`: legge il profilo del brand dalla sua cartella, guarda i visivi
 * dell'onboarding, scrive e prova i template.
 */
function toolStep(tool: string, input: Record<string, unknown>): { label: string; detail?: string } {
  switch (tool) {
    case 'WebFetch':
      return pageStep(String(input.url ?? ''));
    case 'WebSearch':
      return searchStep(String(input.query ?? ''));
    case 'Read':
      return { label: `Guardo «${fileName(input.file_path)}»` };
    case 'Glob':
      return { label: 'Cerco tra i file', detail: shorten(String(input.pattern ?? '')) };
    case 'Grep':
      return { label: `Cerco «${shorten(String(input.pattern ?? ''))}» nei file` };
    case 'Write':
      return { label: `Scrivo «${fileName(input.file_path)}»` };
    case 'Edit':
    case 'NotebookEdit':
      return { label: `Correggo «${fileName(input.file_path ?? input.notebook_path)}»` };
    case 'Bash':
      return { label: 'Eseguo un comando', detail: shorten(String(input.description ?? input.command ?? '')) };
    case 'Task':
      return { label: 'Metto al lavoro un aiutante', detail: shorten(String(input.description ?? '')) };
    case 'TodoWrite':
      return { label: 'Rivedo cosa mi manca' };
    // Gli strumenti del visivo (server MCP «visivo» di be-agent): sono i passi che l'utente aspetta davvero.
    case 'mcp__visivo__genera_foto':
      return { label: 'Preparo la foto', detail: shorten(String(input.descrizione ?? '')) };
    case 'mcp__visivo__componi_card':
      return { label: 'Compongo la card e me la guardo' };
    // Higgsfield (server MCP remoto di be-agent): quelli che l'utente aspetta davvero.
    case 'mcp__higgsfield__models_explore':
      return { label: 'Scelgo il modello giusto' };
    case 'mcp__higgsfield__media_import_url':
      return { label: 'Passo l’immagine al generatore' };
    case 'mcp__higgsfield__generate_image':
    case 'mcp__higgsfield__generate_image_batch':
      return { label: 'Preparo l’immagine', detail: shorten(String(input.prompt ?? '')) };
    case 'mcp__higgsfield__generate_video':
    case 'mcp__higgsfield__generate_video_batch':
      return { label: 'Giro la clip', detail: shorten(String(input.prompt ?? '')) };
    case 'mcp__higgsfield__jobs_wait':
      return { label: 'Aspetto che sia pronta: può volerci qualche minuto' };
    // La sala di montaggio (server MCP «montaggio» di be-agent).
    case 'mcp__montaggio__guarda':
      return { label: `Guardo «${fileName(input.file)}»`, detail: shorten(`ai secondi ${String(input.secondi ?? '')}`) };
    case 'mcp__montaggio__consegna':
      return { label: 'Consegno il video', detail: shorten(String(input.cosa ?? '')) };
    default:
      return { label: 'Lavoro un momento' };
  }
}
