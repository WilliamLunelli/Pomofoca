import { useEffect, useId, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type FokiState = 'idle' | 'focused' | 'celebrating' | 'sad' | 'sleeping' | 'curious';

interface FokiProps {
  state: FokiState;
  size?: number;
  className?: string;
}

const OUTLINE = { stroke: 'var(--foki-outline)', strokeWidth: 1.5 } as const;
const CHEEK = 'color-mix(in srgb, var(--color-accent) 45%, transparent)';
const PHONE_EDGE = 'color-mix(in srgb, var(--color-accent) 65%, black)';

// Estrelinha de 4 pontas (centrada na origem)
const STAR = 'M0 -6 Q1 -1 6 0 Q1 1 0 6 Q-1 1 -6 0 Q-1 -1 0 -6Z';
const SPARKLES = [
  { x: 14, y: 26, s: 1, delay: 0, light: false },
  { x: 86, y: 22, s: 0.85, delay: 110, light: true },
  { x: 24, y: 8, s: 0.7, delay: 220, light: true },
  { x: 76, y: 6, s: 1.1, delay: 160, light: false },
  { x: 50, y: 2, s: 0.8, delay: 300, light: false },
];

/**
 * Mascote Foki (foca) - componente reativo, nao conversacional. So muda de
 * expressao/pose conforme a prop `state`; nao guarda nenhuma logica de app.
 * Cores via tokens (--foki-*, --color-accent) pra acompanhar tema/cor de destaque.
 * Animacao so por CSS (index.css, keyframes foki-*); o unico JS e o timer da piscada.
 */
export function Foki({ state, size = 64, className }: FokiProps) {
  const uid = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const blinkRef = useRef<SVGGElement>(null);

  // Piscar em intervalos aleatorios (2.5s a 6s), as vezes duas vezes seguidas
  useEffect(() => {
    if (reduced || state === 'sleeping') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const blinkOnce = (done: () => void) => {
      blinkRef.current?.classList.add('foki-blink');
      timers.push(
        setTimeout(() => {
          blinkRef.current?.classList.remove('foki-blink');
          done();
        }, 140),
      );
    };
    const schedule = () => {
      timers.push(
        setTimeout(
          () => {
            blinkOnce(() => {
              if (Math.random() < 0.25) {
                timers.push(setTimeout(() => blinkOnce(schedule), 160));
              } else {
                schedule();
              }
            });
          },
          2500 + Math.random() * 3500,
        ),
      );
    };
    schedule();
    return () => {
      timers.forEach(clearTimeout);
      blinkRef.current?.classList.remove('foki-blink');
    };
  }, [reduced, state]);

  const on = (...s: FokiState[]) => s.includes(state);
  const gBody = `foki-body-${uid}`;
  const gFace = `foki-face-${uid}`;
  const gFlip = `foki-flip-${uid}`;

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
        className={`foki foki--${state}${reduced ? ' foki--still' : ''}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gBody} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--foki-back)' }} />
            <stop offset="1" style={{ stopColor: 'var(--foki-mid)' }} />
          </linearGradient>
          <radialGradient id={gFace} cx="0.4" cy="0.3" r="0.8">
            <stop offset="0" style={{ stopColor: 'var(--foki-light)' }} />
            <stop offset="1" style={{ stopColor: 'var(--foki-mid)' }} />
          </radialGradient>
          <linearGradient id={gFlip} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--foki-mid)' }} />
            <stop offset="1" style={{ stopColor: 'var(--foki-back)' }} />
          </linearGradient>
        </defs>

        {/* sombra de chao */}
        <ellipse
          className="foki-shadow"
          cx="50"
          cy="93"
          rx="28"
          ry="4.5"
          style={{ fill: 'var(--foki-shadow)' }}
        />

        <g className="foki-char">
          {/* corpo (squash/stretch proprio) */}
          <g className="foki-body">
            <ellipse cx="50" cy="69" rx="31" ry="24" fill={`url(#${gBody})`} {...OUTLINE} />
            <ellipse
              cx="50"
              cy="76"
              rx="19"
              ry="14"
              style={{ fill: 'var(--foki-light)' }}
              opacity="0.75"
            />
          </g>

          {/* nadadeiras */}
          <g className="foki-flipper foki-flipper--l">
            <ellipse
              cx="21"
              cy="72"
              rx="9"
              ry="5.5"
              transform="rotate(-25 21 72)"
              fill={`url(#${gFlip})`}
              {...OUTLINE}
            />
          </g>
          <g className="foki-flipper foki-flipper--r">
            <ellipse
              cx="79"
              cy="72"
              rx="9"
              ry="5.5"
              transform="rotate(25 79 72)"
              fill={`url(#${gFlip})`}
              {...OUTLINE}
            />
          </g>

          {/* cabeca: inclinacao/balanco no externo, acompanhamento da respiracao no interno */}
          <g className="foki-head-tilt">
            <g className="foki-head">
              <ellipse cx="50" cy="50" rx="25" ry="22" fill={`url(#${gFace})`} {...OUTLINE} />
              {/* brilho especular */}
              <ellipse
                cx="40"
                cy="37"
                rx="8"
                ry="3.2"
                transform="rotate(-20 40 37)"
                style={{ fill: 'var(--foki-shine)' }}
                opacity="0.5"
              />

              {/* bochechas */}
              <g className="foki-expr" data-on={!on('sad')}>
                <circle cx="30" cy="57" r="4.2" fill={CHEEK} />
                <circle cx="70" cy="57" r="4.2" fill={CHEEK} />
              </g>

              {/* focinho */}
              <ellipse
                cx="50"
                cy="58"
                rx="8"
                ry="5.5"
                style={{ fill: 'var(--foki-light)' }}
                stroke="var(--foki-outline)"
                strokeWidth="0.8"
                strokeOpacity="0.5"
              />
              <ellipse cx="50" cy="55.5" rx="2.4" ry="1.7" style={{ fill: 'var(--foki-eye)' }} />
              {size >= 56 && (
                <g
                  stroke="var(--foki-outline)"
                  strokeWidth="0.8"
                  strokeLinecap="round"
                  opacity="0.6"
                >
                  <path d="M42 58 L33 56.5" />
                  <path d="M42 60 L33 61.5" />
                  <path d="M58 58 L67 56.5" />
                  <path d="M58 60 L67 61.5" />
                </g>
              )}

              {/* bocas */}
              <g className="foki-expr" data-on={on('idle', 'focused', 'sleeping')}>
                <path
                  d="M46 60.5 q4 3 8 0"
                  style={{ stroke: 'var(--foki-eye)' }}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </g>
              <g className="foki-expr" data-on={on('celebrating')}>
                <path d="M44.5 60 q5.5 9 11 0z" style={{ fill: 'var(--foki-eye)' }} />
              </g>
              <g className="foki-expr" data-on={on('sad')}>
                <path
                  d="M46.5 63.5 q3.5 -3.5 7 0"
                  style={{ stroke: 'var(--foki-eye)' }}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </g>
              <g className="foki-expr" data-on={on('curious')}>
                <ellipse
                  cx="50"
                  cy="62"
                  rx="1.8"
                  ry="2.2"
                  style={{ fill: 'var(--foki-eye)' }}
                  opacity="0.85"
                />
              </g>

              {/* olhos abertos (piscam via ref) */}
              <g ref={blinkRef} className="foki-blinkable">
                <g className="foki-expr" data-on={on('idle')}>
                  <circle cx="40" cy="49" r="3.5" style={{ fill: 'var(--foki-eye)' }} />
                  <circle cx="60" cy="49" r="3.5" style={{ fill: 'var(--foki-eye)' }} />
                  <circle cx="41.2" cy="47.8" r="1.1" style={{ fill: 'var(--foki-shine)' }} />
                  <circle cx="61.2" cy="47.8" r="1.1" style={{ fill: 'var(--foki-shine)' }} />
                </g>
                <g className="foki-expr" data-on={on('curious')}>
                  <circle cx="40" cy="49" r="4.2" style={{ fill: 'var(--foki-shine)' }} />
                  <circle cx="60" cy="49" r="4.2" style={{ fill: 'var(--foki-shine)' }} />
                  <g className="foki-look">
                    <circle cx="40" cy="49" r="2.6" style={{ fill: 'var(--foki-eye)' }} />
                    <circle cx="60" cy="49" r="2.6" style={{ fill: 'var(--foki-eye)' }} />
                  </g>
                </g>
              </g>

              {/* olhos concentrados (semicerrados) */}
              <g className="foki-expr" data-on={on('focused')}>
                <path d="M36.5 49 a3.5 3.5 0 0 0 7 0z" style={{ fill: 'var(--foki-eye)' }} />
                <path d="M56.5 49 a3.5 3.5 0 0 0 7 0z" style={{ fill: 'var(--foki-eye)' }} />
                <path
                  d="M35.5 49 h9 M55.5 49 h9"
                  style={{ stroke: 'var(--foki-eye)' }}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </g>

              {/* olhos tristes (caidos) + sobrancelhas */}
              <g className="foki-expr" data-on={on('sad')}>
                <circle cx="40" cy="51.5" r="3.2" style={{ fill: 'var(--foki-eye)' }} />
                <circle cx="60" cy="51.5" r="3.2" style={{ fill: 'var(--foki-eye)' }} />
                <circle cx="41" cy="50.4" r="1" style={{ fill: 'var(--foki-shine)' }} />
                <circle cx="61" cy="50.4" r="1" style={{ fill: 'var(--foki-shine)' }} />
                <path
                  d="M35 45.5 q5 -1 9 2 M65 45.5 q-5 -1 -9 2"
                  style={{ stroke: 'var(--foki-eye)' }}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  fill="none"
                />
              </g>

              {/* olhos felizes (arco pra cima) */}
              <g className="foki-expr" data-on={on('celebrating')}>
                <path
                  d="M36 50 q4 -5 8 0 M56 50 q4 -5 8 0"
                  style={{ stroke: 'var(--foki-eye)' }}
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              </g>

              {/* olhos fechados (dormindo) */}
              <g className="foki-expr" data-on={on('sleeping')}>
                <path
                  d="M36 49 q4 3.5 8 0 M56 49 q4 3.5 8 0"
                  style={{ stroke: 'var(--foki-eye)' }}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  fill="none"
                />
              </g>

              {/* fone de ouvido - so no estado focado */}
              <g className="foki-expr" data-on={on('focused')}>
                <path
                  d="M27 47 a23 23 0 0 1 46 0"
                  style={{ stroke: PHONE_EDGE }}
                  strokeWidth="5"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M27 47 a23 23 0 0 1 46 0"
                  stroke="var(--color-accent)"
                  strokeWidth="3.2"
                  fill="none"
                  strokeLinecap="round"
                />
                <rect
                  x="21"
                  y="44"
                  width="9"
                  height="14"
                  rx="4"
                  fill="var(--color-accent)"
                  style={{ stroke: PHONE_EDGE }}
                  strokeWidth="1.2"
                />
                <rect
                  x="70"
                  y="44"
                  width="9"
                  height="14"
                  rx="4"
                  fill="var(--color-accent)"
                  style={{ stroke: PHONE_EDGE }}
                  strokeWidth="1.2"
                />
              </g>
            </g>
          </g>
        </g>

        {/* z subindo - so dormindo */}
        <g className="foki-expr foki-expr--static" data-on={on('sleeping')}>
          {[0, 1, 2].map((i) => (
            <text
              key={i}
              className="foki-z"
              x={72 + i * 4}
              y={30 - i * 3}
              fontSize={10 + i * 2}
              fontWeight="600"
              fontFamily="var(--font-heading)"
              style={{ fill: 'var(--color-accent)', animationDelay: `${i * 900}ms` }}
            >
              z
            </text>
          ))}
        </g>

        {/* brilhos da comemoracao (estrelas SVG, montadas so no estado) */}
        {state === 'celebrating' &&
          SPARKLES.map((sp, i) => (
            <g key={i} transform={`translate(${sp.x} ${sp.y}) scale(${sp.s})`}>
              <path
                className="foki-star"
                d={STAR}
                style={{
                  fill: sp.light ? 'var(--foki-sparkle)' : 'var(--color-accent)',
                  animationDelay: `${sp.delay}ms`,
                }}
              />
            </g>
          ))}
      </svg>
    </div>
  );
}
