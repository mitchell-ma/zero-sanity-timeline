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
 *    - Wulfgard: SCORCHING_FANGS (OPERATOR/THIS)
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

import { ALL_OPERATORS } from '../controller/operators/operatorRegistry';
import { buildColumns, Slot } from '../controller/timeline/columnBuilder';
import { Enemy, MiniTimeline, Operator, VisibleSkills } from '../consts/viewTypes';
import { SKILL_COLUMNS } from '../model/channels';

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
    [SKILL_COLUMNS.BASIC]: true,
    [SKILL_COLUMNS.BATTLE]: true,
    [SKILL_COLUMNS.COMBO]: true,
    [SKILL_COLUMNS.ULTIMATE]: true,
  } as Record<string, boolean>,
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const findStatusColumn = (columns: ReturnType<typeof buildColumns>, slotId: string) =>
  columns.find(c => c.type === 'mini-timeline' && c.ownerId === slotId && c.columnId === 'operator-status') as MiniTimeline | undefined;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildColumns — operator status columns', () => {
  it('creates status column for Laevatain with MELTING_FLAME and SCORCHING_HEART_EFFECT micro-columns', () => {
    const op = findOperator('laevatain');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain('melting-flame');
    expect(microIds).toContain('scorching-heart-effect');
  });

  it('creates status column for Laevatain with SCORCHING_HEART talent micro-column', () => {
    const op = findOperator('laevatain');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain('scorching-heart');
  });

  it('creates status column for Wulfgard with SCORCHING_FANGS', () => {
    const op = findOperator('wulfgard');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain('scorching-fangs');
  });

  it('creates status column for Yvonne with CRIT_STACKS', () => {
    const op = findOperator('yvonne');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    const microIds = statusCol!.microColumns!.map(mc => mc.id);
    expect(microIds).toContain('crit-stacks');
  });
});

describe('buildColumns — enemy-targeted statuses excluded from operator status column', () => {
  it('does not include FOCUS in operator status column for Antal (targets ENEMY)', () => {
    const op = findOperator('antal');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    const microIds = statusCol?.microColumns?.map(mc => mc.id) ?? [];
    expect(microIds).not.toContain('focus');
    expect(microIds).not.toContain('focus-empowered');
  });

  it('does not include ORIGINIUM_CRYSTAL in operator status column for Endministrator (targets ENEMY)', () => {
    const op = findOperator('endministrator');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    const microIds = statusCol?.microColumns?.map(mc => mc.id) ?? [];
    expect(microIds).not.toContain('originium-crystal');
  });
});

describe('buildColumns — matchColumnIds covers both kebab-case and StatusType forms', () => {
  it('Laevatain status column matchColumnIds includes both forms for MELTING_FLAME', () => {
    const op = findOperator('laevatain');
    const slot = makeSlot('slot1', op);
    const columns = buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
    const statusCol = findStatusColumn(columns, 'slot1');
    expect(statusCol).toBeDefined();
    expect(statusCol!.matchColumnIds).toContain('melting-flame');
    expect(statusCol!.matchColumnIds).toContain('MELTING_FLAME');
  });
});
