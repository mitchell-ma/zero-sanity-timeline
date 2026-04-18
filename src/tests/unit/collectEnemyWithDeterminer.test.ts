/**
 * `collectEnemyWithDeterminer` — config-level validator that flags any
 * reference to `ENEMY` that carries a determiner. ENEMY is a singleton in
 * the DSL: there is no `THIS` vs `OTHER` enemy, so a stray determiner
 * signals a misreading of the DSL grammar. Called from operator skill
 * and status validators to surface these loudly.
 */

import { collectEnemyWithDeterminer } from '../../model/game-data/validationUtils';
import { NounType, DeterminerType } from '../../dsl/semantics';

describe('collectEnemyWithDeterminer', () => {
  it('flags nested `of: { object: ENEMY, determiner: THIS }` in a ValueStatus', () => {
    const node = {
      verb: 'IS',
      object: NounType.STATUS_LEVEL,
      of: {
        object: NounType.STATUS,
        objectId: 'ELECTRIFICATION',
        of: { object: NounType.ENEMY, determiner: DeterminerType.THIS },
      },
    };
    const errors = collectEnemyWithDeterminer(node, 'root');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]).toMatch(/ENEMY has no determiner in the DSL/);
  });

  it('flags subject=ENEMY with subjectDeterminer', () => {
    const cond = {
      subject: NounType.ENEMY,
      subjectDeterminer: DeterminerType.THIS,
      verb: 'HAVE',
      object: NounType.STATUS,
    };
    const errors = collectEnemyWithDeterminer(cond, 'condition');
    expect(errors.some((e) => /subject=ENEMY has no subjectDeterminer/.test(e))).toBe(true);
  });

  it('flags to=ENEMY with toDeterminer', () => {
    const effect = {
      verb: 'DEAL',
      object: NounType.DAMAGE,
      to: NounType.ENEMY,
      toDeterminer: DeterminerType.THIS,
    };
    const errors = collectEnemyWithDeterminer(effect, 'effect');
    expect(errors.some((e) => /to=ENEMY has no toDeterminer/.test(e))).toBe(true);
  });

  it('flags from=ENEMY with fromDeterminer', () => {
    const effect = {
      verb: 'CONSUME',
      object: NounType.STATUS,
      from: NounType.ENEMY,
      fromDeterminer: DeterminerType.THIS,
    };
    const errors = collectEnemyWithDeterminer(effect, 'effect');
    expect(errors.some((e) => /from=ENEMY has no fromDeterminer/.test(e))).toBe(true);
  });

  it('passes cleanly for `{ object: ENEMY }` without a determiner', () => {
    const node = {
      verb: 'IS',
      object: NounType.STATUS_LEVEL,
      of: {
        object: NounType.STATUS,
        objectId: 'ELECTRIFICATION',
        of: { object: NounType.ENEMY },
      },
    };
    expect(collectEnemyWithDeterminer(node, 'root')).toEqual([]);
  });

  it('passes cleanly for effects routed to ENEMY without toDeterminer', () => {
    const effect = {
      verb: 'DEAL',
      object: NounType.DAMAGE,
      objectQualifier: 'ELECTRIC',
      to: NounType.ENEMY,
    };
    expect(collectEnemyWithDeterminer(effect, 'effect')).toEqual([]);
  });

  it('leaves non-ENEMY determiners alone (e.g. `THIS OPERATOR`)', () => {
    const node = {
      verb: 'IS',
      object: NounType.STACKS,
      of: {
        object: NounType.STATUS,
        objectId: 'SUNDERBLADE',
        of: { object: NounType.OPERATOR, determiner: DeterminerType.THIS },
      },
    };
    expect(collectEnemyWithDeterminer(node, 'root')).toEqual([]);
  });

  it('walks arrays and nested objects, reporting every occurrence with its path', () => {
    const tree = {
      effects: [
        { subject: NounType.ENEMY, subjectDeterminer: DeterminerType.THIS },
        {
          verb: 'DEAL',
          with: {
            value: {
              operation: 'ADD',
              left: { of: { object: NounType.ENEMY, determiner: DeterminerType.THIS } },
              right: { of: { object: NounType.OPERATOR, determiner: DeterminerType.THIS } },
            },
          },
        },
      ],
    };
    const errors = collectEnemyWithDeterminer(tree, 'root');
    expect(errors).toHaveLength(2);
    // Paths should make it clear where each violation lives.
    expect(errors.some((e) => e.startsWith('root.effects[0]'))).toBe(true);
    expect(errors.some((e) => e.includes('root.effects[1].with.value.left'))).toBe(true);
  });
});
