// Grade semanal de exemplo (dados fixos), no mesmo formato do RoutinePage:
// colunas = dias, blocos posicionados por hora de inicio/fim.

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const FIRST_HOUR = 8;
const LAST_HOUR = 22;

interface DemoBlock {
  day: number;
  start: number;
  end: number;
  label: string;
  color: string;
}

const BLOCKS: DemoBlock[] = [
  { day: 0, start: 8, end: 10, label: 'Química', color: '#35C3BB' },
  { day: 0, start: 14, end: 16, label: 'Cálculo', color: '#8B7CF0' },
  { day: 1, start: 14, end: 16.5, label: 'Cálculo', color: '#8B7CF0' },
  { day: 1, start: 19, end: 20, label: 'Redação', color: '#E9962B' },
  { day: 2, start: 9, end: 11, label: 'História', color: '#FF8A7A' },
  { day: 2, start: 19, end: 21, label: 'Redação', color: '#E9962B' },
  { day: 3, start: 14, end: 16, label: 'Cálculo', color: '#8B7CF0' },
  { day: 4, start: 8, end: 9.5, label: 'Química', color: '#35C3BB' },
  { day: 4, start: 10, end: 11, label: 'História', color: '#FF8A7A' },
  { day: 5, start: 10, end: 12, label: 'Biologia', color: '#4ED886' },
];


const SPAN = LAST_HOUR - FIRST_HOUR;
const HOUR_LINES = Array.from({ length: SPAN - 1 }, (_, i) => i + 1);

export function DemoWeek({ className }: { className?: string }) {
  return (
    <div
      className={className}
      role="img"
      aria-label="Exemplo de rotina semanal com blocos de estudo por matéria"
    >
      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {DAYS.map((d) => (
          <span key={d} className="landing-muted text-center text-[11px]">
            {d}
          </span>
        ))}
      </div>
      <div className="grid h-[260px] grid-cols-7 gap-1.5">
        {DAYS.map((d, day) => (
          <div
            key={d}
            className="relative overflow-hidden rounded-[6px]"
            style={{ background: 'var(--color-accent-tint)' }}
          >
            {HOUR_LINES.map((h) => (
              <div
                key={h}
                aria-hidden="true"
                className="absolute inset-x-0 h-px"
                style={{
                  top: `${(h / SPAN) * 100}%`,
                  background: 'color-mix(in srgb, var(--color-text) 7%, transparent)',
                }}
              />
            ))}
            {BLOCKS.filter((b) => b.day === day).map((b) => (
              <div
                key={b.label + b.start}
                className="absolute inset-x-0.5 flex items-start overflow-hidden text-ellipsis rounded-[4px] px-1 py-0.5 text-[10px] font-medium leading-tight"
                style={{
                  top: `${((b.start - FIRST_HOUR) / SPAN) * 100}%`,
                  height: `${((b.end - b.start) / SPAN) * 100}%`,
                  background: b.color,
                  color: 'var(--landing-on-block)',
                }}
              >
                {b.label}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
