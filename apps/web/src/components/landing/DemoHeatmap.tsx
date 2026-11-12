import { DEMO_HEATMAP } from './demoData';

// Niveis 0-4: a partir do accent com opacidade, funciona nos dois temas.
const LEVEL_COLOR = [
  'color-mix(in srgb, var(--color-text) 8%, transparent)',
  'color-mix(in srgb, var(--color-accent) 28%, transparent)',
  'color-mix(in srgb, var(--color-accent) 50%, transparent)',
  'color-mix(in srgb, var(--color-accent) 75%, transparent)',
  'var(--color-accent)',
];

interface DemoHeatmapProps {
  /** Quantas semanas mostrar (as mais recentes). Padrao: todas (53). */
  weeks?: number;
  className?: string;
}

export function DemoHeatmap({ weeks, className }: DemoHeatmapProps) {
  const total = DEMO_HEATMAP.levels.length;
  const from = weeks ? Math.max(0, total - weeks) : 0;
  const levels = DEMO_HEATMAP.levels.slice(from);
  const labels = DEMO_HEATMAP.monthLabels.slice(from);
  const cols = `repeat(${levels.length}, minmax(0, 1fr))`;

  return (
    <div
      className={className}
      role="img"
      aria-label="Exemplo de heatmap anual de estudo, com mais atividade em dias úteis"
    >
      <div className="mb-1.5 grid gap-[3px]" style={{ gridTemplateColumns: cols }}>
        {labels.map((label, i) => (
          <span
            key={i}
            className="overflow-visible whitespace-nowrap text-[10px] leading-none text-muted"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: cols }}>
        {levels.map((week, w) => (
          <div key={w} className="grid gap-[3px]">
            {week.map((level, d) => (
              <div
                key={d}
                className="aspect-square rounded-[2px]"
                style={{ background: LEVEL_COLOR[level] }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
