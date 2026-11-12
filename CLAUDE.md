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
- Layout do Timer (`zen`/`panel`, padrão `panel`) e layout dos Relatórios
  (`narrative`/`dense`, padrão `narrative`) — replicam as duas variantes de cada tela
  que existiam no protótipo original (ver seções próprias abaixo)
- Tudo persistido em `localStorage`, nada no backend (preferência é só do
  dispositivo/navegador atual)

### Estrutura (`apps/web/src/`)

```
src/
├── components/
│   ├── AppShell.tsx              # sidebar (desktop) + nav inferior (mobile)
│   ├── Foki.tsx                  # mascote reativo (ver seção própria abaixo)
│   ├── landing/                  # demos da landing (ver seção "Landing" abaixo)
│   └── PlanCards.tsx             # os 3 cards de plano, usado em Landing/Onboarding/
│                                     Subscription (ver seção "Preço do Premium")
├── context/
│   ├── AuthContext.tsx           # usuário logado, login/register/logout, refresh
│   └── PreferencesContext.tsx    # tema, cor de destaque, densidade, fonte
├── hooks/
│   ├── useSubjects.ts
│   └── usePomodoroSettings.ts    # duração dos ciclos - só local, não é campo do backend
├── lib/
│   ├── api.ts                    # fetch wrapper com refresh automático de token
│   ├── color.ts                  # OKLCH + generateRamp + paletas curadas
│   └── plans.ts                  # preço/features Free-Premium, compartilhado entre
│                                     LandingPage, OnboardingPage e SubscriptionPage
├── pages/                        # Landing (pública), Onboarding (pós-cadastro),
│                                     Timer, Subjects, Reports, Settings, Subscription,
│                                     Login, Register
├── styles/tokens.css             # design tokens como CSS custom properties
├── App.tsx                       # rotas (react-router)
└── main.tsx
```

### Rotas públicas vs protegidas

`/` (landing), `/login`, `/register` e `/onboarding` são públicas no roteador (fora
do grupo `ProtectedLayout`); `/onboarding` faz sua própria checagem de `useAuth()` e
redireciona pra `/login` se não houver usuário (só faz sentido logo após o cadastro).
Todo o resto (`/timer`, `/subjects`, `/reports`, `/settings`, `/subscription`) fica
dentro do `ProtectedLayout`, que exige login. Fluxo pós-cadastro:
`RegisterPage` → `/onboarding` (Free vs Premium) → `/timer` ou `/subscription`. Login
normal vai direto pra `/timer`, sem passar pelo onboarding.

### Foki (`src/components/Foki.tsx`)

Mascote reativo, **não conversacional** — só troca de pose/expressão via prop
`state: 'idle' | 'focused' | 'celebrating' | 'sad' | 'sleeping'`, sem lógica própria
de app. SVG inline usando os tokens de cor (se adapta a tema/cor de destaque
automaticamente). Mapeamento de estado usado hoje:
- Card de streak (`TimerPage` e `ReportsPage`): `idle` com sequência ativa,
  `sleeping` quando a sequência está zerada. `sad` existe no componente mas não está
  ligado a nenhum evento ainda — fica disponível pra uso futuro (ex: relatório sem
  nenhuma atividade no período)
- `TimerPage`: `focused` (com fone de ouvido) enquanto um ciclo FOCUS está rodando;
  `celebrating` (bounce + sparkles, ~1.6s) no instante em que um ciclo FOCUS é
  concluído; `idle` em qualquer outro caso (pausado, parado, ou durante uma pausa)
- Landing: `focused` → `celebrating` no `DemoTimer` do hero (acompanha o ciclo
  acelerado da demo) e `celebrating` nos cards de streak/CTA final. Com
  `prefers-reduced-motion`, todos caem pra `idle` (via `useReducedMotion`)

### Landing (`src/pages/LandingPage.tsx` + `src/components/landing/`)

Redesenhada pra mostrar o produto em vez de descrevê-lo: hero assimétrico com
`DemoTimer` (anel SVG num ciclo acelerado de 12s, atualizado por refs, sem setState
por frame; pausa fora da viewport e com aba oculta) + `DemoHeatmap` (dados fixos
gerados por seed em `demoData.ts`, 26 semanas no mobile), bento com `DemoSubjects`,
"Como funciona" em 3 passos, offline + `DemoWeek` (rotina semanal), `PlanCards` e
CTA final. `LandingHeader` fica sticky. Todos os demos são **dados fictícios e
decorativos** (`aria-hidden`/`role="img"`), nunca chamam a API. Tokens próprios da
landing em `tokens.css` (`--text-display`, `--landing-*`); `--landing-on-block` é
fixo nos dois temas de propósito (texto sobre os blocos pastel do `DemoWeek`).
Sob `prefers-reduced-motion`: timer estático em 18:42, `.reveal` sem transição.
Sem travessão (— ou –) em texto visível da landing.

### Tint de accent theme-aware (`--color-accent-tint`)

A rampa `--color-accent-100..900` (gerada em `generateRamp()`) usa a mesma escala de
luminosidade **independente do tema**, então usar `accent-100`/`accent-700` direto
pra fundo+texto de um estado ativo (ex: item de menu selecionado) fica quase branco
no dark mode. Pra qualquer fundo "tint" + texto de estado ativo/selecionado, usar
`background: var(--color-accent-tint)` (definido via `color-mix(in srgb,
var(--color-accent) 10%, transparent)`, então sempre correto nos dois temas porque
deriva do `--color-accent` já theme-aware) + `color: var(--color-accent)` — não usar
a rampa numérica pra isso. Já aplicado em: nav ativo (`AppShell`), seletor de período
(`ReportsPage`), `.tag-accent` (usado no badge de desconto do card Premium) e o glow
atrás do timer (`TimerPage`). O heatmap (`HEATMAP_LEVEL_COLOR` em `ReportsPage`)
ainda usa a rampa numérica de propósito (precisa de 5 tons bem diferenciados, não um
tint único) — não foi alterado, pode ter o mesmo problema de contraste no dark mode
se isso incomodar no futuro.

**Tipos de resposta da API:** vivem em `packages/shared/src/types/api.ts` (20 tipos:
`User`, `Subject`, `Task`, `RoutineBlock`, `PomodoroSession`, os de relatório, insights,
notificações e assinatura), reexportados por `@pomofoca/shared` junto com `Plan` e
`SessionType`. O web importa sempre de `@pomofoca/shared` (`import type`), seguindo a
convenção "tipos usados por mais de um app vivem em shared". Antes ficavam em
`apps/web/src/lib/types.ts`, que foi removido.

