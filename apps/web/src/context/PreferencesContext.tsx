import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { generateRamp } from '@/lib/color';

export type Theme = 'dark' | 'light';
export type Density = 'comfortable' | 'compact';
export type FontSize = 'default' | 'large' | 'xlarge';
export type TimerLayout = 'zen' | 'panel';
export type ReportsLayout = 'narrative' | 'dense';

interface Preferences {
  theme: Theme;
  accentColor: string;
  density: Density;
  fontSize: FontSize;
  timerLayout: TimerLayout;
  reportsLayout: ReportsLayout;
}

interface PreferencesContextValue extends Preferences {
  setTheme: (theme: Theme) => void;
  setAccentColor: (hex: string) => void;
  setDensity: (density: Density) => void;
  setFontSize: (size: FontSize) => void;
  setTimerLayout: (layout: TimerLayout) => void;
  setReportsLayout: (layout: ReportsLayout) => void;
}

const STORAGE_KEY = 'pomofoca:preferences';
const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  accentColor: '#6D5AE6',
  density: 'comfortable',
  fontSize: 'default',
  timerLayout: 'panel',
  reportsLayout: 'narrative',
};

function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function applyToDocument(prefs: Preferences) {
  const root = document.documentElement;
  root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-density', prefs.density);
  root.setAttribute('data-font-size', prefs.fontSize);

  const ramp = generateRamp(prefs.accentColor);
  for (const [step, hex] of Object.entries(ramp)) {
    root.style.setProperty(`--color-accent-${step}`, hex);
  }
  root.style.setProperty(
    '--color-accent',
    prefs.theme === 'dark' ? ramp[400] : ramp[600],
  );
  root.style.setProperty('--color-accent-2', ramp[300]);
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);

  useEffect(() => {
    applyToDocument(prefs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const setTheme = useCallback((theme: Theme) => setPrefs((p) => ({ ...p, theme })), []);
  const setAccentColor = useCallback(
    (accentColor: string) => setPrefs((p) => ({ ...p, accentColor })),
    [],
  );
  const setDensity = useCallback(
    (density: Density) => setPrefs((p) => ({ ...p, density })),
    [],
  );
  const setFontSize = useCallback(
    (fontSize: FontSize) => setPrefs((p) => ({ ...p, fontSize })),
    [],
  );
  const setTimerLayout = useCallback(
    (timerLayout: TimerLayout) => setPrefs((p) => ({ ...p, timerLayout })),
    [],
  );
  const setReportsLayout = useCallback(
    (reportsLayout: ReportsLayout) => setPrefs((p) => ({ ...p, reportsLayout })),
    [],
  );

  return (
    <PreferencesContext.Provider
      value={{
        ...prefs,
        setTheme,
        setAccentColor,
        setDensity,
        setFontSize,
        setTimerLayout,
        setReportsLayout,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
