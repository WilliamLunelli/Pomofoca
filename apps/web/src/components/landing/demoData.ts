// Dados de exemplo fixos e deterministicos para as demos da landing (sem backend,
// sem Math.random): tudo sai de literais ou de um LCG com seed fixa.

export interface DemoSubject {
  name: string;
  color: string;
  hours: number;
}

export const DEMO_SUBJECTS: DemoSubject[] = [
  { name: 'Cálculo', color: '#8B7CF0', hours: 34.5 },
  { name: 'Química', color: '#35C3BB', hours: 21.25 },
  { name: 'Redação', color: '#E9962B', hours: 13.75 },
  { name: 'História', color: '#FF8A7A', hours: 9.5 },
  { name: 'Biologia', color: '#4ED886', hours: 6.25 },
];

export const HEATMAP_WEEKS = 53;
const MONTHS_PT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

// Domingo fixo: a coluna 0 comeca aqui (UTC, sem depender do relogio do usuario).
const START_UTC = Date.UTC(2025, 0, 5);
const DAY_MS = 86_400_000;

// Seg-sex estudam mais; sabado medio, domingo fraco.
const WEEKDAY_BASE = [1.2, 2.6, 2.8, 2.8, 2.6, 2.4, 1.6];

export interface HeatmapData {
  /** levels[semana][diaDaSemana], 0-4 */
  levels: number[][];
  /** mes curto por semana, so na semana em que o mes muda (senao null) */
  monthLabels: (string | null)[];
}

function buildHeatmap(): HeatmapData {
  let seed = 20250105;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const levels: number[][] = [];
  const monthLabels: (string | null)[] = [];
  let lastMonth = -1;

  for (let w = 0; w < HEATMAP_WEEKS; w++) {
    const week: number[] = [];
    for (let d = 0; d < 7; d++) {
      let score = WEEKDAY_BASE[d] + (rand() - 0.5) * 2.2;
      // ferias de janeiro e de julho: quase nada
      if (w <= 3 || (w >= 25 && w <= 29)) score -= 1.8;
      // semanas de prova fortes (inicio de junho e novembro)
      if (w >= 21 && w <= 22) score += 1.6;
      if (w >= 43 && w <= 44) score += 1.2;
      // dia livre de vez em quando
      if (rand() < 0.08) score = 0;
      week.push(Math.max(0, Math.min(4, Math.round(score))));
    }
    levels.push(week);

    const month = new Date(START_UTC + w * 7 * DAY_MS).getUTCMonth();
    monthLabels.push(month !== lastMonth ? MONTHS_PT[month] : null);
    lastMonth = month;
  }

  return { levels, monthLabels };
}

export const DEMO_HEATMAP: HeatmapData = buildHeatmap();
