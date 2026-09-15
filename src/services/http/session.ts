import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { API_URL } from '@/config';
import { useOnboardingStore } from '@/features/onboarding/store';
import { queryClient } from '@/services/query-client';

/** L'account Presenza con cui si è entrati. */
export interface Account {
  id: string;
  email: string;
  name: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  /** Secondi di validità del token di accesso. */
  expiresIn: number;
}

export interface AuthResult extends TokenResponse {
  account: Account;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Scadenza del token di accesso, in millisecondi. */
  expiresAt: number;
}

interface SessionState {
  tokens: SessionTokens | null;
  account: Account | null;
}

export const useSessionStore = create<SessionState>()(
  persist((): SessionState => ({ tokens: null, account: null }), {
    name: 'presenza/auth/v1',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

function toTokens({ accessToken, refreshToken, expiresIn }: TokenResponse): SessionTokens {
  return { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
}

/** Accesso o registrazione riusciti: la cache riparte vuota, così non resta niente di un altro account. */
export function startSession(result: AuthResult) {
  queryClient.clear();
  useSessionStore.setState({ tokens: toTokens(result), account: result.account });
}

export function updateTokens(response: TokenResponse) {
  useSessionStore.setState({ tokens: toTokens(response) });
}

export function updateAccount(account: Account) {
  useSessionStore.setState({ account });
}

/** Uscita, o sessione non più rinnovabile: via i token, la cache e la bozza dell'onboarding. */
export function endSession() {
  useSessionStore.setState({ tokens: null, account: null });
  useOnboardingStore.getState().reset();
  queryClient.clear();
}

/** Senza backend l'app è sempre "dentro": il mock non ha account. */
export function useSignedIn(): boolean {
  const signedIn = useSessionStore((state) => state.tokens !== null);
  return API_URL === null || signedIn;
}

/** Prima di decidere dove andare aspetta di aver riletto la sessione salvata. */
export function useSessionHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => API_URL === null || useSessionStore.persist.hasHydrated());
  useEffect(() => {
    const unsubscribe = useSessionStore.persist.onFinishHydration(() => setHydrated(true));
    if (useSessionStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, []);
  return hydrated;
}
