/**
 * Unit tests for the game-data locale resolver (prefix builders, event /
 * segment / frame-tier lookups, optional fallthrough, fr-FR → en-US
 * fallback for game-data keys).
 */
import {
  LocaleKey,
  resolveEventName,
  resolveEventDescription,
  resolveSegmentName,
  resolveFrameName,
  getGameDataEntry,
} from '../../locales/gameDataLocale';
import { registerLocale, loadLocaleById } from '../../locales/locale';
import { DataStatus } from '../../consts/enums';

describe('gameDataLocale', () => {
  beforeAll(() => {
    // Only register keys that are NOT already shipped in the pilot locale
    // file (src/locales/game-data/en-US/operators/da-pan.json). Pilot keys
    // are covered by the "pilot file integration" block below.
    registerLocale('en-US', {
      'weapon.AGGELOSLAYER.event.name': 'Aggeloslayer',
      'weapon.TEST_WEAPON.segment.0.frame.1.name': 'Windup',
      'gear.ABURREY_LEGACY.event.name': "Aburrey's Legacy",
      'gear.ABURREY_LEGACY.status.ABURREY_LEGACY_BATTLE_SKILL.event.name': "Aburrey's Legacy (BS)",
      'consumable.GINSENG_MEAT_STEW.event.name': 'Ginseng Meat Stew',
      'status.FOCUS.event.name': 'Focus',
      'gd.test.unknownop.event.name': 'placeholder',
    });
    registerLocale('fr-FR', {
      'weapon.AGGELOSLAYER.event.name': 'Aggeloslayer',
      // intentionally no French version of other keys — exercises en-US fallback
    });
    loadLocaleById('en-US');
  });

  afterAll(() => loadLocaleById('en-US'));

  describe('LocaleKey builders', () => {
    it('produces the expected prefixes', () => {
      expect(LocaleKey.operator('DA_PAN')).toBe('op.DA_PAN');
      expect(LocaleKey.operatorSkill('DA_PAN', 'FLIP_DA_WOK')).toBe('op.DA_PAN.skill.FLIP_DA_WOK');
      expect(LocaleKey.operatorTalent('DA_PAN', 'SALTY_OR_MILD')).toBe('op.DA_PAN.talent.SALTY_OR_MILD');
      expect(LocaleKey.operatorStatus('DA_PAN', 'FINE_COOKING')).toBe('op.DA_PAN.status.FINE_COOKING');
      expect(LocaleKey.operatorPotential('DA_PAN', 3)).toBe('op.DA_PAN.potential.3');
      expect(LocaleKey.weapon('AGGELOSLAYER')).toBe('weapon.AGGELOSLAYER');
      expect(LocaleKey.gear('ABURREY_LEGACY')).toBe('gear.ABURREY_LEGACY');
      expect(LocaleKey.gearStatus('ABURREY_LEGACY', 'FOO')).toBe('gear.ABURREY_LEGACY.status.FOO');
      expect(LocaleKey.consumable('GINSENG_MEAT_STEW')).toBe('consumable.GINSENG_MEAT_STEW');
      expect(LocaleKey.genericStatus('FOCUS')).toBe('status.FOCUS');
    });
  });

  describe('resolveEventName', () => {
    it('returns the event-tier name via the pilot file', () => {
      expect(resolveEventName(LocaleKey.operator('DA_PAN'))).toBe('Da Pan');
    });

    it('returns the event-tier name via an in-memory registration', () => {
      expect(resolveEventName(LocaleKey.weapon('AGGELOSLAYER'))).toBe('Aggeloslayer');
    });

    it('falls back to the key when missing everywhere', () => {
      expect(resolveEventName(LocaleKey.operator('UNKNOWN'))).toBe('op.UNKNOWN.event.name');
    });
  });

  describe('resolveSegmentName / resolveFrameName', () => {
    it('returns undefined when no segment name is registered', () => {
      expect(resolveSegmentName(LocaleKey.operatorSkill('DA_PAN', 'FLIP_DA_WOK'), 0)).toBeUndefined();
    });

    it('returns undefined for undefined segment', () => {
      expect(resolveSegmentName(LocaleKey.operatorSkill('DA_PAN', 'FLIP_DA_WOK'), 9)).toBeUndefined();
    });

    it('returns frame name when defined', () => {
      // Via in-memory registration — the pilot file has no named frames.
      expect(resolveFrameName(LocaleKey.weapon('TEST_WEAPON'), 0, 1)).toBe('Windup');
    });

    it('returns undefined for undefined frame', () => {
      expect(resolveFrameName(LocaleKey.weapon('TEST_WEAPON'), 0, 5)).toBeUndefined();
    });
  });

  describe('fallback to en-US for game-data', () => {
    it('uses current-locale text when available', () => {
      loadLocaleById('fr-FR');
      expect(resolveEventName(LocaleKey.weapon('AGGELOSLAYER'))).toBe('Aggeloslayer');
    });

    it('falls back to en-US when key missing in current locale', () => {
      loadLocaleById('fr-FR');
      expect(resolveEventName(LocaleKey.operatorSkill('DA_PAN', 'FLIP_DA_WOK'))).toBe('FLIP DA WOK!');
    });
  });

  describe('getGameDataEntry (reconciler API)', () => {
    // The raw records map is populated by `ingest()` at module load time from
    // files under `src/locales/game-data/<locale>/**/*.json`. Runtime
    // `registerLocale` calls do NOT appear here — the reconciler reads from
    // the persisted file state, not from in-memory overrides.
    it('returns undefined for unknown keys', () => {
      expect(getGameDataEntry('en-US', 'op.DOES_NOT_EXIST.event.name')).toBeUndefined();
    });

    it('returns undefined for keys only added via registerLocale (not on disk)', () => {
      // `op.DA_PAN.skill.FLIP_DA_WOK` IS on disk (ingested from the pilot
      // file), so we pick a key that's only been registered in beforeAll.
      // None of the beforeAll registrations land in `gameDataRecords` because
      // they go through `registerLocale` directly, bypassing `ingest`.
      expect(getGameDataEntry('en-US', 'weapon.AGGELOSLAYER.event.name')).toBeUndefined();
      expect(getGameDataEntry('en-US', 'consumable.GINSENG_MEAT_STEW.event.name')).toBeUndefined();
    });

    it('returns the full record including dataStatus for entries on disk', () => {
      const entry = getGameDataEntry('en-US', 'op.DA_PAN.event.name');
      expect(entry).toEqual({ text: 'Da Pan', dataStatus: DataStatus.RECONCILED });
    });
  });

  describe('pilot file integration', () => {
    it('resolves the operator name from the pilot file', () => {
      expect(resolveEventName(LocaleKey.operator('DA_PAN'))).toBe('Da Pan');
    });

    it('resolves skill name + description from the pilot file', () => {
      const prefix = LocaleKey.operatorSkill('DA_PAN', 'FLIP_DA_WOK');
      expect(resolveEventName(prefix)).toBe('FLIP DA WOK!');
      expect(resolveEventDescription(prefix)).toContain('Takes out a wok');
    });

    it('resolves segment names for skills that define them', () => {
      const prefix = LocaleKey.operatorSkill('DA_PAN', 'MORE_SPICE');
      expect(resolveSegmentName(prefix, 0)).toBe('Animation');
      expect(resolveSegmentName(prefix, 1)).toBe('MORE SPICE!');
      expect(resolveSegmentName(prefix, 2)).toBe('Cooldown');
    });

    it('resolves potential description with format-coded interpolation', () => {
      const prefix = LocaleKey.operatorPotential('DA_PAN', 3);
      expect(
        resolveEventDescription(prefix, { Str: 8, PhysicalDamageIncrease: 0.12 }),
      ).toBe('Strength +8, Physical DMG Dealt +12%.');
    });
  });
});
