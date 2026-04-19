/**
 * Unit tests for the locale module — format-code parsing, fallback chain,
 * and backward-compat of the original `{param}` interpolation.
 */
import { t, loadLocaleData, loadLocaleById, getCurrentLocale } from '../../locales/locale';

const EN_US_SNAPSHOT = {
  'test.plain': 'Hello world',
  'test.simple': 'Hi {name}!',
  'test.int': 'Strength +{Str:0}',
  'test.int1dp': 'Power {Val:1}',
  'test.pct0': 'DMG +{Inc:0%}',
  'test.pct1': 'DMG +{Inc:1%}',
  'test.secs': 'Duration {Dur:0s}',
  'test.secs1': 'Duration {Dur:1s}',
  'test.multi': '+{Str:0} STR, +{Inc:0%} DMG',
  'test.repeated': '{n} and {n} again',
  'test.en_only': 'English only',
  'test.shared': 'English shared',
};

const FR_FR_SNAPSHOT = {
  'test.plain': 'Bonjour monde',
  'test.shared': 'Français partagé',
  // no test.en_only — exercises the en-US fallback
};

function useFrench() {
  loadLocaleData('fr-FR', FR_FR_SNAPSHOT);
}

function useEnglish() {
  loadLocaleData('en-US', EN_US_SNAPSHOT);
}

describe('locale t()', () => {
  beforeEach(useEnglish);
  afterAll(() => loadLocaleById('en-US'));

  describe('plain lookup', () => {
    it('returns the string when present', () => {
      expect(t('test.plain')).toBe('Hello world');
    });

    it('returns the key when missing in both current and fallback', () => {
      expect(t('test.does_not_exist')).toBe('test.does_not_exist');
    });
  });

  describe('legacy {param} interpolation', () => {
    it('substitutes a single named param', () => {
      expect(t('test.simple', { name: 'Bob' })).toBe('Hi Bob!');
    });

    it('leaves unknown tokens untouched', () => {
      expect(t('test.simple', { other: 'x' })).toBe('Hi {name}!');
    });

    it('replaces every occurrence of a repeated token', () => {
      expect(t('test.repeated', { n: 3 })).toBe('3 and 3 again');
    });
  });

  describe('format codes', () => {
    it(':0 rounds to integer', () => {
      expect(t('test.int', { Str: 8.7 })).toBe('Strength +9');
      expect(t('test.int', { Str: 8 })).toBe('Strength +8');
    });

    it(':1 renders one decimal place', () => {
      expect(t('test.int1dp', { Val: 8 })).toBe('Power 8.0');
      expect(t('test.int1dp', { Val: 8.76 })).toBe('Power 8.8');
    });

    it(':0% multiplies by 100 and appends %', () => {
      expect(t('test.pct0', { Inc: 0.12 })).toBe('DMG +12%');
      expect(t('test.pct0', { Inc: 0.125 })).toBe('DMG +13%');
    });

    it(':1% keeps one decimal in the percent', () => {
      expect(t('test.pct1', { Inc: 0.125 })).toBe('DMG +12.5%');
    });

    it(':0s appends seconds suffix', () => {
      expect(t('test.secs', { Dur: 5 })).toBe('Duration 5s');
    });

    it(':1s keeps one decimal', () => {
      expect(t('test.secs1', { Dur: 5.25 })).toBe('Duration 5.3s');
    });

    it('handles multiple tokens in one string', () => {
      expect(t('test.multi', { Str: 8, Inc: 0.12 })).toBe('+8 STR, +12% DMG');
    });

    it('leaves format-coded tokens alone when param is absent', () => {
      expect(t('test.multi', { Str: 8 })).toBe('+8 STR, +{Inc:0%} DMG');
    });

    it('falls back to plain insertion when a format-coded param is a string', () => {
      expect(t('test.int', { Str: 'N/A' as unknown as number })).toBe('Strength +N/A');
    });
  });

  describe('fallback chain', () => {
    it('uses current-locale string when present', () => {
      useFrench();
      expect(t('test.plain')).toBe('Bonjour monde');
      expect(t('test.shared')).toBe('Français partagé');
    });

    it('falls back to en-US when key is missing in current locale', () => {
      useFrench();
      expect(t('test.en_only')).toBe('English only');
    });

    it('returns the key when missing in both', () => {
      useFrench();
      expect(t('test.nothing_defined_anywhere')).toBe('test.nothing_defined_anywhere');
    });
  });

  describe('loadLocaleById', () => {
    it('resolves known locales', () => {
      const { locale } = loadLocaleById('fr-FR');
      expect(locale).toBe('fr-FR');
      expect(getCurrentLocale()).toBe('fr-FR');
    });

    it('falls back to en-US when the id is unknown', () => {
      const { locale } = loadLocaleById('xx-XX');
      expect(locale).toBe('en-US');
    });
  });
});
