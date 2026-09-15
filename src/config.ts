/** Nome provvisorio del prodotto: cambiarlo qui e in app.json. */
export const APP_NAME = 'Presenza';

/**
 * Abilita il profilo di esempio, il reset dei dati e il catalogo del design system.
 */
export const DEMO_MODE = true;

/**
 * Dove risponde il backend (`be-node`), da `EXPO_PUBLIC_API_URL` in `.env.local`: senza, l'app resta
 * interamente sul mock. Expo inietta la variabile solo se è letta con l'accesso a punto.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
export const API_URL: string | null = apiUrl?.trim().replace(/\/+$/, '') || null;
