/**
 * Pins the single-source-of-truth column resolver. Every layer (interpreter,
 * conditionEvaluator, triggerIndex, triggerMatch) routes column resolution
 * through these two functions — if any layer re-introduces a local copy,
 * this test serves as the comparison point for the canonical behavior.
 */
import {
  resolveColumnId,
  resolveColumnIds,
  ELEMENT_TO_INFLICTION_COLUMN,
  INFLICTION_COLUMN_TO_ELEMENT,
  PHYSICAL_STATUS_VALUES,
} from '../../controller/timeline/columnResolution';
import { NounType, AdjectiveType } from '../../dsl/semantics';
import { PhysicalStatusType, ElementType } from '../../consts/enums';
import {
  INFLICTION_COLUMNS,
  REACTION_COLUMNS,
  PHYSICAL_STATUS_COLUMN_IDS,
} from '../../model/channels';

describe('resolveColumnId (single-column resolution)', () => {
  describe('STATUS object', () => {
    test('STATUS + INFLICTION + element qualifier → element infliction column', () => {
      expect(resolveColumnId(NounType.STATUS, NounType.INFLICTION, ElementType.CRYO))
        .toBe(ELEMENT_TO_INFLICTION_COLUMN[ElementType.CRYO]);
    });

    test('STATUS + INFLICTION without qualifier → undefined', () => {
      expect(resolveColumnId(NounType.STATUS, NounType.INFLICTION, undefined)).toBeUndefined();
    });

    test('STATUS + REACTION + known qualifier → reaction column', () => {
      const anyReactionKey = Object.keys(REACTION_COLUMNS)[0];
      expect(resolveColumnId(NounType.STATUS, NounType.REACTION, anyReactionKey))
        .toBe((REACTION_COLUMNS as Record<string, string>)[anyReactionKey]);
    });

    test('STATUS + REACTION without qualifier → undefined', () => {
      expect(resolveColumnId(NounType.STATUS, NounType.REACTION, undefined)).toBeUndefined();
    });

    test('STATUS + PHYSICAL + known physical status → qualifier itself', () => {
      const phys = PhysicalStatusType.LIFT;
      expect(resolveColumnId(NounType.STATUS, AdjectiveType.PHYSICAL, phys)).toBe(phys);
    });

    test('STATUS + PHYSICAL + unknown qualifier → undefined', () => {
      expect(resolveColumnId(NounType.STATUS, AdjectiveType.PHYSICAL, 'NOT_A_STATUS'))
        .toBeUndefined();
    });

    test('STATUS + arbitrary objectId → objectId passthrough', () => {
      expect(resolveColumnId(NounType.STATUS, 'MY_CUSTOM_STATUS_ID')).toBe('MY_CUSTOM_STATUS_ID');
    });
  });

  describe('fallthrough', () => {
    test('unknown object + objectId → objectId passthrough', () => {
      expect(resolveColumnId('SOMETHING_ELSE', 'fallthrough-id')).toBe('fallthrough-id');
    });

    test('undefined everything → undefined', () => {
      expect(resolveColumnId(undefined, undefined, undefined)).toBeUndefined();
    });
  });
});

describe('resolveColumnIds (multi-column resolution)', () => {
  test('STATUS + INFLICTION + no qualifier → all element infliction columns', () => {
    const cols = resolveColumnIds(NounType.STATUS, NounType.INFLICTION);
    expect(cols.sort()).toEqual(Object.values(INFLICTION_COLUMNS).sort());
  });

  test('STATUS + INFLICTION + ARTS qualifier → all element infliction columns', () => {
    const cols = resolveColumnIds(NounType.STATUS, NounType.INFLICTION, AdjectiveType.ARTS);
    expect(cols.sort()).toEqual(Object.values(INFLICTION_COLUMNS).sort());
  });

  test('STATUS + INFLICTION + element qualifier → single element column', () => {
    const cols = resolveColumnIds(NounType.STATUS, NounType.INFLICTION, ElementType.CRYO);
    expect(cols).toEqual([ELEMENT_TO_INFLICTION_COLUMN[ElementType.CRYO]]);
  });

  test('STATUS + REACTION + no qualifier → all reaction columns', () => {
    const cols = resolveColumnIds(NounType.STATUS, NounType.REACTION);
    expect(cols.sort()).toEqual(Object.values(REACTION_COLUMNS).sort());
  });

  test('STATUS + PHYSICAL + no qualifier → all physical status columns', () => {
    const cols = resolveColumnIds(NounType.STATUS, AdjectiveType.PHYSICAL);
    expect(cols.sort()).toEqual(Array.from(PHYSICAL_STATUS_COLUMN_IDS).sort());
  });

  test('STATUS + PHYSICAL + qualifier → single physical column', () => {
    const cols = resolveColumnIds(NounType.STATUS, AdjectiveType.PHYSICAL, PhysicalStatusType.LIFT);
    expect(cols).toEqual([PhysicalStatusType.LIFT]);
  });

  test('non-STATUS object → empty array', () => {
    expect(resolveColumnIds(NounType.STAT, 'ATK')).toEqual([]);
  });

  test('STATUS + arbitrary objectId → single passthrough column', () => {
    expect(resolveColumnIds(NounType.STATUS, 'CUSTOM_STATUS')).toEqual(['CUSTOM_STATUS']);
  });
});

describe('exported constants', () => {
  test('INFLICTION_COLUMN_TO_ELEMENT is the reverse of ELEMENT_TO_INFLICTION_COLUMN', () => {
    for (const [element, columnId] of Object.entries(ELEMENT_TO_INFLICTION_COLUMN)) {
      expect(INFLICTION_COLUMN_TO_ELEMENT[columnId]).toBe(element);
    }
  });

  test('PHYSICAL_STATUS_VALUES contains every PhysicalStatusType enum value', () => {
    for (const phys of Object.values(PhysicalStatusType)) {
      expect(PHYSICAL_STATUS_VALUES.has(phys)).toBe(true);
    }
  });
});
