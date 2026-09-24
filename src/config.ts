/** Il nome del prodotto: sta qui e in app.json, che è quello che finisce sul telefono. */
export const APP_NAME = 'Moonbrand';

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
