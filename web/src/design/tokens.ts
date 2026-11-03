/** Same values as tokens.css, for GSAP and Three.js. */
export const colors = {
  void: '#03050A',
  bg: '#060912',
  navy900: '#070C1C',
  navy800: '#0A1228',
  navy700: '#0E1A38',
  graphite900: '#0B0E14',
  graphite800: '#11151D',
  graphite700: '#171C26',
  graphite600: '#202734',
  line1: 'rgba(148,178,255,0.08)',
  line2: 'rgba(148,178,255,0.14)',
  line3: 'rgba(148,178,255,0.26)',
  text1: '#F3F6FC',
  text2: '#A6B1C8',
  text3: '#76829C',
  text4: '#4A546B',
  blue500: '#2F6BFF',
  blue400: '#4C86FF',
  blue300: '#8AAEFF',
  cyan400: '#35D6FF',
  cyan300: '#7BE6FF',
  cyan200: '#C2F5FF',
  violet500: '#7A4DFF',
  violet400: '#9A73FF',
  success: '#2FD98B',
  warning: '#FFB547',
  danger: '#FF4D6D',
} as const;

export const emissive = {
  ledCyan: { color: '#35D6FF', intensity: 4 },
  ledBlue: { color: '#2F6BFF', intensity: 5 },
  ledWhite: { color: '#EAF2FF', intensity: 3 },
  green: { color: '#2FD98B', intensity: 3 },
  amber: { color: '#FFB547', intensity: 3 },
  red: { color: '#FF4D6D', intensity: 3 },
  stream: ['#2F6BFF', '#35D6FF', '#9A73FF'],
} as const;

export const space = { 0.5: 2, 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80 } as const;
export const layout = { sidebar: 232, panelPad: 20, gutter: 24, safeTop: 52 } as const;
export const radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 28, pill: 999 } as const;

/** Durations in SECONDS (GSAP units). */
export const dur = {
  instant: 0.08,
  micro: 0.14,
  fast: 0.2,
  base: 0.32,
  moderate: 0.45,
  slow: 0.64,
  deliberate: 0.9,
  cameraShort: 1.2,
  camera: 1.8,
  cameraLong: 2.6,
} as const;

export const stagger = { rows: 0.035, panels: 0.06, chars: 0.018 } as const;

export const bezier = {
  standard: [0.2, 0, 0, 1],
  enter: [0.05, 0.7, 0.1, 1],
  exit: [0.3, 0, 0.8, 0.15],
  camera: [0.65, 0, 0.35, 1],
  press: [0.3, 0, 0.2, 1],
  warpIn: [0.7, 0, 0.84, 0],
} as const;

export const themes = ['midnight', 'graphite', 'aurora'] as const;
