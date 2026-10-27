<!--
  Copie para a RAIZ do projeto como CONVENTIONS.md. Os workers leem este arquivo (primeiros 6.000 caracteres).
  Preencha com o que REALMENTE existe no código; apague o que não se aplicar. Mantenha curto.
-->

# Convenções do Pomofoca

## Visão geral
- Monorepo: `backend/` (API) e `frontend/` (PWA). <!-- AJUSTE os nomes reais das pastas -->
- Backend: Node.js, Express, TypeScript, PostgreSQL + Prisma, Redis + BullMQ, validação com Zod, auth JWT + OAuth, pagamentos via Mercado Pago, testes com Jest.
- Frontend: <!-- AJUSTE: framework, gerenciador de estado, estilo (design system "Nocturne": Inter, roxo/índigo, modo escuro) -->

## Código
- TypeScript estrito; sem `any` novo sem justificativa em comentário.
- Toda entrada externa (body, query, params, webhooks) é validada com Zod na borda.
- Estrutura do backend: <!-- AJUSTE: ex. routes → controllers → services → repositories -->
- Erros: <!-- AJUSTE: classe/handler de erro padrão e formato da resposta -->
- Acesso a dados somente via Prisma, dentro de <!-- AJUSTE: camada -->. Sem SQL cru, exceto quando indicado.
- Jobs assíncronos via BullMQ em <!-- AJUSTE: pasta -->.

## Testes
- Jest. Arquivos `*.test.ts` ao lado do código ou em `__tests__/`. <!-- AJUSTE -->
- Unitários não acessam rede, hora real nem banco real (mocks/fakes); integração usa banco de teste.
- Nome dos testes descreve comportamento ("retorna 401 sem token"), não implementação.

## Git e entrega
- Mudanças pequenas e focadas; não alterar lockfiles nem dependências sem pedido explícito.
- Mensagens de commit: <!-- AJUSTE: convenção (ex.: Conventional Commits) -->

## Armadilhas conhecidas
<!-- O gestor acrescenta aqui erros recorrentes, com aprovação do usuário. -->
