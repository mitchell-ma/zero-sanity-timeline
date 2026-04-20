/**
 * Column Builder — Integration Tests
 *
 * Validates that buildColumns produces the correct status/talent columns
 * from real operator JSON data. No mocks — uses the real operatorJsonLoader
 * via babel-plugin-require-context-hook.
 *
 * ═══ What's tested ═══════════════════════════════════════════════════════════
 *
 * A. Operator status columns
 *    - Laevatain: MELTING_FLAME + SCORCHING_HEART (OPERATOR/THIS)
 *    - Wulfgard: SCORCHING_FANGS_T1 (OPERATOR/THIS)
 *    - Yvonne: CRYOBLASTING_PISTOLIER_CRIT_RATE (OPERATOR/THIS)
 *
 * B. Enemy-targeted statuses do NOT create operator status columns
 *    - Antal: FOCUS (ENEMY target)
 *    - Endministrator: REALSPACE_STASIS (ENEMY target)
 *
 * C. Talent columns
 *    - Laevatain: SCORCHING_HEART talent (permanent, OPERATOR/THIS)
 *
 * D. matchColumnIds covers both kebab-case and StatusType forms
 */

import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { NounType, AdjectiveType as DslAdjective, VerbType, isQualifiedId } from '../../dsl/semantics';
import { buildColumns, Slot } from '../../controller/timeline/columnBuilder';
import { Enemy, MiniTimeline, Operator, VisibleSkills } from '../../consts/viewTypes';
import { StatusType } from '../../consts/enums';