### Timer (`src/pages/TimerPage.tsx`)

O timer roda inteiramente no cliente (sem estado de timer no servidor). Ao completar
ou pular um ciclo, a página faz `POST /api/sessions` com o registro completo
(duração real decorrida, `completed: true/false`). Ciclos de pausa nunca carregam
`subjectId`. As durações (foco/pausa curta/pausa longa/ciclos até pausa longa) ficam
em `usePomodoroSettings`, só local (o backend não tem esse conceito — é preferência
de uso, não dado de estudo).

**Duas variantes de layout** (`preferences.timerLayout`, toggle no topo da página):
- `zen` — só o anel, relógio, controles e o seletor de matéria (minimalista)
- `panel` (padrão) — tudo isso + coluna lateral com card "Hoje" (breakdown por
  matéria hoje, via `GET /reports/breakdown?period=today`, recarregado a cada sessão
  registrada), seletor de som de fundo e card de streak

**Som de fundo** (card "Som de fundo", só no layout `panel`): 4 opções -
`rain`/`lofi`/`white-noise`/`silence` (padrão), persistido em
`usePomodoroSettings().backgroundSound`. Toca (via `<audio loop>`) só durante um
ciclo FOCUS rodando. **Os arquivos de áudio ainda não existem** — ver
`apps/web/public/sounds/README.md` para os nomes exatos esperados
(`rain.mp3`/`lofi.mp3`/`white-noise.mp3`) e requisitos técnicos (loop sem clique,
1-3min, licenciado pra uso comercial). Até lá, o `<audio>` falha silenciosamente
(`.catch()` no `.play()`) sem quebrar o timer; a UI mostra "em breve" nas opções sem
arquivo.

### Relatórios (`src/pages/ReportsPage.tsx`)

**Duas variantes de visualização** (`preferences.reportsLayout`, toggle ao lado do
seletor de período):
- `narrative` (padrão) — o layout original: 4 KPIs em grid, pizza + barras lado a
  lado, streak, heatmap
- `dense` — grid de 2 colunas com mais métricas visíveis ao mesmo tempo: heatmap +
  barras + tabela de matérias na coluna principal, streak + KPIs empilhados (linha a
  linha em vez de cards) + distribuição por matéria (barra segmentada + lista) na
  coluna lateral

Os dois layouts reaproveitam exatamente os mesmos dados já buscados (`summary`,
`breakdown`, `trend`, `streak`, `heatmap`) — só a apresentação muda, nenhuma request
extra ao trocar de variante.

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

## Como rodar localmente

1. `docker compose up -d postgres redis`
2. Confirme que existe um `.env` na raiz (copie de `.env.example` se não existir) —
   repare que `DATABASE_URL` aponta pra porta **5433**, não 5432 (ver nota de
   ambiente Windows mais abaixo)
3. `npm install` na raiz (instala todos os workspaces)
4. `npm run prisma:migrate --workspace=apps/api` — aplica migrations pendentes.
   **Não rode `npx prisma migrate dev` direto dentro de `apps/api`**: o Prisma CLI
   não usa o `dotenv` custom do `config/env.ts` (que só roda em tempo de execução da
   app) e não acha `DATABASE_URL` porque o `.env` real está na raiz, não em
   `apps/api`. Os scripts `prisma:generate`/`prisma:migrate`/`prisma:studio` do
   `package.json` já usam `dotenv-cli` (`dotenv -e ../../.env -- prisma ...`)
   exatamente pra resolver isso — sempre use os scripts do `npm run`, não o `prisma`
   direto
5. `npm run dev:api` (porta 3333) e `npm run dev:web` (porta 5173, com proxy `/api`
   já configurado no Vite) em dois terminais
6. Abra `http://localhost:5173` — crie uma conta pela tela de registro

Testes do backend: `npm run test --workspace=apps/api`.

## Modelo de dados (Prisma)

Definido em `apps/api/prisma/schema.prisma`. Migrations em
`apps/api/prisma/migrations/`, geradas e aplicadas via `npm run prisma:migrate
--workspace=apps/api` (ver "Como rodar localmente" acima).

- **User** — email, name, passwordHash (nullable — permite conta só-Google), googleId
  (nullable), `plan` (denormalizado: fonte rápida de verdade para o
  `plan.middleware`, mantido sincronizado via webhook do Mercado Pago em vez de
  sempre derivar da tabela `Subscription`), `timezone` (IANA, ex:
  "America/Sao_Paulo", default no schema — capturado automaticamente no frontend
  via `Intl.DateTimeFormat().resolvedOptions().timeZone` a cada login/cadastro,
  nunca escolhido manualmente; `shared/utils/timezone.ts::resolveTimezone` valida
  e cai pro default se o valor recebido não for um IANA reconhecido pelo `Intl` do
  Node. Usado tanto pelo bucketing de dia do `DailyStudyStat`/relatórios quanto
  pelos jobs de notificação — lembrete no horário aprendido, streak em risco às
  20h — pra tudo operar no horário local do usuário, não UTC do servidor)
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
  tamanho do histórico. `date` é o dia de calendário **local** (fuso do usuário,
  `User.timezone`) derivado de `startedAt` da sessão via
  `shared/utils/period.ts::localDateSurrogate` (armazenado como surrogate
  UTC-midnight desse dia local — mesmo truque usado em toda resolução de período
  do módulo `reports`). Corrigido depois de detectar que o bucketing em UTC puro
  creditava sessões noturnas (comuns no Brasil, UTC-3) no dia seguinte, afetando
  streak/heatmap/relatórios de "hoje". Dados históricos já recalculados via
  `apps/api/scripts/backfill-timezone-buckets.ts` (idempotente, reconstrói do zero
  a partir do `PomodoroSession` bruto — reexecutável a qualquer momento sem risco).

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
  (`POST /auth/google { idToken, timezone? }` — backend validado com credenciais
  reais; **frontend implementado nesta sessão**: `apps/web/src/lib/googleAuth.ts`
  carrega o script do Google Identity Services sob demanda e renderiza o botão
  oficial deles via `google.accounts.id.renderButton` — nunca estilizado por nós,
  exigência de marca do Google. `GoogleSignInButton.tsx` + `AuthContext.loginWithGoogle`
  ligam isso no `LoginPage`/`RegisterPage`, acima do form de e-mail/senha com um
  divisor "ou". Requer `VITE_GOOGLE_CLIENT_ID` em `apps/web/.env` (mesmo Client ID
  do backend — é público, identifica a app, não autentica nada sozinho). **Nunca
  testado num navegador de verdade** — só validei que o backend responde certo a
  um ID token forjado/ausente; o clique real no botão do Google, o consentimento e
  o retorno do ID token de verdade dependem de um browser)
