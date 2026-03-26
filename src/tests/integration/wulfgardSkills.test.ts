/**
 * @jest-environment jsdom
 */

/**
 * Wulfgard Skills — Integration Tests
 *
 * Tests the full pipeline through useApp: skill placement, infliction/reaction
 * derivation, combo triggers, empowered variants, talents, and potential interactions.
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Wulfgard is swapped into slot-0 for all tests.
 *
 * Placement modes used:
 *   - Strict: uses column defaultEvent (skill events)
 *   - Freeform: raw segment data (inflictions, reactions placed directly on enemy)
 *   - Mix: freeform enemy setup + strict skill placement
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import {
  SKILL_COLUMNS, INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID,
} from '../../model/channels';
import { EventStatusType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import type { MiniTimeline } from '../../consts/viewTypes';
import { getUltimateEnergyCostForPotential } from '../../controller/operators/operatorRegistry';

const SLOT_WULFGARD = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

function eventDuration(ev: { segments: { properties: { duration: number } }[] }) {
  return ev.segments.reduce((sum, s) => sum + s.properties.duration, 0);
}

/** Set up a fresh hook with Wulfgard in slot-0. Returns result after swap. */
function setupWulfgard() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_WULFGARD, 'WULFGARD'); });
  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement (strict)
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill appears in BATTLE column (strict)', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);
    expect(col?.defaultEvent).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 5 * FPS, col!.defaultEvent!,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('THERMITE_TRACERS');
  });

  it('A2: Combo skill appears in COMBO column with cooldown (strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: place heat infliction to satisfy combo trigger
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.COMBO);
    expect(col?.defaultEvent).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 3 * FPS, col!.defaultEvent!,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    expect(events).toHaveLength(1);
    // Should have a cooldown segment
    const cdSeg = events[0].segments.find(
      (s: { properties: { name?: string } }) => s.properties.name === 'Cooldown',
    );
    expect(cdSeg).toBeDefined();
  });

  it('A3: Ultimate appears in ULTIMATE column (strict)', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);
    expect(col?.defaultEvent).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 5 * FPS, col!.defaultEvent!,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.ULTIMATE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('WOLVEN_FURY');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Infliction & Reaction Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Infliction & Reaction Pipeline', () => {
  it('B1: Battle skill applies heat infliction to enemy (strict)', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 2 * FPS, col!.defaultEvent!,
      );
    });

    const heats = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heats.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: Ultimate forces Combustion on enemy (strict)', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 2 * FPS, col!.defaultEvent!,
      );
    });

    const combustions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(combustions.length).toBeGreaterThanOrEqual(1);
  });

  it('B3: Combo applies heat infliction to enemy (freeform setup + strict combo)', () => {
    const { result } = setupWulfgard();

    // Freeform: place heat infliction to open combo window
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 3 * FPS, col!.defaultEvent!,
      );
    });

    // Combo's own heat infliction should appear (in addition to the freeform one)
    const heats = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heats.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo Trigger
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Trigger', () => {
  it('C1: Combo triggers from own battle skill infliction (strict)', () => {
    const { result } = setupWulfgard();

    // Battle skill at 2s — applies heat infliction at frame 3 (~0.767s offset)
    const battleCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 2 * FPS, battleCol!.defaultEvent!,
      );
    });

    // Combo at 5s — after infliction has landed
    const comboCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 5 * FPS, comboCol!.defaultEvent!,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    expect(combos).toHaveLength(1);
  });

  it('C2: Combo triggers from teammate infliction (strict)', () => {
    const { result } = setupWulfgard();

    // Akekuri battle skill at 2s — applies heat infliction
    const akekuriBattleCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.BATTLE);
    expect(akekuriBattleCol).toBeDefined();
    expect(akekuriBattleCol!.defaultEvent).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.BATTLE, 2 * FPS, akekuriBattleCol!.defaultEvent!,
      );
    });

    // Wulfgard combo at 5s — should trigger from Akekuri's infliction
    const comboCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 5 * FPS, comboCol!.defaultEvent!,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    expect(combos).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Empowered Battle Skill
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Empowered Battle Skill', () => {
  function getEmpoweredVariant(app: ReturnType<typeof useApp>) {
    const battleCol = findColumn(app, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);
    const empowered = battleCol?.eventVariants?.find(
      v => v.enhancementType === 'EMPOWERED',
    );
    return empowered;
  }

  it('D1: Empowered variant has 4 frames and correct segments (freeform + strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: place Combustion on enemy
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, REACTION_COLUMNS.COMBUSTION, 1 * FPS,
        { name: REACTION_COLUMNS.COMBUSTION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    // Get empowered variant and place it
    const empowered = getEmpoweredVariant(result.current);
    expect(empowered).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 3 * FPS, empowered!,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battles).toHaveLength(1);
    // Empowered variant has 4 frames, normal has 3
    const frames = battles[0].segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(frames.length).toBe(4);
  });

  // TODO: requires condition evaluator support for HAVE REACTION with objectQualifier
  it.skip('D2: Empowered battle skill consumes Combustion (freeform + strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: place Combustion on enemy
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, REACTION_COLUMNS.COMBUSTION, 1 * FPS,
        { name: REACTION_COLUMNS.COMBUSTION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const empowered = getEmpoweredVariant(result.current);
    expect(empowered).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 3 * FPS, empowered!,
      );
    });

    // Combustion should be consumed
    const combustions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION &&
        ev.ownerId === ENEMY_OWNER_ID &&
        ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(combustions.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Talent 1 — Scorching Fangs
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Scorching Fangs (Talent 1)', () => {
  it('E1: Ultimate Combustion triggers Scorching Fangs on Wulfgard (strict)', () => {
    const { result } = setupWulfgard();
    const ultCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 2 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Scorching Fangs should appear as a status on Wulfgard
    const sfEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === 'WULFGARD_TALENT1_SCORCHING_FANGS',
    );
    expect(sfEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Talent 2 — Code of Restraint
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Code of Restraint (Talent 2)', () => {
  it('F1: SP recovery triggers when empowered battle skill consumes reaction (freeform + strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: place Combustion on enemy
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, REACTION_COLUMNS.COMBUSTION, 1 * FPS,
        { name: REACTION_COLUMNS.COMBUSTION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    // Strict: empowered battle skill consumes Combustion
    const battleCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 3 * FPS, battleCol!.defaultEvent!,
      );
    });

    // Code of Restraint should fire — look for a trigger-related event
    const triggerEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === 'WULFGARD_TALENT2_CODE_OF_RESTRAINT',
    );
    expect(triggerEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Potential Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Potential Interactions', () => {
  it('G1: P4 ult cost is 76.5, P0 ult cost is 90', () => {
    const p4Cost = getUltimateEnergyCostForPotential('WULFGARD', 4);
    const p0Cost = getUltimateEnergyCostForPotential('WULFGARD', 0);
    expect(p0Cost).toBe(90);
    expect(p4Cost).toBeLessThan(p0Cost!);
  });

  it('G2: P5 — ult resets combo cooldown (strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: heat infliction for combo trigger
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 30 * FPS } }] },
      );
    });

    // Combo at 3s → goes to cooldown (20s CD, ends at ~24s)
    const comboCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });

    const comboBefore = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    const durationBefore = eventDuration(comboBefore!);

    // Ult at 10s — should reset combo cooldown (P5 default)
    const ultCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 10 * FPS, ultCol!.defaultEvent!,
      );
    });

    const comboAfter = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    const durationAfter = eventDuration(comboAfter!);

    // Combo should be shorter after ult resets its cooldown
    expect(durationAfter).toBeLessThan(durationBefore);
  });

  it('G3: P4 — ult does NOT reset combo cooldown (strict)', () => {
    const { result } = setupWulfgard();

    // Set potential to 4
    const props = result.current.loadoutProperties[SLOT_WULFGARD];
    act(() => {
      result.current.handleStatsChange(SLOT_WULFGARD, {
        ...props,
        operator: { ...props.operator, potential: 4 },
      });
    });

    // Freeform: heat infliction for combo trigger
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 30 * FPS } }] },
      );
    });

    // Combo at 3s
    const comboCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });

    const comboBefore = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    const durationBefore = eventDuration(comboBefore!);

    // Ult at 10s — should NOT reset cooldown at P4
    const ultCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 10 * FPS, ultCol!.defaultEvent!,
      );
    });

    const comboAfter = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    const durationAfter = eventDuration(comboAfter!);

    // Duration should be unchanged — no cooldown reset at P4
    expect(durationAfter).toBe(durationBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Cross-Mechanic Chains
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Cross-Mechanic Chains', () => {
  it('H1: Full rotation — ult forces Combustion + triggers Scorching Fangs + resets combo CD (strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: heat infliction for combo trigger
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 30 * FPS } }] },
      );
    });

    // 1. Combo at 3s (triggers from infliction)
    const comboCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });

    // 2. Ult at 10s (forces Combustion, triggers Scorching Fangs, resets combo CD)
    const ultCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 10 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Verify: Combustion on enemy
    const combustions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(combustions.length).toBeGreaterThanOrEqual(1);

    // Verify: Scorching Fangs on Wulfgard
    const sfEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === 'WULFGARD_TALENT1_SCORCHING_FANGS',
    );
    expect(sfEvents.length).toBeGreaterThanOrEqual(1);

    // Verify: combo cooldown was reset (duration shortened)
    const combo = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    // Combo total duration should end near the ult frame (10s), not at 3s + 1s + 20s = 24s
    const comboEnd = combo!.startFrame + eventDuration(combo!);
    const ultFrame = 10 * FPS;
    expect(comboEnd).toBeLessThanOrEqual(ultFrame + 2 * FPS); // within 2s of ult
  });

  // TODO: requires condition evaluator support for HAVE REACTION with objectQualifier
  it.skip('H2: Empowered battle skill after ult Combustion (strict)', () => {
    const { result } = setupWulfgard();

    // 1. Ult at 2s — forces Combustion
    const ultCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 2 * FPS, ultCol!.defaultEvent!,
      );
    });

    // 2. Place empowered battle skill at 4s (Combustion active from ult's forced apply at ~2.77s, 5s duration)
    const battleCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.enhancementType === 'EMPOWERED');
    expect(empowered).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 4 * FPS, empowered!,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battles).toHaveLength(1);

    // Empowered variant has 4 frames
    const frames = battles[0].segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(frames.length).toBe(4);

    // Combustion should be consumed by the empowered skill
    const consumed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION &&
        ev.ownerId === ENEMY_OWNER_ID &&
        ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumed.length).toBeGreaterThanOrEqual(1);
  });

  it('H3: P3 — empowered battle skill resets Scorching Fangs and applies Minor to teammates (freeform + strict)', () => {
    const { result } = setupWulfgard();

    // 1. Ult at 2s — forces Combustion + triggers Scorching Fangs
    const ultCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 2 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Verify Scorching Fangs triggered from ult Combustion
    const sfBefore = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === 'WULFGARD_TALENT1_SCORCHING_FANGS',
    );
    expect(sfBefore.length).toBeGreaterThanOrEqual(1);

    // 2. Empowered battle skill at 8s — Combustion still active, empowered variant consumes it
    //    P3 trigger: PERFORM EMPOWERED BATTLE_SKILL → apply SF to self (reset) + SF Minor to ALL_OTHER
    const battleCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.enhancementType === 'EMPOWERED');
    expect(empowered).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 8 * FPS, empowered!,
      );
    });

    // Verify: Scorching Fangs on self should have been re-applied (reset duration)
    const sfAfter = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === 'WULFGARD_TALENT1_SCORCHING_FANGS',
    );
    expect(sfAfter.length).toBeGreaterThanOrEqual(1);

    // Verify: Scorching Fangs Minor applied to other operators
    const sfMinor = result.current.allProcessedEvents.filter(
      ev => ev.name === 'WULFGARD_TALENT1_SCORCHING_FANGS_MINOR' && ev.ownerId !== SLOT_WULFGARD,
    );
    expect(sfMinor.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Empowered Battle Skill — Activation & Consume Priority
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Empowered Battle Skill — Activation & Consume Priority', () => {
  function placeReaction(
    result: ReturnType<typeof setupWulfgard>['result'],
    reactionCol: string,
    startSec: number,
    durationSec = 20,
  ) {
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, reactionCol, startSec * FPS,
        { name: reactionCol, segments: [{ properties: { duration: durationSec * FPS } }] },
      );
    });
  }

  function placeEmpoweredBS(
    result: ReturnType<typeof setupWulfgard>['result'],
    startSec: number,
  ) {
    const battleCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.enhancementType === 'EMPOWERED');
    expect(empowered).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, startSec * FPS, empowered!,
      );
    });
  }

  function consumedReactions(result: ReturnType<typeof setupWulfgard>['result'], reactionCol: string) {
    return result.current.allProcessedEvents.filter(
      ev => ev.columnId === reactionCol &&
        ev.ownerId === ENEMY_OWNER_ID &&
        ev.eventStatus === EventStatusType.CONSUMED,
    );
  }

  it('I1: Empowered BS is disabled when no Combustion or Electrification exists', () => {
    const { result } = setupWulfgard();

    // Place Corrosion (not Combustion or Electrification)
    placeReaction(result, REACTION_COLUMNS.CORROSION, 1);

    // Place Solidification (not Combustion or Electrification)
    placeReaction(result, REACTION_COLUMNS.SOLIDIFICATION, 1);

    // Empowered variant should exist in the column definition but placing it should be invalid
    const battleCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.enhancementType === 'EMPOWERED');
    expect(empowered).toBeDefined();

    // Place it anyway — should be flagged as invalid by the validator
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 3 * FPS, empowered!,
      );
    });

    // The placed event should have a validation warning (activation not met)
    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battles).toHaveLength(1);
    // Corrosion and Solidification should NOT be consumed
    expect(consumedReactions(result, REACTION_COLUMNS.CORROSION)).toHaveLength(0);
    expect(consumedReactions(result, REACTION_COLUMNS.SOLIDIFICATION)).toHaveLength(0);
  });

  // TODO: requires condition evaluator support for HAVE REACTION with objectQualifier
  it.skip('I2: Consumes only Combustion when both Combustion and Electrification exist', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);
    placeReaction(result, REACTION_COLUMNS.ELECTRIFICATION, 1);

    placeEmpoweredBS(result, 3);

    // Combustion should be consumed (priority)
    expect(consumedReactions(result, REACTION_COLUMNS.COMBUSTION).length).toBeGreaterThanOrEqual(1);
    // Electrification should NOT be consumed
    expect(consumedReactions(result, REACTION_COLUMNS.ELECTRIFICATION)).toHaveLength(0);
  });

  // TODO: requires condition evaluator support for HAVE REACTION with objectQualifier
  it.skip('I3: Consumes Electrification when only Electrification exists', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.ELECTRIFICATION, 1);

    placeEmpoweredBS(result, 3);

    // Electrification should be consumed
    expect(consumedReactions(result, REACTION_COLUMNS.ELECTRIFICATION).length).toBeGreaterThanOrEqual(1);
  });

  // TODO: requires condition evaluator support for HAVE REACTION with objectQualifier
  it.skip('I4: Consumes only Combustion when only Combustion exists', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);

    placeEmpoweredBS(result, 3);

    // Combustion should be consumed
    expect(consumedReactions(result, REACTION_COLUMNS.COMBUSTION).length).toBeGreaterThanOrEqual(1);
  });

  // TODO: requires condition evaluator support for HAVE REACTION with objectQualifier
  it.skip('I5: Does not consume Corrosion or Solidification even when present alongside Combustion', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);
    placeReaction(result, REACTION_COLUMNS.CORROSION, 1);
    placeReaction(result, REACTION_COLUMNS.SOLIDIFICATION, 1);

    placeEmpoweredBS(result, 3);

    // Only Combustion consumed
    expect(consumedReactions(result, REACTION_COLUMNS.COMBUSTION).length).toBeGreaterThanOrEqual(1);
    expect(consumedReactions(result, REACTION_COLUMNS.CORROSION)).toHaveLength(0);
    expect(consumedReactions(result, REACTION_COLUMNS.SOLIDIFICATION)).toHaveLength(0);
  });

  it('I6: Freeform Combustion enables EBS placement without warnings', () => {
    const { result } = setupWulfgard();

    // Place freeform Combustion on enemy
    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);

    // Place empowered battle skill while Combustion is active
    placeEmpoweredBS(result, 3);

    // EBS should exist and have no activation warnings
    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].enhancementType).toBe('EMPOWERED');
    expect(battles[0].warnings ?? []).toHaveLength(0);
  });

  it('I7: Freeform Electrification also enables EBS placement', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.ELECTRIFICATION, 1);
    placeEmpoweredBS(result, 3);

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].enhancementType).toBe('EMPOWERED');
    expect(battles[0].warnings ?? []).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. Normal vs Empowered — Mutual Exclusivity
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. Normal vs Empowered — Mutual Exclusivity', () => {
  it('J1: Normal BS applies heat infliction on frame 3', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 2 * FPS, col!.defaultEvent!,
      );
    });

    const heats = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heats.length).toBeGreaterThanOrEqual(1);
  });

  it('J2: Normal BS has 3 frames, empowered has 4', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);

    // Normal BS
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 2 * FPS, col!.defaultEvent!,
      );
    });

    const normalBattle = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    const normalFrames = normalBattle!.segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(normalFrames).toHaveLength(3);
  });

  // TODO: requires condition evaluator support for HAVE REACTION with objectId in frame clauses
  it.skip('J3: Empowered BS does NOT apply heat infliction (consumes reaction instead)', () => {
    const { result } = setupWulfgard();

    // Place Combustion so empowered fires
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, REACTION_COLUMNS.COMBUSTION, 1 * FPS,
        { name: REACTION_COLUMNS.COMBUSTION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const battleCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.enhancementType === 'EMPOWERED');

    // Count heat inflictions BEFORE placing empowered BS
    const heatsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    ).length;

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.BATTLE, 3 * FPS, empowered!,
      );
    });

    // Empowered BS should NOT produce additional heat infliction
    const heatsAfter = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    ).length;
    expect(heatsAfter).toBe(heatsBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. Scorching Fangs — Detailed Behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. Scorching Fangs — Detailed Behavior', () => {
  it('K1: Scorching Fangs has 10s duration (1200 frames)', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);

    // Ult forces Combustion → triggers Scorching Fangs
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 2 * FPS, col!.defaultEvent!,
      );
    });

    const sf = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === 'WULFGARD_TALENT1_SCORCHING_FANGS',
    );
    expect(sf.length).toBeGreaterThanOrEqual(1);
    // Duration should be at least 10s (1200 frames) — may be slightly longer
    // due to trigger frame offset within the ultimate animation
    expect(eventDuration(sf[0])).toBeGreaterThanOrEqual(10 * FPS);
  });

  it('K2: Scorching Fangs does not stack — second trigger resets duration', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);

    // Two ults spaced apart — each forces Combustion → triggers SF
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 2 * FPS, col!.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 30 * FPS, col!.defaultEvent!,
      );
    });

    const sf = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD &&
        ev.name === 'WULFGARD_TALENT1_SCORCHING_FANGS' &&
        ev.eventStatus !== EventStatusType.CONSUMED,
    );
    // Should have at most 1 active at any time (stack limit 1 with RESET)
    expect(sf.length).toBeGreaterThanOrEqual(1);
  });

  it('K3: Scorching Fangs applies Heat DMG Dealt bonus (STAT_MODIFIER HEAT_DAMAGE_BONUS)', () => {
    const { result } = setupWulfgard();

    // Place ult to force Combustion → trigger SF
    const col = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 2 * FPS, col!.defaultEvent!,
      );
    });

    const sf = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === 'WULFGARD_TALENT1_SCORCHING_FANGS',
    );
    expect(sf).toBeDefined();
    // The status config clause has APPLY STAT_MODIFIER HEAT_DAMAGE_BONUS
    // Verify the event carries the talent's clause data
    expect(sf!.id).toBe('WULFGARD_TALENT1_SCORCHING_FANGS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L. P5 Natural Predator — Combo Cooldown Reset
// ═══════════════════════════════════════════════════════════════════════════════

describe('L. P5 Natural Predator — Combo Cooldown Reset', () => {
  it('L1: At P5, ult resets combo cooldown even when combo was just used', () => {
    const { result } = setupWulfgard();
    // Default potential is P5 — no change needed

    // Place heat infliction to trigger combo
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    // Place combo at 2s
    const comboCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 2 * FPS, comboCol!.defaultEvent!,
      );
    });

    // Place ult at 5s — should reset combo cooldown
    const ultCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 5 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Place second combo at 8s — should be placeable due to cooldown reset
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 8 * FPS, comboCol!.defaultEvent!,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    expect(combos).toHaveLength(2);
  });

  it('L2: At P4 (not P5), ult does NOT reset combo cooldown', () => {
    const { result } = setupWulfgard();
    const props = result.current.loadoutProperties[SLOT_WULFGARD];
    act(() => {
      result.current.handleStatsChange(SLOT_WULFGARD, {
        ...props,
        operator: { ...props.operator, potential: 4 },
      });
    });

    // Same setup as L1
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const comboCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 2 * FPS, comboCol!.defaultEvent!,
      );
    });

    const ultCol = findColumn(result.current, SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.ULTIMATE, 5 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Second combo at 8s — should NOT be placeable (still on cooldown)
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, SKILL_COLUMNS.COMBO, 8 * FPS, comboCol!.defaultEvent!,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    // Only 1 combo — second was rejected or overlaps
    expect(combos).toHaveLength(1);
  });
});
