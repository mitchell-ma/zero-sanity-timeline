/**
 * Regression tests for the reaction / physical-status `objectId` misuse check
 * in `validationUtils.ts`.
 *
 * The canonical DSL shape for arts reactions is
 *   { object: STATUS, objectId: REACTION,  objectQualifier: <ArtsReactionType> }
 * and for physical statuses
 *   { object: STATUS, objectId: PHYSICAL,  objectQualifier: <PhysicalStatusType> }.
 *
 * Writing the reaction/physical name directly as `objectId` silently breaks
 * trigger matching (the interpretor keys on objectId + objectQualifier), so
 * the store validators reject it at parse time.
 */

import { NounType, VerbType } from '../../dsl/semantics';
import { ArtsReactionType, PhysicalStatusType } from '../../consts/enums';
import { validateEffect, validateInteraction } from '../../model/game-data/validationUtils';

describe('reaction / physical-status objectId misuse', () => {
  describe('arts reactions via validateEffect (effects side)', () => {
    for (const reaction of Object.values(ArtsReactionType)) {
      it(`flags ${reaction} as objectId`, () => {
        const errs = validateEffect({
          verb: VerbType.CONSUME,
          object: NounType.STATUS,
          objectId: reaction,
          from: NounType.ENEMY,
        }, 'test');
        expect(errs.some(e => e.includes(`"${reaction}" is an arts reaction`))).toBe(true);
        expect(errs.some(e => e.includes('objectQualifier'))).toBe(true);
      });
    }

    it('accepts canonical REACTION + qualifier shape', () => {
      const errs = validateEffect({
        verb: VerbType.CONSUME,
        object: NounType.STATUS,
        objectId: NounType.REACTION,
        objectQualifier: ArtsReactionType.ELECTRIFICATION,
        from: NounType.ENEMY,
      }, 'test');
      expect(errs.find(e => e.includes('arts reaction'))).toBeUndefined();
    });
  });

  describe('physical statuses via validateEffect (effects side)', () => {
    for (const phys of Object.values(PhysicalStatusType)) {
      it(`flags ${phys} as objectId`, () => {
        const errs = validateEffect({
          verb: VerbType.APPLY,
          object: NounType.STATUS,
          objectId: phys,
          to: NounType.ENEMY,
        }, 'test');
        expect(errs.some(e => e.includes(`"${phys}" is a physical status`))).toBe(true);
        expect(errs.some(e => e.includes('PHYSICAL'))).toBe(true);
      });
    }

    it('accepts canonical PHYSICAL + qualifier shape', () => {
      const errs = validateEffect({
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: 'PHYSICAL',
        objectQualifier: PhysicalStatusType.LIFT,
        to: NounType.ENEMY,
      }, 'test');
      expect(errs.find(e => e.includes('physical status'))).toBeUndefined();
    });
  });

  describe('conditions side via validateInteraction', () => {
    it('flags ELECTRIFICATION as objectId in a HAVE condition', () => {
      const errs = validateInteraction({
        subject: NounType.ENEMY,
        verb: VerbType.HAVE,
        object: NounType.STATUS,
        objectId: ArtsReactionType.ELECTRIFICATION,
      }, 'test');
      expect(errs.some(e => e.includes('arts reaction'))).toBe(true);
    });

    it('flags LIFT as objectId in a HAVE condition', () => {
      const errs = validateInteraction({
        subject: NounType.ENEMY,
        verb: VerbType.HAVE,
        object: NounType.STATUS,
        objectId: PhysicalStatusType.LIFT,
      }, 'test');
      expect(errs.some(e => e.includes('physical status'))).toBe(true);
    });

    it('accepts canonical condition shape with qualifier', () => {
      const errs = validateInteraction({
        subject: NounType.ENEMY,
        verb: VerbType.HAVE,
        object: NounType.STATUS,
        objectId: NounType.REACTION,
        objectQualifier: ArtsReactionType.COMBUSTION,
      }, 'test');
      expect(errs).toHaveLength(0);
    });

    it('ignores unrelated objectIds (e.g. INFLICTION, PROTECTION)', () => {
      const infl = validateInteraction({
        subject: NounType.ENEMY,
        verb: VerbType.HAVE,
        object: NounType.STATUS,
        objectId: NounType.INFLICTION,
        objectQualifier: 'HEAT',
      }, 'test');
      const prot = validateInteraction({
        subject: NounType.OPERATOR,
        verb: VerbType.HAVE,
        object: NounType.STATUS,
        objectId: 'PROTECTION',
      }, 'test');
      expect(infl).toHaveLength(0);
      expect(prot).toHaveLength(0);
    });
  });

  describe('invalid End-Axis with-keys are rejected', () => {
    const invalidKeys = ['damageMultiplierIncrement', 'poiseExtra', 'count'] as const;

    for (const key of invalidKeys) {
      it(`rejects ${key} inside effect.with`, () => {
        const errs = validateEffect({
          verb: VerbType.DEAL,
          objectQualifier: 'ELECTRIC',
          object: NounType.DAMAGE,
          to: NounType.ENEMY,
          with: {
            [key]: { verb: 'IS', value: 4 },
            value: { verb: 'IS', value: 1.5 },
          },
        }, 'test');
        expect(errs.some(e => e.includes(`.with.${key}`))).toBe(true);
        expect(errs.some(e => e.includes('not a valid DSL key'))).toBe(true);
      });
    }

    it('rejects multiple invalid with-keys in the same effect', () => {
      const errs = validateEffect({
        verb: VerbType.DEAL,
        objectQualifier: 'HEAT',
        object: NounType.DAMAGE,
        to: NounType.ENEMY,
        with: {
          damageMultiplierIncrement: { verb: 'IS', value: 1 },
          poiseExtra: { verb: 'IS', value: 10 },
          count: { verb: 'IS', value: 4 },
          value: { verb: 'IS', value: 1.5 },
        },
      }, 'test');
      expect(errs.filter(e => e.includes('not a valid DSL key'))).toHaveLength(3);
    });

    it('accepts effect.with without any invalid keys', () => {
      const errs = validateEffect({
        verb: VerbType.DEAL,
        objectQualifier: 'ELECTRIC',
        object: NounType.DAMAGE,
        to: NounType.ENEMY,
        with: {
          value: { verb: 'IS', value: 1.5 },
        },
      }, 'test');
      expect(errs.find(e => e.includes('not a valid DSL key'))).toBeUndefined();
    });
  });
});
