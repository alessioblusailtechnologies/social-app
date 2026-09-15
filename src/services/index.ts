import { createMockServices } from './mock';
import type { Services } from './types';

/** Punto di scambio: qui entreranno le implementazioni che parlano con il backend. */
export const services: Services = createMockServices();

export type * from './types';
