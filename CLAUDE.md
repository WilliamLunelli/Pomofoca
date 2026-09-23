# Pomofoca

## O que é

Pomofoca é um app de Pomodoro para estudantes com foco em **relatórios detalhados de
estudo por matéria e por período** (diário, mensal, anual, histórico). É um produto
pago por assinatura, multiplataforma via PWA.

Diferencial: não é só um timer de pomodoro — o valor está nos relatórios (heatmap
anual, breakdown por matéria, exportação em PDF) que ajudam o estudante a enxergar
onde está investindo tempo de estudo.

## Modelo de negócio

- **Plano gratuito:** até 3 matérias ativas, relatório limitado aos últimos 7 dias
- **Plano pago (Premium):** matérias ilimitadas, histórico completo, exportação de
  relatório, heatmap anual
- Pagamento via Mercado Pago (assinatura recorrente, com suporte nativo a PIX)

## Arquitetura

Monorepo com **npm workspaces** (sem Turborepo/Nx — desnecessário neste estágio,
dev único no momento):

```
pomofoca/
├── apps/
│   ├── api/       # backend Node + Express (implementado)
│   └── web/       # frontend PWA (stack ainda não definida — não criar nada aqui
│                    sem alinhar antes: framework, biblioteca de gráficos, etc.)
├── packages/
│   └── shared/    # tipos e schemas Zod compartilhados entre api e web
├── docker-compose.yml
└── .env.example
```

`packages/shared` existe para evitar duplicar tipos entre backend e frontend: exporta
schemas Zod e os tipos inferidos (ex: `Plan`, `SessionType`) usados nos dois lados.

## Stack — Backend (apps/api)

- Node.js (LTS) + TypeScript (strict mode)
- Express
- PostgreSQL + Prisma (ORM)
- Redis (cache, sessão, revogação de refresh token)
- BullMQ sobre Redis — filas para geração de relatórios pesados (heatmap anual,
  exportação de PDF), e-mails/notificações. **Processamento pesado nunca é síncrono
  na request.**
- Zod para validação (schemas reaproveitados de `packages/shared` quando compartilhados
  com o frontend)
- Autenticação: JWT (access token curto + refresh token com rotação, revogável via
  Redis) + OAuth Google, ou e-mail/senha com bcrypt
- Pagamento: Mercado Pago

Bibliotecas de apoio: `helmet`, `cors`, `express-rate-limit`, `pino`/`pino-http`
(logging estruturado), `jsonwebtoken`, `bcrypt`, `google-auth-library`,
`swagger-jsdoc`/`swagger-ui-express` (documentação — ainda não conectada),
`jest`/`supertest` (testes), `eslint`/`prettier`, `husky`/`lint-staged`.

## Stack — Frontend (apps/web)

Ainda não definida. Não gerar código em `apps/web` sem alinhar antes framework
(React/Vite vs Next.js), biblioteca de gráficos para os relatórios, etc.

## Estrutura do backend (apps/api)

Organização **por módulo de domínio** (feature-based), não por camada técnica solta:

```
apps/api/src/
├── config/        # env (validado com Zod), database (Prisma), redis, logger
├── modules/
│   └── auth/      # implementado — padrão de referência para os demais módulos
│       # subjects, sessions, reports, subscriptions: ainda não implementados
├── middlewares/   # auth, validate, error, rateLimit (plan.middleware ainda não existe)
├── jobs/
│   ├── queues/    # reports.queue, notifications.queue
│   └── workers/   # esqueletos prontos, lógica de processamento pendente
├── shared/
│   ├── errors/    # AppError + errorCodes
│   ├── utils/     # apiResponse (sendSuccess/sendError), asyncHandler, jwt
│   └── types/     # express.d.ts (req.user)
├── routes/index.ts  # agrega rotas de todos os módulos
├── app.ts
└── server.ts
```

### Convenção de nomenclatura

- `nome.controller.ts` — só orquestra (recebe request, chama service, retorna
  response). **Nenhuma regra de negócio no controller.**
- `nome.service.ts` — toda a lógica de negócio, chamadas ao Prisma/Redis/filas. Não
  conhece `req`/`res`.
- `nome.schema.ts` — schema Zod + tipo inferido (`export type X = z.infer<typeof
  xSchema>`). Vive em `packages/shared` só quando usado por mais de um app; hoje os
  schemas de `auth` vivem em `apps/api` porque `apps/web` ainda não existe.
