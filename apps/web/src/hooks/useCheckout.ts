import { useState } from 'react';

import { api, ApiError } from '@/lib/api';
import type { BillingCycle } from '@/lib/types';

export function useCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(billingCycle: BillingCycle = 'YEARLY') {
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<{ checkoutUrl: string | null }>(
        '/subscriptions/checkout',
        {
          billingCycle,
        },
      );
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      setError(
        'Não foi possível gerar o link de pagamento. Tente novamente em instantes.',
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível iniciar a assinatura.',
      );
    } finally {
      setLoading(false);
    }
  }

  return { startCheckout, loading, error };
}
