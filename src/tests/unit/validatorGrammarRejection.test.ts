/**
 * Validator grammar tests — pin the DSL shape rejection rules so the
 * INFLICTION / REACTION migration can't be undone silently.
 *
 * The model treats INFLICTION and REACTION exclusively as `objectId` values
 * under `object: STATUS`. They are never valid at the `object` or `subject`
 * position. The validators (`validateEffect`, `validateInteraction`) emit an
 * explicit error for the legacy shape.
 */
import { validateEffect, validateInteraction } from '../../model/game-data/validationUtils';
import { VerbType, NounType, AdjectiveType } from '../../dsl/semantics';

describe('validator: INFLICTION / REACTION grammar rejection', () => {
  describe('object: INFLICTION — rejected', () => {
    test('APPLY INFLICTION HEAT → error mentioning STATUS wrapper', () => {
      const errors = validateEffect(
        {
          verb: VerbType.APPLY,
          object: NounType.INFLICTION,
          objectQualifier: AdjectiveType.HEAT,
          to: NounType.ENEMY,
        },
        'effect',
      );
      expect(errors.some(e => /INFLICTION is not a valid object/i.test(e))).toBe(true);
    });

    test('CONSUME INFLICTION CRYO → error', () => {
      const errors = validateEffect(
        {
          verb: VerbType.CONSUME,
          object: NounType.INFLICTION,
          objectQualifier: AdjectiveType.CRYO,
          from: NounType.ENEMY,
        },
        'effect',
      );
      expect(errors.some(e => /INFLICTION is not a valid object/i.test(e))).toBe(true);
    });

    test('HAVE INFLICTION (condition) → error', () => {
      const errors = validateInteraction(
        {
          subject: NounType.ENEMY,
          verb: VerbType.HAVE,
          object: NounType.INFLICTION,
          objectQualifier: AdjectiveType.HEAT,
        },
        'cond',
      );
      expect(errors.some(e => /INFLICTION is not a valid object/i.test(e))).toBe(true);
    });
  });

  describe('object: REACTION — rejected', () => {
    test('APPLY REACTION COMBUSTION → error', () => {
      const errors = validateEffect(
        {
          verb: VerbType.APPLY,
          object: NounType.REACTION,
          objectQualifier: AdjectiveType.COMBUSTION,
          to: NounType.ENEMY,
        },
        'effect',
      );
      expect(errors.some(e => /REACTION is not a valid object/i.test(e))).toBe(true);
    });

    test('CONSUME REACTION SOLIDIFICATION → error', () => {
      const errors = validateEffect(
        {
          verb: VerbType.CONSUME,
          object: NounType.REACTION,
          objectQualifier: AdjectiveType.SOLIDIFICATION,
          from: NounType.ENEMY,
        },
        'effect',
      );
      expect(errors.some(e => /REACTION is not a valid object/i.test(e))).toBe(true);
    });
  });

  describe('subject: INFLICTION | REACTION — rejected', () => {
    test('subject=INFLICTION → error', () => {
      const errors = validateInteraction(
        {
          subject: NounType.INFLICTION,
          verb: VerbType.HAVE,
          object: NounType.STACKS,
        },
        'cond',
      );
      expect(errors.some(e => /INFLICTION is not a valid subject/i.test(e))).toBe(true);
    });

    test('subject=REACTION → error', () => {
      const errors = validateInteraction(
        {
          subject: NounType.REACTION,
          verb: VerbType.HAVE,
          object: NounType.STACKS,
        },
        'cond',
      );
      expect(errors.some(e => /REACTION is not a valid subject/i.test(e))).toBe(true);
    });
  });

  describe('canonical STATUS + objectId shape — accepted', () => {
    test('APPLY STATUS INFLICTION HEAT → no INFLICTION/REACTION-shape error', () => {
      const errors = validateEffect(
        {
          verb: VerbType.APPLY,
          object: NounType.STATUS,
          objectId: NounType.INFLICTION,
          objectQualifier: AdjectiveType.HEAT,
          to: NounType.ENEMY,
        },
        'effect',
      );
      expect(errors.filter(e => /is not a valid (object|subject)/i.test(e))).toHaveLength(0);
    });

    test('APPLY STATUS REACTION COMBUSTION → no INFLICTION/REACTION-shape error', () => {
      const errors = validateEffect(
        {
          verb: VerbType.APPLY,
          object: NounType.STATUS,
          objectId: NounType.REACTION,
          objectQualifier: AdjectiveType.COMBUSTION,
          to: NounType.ENEMY,
        },
        'effect',
      );
      expect(errors.filter(e => /is not a valid (object|subject)/i.test(e))).toHaveLength(0);
    });

    test('HAVE STATUS INFLICTION VULNERABLE (condition) → no shape error', () => {
      const errors = validateInteraction(
        {
          subject: NounType.ENEMY,
          verb: VerbType.HAVE,
          object: NounType.STATUS,
          objectId: NounType.INFLICTION,
          objectQualifier: 'VULNERABLE',
        },
        'cond',
      );
      expect(errors.filter(e => /is not a valid (object|subject)/i.test(e))).toHaveLength(0);
    });
  });
});