- **health** — `GET /api/health`, pública (pra monitor/uptime/healthcheck de
  container), sem auth. Checa Postgres (`SELECT 1`) e Redis (`ping`) em paralelo,
  cada um com timeout `HEALTH_CHECK_TIMEOUT_MS` (default 2000). 200 `{status:'ok'}`
  se ambos respondem, 503 `{status:'degraded'}` se algum falha; o detalhe por
  dependência (`checks`) só aparece fora de produção. Resultado cacheado por
  `HEALTH_CACHE_MS` (default 2000) com single-flight, pra rajada de requests não
  virar rajada de queries. Substituiu o antigo `app.get('/health')` fixo do
  `app.ts` (que respondia ok sem checar nada)
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

**Descobertas testando com credenciais reais de sandbox** (validado em 2026-09-23):
- A API do Preapproval **rejeita `back_url` com `localhost`** — precisa ser uma URL
  pública com HTTPS, mesmo em modo de teste (`{"message":"Invalid value for
  back_url, must be a valid URL"}`). Pra testar localmente, use um túnel (`ngrok
  http 5173`) e aponte `MERCADO_PAGO_BACK_URL` pra URL HTTPS gerada por ele — não dá
  pra usar `http://localhost:5173/...` nem em teste.
- Em modo sandbox, **`payer_email` precisa ser o e-mail de um "usuário de teste"**
  do Mercado Pago, não um e-mail real (`{"message":"Both payer and collector must
  be real or test users"}`). O Mercado Pago exige dois usuários de teste distintos:
  um "vendedor" (cujo Access Token vai em `MERCADO_PAGO_ACCESS_TOKEN`) e um
  "comprador" (cujo e-mail é o que `createCheckout` manda como `payer_email` — hoje
  isso é sempre `user.email`, o e-mail real da conta Pomofoca). Pra testar de
  ponta a ponta em sandbox, a conta Pomofoca usada no teste precisa ter o e-mail do
  usuário de teste "comprador", não um e-mail qualquer. Em produção isso deixa de
  ser problema (usuários reais, `payer_email` real).

**Preço do Premium** (`PREMIUM_MONTHLY_PRICE`/`PREMIUM_YEARLY_PRICE` em `.env`,
validado com o dono do produto): R$14,90/mês ou R$119,90/ano (equivalente a
R$9,99/mês, ~33% de desconto — incentivo deliberado para o plano anual, melhor para
fluxo de caixa e retenção). O backend aceita os dois ciclos via
`POST /subscriptions/checkout { billingCycle: 'MONTHLY' | 'YEARLY' }`, e o frontend
oferece os dois lado a lado: `src/components/PlanCards.tsx` renderiza sempre **3
cards com peso visual equivalente** (Gratuito, Premium Mensal, Premium Anual — sem
toggle, sem link escondido), reaproveitado por `LandingPage`, `OnboardingPage` e
`SubscriptionPage`. O card anual se destaca só pela borda accent + selo "-33%" +
"Recomendado" (não por tamanho), e mostra o preço riscado equivalente (12x o mensal)
ao lado do preço anual. Os benefícios (`PREMIUM_FEATURES`) são idênticos nos dois
cards pagos — só muda preço/periodicidade. Cada card recebe sua ação via prop
(`PlanCardAction`: `label` + `to` ou `onClick` + `disabled`/`loading`), então quem
usa o componente decide o que cada botão faz:
- `LandingPage` (visitante deslogado): os 3 levam pra `/register` (precisa de conta
  pra assinar); se já logado, Gratuito vai pra `/timer` e os dois pagos pra
  `/subscription` (checkout de verdade só roda em página autenticada)
- `OnboardingPage`: Gratuito navega pra `/timer`; Mensal/Anual chamam
  `useCheckout().startCheckout(cycle)` **direto** — não navega mais pra
  `/subscription` (evita o usuário cair numa tela de seleção depois de já ter
  decidido ali)
- `SubscriptionPage`: se o usuário já é Premium, o card do ciclo atual vira
  "Cancelar assinatura" e o outro ciclo pago fica desabilitado ("Plano não ativo" —
  trocar de mensal pra anual ou vice-versa não é suportado neste MVP, exigiria
  cancelar e assinar de novo)

`src/hooks/useCheckout.ts` centraliza a chamada de checkout (POST + redirect pro
`checkoutUrl`) e expõe `loadingCycle` (não só um booleano) pra cada botão saber se é
ELE que está carregando, já que mensal e anual convivem na mesma tela e podem ser
clicados independentemente. Preço/features ficam em `src/lib/plans.ts`.

**`src/pages/SubscriptionCallbackPage.tsx`** (`/subscription/callback`, é pra onde
`MERCADO_PAGO_BACK_URL` aponta) — regra de segurança inegociável: **nunca concede
Premium com base em query params da URL** (são forjáveis pelo navegador do
usuário). A única fonte de verdade é `GET /users/me` — a página faz polling nesse
endpoint (a cada 2s, até 6 tentativas ≈ 12s) esperando `user.plan === 'PREMIUM'`,
que só muda quando o webhook assinado do Mercado Pago confirma o pagamento no
backend. Se o polling esgotar sem confirmar, cai em **Pendente** por padrão (nunca
em Aprovado) — só cai em **Rejeitado** se as próprias chamadas a `/users/me`
falharem (erro de rede/API) ou se a URL trouxer uma pista explícita de rejeição
(`?status=rejected` etc., usada só como heurística auxiliar pro caso negativo,
nunca pra aprovar). Ao confirmar Premium, chama `refreshUser()` do `AuthContext`
pra sincronizar o resto do app (badge PRO no menu, etc.) sem precisar recarregar a
página.

`shared/utils/period.ts` centraliza a resolução de período (`today`/`week`/`month`/
`year`/`all` como janelas rolantes ancoradas em "agora", sempre em UTC) — usado tanto
por `reports.service.ts` quanto por `plan.middleware.ts`.

## Frontend (apps/web) — ver seção "Stack — Frontend" acima para detalhes

Rotas implementadas: `/login`, `/register`, `/timer`, `/subjects`, `/reports`,
`/settings`, `/subscription`. Todas as rotas protegidas exigem usuário logado
(`AuthContext`); token de acesso é renovado automaticamente em qualquer 401 via
`src/lib/api.ts`.

