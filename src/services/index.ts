import { API_URL } from '@/config';

import { createHttpServices } from './http';
import { createAuthService, type AuthService } from './http/auth';
import { createApiClient } from './http/client';
import { createMockServices } from './mock';
import type { Services } from './types';

const api = API_URL ? createApiClient(API_URL) : null;

/** Punto di scambio: con `EXPO_PUBLIC_API_URL` l'app parla con il backend, altrimenti resta sul mock. */
export const services: Services = api ? createHttpServices(api) : createMockServices();

/** Accesso e registrazione: esistono solo quando c'è il backend. */
export const auth: AuthService | null = api ? createAuthService(api) : null;

export { ApiError, apiErrorMessage } from './http/client';
export type { Account } from './http/session';
export type * from './types';