- `nome.routes.ts` — aplica rate limit / validate / asyncHandler e delega ao
  controller.
- Classes em PascalCase, funções/variáveis em camelCase, constantes de config em
  UPPER_SNAKE_CASE.

### Padrão de resposta da API

```json
// sucesso
{ "success": true, "data": { ... } }

// erro
{ "success": false, "error": { "code": "SUBJECT_LIMIT_REACHED", "message": "..." } }
```

## Modelo de dados (Prisma)

Definido em `apps/api/prisma/schema.prisma`, ainda **sem migration gerada**
(aguardando `DATABASE_URL` real e primeira `npm install`/`prisma migrate dev`).

- **User** — email, name, passwordHash (nullable — permite conta só-Google), googleId
  (nullable), `plan` (denormalizado: fonte rápida de verdade para o
  `plan.middleware`, mantido sincronizado via webhook do Mercado Pago em vez de
  sempre derivar da tabela `Subscription`)
- **Subject** (matéria) — nome, `color` (string livre/hex, sem enum fixo), ícone
  opcional, meta semanal em minutos opcional, `archived`
- **PomodoroSession** — duração em segundos, `type` (FOCUS/SHORT_BREAK/LONG_BREAK),
  `subjectId` nullable com `onDelete: SetNull` (permite sessão livre e preserva
  histórico se a matéria for apagada)
- **Subscription** — histórico de assinaturas (não é 1:1 com User), status
  (ACTIVE/CANCELED/PAST_DUE), `mercadoPagoSubscriptionId`

Sem soft-delete em nenhuma tabela (hard delete com cascade). Sem campos extras em
User por enquanto (`emailVerified`, `avatarUrl`, `timezone` foram considerados e
adiados até algum fluxo depender deles).

## Segurança

- Rate limiting mais agressivo em `/auth` e `/webhooks`
- Senhas sempre hasheadas com bcrypt, nunca texto puro
- Refresh token: chave `refresh_token:<userId>:<jti>` no Redis com TTL =
  `JWT_REFRESH_EXPIRES_IN`; a cada `refresh` o token antigo é revogado e um novo par é
  emitido (rotação). Isso permite revogar sessões individualmente sem precisar de
  blacklist.
- Webhook do Mercado Pago deve validar a assinatura da requisição antes de processar
  (ainda não implementado — pendente junto do módulo `subscriptions`)

## Estado atual / progresso

Feito:
1. Estrutura do monorepo (`apps/api`, `apps/web` vazio, `packages/shared`) com npm
   workspaces
2. `docker-compose.yml` (postgres, redis, api, worker-reports, worker-notifications)
   + `.env.example`
3. Arquivos base do backend (`app.ts`, `server.ts`, `config/*`)
4. `schema.prisma` com o rascunho revisado (User, Subject, PomodoroSession,
   Subscription) — decisões já validadas com o dono do projeto, mas **migration
   ainda não foi gerada**
5. Módulo `auth` completo: registro, login, refresh (com rotação), logout, OAuth
   Google — serve de padrão de referência para os próximos módulos. Testes unitários
   (`tests/unit/auth.service.test.ts`) e de integração
   (`tests/integration/auth.routes.test.ts`) com Jest + Supertest.

Pendente (ordem combinada — só avançar depois que o módulo anterior for validado):
1. `npm install` na raiz + primeira `prisma migrate dev` (precisa de Postgres/Redis
   rodando — via `docker-compose up postgres redis` ou local)
2. Rodar a suíte de testes (`npm run test --workspace=apps/api`) para validar o
   módulo `auth`
3. Implementar `subjects` seguindo o mesmo padrão do `auth`
4. Implementar `sessions`
5. Implementar `reports` (geração pesada sempre via fila BullMQ, nunca síncrona)
6. Implementar `subscriptions` (integração Mercado Pago + webhook)
7. Só então definir e começar `apps/web`

## Convenções de trabalho com o Claude Code

- Não gerar nada em `apps/web` sem alinhar antes a stack de frontend
- Não gerar a migration do Prisma sem o schema ser revisado e aprovado antes
- Módulos novos seguem o padrão de camadas do `auth` (controller/service/schema/
  routes) — não pular a separação controller/service mesmo em endpoints simples
- Regras de negócio de limite de plano (ex: máx. 3 matérias no gratuito) vão em
  `plan.middleware.ts`, não espalhadas pelos services
