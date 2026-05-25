import { describe, it, expect } from 'vitest';
import { countryName, COUNTRY_ZH } from './countries';

describe('countryName', () => {
  it('returns the Chinese exonym in zh mode', () => {
    expect(countryName('FR', 'France', 'zh')).toBe('法国');
    expect(countryName('NZ', 'New Zealand', 'zh')).toBe('新西兰');
  });
  it('returns English in en mode regardless of cc', () => {
    expect(countryName('FR', 'France', 'en')).toBe('France');
  });
  it('falls back to the English name for an unknown cc', () => {
    expect(countryName('ZZ', 'Atlantis', 'zh')).toBe('Atlantis');
  });
  it('covers the major dataset countries', () => {
    for (const cc of ['CN', 'US', 'JP', 'AU', 'GB', 'DE', 'TW', 'HK']) {
      expect(COUNTRY_ZH[cc]).toBeTruthy();
    }
  });
});
