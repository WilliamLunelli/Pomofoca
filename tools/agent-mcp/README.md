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
| Explorador | `explorar` | Gemini 3.8 Flash (medium), via `agy` | só ler |
| Programador | `codar` | Claude Sonnet, via `claude -p` | escrever código (não testes), rodar lint/test |
| Testador | `testar` | Gemini 3.8 Flash (high), via `agy` | escrever **só** arquivos de teste, rodar testes |
| Revisor | `revisar` | Gemini 3.8 Flash (high), via `agy` | só ler (recebe o diff) |
| Segurança | `auditar_seguranca` | Claude Sonnet, via `claude -p` | só ler (recebe o diff) |
| Triagem | `triar_falhas` | Gemini 3.8 Flash (medium), via `agy` | classificar falha a partir do log |
| Documentação | `documentar` | Gemini 3.8 Flash (medium), via `agy` | escrever só `.md` / `docs/` |
| Gate | `gate` | **sem LLM** | lint + testes via `npm run` |

A divisão segue a força do modelo: o Claude fica com o código que entra no produto e com a auditoria de segurança; o Gemini fica com testes, revisão (um modelo diferente erra de forma diferente), mapa do código, triagem e documentação. Isso também poupa a cota do Claude Pro, que o gestor e os workers Claude dividem.

Trocar modelo sem editar código: `AGENT_MODEL_<PAPEL>=<provedor>:<modelo>`, com provedor `claude-cli`, `agy`, `anthropic` ou `google` (ex.: `AGENT_MODEL_SEGURANCA=claude-cli:opus`, `AGENT_MODEL_REVISOR=agy:claude-sonnet-4-6`). A lista de modelos do `agy` sai de `agy models`.

## Dois modos de provedor (`AGENT_PROVIDER_MODE`)

| Modo | Como os workers rodam | Precisa de | Cobrança |
|---|---|---|---|
| **`cli`** (padrão) | `claude -p` e `agy` (Antigravity CLI), os CLIs oficiais, cada um no worktree da tarefa | login feito uma vez em cada CLI | **sua assinatura** (Claude Pro/Max e Google AI Pro / login Google), **sem chave de API** |
| `api` | AI SDK (`generateText` + ferramentas de `src/fs-tools.ts`) | `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` | por token na API |

> **Por que `agy` e não Gemini CLI:** desde 18/06/2026, o Gemini CLI não aceita mais login de contas pessoais (Free, AI Pro e Ultra); o erro é *"This client is no longer supported for Gemini Code Assist for individuals"*. O substituto oficial é o Antigravity CLI (`agy`).

Modelos no modo `cli`: `CLAUDE_CLI_MODEL` (padrão `sonnet`, alias que acompanha o plano), `AGY_STRONG_MODEL` (padrão `gemini-3.8-flash-high`) e `AGY_FAST_MODEL` (padrão `gemini-3.8-flash-medium`). No modo `api`: `CLAUDE_SONNET_MODEL`, `GEMINI_PRO_MODEL` e `GEMINI_FLASH_MODEL`.

### Como as permissões valem no modo `cli` (`src/cli-runner.ts`)

1. **Antes de rodar:** regras de permissão de cada CLI.
   - Claude: `--allowedTools`/`--disallowedTools` por papel; Bash só `npm run lint/test`; sem WebFetch/WebSearch; `.env*` negado; `--strict-mcp-config` (sem MCP, para evitar recursão).
   - `agy`: regras por sessão em `--settings` (precedência deny > ask > allow). Ficam negados web, MCP, `.env` e escrita (papéis só de leitura). Comandos liberados por **regex**, porque no agy 1.5.6 a regra por prefixo não casa: só leitura (listar/ler/buscar/`git status|diff|log|show`), mais `npm run lint/test` para quem roda checks. Encadear com `;`/`&&`/`|` só vale entre comandos liberados. Também ficam negados `..`, caminho absoluto, `~` e `.agent-*`; num teste real, o Gemini tentou ler `..\..\.agent-logs` a partir do worktree.
