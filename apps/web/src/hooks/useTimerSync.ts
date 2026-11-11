import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

import { getAccessToken, refreshTokens } from '@/lib/api';

export type TimerMode = 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';
export type TimerSyncStatus = 'running' | 'paused';

export interface TimerSyncPayload {
  subjectId: string | null;
  mode: TimerMode;
  cycle: number;
  remainingSeconds: number;
  totalSeconds: number;
  status: TimerSyncStatus;
}

const TIMER_EVENTS = [
  'timer:start',
  'timer:pause',
  'timer:resume',
  'timer:finish',
  'timer:subjectChange',
] as const;
export type TimerSyncEvent = (typeof TIMER_EVENTS)[number];

// Reconecta um pouco antes do access token expirar de verdade, pra nunca deixar a
// janela em que o socket esta com um token ja vencido (access token dura 15min -
// acontece em qualquer sessao de foco normal, entao isso nao e edge case raro).
const PROACTIVE_REFRESH_BUFFER_MS = 30_000;
// So reconecta em UNAUTHORIZED (token vencido/invalido - reversivel com refresh).
// PREMIUM_FEATURE_REQUIRED nao entra aqui: e uma rejeicao permanente do plano
// atual, tentar de novo com token renovado so criaria um loop sem fim se o
// usuario genuinamente estiver no FREE.
const RECONNECTABLE_AUTH_ERROR = 'UNAUTHORIZED';

function decodeJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Sincronizacao do timer entre dispositivos (Premium). So conecta quando `enabled`
 * (plano Premium) - em FREE o hook fica inerte, sem custo de conexao. `onRemote` e
 * chamado quando OUTRO dispositivo do mesmo usuario muda o timer; o emit() so deve
 * ser chamado a partir de handlers de acao do usuario (start/pause/skip/etc), nunca
 * de um efeito que reage ao proprio estado local - senao vira eco entre abas.
 */
export function useTimerSync(
  enabled: boolean,
  onRemote: (event: TimerSyncEvent, payload: TimerSyncPayload) => void,
) {
  const socketRef = useRef<Socket | null>(null);
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnecting = false;

    function clearExpiryTimer() {
      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
      }
    }

    function scheduleProactiveReconnect(token: string) {
      clearExpiryTimer();
      const expiresAt = decodeJwtExpiryMs(token);
      if (expiresAt === null) return;
      const delay = Math.max(0, expiresAt - Date.now() - PROACTIVE_REFRESH_BUFFER_MS);
      expiryTimer = setTimeout(() => {
        void reconnectWithFreshToken();
      }, delay);
    }

    async function reconnectWithFreshToken() {
      if (cancelled || reconnecting) return;
      reconnecting = true;
      try {
        await refreshTokens();
        const freshToken = getAccessToken();
        if (cancelled || !freshToken) return;
        connect(freshToken);
      } finally {
        reconnecting = false;
      }
    }

    function connect(token: string) {
      socketRef.current?.disconnect();

      const socket = io({ path: '/socket.io', auth: { token } });
      socketRef.current = socket;

      for (const event of TIMER_EVENTS) {
        socket.on(event, (payload: TimerSyncPayload) =>
          onRemoteRef.current(event, payload),
        );
      }

      socket.on('connect', () => scheduleProactiveReconnect(token));

      // Access token expirado/invalido (ex: usuario deixou a aba em segundo plano
      // alem do timer de refresh proativo) - tenta renovar e reconectar em vez de
      // desistir da sincronizacao silenciosamente.
      socket.on('connect_error', (err) => {
        if (err.message === RECONNECTABLE_AUTH_ERROR) {
          void reconnectWithFreshToken();
        }
      });
    }

    const initialToken = getAccessToken();
    if (initialToken) connect(initialToken);

    return () => {
      cancelled = true;
      clearExpiryTimer();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [enabled]);

  function emit(event: TimerSyncEvent, payload: TimerSyncPayload) {
    socketRef.current?.emit(event, payload);
  }

  return { emit };
}
