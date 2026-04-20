/**
 * Tests for EventBlock's trailing-numeral extraction — the fallback used when
 * a reaction/stack label is too long for its segment and gets shortened to
 * just its trailing suffix.
 *
 * Verifies:
 * - Reaction levels II–IV extract to their roman numeral
 * - Multi-digit arabic stack counts extract to the number
 * - Singular roman "I" does NOT extract (would reduce the whole label to a
 *   meaningless "I")
 * - Labels with no trailing numeral return undefined
 * - Labels without leading whitespace before the numeral do not match
 *   (e.g. raw "IV" with no base name is not a reaction label)
 */
import { extractTrailingNumeral } from '../../view/EventBlock';

describe('extractTrailingNumeral', () => {
  describe('reaction roman levels', () => {
    it('extracts "II" from "Combustion II"', () => {
      expect(extractTrailingNumeral('Combustion II')).toBe('II');
    });

    it('extracts "III" from "Corrosion III"', () => {
      expect(extractTrailingNumeral('Corrosion III')).toBe('III');
    });

    it('extracts "IV" from "Solidification IV"', () => {
      expect(extractTrailingNumeral('Solidification IV')).toBe('IV');
    });

    it('does NOT extract singular "I" from "Combustion I"', () => {
      // Singular level — collapsing the label to "I" carries no information.
      // The full label should render (CSS mask fades the overflow).
      expect(extractTrailingNumeral('Combustion I')).toBeUndefined();
    });

    it('does NOT extract singular "I" from "Corrosion I"', () => {
      expect(extractTrailingNumeral('Corrosion I')).toBeUndefined();
    });

    it('does NOT extract singular "I" from "Electrification I"', () => {
      expect(extractTrailingNumeral('Electrification I')).toBeUndefined();
    });
  });

  describe('arabic stack counts', () => {
    it('extracts "2" from "Heat 2"', () => {
      expect(extractTrailingNumeral('Heat 2')).toBe('2');
    });

    it('extracts "10" from "Vulnerable 10"', () => {
      expect(extractTrailingNumeral('Vulnerable 10')).toBe('10');
    });
  });

  describe('no trailing numeral', () => {
    it('returns undefined for labels with no trailing numeral', () => {
      expect(extractTrailingNumeral('Basic Attack')).toBeUndefined();
      expect(extractTrailingNumeral('Ultimate')).toBeUndefined();
      expect(extractTrailingNumeral('Combustion')).toBeUndefined();
    });

    it('returns undefined when the numeral is not whitespace-separated', () => {
      expect(extractTrailingNumeral('CombustionII')).toBeUndefined();
      expect(extractTrailingNumeral('IV')).toBeUndefined();
    });

    it('returns undefined for empty strings', () => {
      expect(extractTrailingNumeral('')).toBeUndefined();
    });
  });
});
