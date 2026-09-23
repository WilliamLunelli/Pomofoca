import { Timer as TimerIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Link, useSearchParams } from 'react-router-dom';

import { Foki, type FokiState } from '@/components/Foki';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { Subscription, User } from '@/lib/types';

type CallbackState = 'checking' | 'approved' | 'pending' | 'rejected';

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 6;

// Alguns fluxos de checkout do Mercado Pago anexam um status na URL de retorno.
// Usamos isso só como PISTA pra decidir entre "pendente" e "rejeitado" quando o
// polling não confirma nada - nunca pra conceder Premium. A aprovação real só vem
// do backend (user.plan === 'PREMIUM'), que só muda quando o webhook assinado do
// Mercado Pago confirma o pagamento.
const REJECTED_STATUS_HINTS = ['rejected', 'cancelled', 'canceled', 'failure'];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function SubscriptionCallbackPage() {
  const { user, loading, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<CallbackState>('checking');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (loading || !user || startedRef.current) return;
    startedRef.current = true;

    const statusHint = (
      searchParams.get('status') ??
      searchParams.get('collection_status') ??
      ''
    ).toLowerCase();
    const hintsRejected = REJECTED_STATUS_HINTS.includes(statusHint);

    let cancelled = false;
    let unreachable = false;

    async function poll() {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          const me = await api.get<User>('/users/me');
          if (me.plan === 'PREMIUM') {
            if (cancelled) return;
            await refreshUser();
            api
              .get<Subscription | null>('/subscriptions')
              .then((sub) => !cancelled && setSubscription(sub))
              .catch(() => {});
            setState('approved');
            return;
          }
        } catch {
          unreachable = true;
        }
        if (cancelled) return;
        if (attempt < MAX_ATTEMPTS - 1) await sleep(POLL_INTERVAL_MS);
      }
      if (cancelled) return;
      // Esgotou o polling sem confirmar Premium - nunca cai em "aprovado" aqui.
      setState(unreachable || hintsRejected ? 'rejected' : 'pending');
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [loading, user, searchParams, refreshUser]);

  if (!loading && !user) return <Navigate to="/login" replace />;

  const fokiState: FokiState =
    state === 'approved' ? 'celebrating' : state === 'rejected' ? 'sad' : 'idle';

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <TimerIcon weight="fill" size={18} className="text-accent" />
          <span className="font-heading text-base tracking-tight">Pomofoca</span>
        </div>

        <div className="mb-6 flex justify-center">
          <Foki state={fokiState} size={72} />
        </div>

        {state === 'checking' && (
          <>
            <h1 className="mb-2 text-xl">Confirmando sua assinatura…</h1>
            <p className="text-sm text-muted">
              Isso costuma levar só alguns segundos. Não feche esta página.
            </p>
          </>
        )}

        {state === 'approved' && (
          <>
            <h1 className="mb-2 text-xl">Assinatura confirmada! 🎉</h1>
            <p className="mb-8 text-sm text-muted">
              {subscription?.billingCycle === 'YEARLY'
                ? 'Seu plano anual já está ativo.'
                : 'Seu plano mensal já está ativo.'}{' '}
              Agora você tem histórico completo, heatmap anual e muito mais.
            </p>
            <Link to="/timer" className="btn btn-primary min-w-[180px] text-[15px]">
              Ir para o Timer
            </Link>
          </>
        )}

        {state === 'pending' && (
          <>
            <h1 className="mb-2 text-xl">Pagamento em processamento</h1>
            <p className="mb-8 text-sm text-muted">
              Se você pagou por PIX ou boleto, a confirmação pode levar alguns minutos.
              Assim que o Mercado Pago confirmar, seu plano muda pra Premium
              automaticamente — não precisa fazer nada.
            </p>
            <Link to="/timer" className="btn btn-primary min-w-[180px] text-[15px]">
              Voltar para o app
            </Link>
          </>
        )}

        {state === 'rejected' && (
          <>
            <h1 className="mb-2 text-xl">Não foi possível confirmar sua assinatura</h1>
            <p className="mb-8 text-sm text-muted">
              O pagamento pode ter sido recusado ou algo deu errado na confirmação. Você
              pode tentar novamente quando quiser.
            </p>
            <Link
              to="/subscription"
              className="btn btn-primary min-w-[180px] text-[15px]"
            >
              Tentar novamente
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
