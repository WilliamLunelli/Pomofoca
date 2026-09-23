import { useEffect, useState } from 'react';

export type FokiState = 'idle' | 'focused' | 'celebrating' | 'sad' | 'sleeping';

interface FokiProps {
  state: FokiState;
  size?: number;
  className?: string;
}

/**
 * Mascote Foki (foca) - componente reativo, nao conversacional. So muda de
 * expressao/pose conforme a prop `state`; nao guarda nenhuma logica de app.
 * Paleta usa os tokens do design system pra acompanhar tema/cor de destaque.
 */
export function Foki({ state, size = 64, className }: FokiProps) {
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (state === 'celebrating') {
      setBurst(true);
      const t = setTimeout(() => setBurst(false), 900);
      return () => clearTimeout(t);
    }
    setBurst(false);
  }, [state]);

  const bodyAnimation =
    state === 'celebrating'
      ? 'foki-bounce 700ms ease-in-out'
      : state === 'sleeping'
        ? 'foki-breathe 3200ms ease-in-out infinite'
        : 'foki-breathe 2400ms ease-in-out infinite';

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: 'relative', flex: 'none' }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ animation: bodyAnimation, transformOrigin: '50% 60%' }}
      >
        {/* corpo */}
        <ellipse cx="50" cy="62" rx="34" ry="30" fill="var(--color-neutral-200)" />
        {/* barbatanas */}
        <ellipse
          cx="20"
          cy="70"
          rx="9"
          ry="6"
          fill="var(--color-neutral-300)"
          transform="rotate(-18 20 70)"
        />
        <ellipse
          cx="80"
          cy="70"
          rx="9"
          ry="6"
          fill="var(--color-neutral-300)"
          transform="rotate(18 80 70)"
        />
        {/* rosto */}
        <ellipse cx="50" cy="56" rx="24" ry="21" fill="var(--color-neutral-100)" />

        {/* bochechas */}
        {(state === 'idle' || state === 'celebrating' || state === 'focused') && (
          <>
            <circle cx="32" cy="60" r="4.5" fill="var(--f-cta)" opacity="0.35" />
            <circle cx="68" cy="60" r="4.5" fill="var(--f-cta)" opacity="0.35" />
          </>
        )}

        {/* olhos */}
        {state === 'sleeping' ? (
          <>
            <path
              d="M39 54 q4 3 8 0"
              stroke="var(--color-neutral-700)"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M53 54 q4 3 8 0"
              stroke="var(--color-neutral-700)"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : state === 'sad' ? (
          <>
            <circle cx="43" cy="55" r="3.2" fill="var(--color-neutral-800)" />
            <circle cx="61" cy="55" r="3.2" fill="var(--color-neutral-800)" />
            <path
              d="M38 48 q5 -3 9 -0.5"
              stroke="var(--color-neutral-600)"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M57 47.5 q5 -2.5 9 0.5"
              stroke="var(--color-neutral-600)"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : (
          <>
            <circle cx="43" cy="53" r="3.4" fill="var(--color-neutral-800)" />
            <circle cx="61" cy="53" r="3.4" fill="var(--color-neutral-800)" />
            <circle cx="44.2" cy="51.8" r="1" fill="white" />
            <circle cx="62.2" cy="51.8" r="1" fill="white" />
          </>
        )}

        {/* focinho + boca */}
        <ellipse cx="50" cy="62" rx="6" ry="4" fill="var(--color-neutral-200)" />
        <circle cx="50" cy="60" r="1.6" fill="var(--color-neutral-700)" />
        {state === 'sad' ? (
          <path
            d="M45 67 q5 -3 10 0"
            stroke="var(--color-neutral-600)"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
        ) : state === 'celebrating' ? (
          <path
            d="M44 64 q6 6 12 0"
            stroke="var(--color-neutral-700)"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
        ) : (
          <path
            d="M45 65 q5 3 10 0"
            stroke="var(--color-neutral-600)"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* fone de ouvido - so no estado focado */}
        {state === 'focused' && (
          <g>
            <path
              d="M27 50 a23 23 0 0 1 46 0"
              stroke="var(--color-accent)"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
            <rect x="21" y="47" width="9" height="14" rx="4" fill="var(--color-accent)" />
            <rect x="70" y="47" width="9" height="14" rx="4" fill="var(--color-accent)" />
          </g>
        )}

        {/* zzz - so dormindo */}
        {state === 'sleeping' && (
          <text
            x="74"
            y="34"
            fontSize="13"
            fill="var(--color-neutral-500)"
            fontFamily="var(--font-heading)"
            style={{ animation: 'foki-float 2600ms ease-in-out infinite' }}
          >
            z z
          </text>
        )}
      </svg>

      {/* sparkles - so no burst de comemoracao */}
      {burst && (
        <>
          <span
            style={{
              position: 'absolute',
              top: '4%',
              left: '10%',
              fontSize: size * 0.18,
              animation: 'foki-sparkle 900ms ease-out forwards',
            }}
          >
            ✨
          </span>
          <span
            style={{
              position: 'absolute',
              top: '0%',
              right: '6%',
              fontSize: size * 0.15,
              animation: 'foki-sparkle 900ms ease-out 120ms forwards',
            }}
          >
            ✨
          </span>
        </>
      )}
    </div>
  );
}
