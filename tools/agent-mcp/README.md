# agent-mcp — gestor + subagentes via MCP

Servidor MCP (Node/TypeScript, stdio) que deixa um **gestor** (Opus, rodando no Claude Code) delegar trabalho a **workers** de provedores diferentes (Sonnet, Gemini…). O gestor só enxerga ferramentas; por trás de cada uma há um modelo configurável.

```
você ─ tarefa estruturada ─▶ Opus (gestor, no Claude Code)
                               │  MCP (stdio)
                               ▼
        tarefa_abrir ▸ explorar ▸ codar ▸ testar ▸ gate ▸ triar_falhas ▸ revisar ▸ auditar_seguranca ▸ documentar
                               │
   worktree git por tarefa (branch agent/<taskId>) + commits de checkpoint por worker
```

## Papéis e modelos (padrão — `src/config.ts`)

| Papel | Ferramenta MCP | Modelo padrão | Pode… |
|---|---|---|---|
| Gestor | *(é o Claude Code)* | Opus | planejar, delegar, decidir |
| Explorador | `explorar` | Gemini Flash | só ler |
| Programador | `codar` | Sonnet | escrever código (não testes), rodar typecheck/lint/test |
| Testador | `testar` | Gemini Pro | escrever **só** arquivos de teste, rodar testes |
| Revisor | `revisar` | Gemini Pro | só ler (recebe o diff) |
| Segurança | `auditar_seguranca` | Sonnet | só ler (recebe o diff) |
| Triagem | `triar_falhas` | Gemini Flash | classificar falha a partir do log |
| Documentação | `documentar` | Gemini Flash | escrever só `.md` / `docs/` |
| Gate | `gate` | **sem LLM** | typecheck + lint + testes via `npm run` |

Trocar modelo sem editar código: `AGENT_MODEL_<PAPEL>=<provedor>:<modelo>`, com provedor `claude-cli`, `gemini-cli`, `anthropic` ou `google` (ex.: `AGENT_MODEL_SEGURANCA=claude-cli:opus`).

## Dois modos de provedor (`AGENT_PROVIDER_MODE`)

| Modo | Como os workers rodam | Precisa de | Cobrança |
|---|---|---|---|
| **`cli`** (padrão) | `claude -p` e `gemini -p`, os CLIs oficiais, cada um no worktree da tarefa | login feito uma vez em cada CLI | **sua assinatura** (Claude Pro/Max e Google AI Pro / login Google), **sem chave de API** |
| `api` | AI SDK (`generateText` + ferramentas de `src/fs-tools.ts`) | `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` | por token na API |

No modo `cli` os modelos são aliases que acompanham o seu plano: `sonnet` (Claude), `pro` e `flash` (Gemini). Para trocar, use `CLAUDE_CLI_MODEL`, `GEMINI_CLI_PRO_MODEL` e `GEMINI_CLI_FLASH_MODEL`. No modo `api`, use `CLAUDE_SONNET_MODEL`, `GEMINI_PRO_MODEL` e `GEMINI_FLASH_MODEL`.

### Como as permissões valem no modo `cli` (`src/cli-runner.ts`)

1. **Antes de rodar:** flags de permissão de cada CLI.
   - Claude: `--allowedTools`/`--disallowedTools` por papel; Bash só `npm run lint/test`; sem WebFetch/WebSearch; `.env*` negado.
   - Gemini: `--approval-mode plan` (somente leitura) ou `auto_edit`; shell só `npm run lint/test`.
   - Os dois rodam **sem MCP** (`--strict-mcp-config` / `--allowed-mcp-server-names __nenhum__`), para evitar recursão.
2. **Depois de rodar (determinístico):** o `git status` do worktree é comparado com a permissão do papel. Tudo que o papel não podia tocar é **desfeito**, e o gestor recebe a linha `POLÍTICA: ...`. Assim um testador não altera produção, mesmo que o modelo tente.
3. O processo do CLI roda **sem** variáveis `*KEY*`/`*TOKEN*`. Isso garante o uso do login da assinatura, nunca uma chave de API exportada por engano.
4. O prompt vai por **stdin**, porque diffs grandes estourariam o limite de linha de comando do Windows.

> Termos de uso: aqui cada assinatura é usada só pelo **próprio CLI oficial**, rodando na sua máquina. Não extraia tokens OAuth do Claude ou do Gemini para usar em outros programas: os termos proíbem, e a conta pode ser bloqueada.

## Instalação

```bash
cd tools/agent-mcp
npm install
npm run build
npm test            # build + permissões + laço do worker (modelo simulado) + smoke MCP; não gasta tokens
```

### Modo `cli` (assinaturas, padrão)

```bash
npm install -g @anthropic-ai/claude-code @google/gemini-cli
claude    # 1ª vez: login com a conta Claude Pro e aprovação do servidor do .mcp.json
gemini    # 1ª vez: "Login with Google" e "Trust folder"
```

