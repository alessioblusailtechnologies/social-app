/**
 * Da dove si serve il modello delle generazioni, come in Velia (assieme/be-node). La sessione dell'Agent SDK
 * resta la stessa: un fornitore con l'API compatibile con quella di Anthropic cambia solo indirizzo e chiave,
 * passati al processo di Claude Code come ambiente. Un id che non sta nel listino (tutti i Claude) va ad Anthropic.
 */

/** Il listino di un fornitore terzo, in $ per milione di token. */
export interface Tariff {
  input: number;
  output: number;
  /** L'input che il fornitore serve dalla sua cache. */
  cache: number;
}

interface ThirdPartyModel {
  provider: 'deepseek';
  tariff: Tariff;
}

/**
 * DeepSeek diretta: cache automatica, server in Cina. Listino del 15/09/2026 nella fascia di punta (01-04 e
 * 06-10 UTC dei giorni feriali): fuori punta costa la metà, quindi il costo registrato è un tetto.
 */
const THIRD_PARTY_MODELS = new Map<string, ThirdPartyModel>([
  ['deepseek-flash', { provider: 'deepseek', tariff: { input: 0.3, output: 1.2, cache: 0.006 } }],
  ['deepseek-v4-pro', { provider: 'deepseek', tariff: { input: 1.32, output: 3.96, cache: 0.044 } }],
]);

export interface ProviderKeys {
  anthropic: string | undefined;
  deepseek: { key: string | undefined; baseUrl: string };
}

export interface ModelTarget {
  /** L'ambiente del processo di Claude Code; assente = quello del server, cioè Anthropic. */
  env?: Record<string, string>;
  /** Solo per un fornitore terzo: l'SDK conosce i prezzi di Anthropic, il costo si calcola dai token. */
  tariff?: Tariff;
}

export interface TokenCount {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Dove si serve il modello; null se manca la chiave del suo fornitore. */
export function modelTarget(model: string, keys: ProviderKeys, processEnv: NodeJS.ProcessEnv = process.env): ModelTarget | null {
  const listed = THIRD_PARTY_MODELS.get(model);
  if (!listed) return keys.anthropic ? {} : null;
  const { key, baseUrl } = keys[listed.provider];
  if (!key) return null;

  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(processEnv)) if (value !== undefined) env[name] = value;
  env.ANTHROPIC_BASE_URL = baseUrl;
  // Va come `x-api-key`: un token OAuth del processo, se c'è, non deve prevalere.
  env.ANTHROPIC_API_KEY = key;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  // WebFetch riassume le pagine col modello «piccolo»: che sia lo stesso, così i consumi dicono il vero.
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
  return { env, tariff: listed.tariff };
}

/** Il costo al listino. DeepSeek non fa pagare a parte la scrittura in cache: vale come input. */
export function costAtTariff(tokens: TokenCount, tariff: Tariff): number {
  const usd =
    ((tokens.input + tokens.cacheWrite) * tariff.input + tokens.cacheRead * tariff.cache + tokens.output * tariff.output) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}
