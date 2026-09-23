export const FREE_FEATURES = [
  'Timer pomodoro ilimitado',
  'Até 3 matérias ativas',
  'Relatórios dos últimos 7 dias',
];

export const PREMIUM_FEATURES = [
  'Matérias ilimitadas',
  'Histórico completo de estudo',
  'Heatmap anual',
  'Comparativo entre períodos',
  'Exportação de relatórios',
];

export const MONTHLY_PRICE = 14.9;
export const YEARLY_PRICE = 119.9;
export const YEARLY_MONTHLY_EQUIVALENT = YEARLY_PRICE / 12;
/** Quanto custaria pagando 12x no mensal - exibido riscado ao lado do preço anual. */
export const YEARLY_FULL_PRICE_EQUIVALENT = MONTHLY_PRICE * 12;
export const YEARLY_DISCOUNT_PERCENT = Math.round(
  (1 - YEARLY_MONTHLY_EQUIVALENT / MONTHLY_PRICE) * 100,
);

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