2. **Depois de rodar (determinístico):** o `git status` do worktree é comparado com a permissão do papel. Tudo que o papel não podia tocar é **desfeito**, e o gestor recebe a linha `POLÍTICA: ...`.
3. O processo do CLI roda **sem** variáveis `*KEY*`/`*TOKEN*`, para garantir que use o login da assinatura.
4. O prompt vai por **stdin**: texto puro para o `claude`, e NDJSON (`--input-format stream-json`, sem `-p`) para o `agy`. Com `-p "<texto>"`, o agy **ignora** o stdin, e o modelo nunca recebia a tarefa.
5. **Particularidade do `agy` em modo não interativo:** uma ação negada **encerra a execução** com resposta vazia. O runner retoma a mesma conversa (`--conversation <id>`) avisando o que foi negado, até `AGENT_AGY_MAX_RESUMES` vezes (padrão 3), e o relatório ao gestor lista os comandos negados. A transcrição completa de cada execução fica em `.agent-logs/agy/`.

> Termos de uso: aqui cada assinatura é usada só pelo **próprio CLI oficial**, rodando na sua máquina. Não extraia tokens OAuth do Claude ou do Google para usar em outros programas: os termos proíbem, e a conta pode ser bloqueada.

## Instalação

```bash
cd tools/agent-mcp
npm install
npm run build
npm test            # build + permissões + laço do worker (modelo simulado) + smoke MCP; não gasta tokens
```

### Modo `cli` (assinaturas, padrão)

```bash
npm install -g @anthropic-ai/claude-code
irm https://antigravity.google/cli/install.ps1 | iex   # Antigravity CLI (Windows/PowerShell)
claude    # 1ª vez: login com a conta Claude Pro e aprovação do servidor do .mcp.json
agy       # 1ª vez: login com a conta Google (AI Pro)
```

> **Windows:** se o `~/.npmrc` tiver `os=linux`, o npm pula o binário nativo do Claude Code e `claude` dá *"not a valid application"*. Instale com `npm install -g @anthropic-ai/claude-code --os=win32 --cpu=x64`.

Registro do servidor:
- **Claude Code:** `.mcp.json` na raiz (veja `.mcp.json.example`).
- **agy:** `.agents/mcp_config.json` na raiz (local, fora do git), com caminhos absolutos:
  ```json
  { "mcpServers": { "pomofoca-agents": { "command": "node",
    "args": ["C:/caminho/Pomofoca/tools/agent-mcp/dist/server.js"],
    "env": { "AGENT_PROVIDER_MODE": "cli", "AGENT_REPO_ROOT": "C:/caminho/Pomofoca" } } } }
  ```

O gestor recomendado é o `claude` (de preferência com `/model opus`), aberto na raiz do repo.

> Depois de `npm run build`, **reinicie o cliente MCP**, porque o processo do servidor que já está rodando continua com o código antigo.

### Modo `api`

Exporte `AGENT_PROVIDER_MODE=api`, `ANTHROPIC_API_KEY` e `GOOGLE_GENERATIVE_AI_API_KEY` no `env` do `.mcp.json`.

## Painel ao vivo

```bash
npm run painel        # dentro de tools/agent-mcp  →  http://127.0.0.1:4777
```

Página local que se atualiza a cada 2s e mostra:
- **hierarquia:** o gestor e cada papel, com modelo, chamadas, tokens e tempo (Claude em laranja, Gemini em azul);
- **por tarefa:** branch, worktree, barra de orçamento, último gate, e uma linha do tempo com cada delegação (a **instrução que o gestor mandou** e o **relatório que voltou**), cada gate e os workers **rodando agora**;
- **passos do `agy`:** cada ferramenta e cada comando (ou negação), ao vivo durante a execução.

Só lê `.agent-logs/`, nunca o código nem `.env`, e só escuta em `127.0.0.1`. Os dados vêm de `delegations.jsonl`, `reports.jsonl`, `gates.jsonl`, `running/` e `agy/`, gravados pelo próprio servidor. `PAINEL_PORT` muda a porta.

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
- No modo `cli`, `ROLE_LIMITS.maxSteps`/`maxOutputTokens` não se aplicam, porque cada CLI controla o próprio laço. O limite é `AGENT_WORKER_TIMEOUT_MS` (padrão 10 min), mais o orçamento por tarefa: no modo `cli`, o padrão de `AGENT_MAX_TOKENS_PER_TASK` é 4M, porque os CLIs contam leitura de cache como entrada.
- No modo `api`, o Sonnet usa `ANTHROPIC_API_KEY`, com cobrança separada da assinatura.

## Estrutura

```
src/config.ts     mapa papel→modelo, limites, gate, raiz do repo
src/models.ts     provedores via API (Anthropic, Google) — adicionar outro = 1 `case`
src/cli-runner.ts provedores via CLI (claude -p / agy): regras por papel, parse de tokens, retomada após negação, política pós-execução
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
