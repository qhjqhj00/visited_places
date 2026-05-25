import { describe, it, expect } from 'vitest';
import { tr, cityName } from './i18n';

describe('tr', () => {
  it('returns the language-specific string', () => {
    expect(tr('zh', 'app.share')).toBe('分享');
    expect(tr('en', 'app.share')).toBe('Share');
  });
  it('interpolates function entries', () => {
    expect(tr('en', 'sel.header', 5, 2)).toBe('Visited · 5 · 2 countries');
    expect(tr('en', 'sel.header', 5, 1)).toBe('Visited · 5 · 1 country');
  });
  it('returns the key itself for an unknown key', () => {
    expect(tr('en', 'nope.nope')).toBe('nope.nope');
  });
});

describe('cityName', () => {
  const c = { en: 'Suzhou', zh: '苏州' };
  it('prefers zh in zh mode, en in en mode', () => {
    expect(cityName(c, 'zh')).toBe('苏州');
    expect(cityName(c, 'en')).toBe('Suzhou');
  });
  it('falls back to en when zh is missing', () => {
    expect(cityName({ en: 'Strahan', zh: null }, 'zh')).toBe('Strahan');
  });
});
