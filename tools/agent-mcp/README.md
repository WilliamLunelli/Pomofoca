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

Trocar modelo sem editar código: `AGENT_MODEL_<PAPEL>=anthropic:<modelo>` ou `google:<modelo>` (ex.: `AGENT_MODEL_SEGURANCA=anthropic:claude-opus-5-5`).
IDs de modelo mudam; confira nas docs dos provedores e ajuste por `GEMINI_PRO_MODEL`, `GEMINI_FLASH_MODEL`, `CLAUDE_SONNET_MODEL`.

## Instalação

```bash
cd tools/agent-mcp
npm install
npm run build
npm test            # build + permissões + laço do worker (modelo simulado) + smoke MCP; não gasta tokens
```

Registre no projeto (`.mcp.json` na raiz — veja `.mcp.json.example`) e exporte as chaves no seu shell:

```bash
export ANTHROPIC_API_KEY=...
export GOOGLE_GENERATIVE_AI_API_KEY=...
```

No Claude Code: `/model opus` e acrescente o conteúdo de `MANAGER.md` ao `CLAUDE.md` do projeto.

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
- Sonnet via API usa `ANTHROPIC_API_KEY` (cobrança de API), separada da assinatura do Claude Code. Se quiser gastar só assinatura nos papéis Claude, use subagentes nativos do Claude Code (`.claude/agents/`) para eles e deixe este MCP só para os modelos de outros provedores.

## Estrutura

```
src/config.ts     mapa papel→modelo, limites, gate, raiz do repo
src/models.ts     provedores (Anthropic, Google) — adicionar outro = 1 `case`
src/roles.ts      prompts de sistema por papel (+ CONVENTIONS.md do projeto)
src/fs-tools.ts   ferramentas dos workers com permissões por papel
src/delegate.ts   executa o worker, aplica orçamento, faz checkpoint, devolve relatório curto
src/gate.ts       typecheck/lint/test sem LLM + logs completos em .agent-logs/
src/compress.ts   extração de falhas (Jest/tsc/eslint), diffstat, cortes
src/ledger.ts     registro de uso e orçamento
src/workspace.ts  worktrees, checkpoint, caminhos seguros
src/server.ts     servidor MCP (11 ferramentas)
scripts/          policy.mjs (permissões), delegate.mjs (laço do worker com modelo simulado), smoke.mjs (MCP ponta a ponta)
```
