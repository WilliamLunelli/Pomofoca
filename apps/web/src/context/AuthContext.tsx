import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { api, clearTokens, getAccessToken, setTokens } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

// Capturado automaticamente, nunca escolhido manualmente pelo usuario - os jobs de
// notificacao (lembrete no horario aprendido, streak em risco as 20h) usam isso no
// backend pra disparar no horario local certo, nao UTC do servidor.
function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      return;
    }
    try {
      const me = await api.get<User>('/users/me');
      setUser(me);
    } catch {
      clearTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ user: User; tokens: AuthTokensResponse }>(
      '/auth/login',
      { email, password, timezone: detectTimezone() },
      { skipAuth: true },
    );
    setTokens(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await api.post<{ user: User; tokens: AuthTokensResponse }>(
      '/auth/register',
      { name, email, password, timezone: detectTimezone() },
      { skipAuth: true },
    );
    setTokens(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const result = await api.post<{ user: User; tokens: AuthTokensResponse }>(
      '/auth/google',
      { idToken, timezone: detectTimezone() },
      { skipAuth: true },
    );
    setTokens(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, loginWithGoogle, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
