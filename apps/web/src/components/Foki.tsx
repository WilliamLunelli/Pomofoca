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

// Olho de mascote: bola escura + brilho grande (canto superior) + brilho pequeno (canto oposto inferior)
function Eye({
  cx,
  cy,
  r = 5.5,
  big = 1.9,
  small = 0.9,
}: {
  cx: number;
  cy: number;
  r?: number;
  big?: number;
  small?: number;
}) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} style={{ fill: 'var(--foki-eye)' }} />
      <circle cx={cx + 2} cy={cy - 2.2} r={big} style={{ fill: 'var(--foki-shine)' }} />
      <circle cx={cx - 1.8} cy={cy + 2.2} r={small} style={{ fill: 'var(--foki-shine)' }} />
    </>
  );
}

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
          <radialGradient id={gFace} cx="0.4" cy="0.25" r="0.85">
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
          {/* corpo unico em gota (cabeca e corpo fundidos) + cauda traseira em V */}
          <g className="foki-body">
            <path
              d="M68 86 L84 80 Q89 79 88.5 84 L80.5 87.5 L89 91.5 Q90 94.5 85 93.5 L68 91Z"
              fill={`url(#${gFlip})`}
              {...OUTLINE}
              strokeLinejoin="round"
            />
            <path
              d="M50 27 C66 27 76 38 76 51 C76 58 82 64 82 74 C82 84 68 91 50 91 C32 91 18 84 18 74 C18 64 24 58 24 51 C24 38 34 27 50 27Z"
              fill={`url(#${gFace})`}
              {...OUTLINE}
              strokeLinejoin="round"
            />
            <ellipse
              cx="50"
              cy="77"
              rx="19"
              ry="12"
              style={{ fill: 'var(--foki-light)' }}
              opacity="0.75"
            />
          </g>

          {/* nadadeiras dianteiras */}
          <g className="foki-flipper foki-flipper--l">
            <ellipse
              cx="21"
              cy="74"
              rx="9"
              ry="5.5"
              transform="rotate(-25 21 74)"
              fill={`url(#${gFlip})`}
              {...OUTLINE}
            />
          </g>
          <g className="foki-flipper foki-flipper--r">
            <ellipse
              cx="79"
              cy="74"
              rx="9"
              ry="5.5"
              transform="rotate(25 79 74)"
              fill={`url(#${gFlip})`}
              {...OUTLINE}
            />
          </g>

          {/* rosto: inclinacao/balanco no externo, acompanhamento da respiracao no interno */}
          <g className="foki-head-tilt">
            <g className="foki-head">
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
                <circle cx="29" cy="59" r="4.2" fill={CHEEK} />
                <circle cx="71" cy="59" r="4.2" fill={CHEEK} />
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
                  d="M46.5 63.5 q3.5 -2.5 7 0"
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
                  <Eye cx={38} cy={49} />
                  <Eye cx={62} cy={49} />
                </g>
                <g className="foki-expr" data-on={on('curious')}>
                  <circle
                    cx="38"
                    cy="49"
                    r="6.3"
                    style={{ fill: 'var(--foki-shine)' }}
                    stroke="var(--foki-outline)"
                    strokeWidth="0.8"
                    strokeOpacity="0.5"
                  />
                  <circle
                    cx="62"
                    cy="49"
                    r="6.3"
                    style={{ fill: 'var(--foki-shine)' }}
                    stroke="var(--foki-outline)"
                    strokeWidth="0.8"
                    strokeOpacity="0.5"
                  />
                  <g className="foki-look">
                    <Eye cx={38} cy={49} r={4.4} big={1.6} small={0.8} />
                    <Eye cx={62} cy={49} r={4.4} big={1.6} small={0.8} />
                  </g>
                </g>
              </g>

              {/* olhos concentrados (semicerrados) */}
              <g className="foki-expr" data-on={on('focused')}>
                <path d="M32.5 49 a5.5 5.5 0 0 0 11 0z" style={{ fill: 'var(--foki-eye)' }} />
                <path d="M56.5 49 a5.5 5.5 0 0 0 11 0z" style={{ fill: 'var(--foki-eye)' }} />
                <circle cx="40" cy="51.8" r="1.2" style={{ fill: 'var(--foki-shine)' }} />
                <circle cx="64" cy="51.8" r="1.2" style={{ fill: 'var(--foki-shine)' }} />
                <path
                  d="M31.5 49 h13 M55.5 49 h13"
                  style={{ stroke: 'var(--foki-eye)' }}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </g>

              {/* olhos tristes (pidoes) + sobrancelhas com ponta interna mais alta */}
              <g className="foki-expr" data-on={on('sad')}>
                <Eye cx={38} cy={51.5} big={2.3} small={1} />
                <Eye cx={62} cy={51.5} big={2.3} small={1} />
                <path
                  d="M31 45.5 Q37 43 44 40.5 M69 45.5 Q63 43 56 40.5"
                  style={{ stroke: 'var(--foki-eye)' }}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </g>

              {/* olhos felizes (arco pra cima) */}
              <g className="foki-expr" data-on={on('celebrating')}>
                <path
                  d="M33 51 q5 -6 10 0 M57 51 q5 -6 10 0"
                  style={{ stroke: 'var(--foki-eye)' }}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  fill="none"
                />
              </g>

              {/* olhos fechados (dormindo) */}
              <g className="foki-expr" data-on={on('sleeping')}>
                <path
                  d="M33 49 q5 4 10 0 M57 49 q5 4 10 0"
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
