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
│   └── web/       # frontend PWA (implementado — React + Vite)
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

- React 18 + Vite + TypeScript, `vite-plugin-pwa` (instalável, funciona offline via
  service worker gerado no build)
- Tailwind, configurado para ler os design tokens como CSS custom properties (não
  como valores Tailwind fixos) — ver `src/styles/tokens.css` e `tailwind.config.ts`.
  Fonte de verdade visual: `design-tokens-pomofoca.md` (arquivo local, fora do git —
  ver seção "Notas pessoais" abaixo)
- Recharts para pizza (breakdown por matéria) e barras (evolução diária); o heatmap
  anual é um grid customizado com CSS (não é gráfico de biblioteca), replicando a
  técnica do protótipo
- `@phosphor-icons/react` para ícones (mesma lib do protótipo)
- `react-router-dom` para rotas
- Sem gerenciador de estado global de servidor (react-query etc.) por enquanto —
  hooks simples (`useState`/`useEffect`) em `src/hooks/`; considerar react-query se a
  quantidade de fetches ficar difícil de coordenar

### Personalização (`src/context/PreferencesContext.tsx`)

- Tema claro/escuro (`data-theme` na raiz)
- Cor de destaque escolhível: `src/lib/color.ts` implementa conversão sRGB↔OKLCH e
  `generateRamp(hex)`, que gera a rampa 100-900 preservando hue/chroma da cor
  escolhida (mesma lógica do protótipo, seção D do arquivo de tokens) — usado tanto
  pela cor de destaque do app quanto poderia ser reaproveitado para cores de matéria
- Densidade (`comfortable`/`compact`, via `data-density`) e tamanho de fonte (3
  níveis, via `data-font-size`) — ambos definidos como overrides de custom properties
  em `tokens.css`
- Tudo persistido em `localStorage`, nada no backend (preferência é só do
  dispositivo/navegador atual)

### Estrutura (`apps/web/src/`)

```
src/
├── components/AppShell.tsx      # sidebar (desktop) + nav inferior (mobile)
├── context/
│   ├── AuthContext.tsx          # usuário logado, login/register/logout, refresh
│   └── PreferencesContext.tsx   # tema, cor de destaque, densidade, fonte
├── hooks/
│   ├── useSubjects.ts
│   └── usePomodoroSettings.ts   # duração dos ciclos - só local, não é campo do backend
├── lib/
│   ├── api.ts                   # fetch wrapper com refresh automático de token
│   ├── color.ts                 # OKLCH + generateRamp + paletas curadas
│   └── types.ts                 # tipos das respostas da API (não vieram de
│                                    packages/shared ainda - ver nota abaixo)
├── pages/                       # Timer, Subjects, Reports, Settings, Subscription,
│                                    Login, Register
├── styles/tokens.css            # design tokens como CSS custom properties
├── App.tsx                      # rotas (react-router)
└── main.tsx
```

