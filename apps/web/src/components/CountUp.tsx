import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/hooks/useReducedMotion';

const DURATION_MS = 600;

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface CountUpProps {
  value: number;
  /** Formata o valor (inteiro animado) pra exibicao; padrao: o proprio numero. */
  format?: (n: number) => string;
}

/** Numero que conta de 0 ate `value` (~600ms, easeOut); reinicia quando `value` muda.
 *  Sob prefers-reduced-motion mostra o valor final direto. */
export function CountUp({ value, format }: CountUpProps) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const fromRef = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min((now - start) / DURATION_MS, 1));
      const current = Math.round(from + (value - from) * easeOut(t));
      fromRef.current = current;
      setDisplay(current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return <>{format ? format(display) : display}</>;
}
