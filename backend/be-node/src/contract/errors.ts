/**
 * L'errore che rotte e servizi lanciano. Il gestore centrale (`api/plugins/errors.ts`) lo
 * traduce nella risposta `{ code, message }`: `code` è stabile e in maiuscolo, `message` è
 * italiano e si può mostrare all'utente. Qualunque altra eccezione diventa un 500 senza dettagli.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  body(): { code: string; message: string } {
    return { code: this.code, message: this.message };
  }

  static invalid(message = 'La richiesta contiene dati mancanti o non validi.'): ApiError {
    return new ApiError(400, 'INVALID_DATA', message);
  }

  static unauthenticated(message = 'Accedi per continuare.'): ApiError {
    return new ApiError(401, 'UNAUTHENTICATED', message);
  }

  static forbidden(code = 'FORBIDDEN', message = 'Non hai i permessi per questa operazione.'): ApiError {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Risorsa non trovata.'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string): ApiError {
    return new ApiError(409, code, message);
  }

  /** La richiesta è valida, ma questa strada non esiste ancora. */
  static notAvailable(message: string): ApiError {
    return new ApiError(422, 'NOT_AVAILABLE', message);
  }

  static unavailable(code: string, message: string): ApiError {
    return new ApiError(503, code, message);
  }
}
