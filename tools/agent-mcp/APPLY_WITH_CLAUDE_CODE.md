# Prompt para o Claude Code aplicar este esqueleto no Pomofoca

Coloque esta pasta em algum lugar legível (ex.: `~/Downloads/agent-mcp`), abra o Claude Code na raiz do monorepo do Pomofoca e cole o prompt abaixo (ajuste o caminho de origem).

---

```
Aplique no monorepo atual o esqueleto de servidor MCP multiagente que está em ~/Downloads/agent-mcp. Leia o README.md dele primeiro. Trabalhe numa branch nova (chore/agent-mcp) e NÃO faça push nem merge.

Passos:

1. Copie a pasta para `tools/agent-mcp/` na raiz do repositório, SEM node_modules e SEM dist. Antes, verifique o package.json da raiz: se ele usa `workspaces`, confira se o glob incluiria `tools/agent-mcp` e, se incluir, me avise antes de prosseguir (prefiro que o pacote seja independente, com seu próprio package.json e node_modules).

2. Em `tools/agent-mcp`: `npm install`, `npm run build` e `npm test` (os testes não gastam tokens nem precisam de chaves). Se algo falhar, corrija a causa raiz; não desligue testes.

3. Adapte `GATE_CHECKS` em `tools/agent-mcp/src/config.ts` ao layout REAL do monorepo: leia os package.json de backend/frontend (e o da raiz) e use apenas scripts que existem (typecheck, lint, test…), com o `cwd` correto de cada pacote (ex.: `{ name: 'backend:test', script: 'test', cwd: 'backend' }`). Se faltar um script de typecheck, NÃO invente um comando: me diga e sugira `tsc --noEmit` como script. Reconstrua e rode `npm test` de novo.

4. Crie `CONVENTIONS.md` na raiz a partir de `tools/agent-mcp/CONVENTIONS.example.md`, preenchendo os trechos marcados com "AJUSTE" a partir do código REAL (estrutura de pastas, tratamento de erros, estilo de testes, frontend). Não invente: o que você não conseguir confirmar no código, remova ou deixe como pergunta para mim.

5. Acrescente ao `CLAUDE.md` da raiz (crie se não existir, sem apagar nada do que já houver) o conteúdo de `tools/agent-mcp/MANAGER.md`, sem o comentário HTML do topo.

6. Crie/atualize `.mcp.json` na raiz com o servidor `pomofoca-agents` conforme `tools/agent-mcp/.mcp.json.example` (preserve outros servidores existentes). Acrescente ao `.gitignore`: `.agent-logs/`, `.agent-worktrees/`, `tools/agent-mcp/node_modules/`, `tools/agent-mcp/dist/`. Não crie arquivo .env com chaves.

7. Verifique que o servidor sobe: `node tools/agent-mcp/dist/server.js` deve imprimir a linha de "pronto" no stderr e ficar aguardando (encerre com Ctrl+C / timeout). Rode `claude mcp list` e confirme que `pomofoca-agents` aparece.

8. NÃO chame nenhuma ferramenta que consuma API de LLM (codar, testar, revisar, etc.) nesta sessão: não há chaves configuradas e quero decidir o gasto. Só valide com o que não usa LLM.

9. Faça commits pequenos e descritivos na branch chore/agent-mcp e, no final, me entregue um resumo curto: o que foi aplicado, como ficou o GATE_CHECKS, o que ficou pendente (chaves de API, trechos do CONVENTIONS.md que precisam da minha confirmação) e qualquer ponto em que você divergiu destas instruções.
```

---

Depois que o Claude Code terminar:

1. `export ANTHROPIC_API_KEY=...` e `export GOOGLE_GENERATIVE_AI_API_KEY=...` no shell e reinicie o Claude Code.
2. `/model opus` (o gestor).
3. Peça uma tarefa pequena e de baixo risco para validar o fluxo, usando o template do `MANAGER.md`, e acompanhe com a ferramenta `custos`.
