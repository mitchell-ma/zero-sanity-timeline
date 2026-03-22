/**
 * Tests for damage table builder utility functions:
 * - buildDamageTableColumns: INPUT column exclusion
 * - mergeRowsByFrame: row merging for dense display
 * - buildCollapsedColumns: per-operator column collapse
 */

jest.mock('../../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined, getAllOperatorIds: () => [],
  getFrameSequences: () => [], getSkillIds: () => new Set(), getSkillTypeMap: () => ({}), resolveSkillType: () => null,
  getSegmentLabels: () => undefined, getSkillTimings: () => undefined,
  getUltimateEnergyCost: () => 0, getSkillGaugeGains: () => undefined,
  getBattleSkillSpCost: () => undefined, getSkillCategoryData: () => undefined,
  getBasicAttackDurations: () => undefined,
  getComboTriggerClause: () => undefined,
  getExchangeStatusConfig: () => ({}),
  getExchangeStatusIds: () => new Set(),
}));
jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));
jest.mock('../../controller/operators/operatorRegistry', () => ({
  getOperatorConfig: () => undefined,
  ALL_OPERATORS: [],
}));
jest.mock('../../utils/loadoutRegistry', () => ({
  OPERATORS: [], WEAPONS: [], GEARS: [], CONSUMABLES: [], TACTICALS: [],
}));
jest.mock('../../model/game-data/weaponGearEffectLoader', () => ({
  getWeaponEffectDefs: () => [],
  getGearEffectDefs: () => [],
  resolveTargetDisplay: () => 'wielder',
  resolveDurationSeconds: () => 0,
  resolveTriggerInteractions: () => [],
}));
jest.mock('../../consts/gearSetEffects', () => ({
  getGearSetEffects: () => undefined,
}));

// eslint-disable-next-line import/first
import {
  buildDamageTableColumns,
  mergeRowsByFrame,
  buildCollapsedColumns,
  DamageTableRow,
} from '../../controller/calculation/damageTableBuilder';
// eslint-disable-next-line import/first
import { Column, MiniTimeline } from '../../consts/viewTypes';
// eslint-disable-next-line import/first
import { TimelineSourceType } from '../../consts/enums';
// eslint-disable-next-line import/first
import { OPERATOR_COLUMNS } from '../../model/channels';
// eslint-disable-next-line import/first
import { Slot } from '../../controller/timeline/columnBuilder';

function miniTimeline(key: string, ownerId: string, columnId: string, label: string, opts?: { derived?: boolean }): Column {
  return {
    key,
    type: 'mini-timeline',
    source: TimelineSourceType.OPERATOR,
    ownerId,
    columnId,
    label,
    color: '#fff',
    headerVariant: 'skill',
    derived: opts?.derived,
  } as MiniTimeline;
}

function row(key: string, absoluteFrame: number, columnKey: string, ownerId: string, damage: number | null): DamageTableRow {
  return {
    key,
    absoluteFrame,
    label: `test-${key}`,
    columnKey,
    ownerId,
    columnId: 'basic',
    eventUid: `ev-${key}`,
    segmentIndex: 0,
    frameIndex: 0,
    damage,
    multiplier: null,
    segmentLabel: undefined,
    skillName: 'TEST',
    hpRemaining: null,
    params: null,
  };
}

describe('buildDamageTableColumns', () => {
  it('includes operator skill columns', () => {
    const columns = [
      miniTimeline('s1-basic', 'slot1', 'basic', 'BASIC'),
      miniTimeline('s1-battle', 'slot1', 'battle', 'BATTLE'),
    ];
    const result = buildDamageTableColumns(columns);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('BASIC');
    expect(result[1].label).toBe('BATTLE');
  });

  it('excludes DASH columns', () => {
    const columns = [
      miniTimeline('s1-basic', 'slot1', 'basic', 'BASIC'),
      miniTimeline('s1-dash', 'slot1', OPERATOR_COLUMNS.INPUT, 'DASH'),
      miniTimeline('s1-battle', 'slot1', 'battle', 'BATTLE'),
    ];
    const result = buildDamageTableColumns(columns);
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.label === 'DASH')).toBeUndefined();
  });

  it('excludes derived columns', () => {
    const columns = [
      miniTimeline('s1-basic', 'slot1', 'basic', 'BASIC'),
      miniTimeline('s1-status', 'slot1', 'operator-status', 'STATUS', { derived: true }),
    ];
    const result = buildDamageTableColumns(columns);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('BASIC');
  });

  it('excludes non-operator source columns', () => {
    const columns: Column[] = [
      miniTimeline('s1-basic', 'slot1', 'basic', 'BASIC'),
      {
        ...miniTimeline('enemy-stagger', 'enemy', 'stagger', 'STAGGER'),
        source: TimelineSourceType.ENEMY,
      } as MiniTimeline,
    ];
    const result = buildDamageTableColumns(columns);
    expect(result).toHaveLength(1);
  });
});

