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
 *    - Laevatain: MELTING_FLAME + SCORCHING_HEART_EFFECT (OPERATOR/THIS)
 *    - Wulfgard: WULFGARD_TALENT1_SCORCHING_FANGS (OPERATOR/THIS)
 *    - Yvonne: CRIT_STACKS (OPERATOR/THIS)
 *
 * B. Enemy-targeted statuses do NOT create operator status columns
 *    - Antal: FOCUS / FOCUS_EMPOWERED (ENEMY target)
 *    - Endministrator: ORIGINIUM_CRYSTAL (ENEMY target)
 *
 * C. Talent columns
 *    - Laevatain: SCORCHING_HEART talent (permanent, OPERATOR/THIS)
 *
 * D. matchColumnIds covers both kebab-case and StatusType forms
 */

import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { NounType } from '../../dsl/semantics';
import { buildColumns, Slot } from '../../controller/timeline/columnBuilder';
import { Enemy, MiniTimeline, Operator, VisibleSkills } from '../../consts/viewTypes';

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
    [NounType.BATTLE_SKILL]: true,
    [NounType.COMBO_SKILL]: true,
    [NounType.ULTIMATE]: true,
  } as Record<string, boolean>,
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const findStatusColumn = (columns: ReturnType<typeof buildColumns>, slotId: string) =>
  columns.find(c => c.type === 'mini-timeline' && c.ownerId === slotId && c.columnId === 'operator-status') as MiniTimeline | undefined;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildColumns — operator status columns', () => {
  it('creates status column for Laevatain with MELTING_FLAME and SCORCHING_HEART_EFFECT micro-columns', () => {
    const op = findOperator('LAEVATAIN');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain('MELTING_FLAME');
    expect(microIds).toContain('SCORCHING_HEART_EFFECT');
  });

  it('creates status column for Laevatain with SCORCHING_HEART talent micro-column', () => {
    const op = findOperator('LAEVATAIN');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain('SCORCHING_HEART');
  });

  it('creates status column for Wulfgard with WULFGARD_TALENT1_SCORCHING_FANGS', () => {
    const op = findOperator('WULFGARD');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain('WULFGARD_TALENT1_SCORCHING_FANGS');
  });

  it('creates status column for Yvonne with CRIT_STACKS', () => {
    const op = findOperator('YVONNE');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain('CRIT_STACKS');
  });
});

describe('buildColumns — enemy-targeted statuses excluded from operator status column', () => {
  it('does not include FOCUS in operator status column for Antal (targets ENEMY)', () => {
    const op = findOperator('ANTAL');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    const microIds = statusCol?.microColumns?.map(mc => mc.id) ?? [];
    expect(microIds).not.toContain('FOCUS');
    expect(microIds).not.toContain('FOCUS_EMPOWERED');
  });

  it('does not include ORIGINIUM_CRYSTAL in operator status column for Endministrator (targets ENEMY)', () => {
    const op = findOperator('ENDMINISTRATOR');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    const microIds = statusCol?.microColumns?.map(mc => mc.id) ?? [];
    expect(microIds).not.toContain('ORIGINIUM_CRYSTAL');
  });
});

describe('buildColumns — matchColumnIds includes raw status IDs', () => {
  it('Laevatain status column matchColumnIds includes MELTING_FLAME', () => {
    const op = findOperator('LAEVATAIN');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    expect(statusCol!.matchColumnIds).toContain('MELTING_FLAME');
  });
});