**Nota de arquitetura pendente:** os tipos de resposta da API (`src/lib/types.ts`)
foram definidos localmente em `apps/web` por velocidade, em vez de irem para
`packages/shared` como a convenção original pedia ("tipos usados por mais de um app
vivem em shared"). `Plan` e `SessionType` já vêm de `packages/shared` corretamente.
Mover `Subject`/`PomodoroSession`/etc. para `packages/shared` é um refactor futuro de
baixo risco, não urgente.

### Timer (`src/pages/TimerPage.tsx`)

O timer roda inteiramente no cliente (sem estado de timer no servidor). Ao completar
ou pular um ciclo, a página faz `POST /api/sessions` com o registro completo
(duração real decorrida, `completed: true/false`). Ciclos de pausa nunca carregam
`subjectId`. As durações (foco/pausa curta/pausa longa/ciclos até pausa longa) ficam
em `usePomodoroSettings`, só local (o backend não tem esse conceito — é preferência
de uso, não dado de estudo).

### Ambiente Windows: bug de dependências opcionais do npm

Se `npm run dev:web` falhar com `Cannot find module @rollup/rollup-win32-x64-msvc`,
é o bug conhecido do npm com optional dependencies
(https://github.com/npm/cli/issues/4828), **agravado neste ambiente** porque o
`.npmrc` global do usuário (`C:\Users\<user>\.npmrc`) tem `os = "linux"` fixado
(provavelmente para uso via WSL em outros projetos). Isso faz o npm baixar os
binários nativos do Rollup para Linux em vez de Windows. Correção **sem tocar no
`.npmrc` global**: `npm install --os=win32 --cpu=x64` na raiz do monorepo. Não altere
o `.npmrc` do usuário sem perguntar - o `os=linux` pode ser intencional para o fluxo
de trabalho dele em outros projetos.

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
- **DailyStudyStat** — agregado diário por usuário (`@@unique([userId, date])`),
  atualizado incrementalmente (upsert) toda vez que uma `PomodoroSession` é criada ou
  apagada, na mesma transação. Campos: `totalSeconds` (todas as sessões, incluindo
  pausas), `focusSeconds`/`sessionsCompleted`/`sessionsInterrupted` (só sessões
  FOCUS), `bySubject` (JSON: `{ [subjectId | "none"]: { seconds, completed } }`). O
  módulo `reports` **sempre** lê daqui, nunca recalcula em cima de
  `PomodoroSession` diretamente — mantém as consultas rápidas independente do
  tamanho do histórico. `date` é a data em UTC derivada de `startedAt` da sessão
  (**sem timezone por usuário ainda** — `timezone` em User foi adiado, ver acima;
  isso significa que o "dia" de uma sessão pode não bater com o dia local do usuário
  perto da meia-noite, dependendo do fuso dele)

Sem soft-delete em nenhuma tabela (hard delete com cascade), exceto `Subject`, que
usa `archived` (soft) porque precisa preservar o histórico de sessões antigas mesmo
depois que o usuário "remove" a matéria. Sem campos extras em User por enquanto
(`emailVerified`, `avatarUrl`, `timezone` foram considerados e adiados até algum
fluxo depender deles).

## Segurança

- Rate limiting mais agressivo em `/auth` e `/webhooks`
- Senhas sempre hasheadas com bcrypt, nunca texto puro
- Refresh token: chave `refresh_token:<userId>:<jti>` no Redis com TTL =
  `JWT_REFRESH_EXPIRES_IN`; a cada `refresh` o token antigo é revogado e um novo par é
  emitido (rotação). Isso permite revogar sessões individualmente sem precisar de
  blacklist.
- Webhook do Mercado Pago valida a assinatura (HMAC-SHA256 sobre
  `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, formato documentado pelo
  Mercado Pago) antes de processar qualquer evento — ver
  `apps/api/src/modules/subscriptions/mercadoPago.client.ts`

## Módulos do backend (apps/api/src/modules/)

Todos seguem o padrão do `auth` (controller só orquestra, service tem a lógica,
schema Zod valida, routes aplica os middlewares). Todos com testes unitários +
integração via Jest/Supertest.

- **auth** — registro, login, refresh (com rotação via Redis), logout, OAuth Google
- **users** — `GET/PATCH /users/me` (perfil; só nome editável por enquanto)
- **subjects** — CRUD de matérias + archive/restore.
  `middlewares/plan.middleware.ts::enforceSubjectLimit` bloqueia (403
  `SUBJECT_LIMIT_REACHED`) a 4ª matéria ativa no plano FREE
- **sessions** — cliente loga a sessão já finalizada (`POST /sessions` com
  `startedAt`/`finishedAt`/`completed`), sem estado de timer no servidor. Cada
  create/delete atualiza `DailyStudyStat` na mesma transação (ver
  `reports.service.ts::recordCompletedSession`/`reverseCompletedSession`)
- **reports** — `summary`, `breakdown`, `heatmap`, `trend`, `streak`, `compare`,
  todos lendo de `DailyStudyStat`. `plan.middleware.ts::enforceReportHistoryLimit`
  bloqueia (403 `REPORT_HISTORY_LIMIT_REACHED`) período/`from` além dos últimos 7
  dias para FREE; `requirePremium(...)` bloqueia `heatmap` e `compare` por completo
  para FREE (403 `PREMIUM_FEATURE_REQUIRED`) — heatmap porque já era feature paga
  na definição original do produto, compare porque sua janela "anterior"
  inevitavelmente extrapola os 7 dias permitidos. `streak` não tem query params de
  período, então não usa o middleware de bloqueio — em vez disso auto-limita sua
  própria janela de cálculo à última semana quando `plan === FREE`
  (`scope: 'week'` na resposta avisa o frontend disso)
- **subscriptions** — `POST /subscriptions/checkout` recebe `{ billingCycle: 'MONTHLY'
  | 'YEARLY' }` (default `MONTHLY`) e cria a assinatura recorrente (preapproval) no
  Mercado Pago com o preço correspondente; devolve o link de checkout. **Não grava
  nada no banco até o webhook confirmar** `authorized` (evita registrar assinatura
  que nunca foi paga). `POST /subscriptions/cancel` cancela no Mercado Pago e
  localmente. `POST /subscriptions/webhooks/mercado-pago` fica fora do
  `authMiddleware` (evento vem do servidor do Mercado Pago) e é protegido por
  validação de assinatura + `webhookRateLimit`. O `billingCycle` da assinatura é
  persistido em `Subscription` (derivado de `auto_recurring.frequency` do preapproval
  — `frequency: 12` meses = anual) para o frontend exibir sem precisar consultar o
  Mercado Pago de novo

**Preço do Premium** (`PREMIUM_MONTHLY_PRICE`/`PREMIUM_YEARLY_PRICE` em `.env`,
validado com o dono do produto): R$14,90/mês ou R$119,90/ano (equivalente a
R$9,99/mês, ~33% de desconto — incentivo deliberado para o plano anual, melhor para
fluxo de caixa e retenção). O frontend (`SubscriptionPage.tsx`) tem um toggle
mensal/anual, padrão em anual.

`shared/utils/period.ts` centraliza a resolução de período (`today`/`week`/`month`/
`year`/`all` como janelas rolantes ancoradas em "agora", sempre em UTC) — usado tanto
por `reports.service.ts` quanto por `plan.middleware.ts`.

## Frontend (apps/web) — ver seção "Stack — Frontend" acima para detalhes

Rotas implementadas: `/login`, `/register`, `/timer`, `/subjects`, `/reports`,
`/settings`, `/subscription`. Todas as rotas protegidas exigem usuário logado
(`AuthContext`); token de acesso é renovado automaticamente em qualquer 401 via
`src/lib/api.ts`.

## Estado atual / progresso

Feito — backend completo (auth, users, subjects, sessions, reports, subscriptions),
frontend completo (todas as telas do MVP conectadas à API real), ambos validados:

- Testes automatizados: suite completa do backend em **73/73** passando
  (`npm run test --workspace=apps/api`)
- Backend validado manualmente ponta a ponta contra Postgres/Redis reais (docker
  compose) em cada módulo: auth (registro/login/refresh com rotação), subjects
  (limite do plano FREE), sessions (sessão livre/vinculada, checagem de propriedade
  cruzada entre usuários), reports (summary/breakdown/streak, bloqueio de
  heatmap/period para FREE, reversão do agregado ao deletar sessão), subscriptions
  (checkout falha graciosamente com credenciais de teste falsas, sem derrubar o
  servidor — **nunca testado contra a API real do Mercado Pago**, pendente de
  credenciais de sandbox reais)
- Frontend: `tsc -b` limpo, `npm run build --workspace=apps/web` gera o bundle +
  service worker do PWA sem erros, `eslint` limpo (só 2 avisos aceitáveis de
  `react-refresh` em arquivos que exportam hook+provider juntos). **Não foi testado
  em um navegador real** (sem ferramenta de automação de browser neste ambiente) —
  a validação foi: type-check, build de produção, lint, e inspeção manual de cada
  tela contra a referência visual do protótipo. Recomendo um teste manual no
  navegador antes de considerar o MVP pronto para uso real.
- Repositório git em https://github.com/WilliamLunelli/Pomofoca (branch `main`)

Pendente / não implementado neste MVP — ordem de prioridade combinada com o dono do
produto para a próxima leva:
1. **Swagger/OpenAPI** — documentar o que já existe custa pouco e evita perder o
   controle da API conforme ela cresce (dependências já instaladas, não conectadas)
2. **Notificações** — streak em risco é o caso de uso prioritário (recurso de
   retenção); fila e worker já esqueletizados em `jobs/queues/notifications.queue.ts`
   / `jobs/workers/notifications.worker.ts`, sem lógica ainda
3. **Exportação de relatório em PDF** — é o que menos bloqueia uso real do produto
   agora, fica por último; fila BullMQ já esqueletizada em
   `jobs/queues/reports.queue.ts` / `jobs/workers/reports.worker.ts`

Outras pendências, sem ordem definida ainda:
4. OAuth Google testado de ponta a ponta (código implementado, mas nunca testado
   contra credenciais reais do Google)
5. Teste manual no navegador do frontend completo (ver nota acima)
6. Mover tipos de `apps/web/src/lib/types.ts` para `packages/shared` (ver nota na
   seção de frontend)
7. `timezone` por usuário (relatórios usam UTC puro por enquanto)

## Notas de ambiente (Windows) descobertas durante o desenvolvimento

- `config/env.ts` carrega o `.env` da raiz do monorepo explicitamente via `dotenv`
  (necessário porque `npm run --workspace` roda com `cwd` no próprio workspace, não
  na raiz).
- Em máquinas Windows com um PostgreSQL nativo já instalado e rodando na porta 5432
  (IPv4), o container Docker só consegue publicar a porta no IPv6, e conexões para
  `localhost:5432` caem no serviço errado mesmo com o container ativo. Por isso o
  Postgres do `docker-compose.yml` é publicado em **5433** no host (a comunicação
  interna entre containers continua em 5432 via nome do serviço). Ver comentário em
  `.env.example`.
- `expiresIn` do `jsonwebtoken` recebe segundos (via `parseDurationToSeconds`) em vez
  da string bruta (`"15m"`), para compatibilidade com a tipagem atual de
  `@types/jsonwebtoken`.
- Processos Node órfãos (de `tsx watch`/Jest anteriores não encerrados corretamente)
  podem travar o binário nativo do Prisma Client no Windows (`EPERM` ao rodar
  `prisma generate`/`migrate`) — encerrar todos os processos `node` soltos resolve.
- Bug de dependências opcionais do npm + `.npmrc` global com `os=linux` quebra
  `vite`/`rollup` no Windows — ver seção "Stack — Frontend" acima para a correção
  (`npm install --os=win32 --cpu=x64`, sem tocar no `.npmrc` do usuário).

## Convenções de trabalho com o Claude Code

- Não gerar a migration do Prisma sem o schema ser revisado e aprovado antes
- Módulos novos seguem o padrão de camadas do `auth` (controller/service/schema/
  routes) — não pular a separação controller/service mesmo em endpoints simples
- Regras de negócio de limite de plano (ex: máx. 3 matérias no gratuito, histórico de
  relatório, features exclusivas do Premium) vão em `plan.middleware.ts`, não
  espalhadas pelos services
- No frontend, não inventar cores/espaçamentos fora de `src/styles/tokens.css` —
  sempre usar as CSS custom properties ou as classes utilitárias já definidas em
  `src/index.css` (`.btn`, `.card`, `.field`, `.input`, `.tag`)