## Funcionalidades Premium (diferenciais)

Três recursos exclusivos do plano Premium, além do já documentado nos módulos
acima — **todos feitos e testados**. Ordem de implementação: sincronização
primeiro (base técnica que os outros reaproveitaram), depois notificações,
insights por último (dependia de histórico real acumulado pra fazer sentido).

### 1. Sincronização do timer entre dispositivos — feito, testado, aprovado

Socket.io (`apps/api/src/realtime/`) + Redis, não REST puro — o timer precisa
atualizar em tempo real nos outros dispositivos do mesmo usuário sem F5.

- **Estado ativo em Redis** (`realtime/activeTimer.ts`): `active_timer:{userId}` →
  `{ subjectId, mode, cycle, remainingSeconds, totalSeconds, status, updatedAt,
  startedAt }`, TTL 4h. `startedAt` é gerido **só pelo servidor** (nunca confiado do
  payload do cliente) — marca o início do ciclo atual, preservado através de
  pause/resume, só reseta num `timer:start` de verdade.
- **Socket.io** (`realtime/socket.ts`): uma room por `userId`
  (`user:{userId}`), autenticação no handshake via JWT + bloqueio de plano FREE
  (`403 PREMIUM_FEATURE_REQUIRED` na conexão, não só nas rotas REST). Eventos:
  `timer:start`/`pause`/`resume`/`finish`/`subjectChange` — o servidor grava no
  Redis e retransmite pros OUTROS sockets da mesma room (quem emitiu já aplicou
  localmente, otimista). Redis adapter (`@socket.io/redis-adapter`) já plugado
  desde o início, mesmo rodando uma instância só — evita retrabalho se um dia
  escalar pra mais de um container da API.
- **`GET /sessions/active`** — hidratação inicial (antes mesmo do socket conectar),
  Premium-gated via `requirePremium`.
- **Finalização autoritativa** (o timer precisa terminar certo mesmo sem nenhum
  dispositivo conectado, e sem inflar tempo que não foi estudado):
  - `jobs/queues/timerCompletion.queue.ts` + `jobs/workers/timerCompletion.worker.ts`
    — job BullMQ com delay = tempo restante, um por usuário (job ID = userId puro,
    **nunca com `:`** — BullMQ rejeita). Roda no MESMO processo da API (não um
    `tsx watch` separado como reports/notifications) porque precisa do `io` pra
    avisar dispositivos conectados. Esse job é só o **caminho feliz**: completa
    como `completed: true` com a duração cheia quando o socket ficou conectado o
    tempo todo (ex: PWA em segundo plano no celular, socket vivo).
  - `realtime/disconnectGrace.ts` — o gatilho principal de verdade. Quando o
    ÚLTIMO socket do usuário desconecta (`io.in(room).allSockets()`, consulta o
    cluster inteiro via adapter Redis), inicia uma janela de tolerância de 60s
    (cobre reload de página, queda de rede momentânea). Reconectar dentro da
    janela cancela tudo. Se não reconectar, finaliza a sessão **imediatamente** ali
    como `completed: false`, com a duração REAL decorrida até o instante da
    desconexão (congelado em `disconnectedAt` — nunca recalculado no momento em
    que a tolerância expira, senão os 60s de espera virariam tempo de estudo
    creditado de graça) — e cancela o job do BullMQ, pra ele nunca completar de
    novo depois com a duração cheia.
  - Ambos os mecanismos foram validados ao vivo (não só type-check): aba fechada
    aos 2s de um ciclo de 25min grava exatamente 2s como interrompida; reportar
    `timer:finish` normalmente cancela o job sem duplicar; reconectar dentro da
    janela cancela a finalização antecipada.
- Frontend: `apps/web/src/hooks/useTimerSync.ts` — só conecta se `plan ===
  'PREMIUM'`. Reconecta proativamente ~30s antes do access token expirar
  (decodifica o `exp` do JWT) e reativamente em `connect_error` com `UNAUTHORIZED`
  (nunca em `PREMIUM_FEATURE_REQUIRED` — seria um loop sem fim pra quem é FREE de
  verdade). `TimerPage.tsx` emite nos pontos reais de mudança de estado
  (start/pause/resume/skip/reset/troca de matéria/conclusão natural) e aplica
  eventos remotos direto no estado local.

### 2. Notificações inteligentes — subscribe/preferências feitos e testados; jobs de disparo pendentes

Web Push nativo (`web-push` + VAPID), sem serviço terceiro pago.

- Modelo: `NotificationPreference` (1:1, `dailyReminderEnabled`/
  `streakRiskEnabled`/`weeklySummaryEnabled`/`learnedReminderTime`) e
  `PushSubscription` (1:N, endpoint + keys) — migration aplicada.
- `apps/api/src/modules/notifications/` — `POST/DELETE /subscribe`,
  `GET/PATCH /preferences`, `POST /test` (envio manual sob demanda, existe
  especificamente pra validar o fluxo ponta a ponta antes dos jobs agendados
  existirem). Tudo Premium-gated. `notifications.service.ts::sendPushToUser` já
  remove sozinho qualquer `PushSubscription` que o push service reporte como morta
  (404/410).
- VAPID: chaves geradas localmente (`npx web-push generate-vapid-keys`, sem conta
  externa), em `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` no `.env` da
  raiz. **A chave pública precisa estar duplicada** em
  `apps/web/.env` (`VITE_VAPID_PUBLIC_KEY`) — são a mesma chave, é seguro expor no
  bundle do cliente (por isso "pública"), mas se regenerar o par, atualizar os
  dois arquivos. Nos testes, `apps/api/tests/jest.setup.ts` gera um par novo a cada
  execução (`webpush.generateVAPIDKeys()`) e **sempre sobrescreve** o ambiente: nenhuma
  chave fica no repositório e os testes nunca usam as chaves reais.
- Frontend: `apps/web/src/lib/push.ts` (subscribe/unsubscribe/status via
  `PushManager`) + seção "Notificações" em `SettingsPage.tsx` (Premium-gated,
  upsell pra FREE). **Mudança de arquitetura do PWA**: `vite.config.ts` trocou de
  `strategies: 'generateSW'` pra `injectManifest` — o `generateSW` não permite
  injetar listeners de evento customizados (`push`, `notificationclick`) no
  service worker gerado. O SW agora vem de `apps/web/src/sw.ts` (código próprio +
  `precacheAndRoute` do Workbox). `devOptions.enabled: true` também ligado, senão
  o SW só registra num build de produção — necessário pra testar push em
  `npm run dev:web` sem precisar buildar toda vez. Build de produção validado:
  `dist/sw.js` contém os handlers customizados, precache com 7 entries.
