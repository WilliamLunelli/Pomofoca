/**
 * Configuração central: quem faz o quê, com qual modelo, e os limites de custo.
 *
 * O GESTOR (Opus) NÃO está aqui: ele é a própria sessão do Claude Code que chama
 * este servidor MCP (rode `/model opus` no Claude Code). Aqui ficam só os WORKERS.
 *
 * Dois modos (AGENT_PROVIDER_MODE):
 *   - "cli" (padrão): workers rodam pelos CLIs oficiais logados na SUA assinatura,
 *     sem chave de API: `claude -p` (Claude Pro/Max) e `agy -p` (Antigravity CLI, login Google /
 *     AI Pro; substitui o Gemini CLI, que parou de aceitar contas pessoais em 18/06/2026).
 *   - "api": workers rodam pelo AI SDK com ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY.
 *
 * Para trocar o modelo de um papel sem mexer no código, use variáveis de ambiente:
 *   AGENT_MODEL_PROGRAMADOR=claude-cli:opus
 *   AGENT_MODEL_REVISOR=agy:claude-sonnet-4-6   (Claude pela cota do Google)
 *   AGENT_MODEL_TESTADOR=anthropic:claude-sonnet-5-5   (API)
 */
import { execFileSync } from 'node:child_process';

export const ROLE_NAMES = [
  'explorador',
  'programador',
  'testador',
  'revisor',
  'seguranca',
  'triagem',
  'documentacao',
] as const;
export type Role = (typeof ROLE_NAMES)[number];

export const PROVIDERS = ['anthropic', 'google', 'claude-cli', 'agy'] as const;
export type Provider = (typeof PROVIDERS)[number];
export interface ModelSpec {
  provider: Provider;
  model: string;
}

const env = (key: string, fallback: string): string =>
  process.env[key]?.trim() || fallback;

// IDs de modelo mudam com frequência: confira nas docs de cada provedor e
// sobrescreva por env se algum default estiver desatualizado.
const SONNET = env('CLAUDE_SONNET_MODEL', 'claude-sonnet-5-5');
const GEMINI_PRO = env('GEMINI_PRO_MODEL', 'gemini-3.1-pro-preview');
const GEMINI_FLASH = env('GEMINI_FLASH_MODEL', 'gemini-3.8-flash');

// Claude CLI: alias "sonnet" acompanha o modelo atual do plano. agy: IDs de `agy models`.
const CLAUDE_CLI = env('CLAUDE_CLI_MODEL', 'sonnet');
const AGY_STRONG = env('AGY_STRONG_MODEL', 'gemini-3.8-flash-high');
const AGY_FAST = env('AGY_FAST_MODEL', 'gemini-3.8-flash-medium');

const API_MODELS: Record<Role, ModelSpec> = {
  explorador: { provider: 'google', model: GEMINI_FLASH }, // contexto grande, barato
  programador: { provider: 'anthropic', model: SONNET }, // o código que vai pro projeto
  testador: { provider: 'google', model: GEMINI_PRO }, // modelo diferente do programador
  revisor: { provider: 'google', model: GEMINI_PRO }, // idem: erra de forma diferente do Sonnet
  seguranca: { provider: 'anthropic', model: SONNET }, // não economize aqui; suba p/ Opus se quiser
  triagem: { provider: 'google', model: GEMINI_FLASH },
  documentacao: { provider: 'google', model: GEMINI_FLASH },
};

// Mesma divisão de trabalho, mas pelas assinaturas (sem API).
const CLI_MODELS: Record<Role, ModelSpec> = {
  explorador: { provider: 'agy', model: AGY_FAST },
  programador: { provider: 'claude-cli', model: CLAUDE_CLI },
  testador: { provider: 'agy', model: AGY_STRONG },
  revisor: { provider: 'agy', model: AGY_STRONG },
  seguranca: { provider: 'claude-cli', model: CLAUDE_CLI },
  triagem: { provider: 'agy', model: AGY_FAST },
  documentacao: { provider: 'agy', model: AGY_FAST },
};

export function providerMode(): 'cli' | 'api' {
  const m = process.env.AGENT_PROVIDER_MODE?.trim().toLowerCase();
  if (!m || m === 'cli') return 'cli';
  if (m === 'api') return 'api';
  throw new Error('AGENT_PROVIDER_MODE inválido: use "cli" ou "api".');
}

export function modelFor(role: Role): ModelSpec {
  const override = process.env[`AGENT_MODEL_${role.toUpperCase()}`]?.trim();
  if (override) {
    const [provider, ...rest] = override.split(':');
    const model = rest.join(':');
    if (provider && (PROVIDERS as readonly string[]).includes(provider) && model) {
      return { provider: provider as Provider, model };
    }
    throw new Error(
      `AGENT_MODEL_${role.toUpperCase()} inválido: use "<provedor>:<modelo>" com provedor em ${PROVIDERS.join(', ')}`,
    );
  }
  return (providerMode() === 'cli' ? CLI_MODELS : API_MODELS)[role];
}

