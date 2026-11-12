// Grade semanal de exemplo (dados fixos), no mesmo formato do RoutinePage:
// colunas = dias, blocos posicionados por hora de inicio/fim.

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const FIRST_HOUR = 6;
const LAST_HOUR = 24;

interface DemoBlock {
  day: number;
  start: number;
  end: number;
  label: string;
  color: string;
}

const BLOCKS: DemoBlock[] = [
  { day: 0, start: 8, end: 10, label: 'Química', color: '#35C3BB' },
  { day: 1, start: 14, end: 16, label: 'Cálculo', color: '#8B7CF0' },
  { day: 2, start: 19, end: 21, label: 'Redação', color: '#E9962B' },
  { day: 3, start: 14, end: 16, label: 'Cálculo', color: '#8B7CF0' },
  { day: 4, start: 9, end: 11, label: 'História', color: '#FF8A7A' },
  { day: 5, start: 10, end: 12, label: 'Biologia', color: '#4ED886' },
];

const SPAN = LAST_HOUR - FIRST_HOUR;

export function DemoWeek({ className }: { className?: string }) {
  return (
    <div
      className={className}
      role="img"
      aria-label="Exemplo de rotina semanal com blocos de estudo por matéria"
    >
      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {DAYS.map((d) => (
          <span key={d} className="text-center text-[11px] text-muted">
            {d}
          </span>
        ))}
      </div>
      <div className="grid h-52 grid-cols-7 gap-1.5">
        {DAYS.map((d, day) => (
          <div
            key={d}
            className="relative rounded-[6px]"
            style={{ background: 'var(--color-accent-tint)' }}
          >
            {BLOCKS.filter((b) => b.day === day).map((b) => (
              <div
                key={b.label + b.start}
                className="absolute inset-x-0.5 flex items-start overflow-hidden rounded-[4px] px-1 py-0.5 text-[10px] font-medium leading-tight"
                style={{
                  top: `${((b.start - FIRST_HOUR) / SPAN) * 100}%`,
                  height: `${((b.end - b.start) / SPAN) * 100}%`,
                  background: b.color,
                  color: '#1f1b24',
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