/* eslint-disable @typescript-eslint/no-require-imports */
const MF_ID: string = require('../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
const SH_ID: string = require('../../model/game-data/operators/laevatain/statuses/status-scorching-heart.json').properties.id;
const SH_TALENT_ID: string = require('../../model/game-data/operators/laevatain/talents/talent-scorching-heart.json').properties.id;
const SCORCHING_FANGS_ID: string = require('../../model/game-data/operators/wulfgard/talents/talent-scorching-fangs-talent.json').properties.id;
const CRYOBLASTING_PISTOLIER_CRIT_RATE_ID: string = require('../../model/game-data/operators/yvonne/statuses/status-crit-stacks.json').properties.id;
const FOCUS_ID: string = require('../../model/game-data/operators/antal/statuses/status-focus.json').properties.id;
const REALSPACE_STASIS_ID: string = require('../../model/game-data/operators/endministrator/talents/talent-realspace-stasis.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

// ── Test fixtures ───────────────────────────────────────────────────────────

function findOperator(id: string): Operator {
  const op = ALL_OPERATORS.find(o => o.id === id);
  if (!op) throw new Error(`Operator ${id} not found in ALL_OPERATORS`);
  return op;
}

const ENEMY: Enemy = {
  id: 'test-enemy',
  name: 'Test Enemy',
  tier: 'NORMAL',
  statuses: [],
  staggerHp: 10000,
  staggerNodes: 0,
  staggerNodeRecoverySeconds: 5,
  staggerBreakDurationSeconds: 10,
};

const makeSlot = (slotId: string, operator: Operator): Slot => ({
  slotId,
  operator,
});

const allSkillsVisible = (slotId: string): VisibleSkills => ({
  [slotId]: {
    [NounType.BASIC_ATTACK]: true,
    [NounType.BATTLE]: true,
    [NounType.COMBO]: true,
    [NounType.ULTIMATE]: true,
  } as Record<string, boolean>,
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const findStatusColumn = (columns: ReturnType<typeof buildColumns>, slotId: string) =>
  columns.find(c => c.type === 'mini-timeline' && c.ownerEntityId === slotId && c.columnId === 'operator-status') as MiniTimeline | undefined;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildColumns — operator status columns', () => {
  it('creates status column for Laevatain with MELTING_FLAME and SCORCHING_HEART micro-columns', () => {
    const op = findOperator('LAEVATAIN');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain(MF_ID);
    expect(microIds).toContain(SH_ID);
  });

  it('creates status column for Laevatain with SCORCHING_HEART talent micro-column', () => {
    const op = findOperator('LAEVATAIN');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain(SH_TALENT_ID);
  });

  it('creates status column for Wulfgard with SCORCHING_FANGS', () => {
    const op = findOperator('WULFGARD');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain(SCORCHING_FANGS_ID);
  });

  it('creates status column for Yvonne with CRYOBLASTING_PISTOLIER_CRIT_RATE', () => {
    const op = findOperator('YVONNE');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain(CRYOBLASTING_PISTOLIER_CRIT_RATE_ID);
  });
});

describe('buildColumns — enemy-targeted statuses excluded from operator status column', () => {
  it('does not include FOCUS in operator status column for Antal (targets ENEMY)', () => {
    const op = findOperator('ANTAL');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    const microIds = statusCol?.microColumns?.map(mc => mc.id) ?? [];
    expect(microIds).not.toContain(FOCUS_ID);
  });

  it('does not include REALSPACE_STASIS in operator status column for Endministrator (targets ENEMY)', () => {
    const op = findOperator('ENDMINISTRATOR');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    const microIds = statusCol?.microColumns?.map(mc => mc.id) ?? [];
    expect(microIds).not.toContain(REALSPACE_STASIS_ID);
  });
});

describe('buildColumns — matchColumnIds includes raw status IDs', () => {
  it('Laevatain status column matchColumnIds includes MELTING_FLAME', () => {
    const op = findOperator('LAEVATAIN');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    expect(statusCol!.matchColumnIds).toContain(MF_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPLY-clause invariant for freeform-placeable non-skill columns
// ═══════════════════════════════════════════════════════════════════════════
//
// Every freeform-placeable non-skill column's `defaultEvent` must carry an
// APPLY clause at `segments[0].frames[0].clause[0].effects[0].dslEffect`.
// At pipeline runtime, the wrapper's PROCESS_FRAME drives the unified
// `interpret → doApply → applyEvent → runStatusCreationLifecycle` path —
// no fallback branch exists. Runtime-user-edited fields (`susceptibility`
// on qualified-susceptibility / FOCUS wrappers) are threaded onto the
// applied event via `InterpretContext.sourceEvent` inside doApply's
// generic qualified-status path. Any regression that adds a placeable
// column without an APPLY clause will surface here.

type MicroCol = NonNullable<MiniTimeline['microColumns']>[number];

function hasApplyClause(mc: MicroCol): boolean {
  const seg = mc.defaultEvent?.segments?.[0];
  const frame = seg?.frames?.[0];
  const clause = frame?.clause?.[0];
  const effect = clause?.effects?.[0] as { verb?: string } | undefined;
  return effect?.verb === VerbType.APPLY;
}

describe('buildColumns — APPLY-clause invariant on freeform-placeable columns', () => {
  it('every enemy-status micro-column ships an APPLY clause', () => {
    const op = findOperator('YVONNE');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const enemyStatusCol = columns.find(
      (c): c is MiniTimeline => c.type === 'mini-timeline' && c.ownerEntityId === 'enemy' && c.columnId === 'enemy-status',
    );
    expect(enemyStatusCol).toBeDefined();
    const micros = enemyStatusCol!.microColumns ?? [];
    expect(micros.length).toBeGreaterThan(0);

    const violations: { id: string }[] = [];
    for (const mc of micros) {
      if (!hasApplyClause(mc)) violations.push({ id: mc.id });
    }
    expect(violations).toEqual([]);
  });

  it('abstract SUSCEPTIBILITY is not a placeable micro-column (only element-specific variants)', () => {
    const op = findOperator('YVONNE');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const enemyStatusCol = columns.find(
      (c): c is MiniTimeline => c.type === 'mini-timeline' && c.ownerEntityId === 'enemy' && c.columnId === 'enemy-status',
    );
    const microIds = enemyStatusCol?.microColumns?.map(mc => mc.id) ?? [];
    expect(microIds).not.toContain(StatusType.SUSCEPTIBILITY);
    // Element-specific susceptibility IS still placeable
    expect(microIds.some(id => isQualifiedId(id, StatusType.SUSCEPTIBILITY))).toBe(true);
  });

  it('physical-status micro-columns (LIFT, KNOCK_DOWN, CRUSH, BREACH) have APPLY clauses with objectId=PHYSICAL + isForced', () => {
    const op = findOperator('YVONNE');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const enemyStatusCol = columns.find(
      (c): c is MiniTimeline => c.type === 'mini-timeline' && c.ownerEntityId === 'enemy' && c.columnId === 'enemy-status',
    );
    const micros = enemyStatusCol?.microColumns ?? [];
    const physicalIds = ['LIFT', 'KNOCK_DOWN', 'CRUSH', 'BREACH'];
    for (const id of physicalIds) {
      const mc = micros.find(m => m.id === id);
      expect(mc).toBeDefined();
      const effect = mc!.defaultEvent?.segments?.[0]?.frames?.[0]?.clause?.[0]?.effects?.[0] as {
        verb?: string; objectId?: string; objectQualifier?: string; with?: { isForced?: { verb?: string; value?: number } };
      } | undefined;
      expect(effect?.verb).toBe(VerbType.APPLY);
      expect(effect?.objectId).toBe(DslAdjective.PHYSICAL);
      expect(effect?.objectQualifier).toBe(id);
      expect(effect?.with?.isForced?.verb).toBe(VerbType.IS);
      expect(effect?.with?.isForced?.value).toBe(1);
    }
  });
});