describe('mergeRowsByFrame', () => {
  it('returns empty array for empty input', () => {
    expect(mergeRowsByFrame([])).toEqual([]);
  });

  it('keeps rows at different frames separate', () => {
    const rows = [
      row('r1', 0, 'col-a', 'slot1', 100),
      row('r2', 120, 'col-b', 'slot1', 200),
      row('r3', 240, 'col-a', 'slot1', 150),
    ];
    const merged = mergeRowsByFrame(rows);
    expect(merged).toHaveLength(3);
    expect(merged[0].cells.size).toBe(1);
    expect(merged[1].cells.size).toBe(1);
    expect(merged[2].cells.size).toBe(1);
  });

  it('merges rows at the same frame into one row', () => {
    const rows = [
      row('r1', 0, 'col-a', 'slot1', 100),
      row('r2', 0, 'col-b', 'slot2', 200),
    ];
    const merged = mergeRowsByFrame(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].cells.size).toBe(2);
    expect(merged[0].cells.get('col-a')?.damage).toBe(100);
    expect(merged[0].cells.get('col-b')?.damage).toBe(200);
  });

  it('sums totalDamage across merged cells', () => {
    const rows = [
      row('r1', 0, 'col-a', 'slot1', 100),
      row('r2', 0, 'col-b', 'slot2', 250),
      row('r3', 0, 'col-c', 'slot1', 50),
    ];
    const merged = mergeRowsByFrame(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].totalDamage).toBe(400);
  });

  it('uses last row hpRemaining for merged row', () => {
    const r1 = row('r1', 0, 'col-a', 'slot1', 100);
    r1.hpRemaining = 900;
    const r2 = row('r2', 0, 'col-b', 'slot2', 200);
    r2.hpRemaining = 700;
    const merged = mergeRowsByFrame([r1, r2]);
    expect(merged[0].hpRemaining).toBe(700);
  });

  it('handles null damage in totalDamage sum', () => {
    const rows = [
      row('r1', 0, 'col-a', 'slot1', null),
      row('r2', 0, 'col-b', 'slot2', 300),
    ];
    const merged = mergeRowsByFrame(rows);
    expect(merged[0].totalDamage).toBe(300);
  });

  it('preserves ordering: different frames interspersed', () => {
    const rows = [
      row('r1', 0, 'col-a', 'slot1', 100),
      row('r2', 0, 'col-b', 'slot2', 200),
      row('r3', 120, 'col-a', 'slot1', 300),
      row('r4', 240, 'col-b', 'slot2', 400),
      row('r5', 240, 'col-a', 'slot1', 500),
    ];
    const merged = mergeRowsByFrame(rows);
    expect(merged).toHaveLength(3);
    expect(merged[0].absoluteFrame).toBe(0);
    expect(merged[0].cells.size).toBe(2);
    expect(merged[1].absoluteFrame).toBe(120);
    expect(merged[1].cells.size).toBe(1);
    expect(merged[2].absoluteFrame).toBe(240);
    expect(merged[2].cells.size).toBe(2);
  });
});

describe('buildCollapsedColumns', () => {
  it('creates one column per operator', () => {
    const tableColumns = [
      { key: 's1-basic', label: 'BASIC', ownerId: 'slot1', columnId: 'basic', color: '#f00' },
      { key: 's1-battle', label: 'BATTLE', ownerId: 'slot1', columnId: 'battle', color: '#f00' },
      { key: 's2-basic', label: 'BASIC', ownerId: 'slot2', columnId: 'basic', color: '#0f0' },
    ];
    const slots = [
      { slotId: 'slot1', operator: { id: 'laevatain', name: 'Laevatain', color: '#f00' } },
      { slotId: 'slot2', operator: { id: 'akekuri', name: 'Akekuri', color: '#0f0' } },
    ] as Slot[];

    const collapsed = buildCollapsedColumns(tableColumns, slots);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].label).toBe('Laevatain');
    expect(collapsed[0].sourceColumnKeys).toEqual(['s1-basic', 's1-battle']);
    expect(collapsed[1].label).toBe('Akekuri');
    expect(collapsed[1].sourceColumnKeys).toEqual(['s2-basic']);
  });

  it('preserves slot order', () => {
    const tableColumns = [
      { key: 's2-basic', label: 'BASIC', ownerId: 'slot2', columnId: 'basic', color: '#0f0' },
      { key: 's1-basic', label: 'BASIC', ownerId: 'slot1', columnId: 'basic', color: '#f00' },
    ];
    const slots = [
      { slotId: 'slot1', operator: { id: 'laevatain', name: 'Laevatain', color: '#f00' } },
      { slotId: 'slot2', operator: { id: 'akekuri', name: 'Akekuri', color: '#0f0' } },
    ] as Slot[];

    const collapsed = buildCollapsedColumns(tableColumns, slots);
    // Column order follows iteration order of tableColumns (slot2 appears first)
    expect(collapsed[0].ownerId).toBe('slot2');
    expect(collapsed[1].ownerId).toBe('slot1');
  });

  it('returns empty for no columns', () => {
    const collapsed = buildCollapsedColumns([], []);
    expect(collapsed).toEqual([]);
  });
});
