import { Minus, MoonStars, Plus, SunDim } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { usePomodoroSettings } from '@/hooks/usePomodoroSettings';
import { ACCENT_PRESETS } from '@/lib/color';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { settings, update } = usePomodoroSettings();
  const prefs = usePreferences();

  const durations: {
    key: 'focusMinutes' | 'shortBreakMinutes' | 'longBreakMinutes';
    label: string;
    hint: string;
    min: number;
    max: number;
  }[] = [
    {
      key: 'focusMinutes',
      label: 'Foco',
      hint: 'Duração de cada ciclo de estudo',
      min: 5,
      max: 90,
    },
    {
      key: 'shortBreakMinutes',
      label: 'Pausa curta',
      hint: 'Entre ciclos de foco',
      min: 1,
      max: 30,
    },
    {
      key: 'longBreakMinutes',
      label: 'Pausa longa',
      hint: 'A cada N ciclos completos',
      min: 5,
      max: 60,
    },
  ];

  return (
    <div className="max-w-[660px] p-6 md:p-8">
      <h3 className="mb-8 text-xl">Configurações</h3>

      <div className="flex flex-col gap-8">
        <section>
          <h6 className="mb-4">Durações</h6>
          <div className="card px-6 py-1">
            {durations.map((d, i) => (
              <div
                key={d.key}
                className="flex items-center gap-6 py-4"
                style={{
                  borderBottom:
                    i < durations.length - 1 ? '1px solid var(--color-divider)' : 'none',
                }}
              >
                <div className="flex-1 text-sm">
                  {d.label}
                  <div className="text-[11px] text-muted">{d.hint}</div>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => update(d.key, Math.max(d.min, settings[d.key] - 1))}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-[52px] text-center font-heading text-[17px] tabular-nums">
                    {settings[d.key]}m
                  </span>
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => update(d.key, Math.min(d.max, settings[d.key] + 1))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h6 className="mb-4">Comportamento</h6>
          <div className="card px-6 py-1">
            <div className="flex items-center gap-6 border-b border-divider py-4">
              <div className="flex-1 text-sm">
                Iniciar próximo ciclo automaticamente
                <div className="text-[11px] text-muted">
                  Sem precisar apertar "Continuar"
                </div>
              </div>
              <button
                onClick={() => update('autoStartNext', !settings.autoStartNext)}
                className="flex w-[42px] flex-none justify-start rounded-full border p-0.5 transition-all"
                style={{
                  borderColor: settings.autoStartNext
                    ? 'var(--color-accent)'
                    : 'var(--color-divider)',
                  background: settings.autoStartNext
                    ? 'var(--color-accent)'
                    : 'transparent',
                  justifyContent: settings.autoStartNext ? 'flex-end' : 'flex-start',
                }}
              >
                <span className="h-[18px] w-[18px] rounded-full bg-surface" />
              </button>
            </div>
            <div className="flex items-center gap-6 py-4">
              <div className="flex-1 text-sm">
                Som ao concluir ciclo
                <div className="text-[11px] text-muted">Notificação sonora discreta</div>
              </div>
              <button
                onClick={() => update('soundEnabled', !settings.soundEnabled)}
                className="flex w-[42px] flex-none justify-start rounded-full border p-0.5 transition-all"
                style={{
                  borderColor: settings.soundEnabled
                    ? 'var(--color-accent)'
                    : 'var(--color-divider)',
                  background: settings.soundEnabled
                    ? 'var(--color-accent)'
                    : 'transparent',
                  justifyContent: settings.soundEnabled ? 'flex-end' : 'flex-start',
                }}
              >
                <span className="h-[18px] w-[18px] rounded-full bg-surface" />
              </button>
            </div>
          </div>
        </section>

        <section>
          <h6 className="mb-4">Aparência</h6>
          <div className="mb-4 flex gap-4">
            <button
              onClick={() => prefs.setTheme('dark')}
              className="flex-1 rounded-md border p-6 text-left text-[13px]"
              style={{
                borderColor:
                  prefs.theme === 'dark' ? 'var(--color-accent)' : 'var(--color-divider)',
              }}
            >
              <MoonStars size={18} className="mb-2 block text-accent" />
              Escuro
            </button>
            <button
              onClick={() => prefs.setTheme('light')}
              className="flex-1 rounded-md border p-6 text-left text-[13px]"
              style={{
                borderColor:
                  prefs.theme === 'light'
                    ? 'var(--color-accent)'
                    : 'var(--color-divider)',
              }}
            >
              <SunDim size={18} className="mb-2 block text-accent" />
              Claro
            </button>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-xs text-muted">Cor de destaque</label>
            <div className="flex gap-2">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  title={preset.name}
                  onClick={() => prefs.setAccentColor(preset.hex)}
                  className="h-7 w-7 rounded-full border-2"
                  style={{
                    background: preset.hex,
                    borderColor:
                      prefs.accentColor === preset.hex ? preset.hex : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="mb-4 flex gap-4">
            {(['comfortable', 'compact'] as const).map((d) => (
              <button
                key={d}
                onClick={() => prefs.setDensity(d)}
                className="flex-1 rounded-sm border px-3 py-2 text-xs"
                style={{
                  borderColor:
                    prefs.density === d ? 'var(--color-accent)' : 'var(--color-divider)',
                }}
              >
                {d === 'comfortable' ? 'Confortável' : 'Compacto'}
              </button>
            ))}
          </div>

          <div className="flex gap-4">
            {(['default', 'large', 'xlarge'] as const).map((f) => (
              <button
                key={f}
                onClick={() => prefs.setFontSize(f)}
                className="flex-1 rounded-sm border px-3 py-2 text-xs"
                style={{
                  borderColor:
                    prefs.fontSize === f ? 'var(--color-accent)' : 'var(--color-divider)',
                }}
              >
                {f === 'default' ? 'Padrão' : f === 'large' ? 'Grande' : 'Extra grande'}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h6 className="mb-4">Conta</h6>
          <div className="card flex items-center gap-6 p-6">
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-accent font-semibold text-bg">
              {user ? initials(user.name) : '·'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">{user?.email}</div>
              <div className="text-[11px] text-muted">
                {user?.plan === 'PREMIUM' ? 'Premium' : 'Gratuito'}
              </div>
            </div>
            {user?.plan === 'FREE' ? (
              <Link to="/subscription" className="btn btn-secondary flex-none">
                Ver planos
              </Link>
            ) : (
              <Link to="/subscription" className="btn btn-secondary flex-none">
                Gerenciar assinatura
              </Link>
            )}
          </div>
        </section>

        <button onClick={logout} className="btn btn-ghost self-start text-cta">
          Sair da conta
        </button>
      </div>
    </div>
  );
}
