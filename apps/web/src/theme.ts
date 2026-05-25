export type ProjectionName = 'naturalEarth1' | 'equalEarth';

export interface ThemeColors {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  land: string;
  landBorder: string;
  water: string;
  dot: string;
  graticule: string;
}

export interface Theme {
  name: string;
  label: string;
  colors: ThemeColors;
  fontDisplay: string;
  fontBody: string;
  projection: ProjectionName;
}

const SERIF = "ui-serif, Georgia, 'Songti SC', 'Times New Roman', serif";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui, sans-serif";

export const themes: Record<string, Theme> = {
  claude: {
    name: 'claude',
    label: 'Claude',
    fontDisplay: SERIF,
    fontBody: SANS,
    projection: 'naturalEarth1',
    colors: {
      bg: '#F2EFE7',
      surface: '#FBFAF6',
      ink: '#34322D',
      muted: '#8C887E',
      accent: '#D97757',
      accentSoft: '#E7D0C4',
      land: '#E3DDD0',
      landBorder: '#D2CBBC',
      water: '#F2EFE7',
      dot: '#C2613F',
      graticule: '#E4DDCF',
    },
  },
  apple: {
    name: 'apple',
    label: 'Apple',
    fontDisplay: SANS,
    fontBody: SANS,
    projection: 'equalEarth',
    colors: {
      bg: '#F5F5F7',
      surface: '#FFFFFF',
      ink: '#1D1D1F',
      muted: '#86868B',
      accent: '#0071E3',
      accentSoft: '#D6E8FB',
      land: '#E4E4E9',
      landBorder: '#D2D2D7',
      water: '#F5F5F7',
      dot: '#0071E3',
      graticule: '#EAEAEF',
    },
  },
  nordic: {
    name: 'nordic',
    label: '北欧',
    fontDisplay: SANS,
    fontBody: SANS,
    projection: 'naturalEarth1',
    colors: {
      bg: '#ECEDEA',
      surface: '#F7F7F5',
      ink: '#2B2F33',
      muted: '#878D8B',
      accent: '#6E8B86',
      accentSoft: '#D7E0DD',
      land: '#DBDDD7',
      landBorder: '#C8CBC4',
      water: '#ECEDEA',
      dot: '#577873',
      graticule: '#DEE0DA',
    },
  },
  midnight: {
    name: 'midnight',
    label: '午夜',
    fontDisplay: SANS,
    fontBody: SANS,
    projection: 'naturalEarth1',
    colors: {
      bg: '#0D1117',
      surface: '#161B22',
      ink: '#E6EDF3',
      muted: '#7D8590',
      accent: '#58C4DD',
      accentSoft: '#15323F',
      land: '#171E29',
      landBorder: '#2A3340',
      water: '#0B0F16',
      dot: '#58C4DD',
      graticule: '#1C2530',
    },
  },
  mono: {
    name: 'mono',
    label: '极简',
    fontDisplay: SANS,
    fontBody: SANS,
    projection: 'naturalEarth1',
    colors: {
      bg: '#F4F5F6',
      surface: '#FFFFFF',
      ink: '#1F2933',
      muted: '#8B95A1',
      accent: '#475569',
      accentSoft: '#DCE2E8',
      land: '#E4E8EB',
      landBorder: '#CFD6DC',
      water: '#EDF0F2',
      dot: '#3D4753',
      graticule: '#E2E6EA',
    },
  },
  sand: {
    name: 'sand',
    label: '暖沙',
    fontDisplay: SERIF,
    fontBody: SANS,
    projection: 'naturalEarth1',
    colors: {
      bg: '#EFE7D6',
      surface: '#FBF6EB',
      ink: '#4B4034',
      muted: '#9C8E78',
      accent: '#B5713C',
      accentSoft: '#E6D3BC',
      land: '#E6DBC2',
      landBorder: '#D6C8A9',
      water: '#CFE0DC',
      dot: '#A85F2E',
      graticule: '#E0D4BB',
    },
  },
};

export function applyTheme(theme: Theme): void {
  const s = document.documentElement.style;
  const c = theme.colors;
  s.setProperty('--bg', c.bg);
  s.setProperty('--surface', c.surface);
  s.setProperty('--ink', c.ink);
  s.setProperty('--muted', c.muted);
  s.setProperty('--accent', c.accent);
  s.setProperty('--accent-soft', c.accentSoft);
  s.setProperty('--land', c.land);
  s.setProperty('--land-border', c.landBorder);
  s.setProperty('--water', c.water);
  s.setProperty('--dot', c.dot);
  s.setProperty('--font-display', theme.fontDisplay);
  s.setProperty('--font-body', theme.fontBody);
}
