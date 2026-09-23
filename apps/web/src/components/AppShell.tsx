import {
  ChartLineUp,
  FlagBanner,
  GearSix,
  Books,
  Timer as TimerIcon,
} from '@phosphor-icons/react';
import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';

const NAV_ITEMS = [
  { to: '/timer', label: 'Timer', icon: TimerIcon },
  { to: '/subjects', label: 'Matérias', icon: Books },
  { to: '/reports', label: 'Relatórios', icon: ChartLineUp },
  { to: '/settings', label: 'Configurações', icon: GearSix },
];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[228px] flex-none flex-col gap-2 border-r border-divider p-6 py-6 md:flex">
        <div className="mb-8 flex items-center gap-2 px-3">
          <TimerIcon weight="fill" size={19} className="text-accent" />
          <span className="font-heading text-base tracking-tight">Pomofoca</span>
          {user?.plan === 'PREMIUM' && (
            <span className="tag tag-outline ml-1 text-[9px]">PRO</span>
          )}
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-sm px-3 py-2.5 text-sm transition-colors ${
                  isActive ? '' : 'text-text hover:bg-tint'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      background: 'var(--color-accent-tint)',
                      color: 'var(--color-accent)',
                    }
                  : undefined
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        {user?.plan === 'FREE' && (
          <NavLink
            to="/subscription"
            className="flex items-center gap-2.5 rounded-sm border border-transparent px-3 py-2 text-sm text-muted hover:bg-tint"
          >
            <FlagBanner size={16} />
            Assinar Premium
          </NavLink>
        )}

        <div className="mt-2 flex items-center gap-2.5 rounded-sm bg-tint p-3">
          <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-bg">
            {user ? initials(user.name) : '·'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs">{user?.name}</div>
            <div className="text-[10px] text-muted">
              {user?.plan === 'PREMIUM' ? 'Premium' : 'Gratuito'}
            </div>
          </div>
          <button onClick={logout} className="text-[10px] text-muted hover:text-text">
            Sair
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-divider bg-surface md:hidden">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] ${
                isActive ? 'text-accent' : 'text-muted'
              }`
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
