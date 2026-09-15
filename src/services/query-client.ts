import { QueryClient } from '@tanstack/react-query';

/**
 * La cache delle query dell'app. Sta fuori dal layout perché la sessione la svuota
 * all'accesso e all'uscita: i dati di un account non devono comparire in un altro.
 *
 * I dati cambiano solo con le mutation, che aggiornano la cache da sole.
 */
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
