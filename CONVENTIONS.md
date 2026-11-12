# Convenções do Pomofoca

## Visão geral
- Monorepo com npm workspaces: `apps/api/` (backend), `apps/web/` (frontend PWA),
  `packages/shared/` (tipos e schemas Zod compartilhados entre os dois apps).
- Backend: Node.js, Express, TypeScript (strict mode), PostgreSQL + Prisma, Redis +
  BullMQ, validação com Zod, auth JWT (access curto + refresh com rotação) + OAuth
  Google, pagamentos via Mercado Pago, testes com Jest + Supertest.
- Frontend: React 18 + Vite + TypeScript, `vite-plugin-pwa`. Sem gerenciador de
  estado de servidor (react-query etc.) - hooks simples (`useState`/`useEffect`) em
  `src/hooks/`. Estilo: Tailwind configurado para ler tokens de design como CSS
  custom properties (`src/styles/tokens.css`), não como valores Tailwind fixos -
  cor de destaque, tema claro/escuro, densidade e tamanho de fonte são todos
  personalizáveis via essas custom properties, persistidos em `localStorage`.

## Código (backend)
- TypeScript estrito; sem `any` novo sem justificativa em comentário.
- Toda entrada externa (body, query, params, webhooks) é validada com Zod na borda
  (middleware `validate`).
- Estrutura por módulo de domínio (`apps/api/src/modules/<nome>/`), não por camada
  técnica solta: `<nome>.routes.ts` (aplica rate limit/validate/asyncHandler) →
  `<nome>.controller.ts` (só orquestra: recebe request, chama service, retorna
  response - nenhuma regra de negócio aqui) → `<nome>.service.ts` (toda a lógica de
  negócio, chama Prisma/Redis/filas diretamente) → `<nome>.schema.ts` (schema Zod +
  tipo inferido). Sem camada de repository separada - o service acessa o Prisma
  direto.
- Erros: classe `AppError` (`shared/errors/AppError.ts`, extends `Error`, carrega
  `code: ErrorCode` + `statusCode`) lançada pelos services; capturada pelo
  `error.middleware.ts` central. Resposta padrão da API:
  ```json
  // sucesso
  { "success": true, "data": { ... } }
  // erro
  { "success": false, "error": { "code": "SUBJECT_LIMIT_REACHED", "message": "..." } }
  ```
- Acesso a dados somente via Prisma Client, dentro do `*.service.ts` do módulo. Sem
  SQL cru no código de aplicação (há um script standalone de backfill único,
  `apps/api/scripts/backfill-timezone-buckets.ts`, fora do fluxo normal de request).
- Jobs assíncronos via BullMQ: filas em `apps/api/src/jobs/queues/`, processamento
  em `apps/api/src/jobs/workers/`. **Processamento pesado nunca é síncrono na
  request.** Hoje todos os workers reais rodam no mesmo processo da API (chamados
  direto em `server.ts`/`realtime/socket.ts`), não em processo separado.
- Regras de negócio de limite de plano (matérias/tarefas no Free, histórico de
  relatório, features exclusivas do Premium) vão em `middlewares/plan.middleware.ts`,
  nunca espalhadas pelos services.
- Logging estruturado via pino: **sempre `logger.error({ err: error }, ...)`, nunca
  `{ error }`** - o serializer padrão do pino só reconhece a chave `err`; usar
  `error` faz o log sair como `{}`, escondendo mensagem e stack trace.
- Nomenclatura: classes em PascalCase, funções/variáveis em camelCase, constantes de
  config em UPPER_SNAKE_CASE.

## Testes
- Jest + Supertest. **Não ficam ao lado do código** - vivem em
  `apps/api/tests/unit/` (services, lógica pura, com mocks) e
  `apps/api/tests/integration/` (rotas HTTP completas via Supertest, contra
  Postgres/Redis reais). Scripts: `npm run test`, `test:unit`, `test:integration`
  (sempre `--workspace=apps/api`, executado da raiz do monorepo).
- Nomes de teste descrevem comportamento observável ("creates a free session with
  no subject", "rejects unauthenticated requests", "returns 404 when..."), não
  implementação - e em **inglês**, mesmo com o resto do código/comentários em
  português.
- Unitários não acessam rede, hora real nem banco real (mocks do Prisma);
  integração usa Postgres/Redis reais via docker compose.
- `apps/web` (frontend) **não tem nenhum script/suite de teste automatizado hoje** -
  validação de frontend é type-check (`tsc -b`) + lint + build de produção + inspeção
  manual. Não inventar um script `test` pra web que não existe.

## Git e entrega
- Mudanças pequenas e focadas; não alterar lockfiles nem dependências sem pedido
  explícito.
- Mensagens de commit seguem o padrão `tipo: descrição` em português (ex.: `fix:
  build real de apps/api quebrado desde o inicio`, `feat: variantes Zen/Painel no
  timer`) - tipos observados no histórico: `feat`, `fix`.
- Não gerar/aplicar migration do Prisma sem o schema ser revisado e aprovado antes
  pelo dono do produto.

## Armadilhas conhecidas
- No Windows, `execFile('npm', ...)` falha com ENOENT (npm é um shim `.cmd`, não um
  `.exe`) - precisa de `shell: true` ou do nome `npm.cmd` explícito. `git` já é um
  `.exe` de verdade - não precisa (e `git.cmd` não existe, dá `EINVAL` se tentado).
- `npm run build --workspace=apps/api` só funciona depois de `npm run
  build:shared` (gera `packages/shared/dist`, que o backend resolve via symlink do
  workspace - `apps/web` não tem esse problema porque o Vite resolve
  `@pomofoca/shared` via alias próprio direto no `src`).
- Scripts do Prisma (`prisma:generate`/`prisma:migrate`/`prisma:studio`) sempre via
  `npm run`, nunca `npx prisma` direto dentro de `apps/api` - o `.env` real está na
  raiz do monorepo, não em `apps/api`, e o Prisma CLI não usa o `dotenv` custom do
  `config/env.ts` (que só roda em tempo de execução da app).
<!-- O gestor acrescenta aqui erros recorrentes, com aprovação do usuário. -->
