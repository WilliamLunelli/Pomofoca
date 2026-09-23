/**
 * Conversão sRGB -> OKLCH e geração de rampas tonais (100-900) a partir de uma cor
 * base qualquer, preservando o mesmo hue/chroma e variando só a luminosidade -
 * mesma abordagem do protótipo (ver design-tokens-pomofoca.md, seção D).
 * Referência do espaço de cor: Björn Ottosson, https://bottosson.github.io/posts/oklab/
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const int = parseInt(value, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(channel: number): number {
  const c =
    channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bLab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + bLab * bLab);
  let H = (Math.atan2(bLab, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  return { l: L, c: C, h: H };
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const bLab = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bLab;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bLab;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bLab;

  const lCubed = l_ ** 3;
  const mCubed = m_ ** 3;
  const sCubed = s_ ** 3;

  const r = +4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed;
  const g = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed;
  const b = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed;

  const toHex = (v: number) => linearToSrgb(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Passos de luminosidade validados no protótipo (rampa 100-900, L 0.660 no 500). */
const RAMP_LIGHTNESS: Record<number, number> = {
  100: 0.97,
  200: 0.93,
  300: 0.86,
  400: 0.76,
  500: 0.66,
  600: 0.56,
  700: 0.45,
  800: 0.33,
  900: 0.22,
};

export type ColorRamp = Record<
  100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900,
  string
>;

/** Gera uma rampa 100-900 a partir de qualquer cor base, mantendo hue/chroma constantes. */
export function generateRamp(baseColorHex: string): ColorRamp {
  const { c, h } = hexToOklch(baseColorHex);
  const entries = Object.entries(RAMP_LIGHTNESS).map(([step, l]) => [
    step,
    oklchToHex({ l, c, h }),
  ]);
  return Object.fromEntries(entries) as ColorRamp;
}

/** Paleta curada de cores de destaque oferecida na personalização (Configurações). */
export const ACCENT_PRESETS = [
  { name: 'Roxo (padrão)', hex: '#6D5AE6' },
  { name: 'Verde-água', hex: '#35C3BB' },
  { name: 'Laranja', hex: '#E9962B' },
  { name: 'Coral', hex: '#FF8A7A' },
  { name: 'Verde', hex: '#4ED886' },
  { name: 'Azul', hex: '#4F7CFF' },
];

/** Paleta sugerida ao criar uma matéria nova. */
export const SUBJECT_COLOR_PRESETS = [
  '#8B7CF0',
  '#35C3BB',
  '#E9962B',
  '#FF8A7A',
  '#4ED886',
  '#F5B95C',
];