- **Jobs de disparo — feitos e testados** (`jobs/workers/notifications.worker.ts`).
  Uma única varredura horária (`hourly-sweep`, cron `0 * * * *`) cobre os 3 tipos
  em vez de 3 jobs separados — evita repetir a mesma query de usuário 3x só pra
  saber "que horas são no fuso dele agora":
  - **Lembrete diário**: dispara se `learnedReminderTime === hora local atual` E o
    usuário ainda não completou nenhuma sessão hoje (`DailyStudyStat.sessionsCompleted`)
  - **Streak em risco**: às 20h locais, se `currentStreak > 0` E hoje ainda não
    virou "dia ativo" (mesmo piso de `MIN_SECONDS_FOR_ACTIVE_DAY` da streak,
    exportado de `reports.service.ts` — nunca duplicado)
  - **Resumo semanal**: domingo às 20h locais, reaproveita `reportsService.getCompare`
  - `learn-reminder-times` (cron semanal, segunda 03h UTC — não precisa ser
    timezone-preciso, só recalcula um campo em segundo plano): moda (hora mais
    frequente, no fuso local) dos horários de início de sessões FOCUS nos últimos
    30 dias. Exige no mínimo 5 sessões na amostra antes de arriscar um palpite —
    senão não seta `learnedReminderTime`, e o lembrete diário simplesmente não
    dispara até haver dado suficiente.
  - Ambos os workers rodam **no mesmo processo da API** (`initNotificationsWorker()`
    chamado direto em `server.ts`, não via `npm run worker:notifications` separado)
    — mesma lógica do `timerCompletion.worker.ts`: um worker que ninguém lembra de
    iniciar num terceiro terminal é um job agendado que nunca roda. Extrair pra
    processo próprio depois é trivial (o script já existe) se a escala pedir.
  - Validado rodando de verdade (não só type-check): enfileirei os dois jobs
    manualmente contra a conta demo — `learn-reminder-times` calculou corretamente
    "05:00" a partir de sessões seedadas às 8h-10h UTC (5h-7h em
    America/Sao_Paulo, confirma a conversão de fuso), e `hourly-sweep` corretamente
    **não** disparou nada fora do horário/condição certos (nenhum falso positivo).
- **Pendente**: testar o recebimento real de uma notificação push num navegador de
  verdade (só validei subscribe/unsubscribe/test-send/jobs via curl/socket script,
  nunca em browser real).

### 3. Insights adaptativos — feito e testado

Motor de regras estatísticas sobre `DailyStudyStat`/`PomodoroSession` (sem IA
generativa, sem custo de API). `apps/api/src/modules/insights/`.

- **Piso geral** (`insights.service.ts::getEligibility`) — nenhum insight é gerado
  (nem parcialmente) com menos de 14 dias de histórico (desde a primeira sessão
  FOCUS) ou menos de 20 sessões FOCUS completadas. Checagem barata (2 queries
  indexadas), separada do cálculo pesado — por isso pode rodar a cada `GET
  /insights` (pra mostrar "faltam N dias/sessões" sempre atualizado, mesmo entre
  execuções do job semanal), enquanto o cálculo dos insights em si só roda no job.
- **5 funções puras**, cada uma com seu próprio piso mínimo de amostra além do
  piso geral (testáveis isoladamente, sem mock de Prisma — recebem os dados já
  buscados):
  - `computePeakHours` — bloco de 2h (fuso local) com melhor taxa de conclusão vs
    a média geral; mínimo 5 sessões no bloco
  - `computeWeakDay` — dia da semana com menor média de minutos (contando dias sem
    estudo como 0, não só os dias com dado) nas últimas 8 semanas; mínimo 4
    semanas com dado nesse dia
  - `computeNeglectedSubject` — matéria com meta semanal definida há ≥ 14 dias e
    com a menor razão estudado/meta nas últimas 2 semanas; só reporta se < 60% da
    meta
  - `computeInterruptionPattern` — compara taxa de interrupção por matéria vs por
    bloco de horário, usa a que tiver diferença mais significativa; mínimo 10
    sessões interrompidas na amostra E gap ≥ 20 pontos percentuais vs a média
  - `computeRoutineMismatch` (`routine_mismatch`) — compara os `RoutineBlock` ativos e
    com matéria (não arquivada) com as sessões FOCUS reais das últimas 4 semanas
    (fuso local, sem o dia de hoje). Numa ocorrência do dia do bloco, "no horário" se
    uma sessão da matéria cruza o bloco; "fora" se houve sessão da matéria no dia mas
    nenhuma cruza. Piso: ≥ 3 vezes fora, mais fora do que dentro, e começando no mesmo
    bloco de 2h em ≥ 3 delas. **Só sugere** ("Que tal ajustar o bloco?"), nunca
    altera o `RoutineBlock`. Ícone `CalendarBlank` no card
  - **Descoberto rodando contra dado real** (não só testes unitários): sem piso de
    diferença mínima, `peak_hours`/`weak_day` geravam insights tecnicamente
    verdadeiros mas irrelevantes (“completa 1% mais pomodoros entre 4h-6h”) — nada
    no spec original previa isso. Adicionado `MIN_MEANINGFUL_DIFF_PERCENT = 10`
    como piso de relevância nos dois.
- **Desempate simples**: primeiro por ordem (de dia da semana, de bloco de
  horário) quando há empate — nunca aleatório.
- `InsightSnapshot` — 1 por usuário (upsert, não histórico), `insights` (jsonb) +
  `dataPointsUsed`. Recalculado pelo job semanal (`insights.worker.ts`, cron
  idêntico ao `learn-reminder-times`), só pra usuários Premium — Free nunca
  computa nem checa pisos (economiza processamento em quem não vai ver o
  resultado).
- `GET /insights` (Premium-gated) — `{ hasEnoughData, generatedAt, missingDays,
  missingSessions, insights[] }`.
- Frontend: seção "Insights" em `ReportsPage.tsx` (`insightsCard`, presente nos
  dois layouts narrative/dense), com os 3 estados — locked (FREE), dado
  insuficiente (progresso "faltam N dias/sessões"), e lista de insights com ícone,
  descrição e "baseado em N sessões".
