import type { ApiClient } from './client';
import { endSession, startSession, updateAccount, type Account, type AuthResult } from './session';

export interface SignUpRequest {
  email: string;
  password: string;
  name?: string;
}

export interface AuthService {
  signIn(email: string, password: string): Promise<Account>;
  /** Crea l'account e, come l'accesso, apre subito la sessione. */
  signUp(request: SignUpRequest): Promise<Account>;
  signOut(): void;
  /** Rilegge l'account della sessione aperta. */
  me(): Promise<Account>;
}

export function createAuthService(api: ApiClient): AuthService {
  const open = (result: AuthResult) => {
    startSession(result);
    return result.account;
  };

  return {
    async signIn(email, password) {
      return open(await api.publicPost<AuthResult>('/auth/sign-in', { email, password }));
    },

    async signUp(request) {
      return open(await api.publicPost<AuthResult>('/auth/sign-up', request));
    },

    signOut: endSession,

    async me() {
      const account = await api.get<Account>('/auth/me');
      updateAccount(account);
      return account;
    },
  };
}
