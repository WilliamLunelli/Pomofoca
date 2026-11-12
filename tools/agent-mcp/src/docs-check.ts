/**
 * Pré-checagem determinística (sem LLM) do papel `documentacao`.
 *
 * Medido em tarefas reais: o worker de documentação gastava uma execução inteira (~150k tokens
 * novos, 12 voltas) para concluir que nenhum `.md` PERMITIDO citava o que mudou — o único que
 * citava era o CLAUDE.md, que é protegido. Esta checagem responde isso na hora.
 */
import { git, isDocPath, isProtectedPath } from './workspace.js';

export interface DocsCheck {
  /** Arquivos alterados pela tarefa (base..HEAD), sem os de documentação. */
  changed: string[];
  /** Docs que o worker PODE editar e que citam algum arquivo alterado. */
  editable: string[];
  /** Docs protegidos (ex.: CLAUDE.md) que citam algum arquivo alterado: ficam para o dono. */
  protectedHits: string[];
}

/** Termos que identificam um arquivo alterado num texto: nome com e sem extensão. */
export function termsFor(file: string): string[] {
  const base = file.split('/').pop() ?? file;
  const stem = base.replace(/\.[^.]+$/, ''); // "insights.service.ts" → "insights.service"
  // Nomes curtos e genéricos ("index", "app") casariam em qualquer doc: ficam de fora.
  return [...new Set([base, stem])].filter(
    (t) => t.length >= 6 && !/^(index|types?|utils?)$/i.test(t),
  );
}

export async function checkDocs(dir: string, base: string): Promise<DocsCheck> {
  const diff = await git(dir, ['diff', '--name-only', base, 'HEAD']);
  const changed = diff.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => !isDocPath(f));
  const terms = [...new Set(changed.flatMap(termsFor))];
  const out: DocsCheck = { changed, editable: [], protectedHits: [] };
  if (!terms.length) return out;

  // git grep: só arquivos versionados, nunca node_modules; -F = termos literais.
  const args = ['grep', '-l', '-I', '-F'];
  for (const t of terms) args.push('-e', t);
  args.push('--', '*.md', '*.mdx', 'docs/');
  const hits = (await git(dir, args)).stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const h of hits) (isProtectedPath(h) ? out.protectedHits : out.editable).push(h);
  return out;
}