- Validado rodando de verdade contra a conta demo (não só testes unitários):
  disparei o job manualmente duas vezes — a primeira confirmou o bug do insight
  irrelevante acima (e a correção), a segunda confirmou o resultado final
  (`weak_day` corretamente reportado, `peak_hours` corretamente descartado por não
  bater o novo piso de relevância).

## Tarefas e rotina semanal

Duas features fora do pacote Premium original — feitas e testadas nesta sessão.
`apps/api/src/modules/tasks/` e `apps/api/src/modules/routine/`.

### Tarefas por matéria

Conecta tempo estudado a um objetivo concreto, não só "estudei Cálculo" genérico.

- `Task` (id, userId, subjectId, title, completed, completedAt, order) —
  `order` permite reordenar manualmente (não usado pelo frontend ainda, só o
  campo existe pra isso). Endpoints assimétricos de propósito: criar/listar são
  aninhados (`POST`/`GET /subjects/:subjectId/tasks`, precisam saber a matéria
  pra validar ownership e aplicar o limite do plano), editar/apagar são planos
  (`PATCH`/`DELETE /tasks/:id`, já sabem a tarefa pelo id). No
  `routes/index.ts`, a rota aninhada é registrada **antes** de `/subjects` —
  mais específica, evita qualquer ambiguidade de path.
- Limite do plano FREE: até 10 tarefas ativas (não completas) por matéria,
  ilimitado no Premium — `plan.middleware.ts::enforceTaskLimit`, mesma lógica de
  `enforceSubjectLimit`.
- `PomodoroSession.taskId` (opcional) — sessão pode carregar a tarefa ativa
  daquela sessão de foco. Validado (ownership) em `sessions.service.ts` do mesmo
  jeito que `subjectId` já era.
- Frontend: `SubjectTasks.tsx` (lista expansível por matéria em
  `SubjectsPage.tsx`, criar/marcar completa/excluir sem sair da tela) +
  integração no `TimerPage.tsx` — ao selecionar uma matéria com tarefas
  pendentes, um seletor de "tarefa ativa" aparece no layout `panel` (não no
  `zen`, minimalismo de propósito), a tarefa escolhida fica visível abaixo do
  relógio, e um botão marca ela como concluída sem sair do timer. Tarefa ativa é
  por matéria — trocar de matéria limpa a seleção. `taskId` vai junto no
  `POST /sessions` quando a sessão é FOCUS.

### Rotina semanal

Grid semanal recorrente (não calendário — sem datas específicas, sem eventos
únicos). Disponível no plano **FREE também** (diferente de tarefas) — ajuda a
converter quem ainda não decidiu assinar.

- `RoutineBlock` (id, userId, subjectId opcional, dayOfWeek 0-6 domingo=0,
  startTime/endTime "HH:mm", label opcional, active) — `startTime`/`endTime`
  validados por regex no schema Zod, e por um `refine` garantindo
  `endTime > startTime` (só quando os dois vêm juntos no PATCH — atualizar só
  um dos dois não revalida contra o valor existente no banco, limitação
  conhecida, aceita por simplicidade). Sem endpoint de plan-gating — `routine.routes.ts`
  não usa `plan.middleware.ts` de propósito.
- Frontend: `RoutinePage.tsx` (rota `/routine`, nova aba na navegação) — grid de
  7 colunas (dias) × horas (6h-24h, uma linha por hora), blocos posicionados de
  forma absoluta dentro da coluna do dia (`top`/`height` calculados a partir de
  `startTime`/`endTime`, não são células de tabela fixas — permite blocos que
  não começam/terminam em hora cheia). Clique num espaço vazio cria um bloco
  (dia/hora pré-preenchidos, editável no modal); clique num bloco existente
  edita (com opção de excluir e de desativar temporariamente via `active` sem
  apagar). Sem arrastar/soltar, por design (spec explícita). Card "Hoje" no topo
  mostra os blocos do dia atual com indicação visual de "cumprido" —
  simplificado pra v1: compara contra `GET /reports/breakdown?period=today` e
  marca como cumprido se a matéria do bloco teve algum minuto estudado hoje
  (não faz comparação fina de sobreposição de horário; blocos sem matéria
  vinculada não têm como ser verificados automaticamente, ficam neutros).
- **Insight `routine_mismatch`** (implementado depois do motor de Insights validado):
  compara os blocos com os horários reais de estudo e sugere ajuste quando há
  descompasso consistente — sempre como sugestão, nunca uma mudança automática no
  bloco. Detalhes na seção "3. Insights adaptativos".
- Validado rodando de verdade contra a conta demo: fluxo completo testado via
  script Node com `fetch` (não curl direto — descobri que caracteres acentuados
  passados por linha de comando no Bash deste ambiente Windows chegavam
  corrompidos ao servidor via `curl -d`, um problema de encoding do
  shell/terminal, não do backend; confirmado comparando o mesmo payload enviado
  via `fetch` puro, que preservou UTF-8 corretamente — vale lembrar disso pra
  qualquer teste futuro com acentos via linha de comando neste ambiente).

## Estado atual / progresso

Feito — backend completo (auth, users, subjects, sessions, reports, subscriptions),
frontend completo (todas as telas do MVP conectadas à API real), ambos validados:

- Testes automatizados: suite completa do backend em **134/134** passando
  (`npm run test --workspace=apps/api`), sem depender do `.env` local
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
2. **Exportação de relatório em PDF** — é o que menos bloqueia uso real do produto
   agora, fica por último; fila BullMQ já esqueletizada em
   `jobs/queues/reports.queue.ts` / `jobs/workers/reports.worker.ts`

Outras pendências, sem ordem definida ainda:
3. Testar o botão "Continuar com Google" (frontend) num navegador de verdade — o
   backend já foi validado com credenciais reais, o frontend nunca foi (ver seção
   "Login com Google" abaixo)
