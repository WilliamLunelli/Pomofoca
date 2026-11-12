import { DEMO_SUBJECTS } from './demoData';

function formatHours(h: number): string {
  return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;
}

export function DemoSubjects({ className }: { className?: string }) {
  const total = DEMO_SUBJECTS.reduce((sum, s) => sum + s.hours, 0);

  return (
    <div className={className}>
      <div
        aria-hidden="true"
        className="mb-4 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full"
      >
        {DEMO_SUBJECTS.map((s) => (
          <div
            key={s.name}
            style={{ background: s.color, width: `${(s.hours / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {DEMO_SUBJECTS.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: s.color }}
            />
            <span className="flex-1">{s.name}</span>
            <span className="tabular-nums text-muted">{formatHours(s.hours)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
