const ACCESS_TOKEN_KEY = 'pomofoca:accessToken';
const REFRESH_TOKEN_KEY = 'pomofoca:refreshToken';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}
interface ApiFailure {
  success: false;
  error: { code: string; message: string };
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * Renova o par de tokens via /auth/refresh. Exportada (alem do uso interno no
 * interceptor de 401 do apiFetch) pra permitir renovacao proativa fora de uma
 * request REST - ex: useTimerSync reconectando o socket antes do access token
 * (15min) expirar. `refreshPromise` garante uma unica chamada em voo mesmo se
 * ambos os caminhos pedirem renovacao ao mesmo tempo.
 */
export async function refreshTokens(): Promise<boolean> {
  refreshPromise ??= doRefreshTokens().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function doRefreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    clearTokens();
    return false;
  }
  const body = (await response.json()) as ApiSuccess<{
    accessToken: string;
    refreshToken: string;
  }>;
  setTokens(body.data.accessToken, body.data.refreshToken);
  return true;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  skipAuth?: boolean;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, skipAuth = false } = options;

  async function doFetch(): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!skipAuth) {
      const token = getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  let response = await doFetch();

  if (response.status === 401 && !skipAuth && getRefreshToken()) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await doFetch();
    }
  }

  const json = (await response.json()) as ApiSuccess<T> | ApiFailure;

  if (!json.success) {
    throw new ApiError(json.error.code, json.error.message, response.status);
  }

  return json.data;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: { skipAuth?: boolean }) =>
    apiFetch<T>(path, { method: 'POST', body, skipAuth: opts?.skipAuth }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'DELETE', body }),
};