/** Limites por papel: passos do loop de ferramentas e tamanho máximo da resposta. */
export const ROLE_LIMITS: Record<Role, { maxSteps: number; maxOutputTokens: number }> = {
  explorador: { maxSteps: 12, maxOutputTokens: 3000 },
  programador: { maxSteps: 30, maxOutputTokens: 8000 },
  testador: { maxSteps: 25, maxOutputTokens: 8000 },
  revisor: { maxSteps: 8, maxOutputTokens: 3000 },
  seguranca: { maxSteps: 8, maxOutputTokens: 3000 },
  triagem: { maxSteps: 1, maxOutputTokens: 1000 },
  documentacao: { maxSteps: 10, maxOutputTokens: 6000 },
};

/** Orçamento por tarefa. Estourou: o servidor recusa novas delegações e avisa o gestor. */
// No modo cli o limite é de cota da assinatura, não de dinheiro, e os CLIs contam leitura de
// cache como entrada (uma chamada trivial do `claude -p` já soma ~22k tokens): 600k travaria
// qualquer tarefa real. Medido: worker do agy ~35-80k tokens por chamada.
export const MAX_TOKENS_PER_TASK = Number(
  process.env.AGENT_MAX_TOKENS_PER_TASK ??
    ((process.env.AGENT_PROVIDER_MODE?.trim().toLowerCase() || 'cli') === 'cli'
      ? 4_000_000
      : 600_000),
);
export const MAX_DELEGATIONS_PER_TASK = Number(
  process.env.AGENT_MAX_DELEGATIONS_PER_TASK ?? 14,
);
export const WORKER_TIMEOUT_MS = Number(
  process.env.AGENT_WORKER_TIMEOUT_MS ?? 10 * 60_000,
);

/** Tamanho máximo do relatório que volta ao gestor (caracteres). Menos contexto = Opus mais barato. */
export const MAX_REPORT_CHARS = 3500;
export const MAX_DIFF_CHARS = 60_000;

/**
 * Gate determinístico (sem LLM). Cada check roda `npm run <script>` em <cwd> dentro do worktree.
 * Scripts ausentes no package.json aparecem como "skipped" (nunca como "pass").
 *
 * Ajustado ao layout real do monorepo Pomofoca (npm workspaces, apps/api +
 * apps/web + packages/shared):
 * - `lint` roda na raiz (`eslint . --ext .ts,.tsx` no package.json raiz já
 *   cobre api + web num só comando - não há "lint" por workspace).
 * - `test` roda os testes Jest reais de apps/api (108 testes na última
 *   contagem). Nome mantido como "test" (não "api:test") de propósito: os
 *   smoke tests do próprio pacote (scripts/policy.mjs, scripts/smoke.mjs)
 *   fixam esse nome pra validar a lógica de testPath/triagem - renomear
 *   quebra esses testes sem relação com a lógica em si, só com o nome.
 *   apps/web não tem nenhum script de teste hoje - não incluído aqui (nada
 *   pra "pular" de verdade, e um script inventado apareceria como "skipped"
 *   de forma confusa).
 *
 * NENHUM workspace tem um script chamado "typecheck" (nem raiz, nem api, nem
 * web) - por isso não está no gate. apps/api tem "build" (`tsc -p
 * tsconfig.json`, SEM --noEmit) e apps/web tem "build" (`tsc -b && vite
 * build`); os dois pegam erro de tipo como efeito colateral, mas emitem
 * artefatos (dist/bundle) a cada rodada do gate e o de web depende de
 * `packages/shared` já buildado primeiro - por isso não foram incluídos como
 * substituto de typecheck (rodariam fora do que o worker realmente mudou e
 * podem falhar por motivo não relacionado). Decisão pendente de confirmação
 * do dono do produto: adicionar um script "typecheck" dedicado em
 * apps/api/package.json (`"typecheck": "tsc -p tsconfig.json --noEmit"`) e em
 * apps/web/package.json (`"typecheck": "tsc -b"` - o tsconfig de web já tem
 * noEmit:true, então "tsc -b" sozinho já não emite nada).
 */
export interface GateCheck {
  name: string;
  script: string;
  cwd: string;
}
export const GATE_CHECKS: GateCheck[] = [
  { name: 'lint', script: 'lint', cwd: '.' },
  { name: 'test', script: 'test', cwd: 'apps/api' },
];

let cachedRoot: string | undefined;
/** Raiz do repositório git (de AGENT_REPO_ROOT ou do cwd do processo). */
export function repoRoot(): string {
  if (cachedRoot) return cachedRoot;
  const cwd = process.env.AGENT_REPO_ROOT ?? process.cwd();
  cachedRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();
  return cachedRoot;
}
