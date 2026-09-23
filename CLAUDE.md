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
│   ├── plans.ts                  # preço/features Free-Premium, compartilhado entre
│   │                                 LandingPage, OnboardingPage e SubscriptionPage
│   └── types.ts                  # tipos das respostas da API (não vieram de
│                                     packages/shared ainda - ver nota abaixo)
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
- `LandingPage`: `idle` perto do hero, `sleeping` pequena no rodapé, como assinatura
  discreta de marca

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
