export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Valida um IANA timezone (ex: "America/Sao_Paulo") tentando formatar uma data com
 * ele - `Intl` lança RangeError pra qualquer string que nao seja um timezone IANA
 * reconhecido. Nunca rejeita a request por causa disso (o campo e capturado
 * automaticamente pelo navegador, nao digitado pelo usuario) - so cai pro default.
 */
export function resolveTimezone(candidate: string | undefined): string {
  if (!candidate) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