> **Windows:** se o `~/.npmrc` tiver `os=linux`, o npm pula o binário nativo do Claude Code e `claude` dá *"not a valid application"*. Instale com `npm install -g @anthropic-ai/claude-code --os=win32 --cpu=x64`.

O servidor já está registrado nos dois clientes:
- **Claude Code:** `.mcp.json` na raiz (veja `.mcp.json.example`).
- **Gemini CLI:** `.gemini/settings.json` na raiz. Ele também carrega o `CLAUDE.md` como contexto, então o Gemini recebe o manual do gestor.

Qualquer um dos dois pode ser o **gestor**: abra o `claude` (de preferência com `/model opus`) ou o `gemini` na raiz do repo e peça a tarefa.

### Modo `api`

Exporte `AGENT_PROVIDER_MODE=api`, `ANTHROPIC_API_KEY` e `GOOGLE_GENERATIVE_AI_API_KEY` no `env` do `.mcp.json`.

## Como o custo é controlado

- O gestor recebe **relatórios curtos** (≤ 3.500 caracteres) + `git diff --stat`, nunca o diff inteiro nem logs de teste. Revisores/documentação é que leem o diff.
- Gate e compressão de logs são **determinísticos** (sem LLM).
- Orçamento por tarefa: `AGENT_MAX_TOKENS_PER_TASK` (padrão 600k) e `AGENT_MAX_DELEGATIONS_PER_TASK` (padrão 14). Estourou → o servidor recusa e o gestor para e reporta.
- Cada delegação vai para `.agent-logs/delegations.jsonl`; `custos` resume por papel/modelo.

## Segurança — leia antes de usar

- Workers têm permissões mínimas (tabela acima). Ninguém lê `.env*`, `.git`, `node_modules`; ninguém escreve em lockfiles, `.mcp.json`, `.claude/`, `.github/`, `CLAUDE.md`, `CONVENTIONS.md` nem em `tools/agent-mcp/`.
- Processos filhos (`npm run …`) rodam **sem** variáveis que contenham KEY/TOKEN/SECRET/PASSWORD.
- **Mas** `gate`/`runCheck` executam o código que o LLM escreveu, na sua máquina. Para isolamento real, rode o Claude Code dentro de um container/devcontainer.
- Commits de checkpoint usam `--no-verify` (hooks de pre-commit não rodam) e só existem em `agent/<taskId>`. O gate é a verificação de verdade; o merge continua sendo decisão sua.
- `tarefa_encerrar` remove o worktree mas **nunca** apaga a branch.

## Limitações conhecidas

- `node_modules` do repositório principal é *symlinkado* para o worktree (raiz e 2 níveis). Cliente Prisma gerado e dependências são compartilhados; se a tarefa muda `package.json`/schema Prisma, rode `npm install`/`prisma generate` no worktree manualmente.
- **Banco de dados:** testes que usam o mesmo PostgreSQL/Redis em tarefas paralelas podem colidir. Use um banco de teste por tarefa (via env) ou rode essas tarefas em sequência.
- Preços não estão embutidos (mudam). `custos` mostra tokens; multiplique pela tabela atual de cada provedor.
- No modo `cli`, os limites são os **da sua assinatura**: o gestor e os workers Claude dividem a mesma cota do Claude Pro. Os tokens do `custos` servem para comparar papéis, não para calcular dinheiro.
- No modo `cli`, `ROLE_LIMITS.maxSteps`/`maxOutputTokens` não se aplicam, porque cada CLI controla o próprio laço. O limite é `AGENT_WORKER_TIMEOUT_MS` (padrão 10 min), mais o orçamento por tarefa.
- No modo `api`, o Sonnet usa `ANTHROPIC_API_KEY`, com cobrança separada da assinatura.

## Estrutura

```
src/config.ts     mapa papel→modelo, limites, gate, raiz do repo
src/models.ts     provedores via API (Anthropic, Google) — adicionar outro = 1 `case`
src/cli-runner.ts provedores via CLI (claude -p / gemini -p): flags por papel, parse de tokens, política pós-execução
src/roles.ts      prompts de sistema por papel (+ CONVENTIONS.md do projeto)
src/fs-tools.ts   ferramentas dos workers com permissões por papel
src/delegate.ts   executa o worker, aplica orçamento, faz checkpoint, devolve relatório curto
src/gate.ts       typecheck/lint/test sem LLM + logs completos em .agent-logs/
src/compress.ts   extração de falhas (Jest/tsc/eslint), diffstat, cortes
src/ledger.ts     registro de uso e orçamento
src/workspace.ts  worktrees, checkpoint, caminhos seguros
src/server.ts     servidor MCP (11 ferramentas)
scripts/          policy.mjs (permissões), delegate.mjs (laço via API com modelo simulado),
                  cli.mjs + fake-cli.mjs (provedores via CLI com CLI simulado), smoke.mjs (MCP ponta a ponta)
```
