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
      const step =
        event.tool === 'WebFetch' ? pageStep(String(event.input.url ?? '')) : searchStep(String(event.input.query ?? ''));
      log.start(event.id, step.label, step.detail);
      return;
    }
    if (!running.delete(event.id)) return;
    log.finish(event.id, { failed: !event.ok });
    if (running.size === 0) log.start(THINKING_STEP, thinking.next);
  };
}