4. Teste manual no navegador do frontend completo (ver nota acima) — agora inclui
   também testar notificações push recebidas de verdade (ver seção "Funcionalidades
   Premium") e o fluxo de tarefas/rotina semanal (ver seção "Tarefas e rotina
   semanal")

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
- **`Ctrl+C` no terminal do `npm run dev:api` nem sempre mata o `tsx watch`
  subjacente no Windows** (npm não propaga o sinal pra árvore de processo de forma
  confiável). O processo órfão continua rodando e segurando a porta 3333, então o
  próximo `npm run dev:api` falha com `EADDRINUSE: address already in use :::3333`.
  Isso **não é perda de dados** — o processo órfão continua servindo requests e
  gravando no Postgres normalmente (confirmado: usuários registrados continuam no
  banco entre reinícios); a confusão é achar que o servidor não subiu e os dados
  "sumiram". Se aparecer `EADDRINUSE`, rode antes de tentar de novo:
  `Get-Process -Name node | Stop-Process -Force` (mata todos os `node` soltos,
  inclusive Jest/scripts esquecidos) e só então `npm run dev:api`.
- Bug de dependências opcionais do npm + `.npmrc` global com `os=linux` quebra
  `vite`/`rollup` no Windows — ver seção "Stack — Frontend" acima para a correção
  (`npm install --os=win32 --cpu=x64`, sem tocar no `.npmrc` do usuário).
- **`npm run build --workspace=apps/api` só funciona depois de `npm run
  build:shared`** (que gera `packages/shared/dist`). O `apps/api/tsconfig.json` tinha
  um `paths` apontando `@pomofoca/shared` direto pro `src` do pacote compartilhado
  (conveniente pro `tsx watch` em dev, que respeita `paths` do tsconfig), mas isso
  conflitava com `rootDir: "./src"` na hora de um `tsc` de verdade (erro TS6059 —
  arquivo fora do rootDir). Removido o `paths`; agora `@pomofoca/shared` resolve pelo
  jeito padrão do Node (symlink do workspace → `packages/shared/dist`, via
  `main`/`types` do `package.json` do pacote). **Esse bug existia desde o começo e
  nunca foi pego** porque só rodávamos a API via `tsx watch` (que não faz essa
  checagem) — o build real (e o Docker, que chama exatamente esse script) nunca
  tinha sido testado até agora. `apps/web` não tinha esse problema porque o `tsc -b`
  ali roda com `noEmit: true` (só type-check) e o Vite resolve `@pomofoca/shared` via
  alias próprio (`vite.config.ts`) direto pro `src`, sem precisar do `dist`.
- **Logs de erro não capturados (`error.middleware.ts`) apareciam como `{}` no
  pino**, escondendo mensagem e stack trace de qualquer falha inesperada. Causa: o
  serializer padrão do pino só reconhece a chave `err`, não `error` — `logger.error({
  error }, ...)` não serializa nada útil. Corrigido pra `logger.error({ err: error
  }, ...)`. Isso mascarou os erros reais da integração com Mercado Pago por um
  tempo — vale lembrar desse padrão (`err`, não `error`) em qualquer log futuro.

## Deploy de produção

- **Arquitetura de processos: tudo roda in-process, um container `api` só.**
  Sincronização (Socket.io + `timerCompletion.worker.ts`), notificações
  (`initNotificationsWorker()`) e insights (`initInsightsWorker()`) são chamados
  direto em `server.ts`/`realtime/socket.ts` — não existe worker funcional
  rodando em processo separado hoje. `reports.worker.ts` é o único módulo que se
  auto-instancia no topo do arquivo (`new Worker(...)` fora de função), mas
  **nunca é importado em lugar nenhum** e a fila `'reports'` não tem nenhum
  produtor real ainda (PDF export não implementado) — é código morto até essa
  feature existir.
- **Bug pré-existente descoberto revisando pra este deploy:** o
  `docker-compose.yml` de dev e o script `worker:notifications` do
  `apps/api/package.json` chamam `notifications.worker.ts` como processo
  standalone (`node .../notifications.worker.js` / `tsx watch
  .../notifications.worker.ts`), mas esse arquivo só **exporta** a função
  `initNotificationsWorker` — não tem nenhuma auto-execução no topo do módulo.
  Rodar esse container/script hoje não inicia o worker de verdade (sobe, importa,
  não faz nada). É resquício de uma arquitetura anterior à decisão (já
  documentada acima) de rodar tudo in-process — não corrigido ainda porque não
  bloqueia nada em dev (o worker real roda dentro do processo principal da API de
  qualquer forma). Por isso `docker-compose.prod.yml` **não** tem serviço worker
  dedicado — só `postgres`, `redis`, `api`, `web` e `caddy`.
- **`docker-compose.prod.yml`** (raiz) — variante de produção do compose de dev:
  sem portas de `postgres`/`redis` expostas no host (só a rede interna), `api`
  sem porta publicada (só o Caddy fala com ela), e um serviço `caddy` (imagem
  `caddy:2-alpine`) na frente de tudo nas portas 80/443, com TLS automático via
  domínio (`DOMAIN` no `.env.production`). **Rodar sempre com `--env-file`**
  (não é automático como o `.env` da raiz seria) porque `env_file:` dentro de um
  serviço só injeta variável dentro do container, não resolve `${VAR}` no
  próprio arquivo do compose:
  `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`
- **`.env.production.example`** (raiz) — template de produção, separado do
  `.env.example` de dev porque tem valores estruturalmente diferentes (HTTPS
  obrigatório, `DATABASE_URL`/`REDIS_URL` apontando pro nome do serviço em vez de
  `localhost`, secrets que devem ser gerados de novo — nunca reaproveitar os de
  dev). Inclui as variáveis que só existem desde as features de Push/Google OAuth
  (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`,
  `VITE_GOOGLE_CLIENT_ID`) — essas já estavam corretas nos `.env.example`
  existentes (raiz e `apps/web`), só faltava propagar pro fluxo de build de
  produção (ver próximo ponto).
- **`apps/web/Dockerfile` recebeu `ARG`/`ENV` pra `VITE_GOOGLE_CLIENT_ID` e
  `VITE_VAPID_PUBLIC_KEY`** — o Vite inlina `VITE_*` no bundle em tempo de
  **build**, não runtime, então só existir num `.env` não adianta nada pro
  container final (é HTML/JS estático servido pelo nginx, sem processo Node pra
  ler variável nenhuma). `docker-compose.prod.yml` repassa isso via `build.args`,
  lidos do `.env.production` (por isso o `--env-file` acima é obrigatório, não
  só uma boa prática).
- **`Caddyfile`** (raiz) — roteia por path: `/socket.io/*` e `/api/*` vão pro
  container `api:3333` (com `Connection`/`Upgrade` forçados explicitamente pro
  handshake de WebSocket do Socket.io — o `reverse_proxy` do Caddy já repassa
  esses headers por padrão, mas foram fixados aqui pra não depender de
  comportamento implícito caso outro proxy/CDN seja colocado na frente do Caddy
  no futuro), qualquer outra rota cai no `web:80` (build estático via nginx). O
  frontend conecta o Socket.io com `io({ path: '/socket.io' })` sem host —
  same-origin, por isso precisa necessariamente passar pelo Caddy até a `api`, não
  pelo nginx do container `web` (que hoje só tem proxy configurado pra `/api/`,
  não pra `/socket.io/` — não é um problema em produção porque o Caddy intercepta
  esse path antes de chegar no nginx, mas é uma lacuna real do `nginx.conf` atual
  se ele algum dia for exposto sozinho, sem o Caddy na frente).
- Validado: `Caddyfile` passa em `caddy validate` (imagem `caddy:2-alpine`);
  `docker-compose.prod.yml` passa em `docker compose config` com
  `--env-file .env.production`. **Nunca implantado de verdade** (sem servidor de
  produção/domínio real neste ambiente) — falta testar TLS automático, o
  handshake de WebSocket atrás do Caddy, e o build do frontend com as `VITE_*`
  de produção de ponta a ponta.
- **Estimativa de RAM** (medida rodando `docker-compose.prod.yml` completo
  localmente, 6 usuários simulados + sessões + 6 sockets Socket.io ativos):
  idle ~111 MiB total (postgres 36 + api 36 + redis 9 + caddy 15 + web 15), sob
  carga leve ~181 MiB total (postgres 84 + api 49 + redis 9 + caddy 24 + web 15).
  CPU ficou perto de 0% em todos os containers nesse teste — RAM é a variável
  que importa pra dimensionar o servidor, não CPU. Número realista pra planejar
  (não só o piso do laboratório): **2GB de RAM como mínimo confortável**, já que
  o Postgres cresce com volume real de dados (não só as poucas dezenas de linhas
  do teste) e o SO + Docker sozinhos já consomem 200-300MB.
- **Suporte a ARM64 confirmado** (Oracle Cloud Free Tier roda em instância ARM
  Ampere) — `node:20-alpine`, `postgres:16-alpine`, `redis:7-alpine`,
  `caddy:2-alpine` e `nginx:1.27-alpine` publicam manifest multi-arquitetura
  com `linux/arm64/v8` nativo (confirmado via `docker buildx imagetools
  inspect`). Nenhum `platform:` fixo no `docker-compose.prod.yml`/Dockerfiles —
  buildar direto na própria instância Oracle usa a arquitetura nativa do host
  automaticamente, sem nenhum ajuste necessário. Único ponto de risco real era
  dependência nativa (`bcrypt`, binário compilado por arquitetura, e o engine
  do Prisma) - **testado de verdade** via `docker buildx build --platform
  linux/arm64` (emulação QEMU) pros dois Dockerfiles: `apps/api` builda limpo
  (`npm ci` resolve o binário `bcrypt` certo pra `linux-arm64-musl` sem precisar
  de toolchain de compilação) e o container resultante roda `bcrypt.hash`/
  `compare` corretamente e carrega o engine do Prisma sem erro (usando o fix de
  OpenSSL acima); `apps/web` builda limpo (Rollup também resolve o binário
  nativo certo pra arm64 automaticamente dentro do container, diferente do bug
  de `.npmrc`/`os=linux` que afeta só o ambiente Windows do dev, documentado
  mais abaixo - não se repete aqui porque o `npm ci` roda dentro do container
  Linux de verdade, não pelo host Windows).

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

## Modo gestor (servidor MCP `pomofoca-agents`)

Você é o **gestor**. Planeje, delegue, decida. Não implemente você mesmo o que um worker pode fazer, e **não leia o repositório inteiro**: use `explorar`.

### Fluxo padrão

1. `tarefa_abrir` com um `taskId` curto (ex.: `relatorio-mensal`). Tarefas independentes = `taskId`s diferentes, podem andar em paralelo.
2. `explorar` com o objetivo → receba o mapa (arquivos, convenções, riscos).
3. Monte a instrução do worker **autocontida**: objetivo, arquivos relevantes (do mapa), restrições, critério de aceitação. Sem isso o worker chuta.
4. `codar` → leia só o relatório curto + diffstat.
5. `testar` descrevendo o **comportamento esperado** (não a implementação).
6. `gate`. Se falhar: `triar_falhas` e roteie conforme `PRÓXIMO PASSO`:
   - `bug_codigo` → `codar` com o erro resumido
   - `teste_ruim` → `testar` com o erro resumido
   - `ambiente` / `humano` → pare e fale com o usuário
7. Com o gate verde: `revisar`. `BLOQUEANTES` e `IMPORTANTES` → `codar` para corrigir e volte ao `gate`.
8. `auditar_seguranca` obrigatório se a tarefa tocar auth (JWT/OAuth), pagamentos (Mercado Pago/webhooks), rotas públicas ou validação de entrada.
9. `documentar` se houve mudança de comportamento, rota ou configuração.
10. `custos` e relate ao usuário: o que foi feito, estado do gate, achados abertos, branch `agent/<taskId>`.
11. **Não faça merge sem o OK do usuário.** `tarefa_encerrar` só depois.

### Regras de economia e controle

- Máximo de **3 rodadas** de correção (codar→gate). Na 4ª, pare e explique o impasse ao usuário.
- Nunca cole diffs ou logs inteiros nas instruções; cite arquivo:linha e o erro resumido.
- Se o servidor responder que o orçamento da tarefa estourou, **pare** e peça decisão.
- Se um worker devolver relatório vago ou sem arquivos alterados, reformule a instrução com mais contexto antes de repetir.
- Não peça ao programador para editar testes, nem ao testador para editar código de produção: troque de worker.
- Não peça a worker para rodar a suíte completa nem o lint: peça só o arquivo de teste que importa. O `gate` roda tudo depois, sem LLM (medido: pedir a suíte completa custava voltas e tokens à toa).
- Tarefa pequena com arquivo já conhecido pode pular o `explorar`. O `documentar` já se checa sozinho sem LLM e responde na hora quando nenhum `.md` editável cita o que mudou.
- Acompanhe pelo painel ao vivo: `npm run painel` em `tools/agent-mcp` → http://127.0.0.1:4777. O `custos` separa tokens novos de leitura de cache.
- Quando aprender uma convenção ou um erro recorrente do projeto, proponha ao usuário acrescentar ao `CONVENTIONS.md` (os workers leem esse arquivo).

### Template de instrução para `codar` / `testar`

```
OBJETIVO: <1-2 frases>
CONTEXTO: <arquivos/trechos relevantes, vindos do explorar>
RESTRIÇÕES: <o que NÃO mudar; libs permitidas; padrões a seguir>
ACEITAÇÃO: <como saberemos que está pronto; comportamentos e casos de borda>
```
