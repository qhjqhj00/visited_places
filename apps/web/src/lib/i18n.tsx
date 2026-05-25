import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'zh' | 'en';
const LANG_KEY = 'lang.v1';

export function getLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

type Val = string | ((...a: any[]) => string);
type Entry = { zh: Val; en: Val };

// One flat dictionary. Values are strings, or functions when they interpolate.
const STRINGS: Record<string, Entry> = {
  'app.title': { zh: 'Life Map', en: 'Life Map' },
  'app.subtitle': {
    zh: '选择去过的城市，看着它在地图上长出来',
    en: 'Pick the places you’ve been — watch your map grow',
  },
  'app.share': { zh: '分享', en: 'Share' },
  'app.export': { zh: '导出图片', en: 'Export image' },
  'app.routes': { zh: '航线', en: 'Routes' },

  'routes.title': { zh: '航线管理', en: 'Manage routes' },
  'routes.from': { zh: '出发城市', en: 'From' },
  'routes.to': { zh: '到达城市', en: 'To' },
  'routes.times': { zh: '次数', en: 'Times' },
  'routes.addBtn': { zh: '添加', en: 'Add' },
  'routes.empty': { zh: '还没有航线，在上方添加一条', en: 'No routes yet — add one above' },
  'routes.search': { zh: '搜索城市', en: 'Search a city' },
  'routes.count': { zh: (n: number) => `${n} 条航线`, en: (n: number) => `${n} ${n === 1 ? 'route' : 'routes'}` },
  'routes.import': { zh: '导入航旅纵横', en: 'Import 航旅纵横' },
  'routes.importing': { zh: '解析中…', en: 'Parsing…' },
  'routes.imported': {
    zh: (n: number, u: number) => `已导入 ${n} 条航线${u ? `，${u} 个机场未识别` : ''}`,
    en: (n: number, u: number) => `Imported ${n} routes${u ? `, ${u} airports unrecognized` : ''}`,
  },
  'routes.importFail': {
    zh: '解析失败，请确认是航旅纵横导出的 Excel',
    en: 'Parse failed — make sure it’s a 航旅纵横 Excel export',
  },
  'routes.importHint': {
    zh: '上传航旅纵横「我的行程」导出的 Excel，自动识别已飞航段',
    en: 'Upload the Excel exported from 航旅纵横; flown legs are detected automatically',
  },
  'app.linkCopied': { zh: '已复制分享链接：', en: 'Share link copied:' },
  'app.loadError': { zh: (e: string) => `数据加载失败：${e}`, en: (e: string) => `Failed to load data: ${e}` },
  'app.loading': { zh: '正在加载城市数据…', en: 'Loading city data…' },

  'stats.cities': { zh: '城市', en: 'Cities' },
  'stats.countries': { zh: '国家 / 地区', en: 'Countries' },
  'stats.continents': { zh: '大洲', en: 'Continents' },
  'stats.world': { zh: '世界版图', en: 'World' },

  'sel.empty1': { zh: '还没有去过的城市。', en: 'No cities yet.' },
  'sel.empty2': { zh: '搜索或点上面的推荐开始吧 ✨', en: 'Search or tap a suggestion above ✨' },
  'sel.header': {
    zh: (n: number, g: number) => `去过的城市 · ${n} · ${g} 国`,
    en: (n: number, g: number) => `Visited · ${n} · ${g} ${g === 1 ? 'country' : 'countries'}`,
  },
  'sel.clear': { zh: '清空', en: 'Clear' },
  'common.remove': { zh: '移除', en: 'Remove' },
  'common.close': { zh: '关闭', en: 'Close' },

  'search.placeholder': {
    zh: '搜索城市，中英文都行 — 试试「札幌」或「Suzhou」',
    en: 'Search cities (中文 or English) — try “Sapporo” or “苏州”',
  },

  'rec.popular': { zh: '热门城市', en: 'popular cities' },
  'rec.shuffle': { zh: '🎲 换一批', en: '🎲 Shuffle' },
  'rec.beenToo': { zh: '你可能也去过 · 点一下快速添加', en: 'You might’ve been here too · tap to add' },
  'rec.startWith': { zh: '从这些热门城市开始', en: 'Start with these popular cities' },

  'expand.busy': { zh: 'AI 有点忙，点一下重试', en: 'AI is busy — tap to retry' },
  'expand.loading': { zh: 'AI 规划中…（约 10–20 秒）', en: 'AI planning… (~10–20s)' },
  'expand.cta': { zh: '智能扩展 · 让 AI 推荐旅行动线', en: 'Smart expand · let AI suggest a route' },
  'expand.based': { zh: (n: string) => `基于 ${n} 的 AI 推荐`, en: (n: string) => `AI picks based on ${n}` },

  'export.preview': { zh: '预览', en: 'Preview' },
  'export.rendering': { zh: '正在渲染地图…', en: 'Rendering map…' },
  'export.renderFail': { zh: '渲染失败，重试一下', en: 'Render failed, try again' },
  'export.hint': { zh: '点「生成预览」看效果', en: 'Tap “Generate preview” to see it' },
  'export.title': { zh: '导出图片', en: 'Export image' },
  'export.size': { zh: '尺寸', en: 'Size' },
  'export.content': { zh: '内容', en: 'Content' },
  'export.titleLabel': { zh: '标题', en: 'Title' },
  'export.handle': { zh: '社媒账号', en: 'Social handle' },
  'export.renderingShort': { zh: '渲染中…', en: 'Rendering…' },
  'export.generate': { zh: '生成预览', en: 'Generate preview' },
  'export.download': { zh: '下载 PNG', en: 'Download PNG' },
  'aspect.square': { zh: '帖子', en: 'Post' },
  'aspect.story': { zh: '竖屏', en: 'Story' },
  'aspect.wide': { zh: '宽屏', en: 'Wide' },

  'flight.both': { zh: '城市+航线', en: 'Cities + routes' },
  'flight.cities': { zh: '城市', en: 'Cities' },
  'flight.routes': { zh: '航线', en: 'Routes' },

  'map.back': { zh: '返回世界', en: 'Back to world' },
  'map.selectHint': {
    zh: '◦ 点空心圈或地名添加 · 点已选取消',
    en: '◦ Tap a ring or label to add · tap a marker to remove',
  },

  'user.default': { zh: '默认', en: 'Default' },
  'user.current': { zh: '当前用户', en: 'Current user' },
  'user.cities': { zh: (n: number) => `${n} 城`, en: (n: number) => `${n} ${n === 1 ? 'city' : 'cities'}` },
  'user.placeholder': { zh: '输入名字进入/新建', en: 'Type a name to enter/create' },
  'user.enter': { zh: '进入', en: 'Enter' },
  'user.rename': {
    zh: (cur: string) => `↳ 把「${cur}」重命名为输入的名字`,
    en: (cur: string) => `↳ Rename “${cur}” to the typed name`,
  },
  'user.renameTitle': { zh: '把当前用户的数据改名搬到新名字下', en: 'Move this user’s data under a new name' },

  'theme.claude': { zh: 'Claude', en: 'Claude' },
  'theme.apple': { zh: 'Apple', en: 'Apple' },
  'theme.nordic': { zh: '北欧', en: 'Nordic' },

  'poster.watermark': { zh: 'Life Map · visited.places', en: 'Life Map · visited.places' },
};

/** Plain (non-React) lookup so canvas/export code can translate too. */
export function tr(lang: Lang, key: string, ...args: any[]): string {
  const e = STRINGS[key];
  if (!e) return key;
  const v = e[lang];
  return typeof v === 'function' ? v(...args) : v;
}

/** City name in the chosen language (zh falls back to en). */
export function cityName(c: { en: string; zh: string | null }, lang: Lang): string {
  return lang === 'zh' ? c.zh || c.en : c.en;
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, ...args: any[]) => string;
}
const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang);
  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);
  const t = useCallback((key: string, ...args: any[]) => tr(lang, key, ...args), [lang]);
  return <LangContext.Provider value={{ lang, setLang: setLangState, t }}>{children}</LangContext.Provider>;
}

export function useT(): Ctx {
  const c = useContext(LangContext);
  if (!c) throw new Error('useT must be used within LangProvider');
  return c;
}
