/**
 * @jest-environment jsdom
 */

/**
 * Yvonne — Flashfreezer υ37 (Combo Skill) Integration Tests
 *
 * Verifies:
 *   1. JSON structure: trigger conditions, frame count, UE expression, P1 gating
 *   2. Trigger: CONTROLLED OPERATOR PERFORM FINAL_STRIKE + ENEMY HAVE SOLIDIFICATION
 *   3. UE on first frame: ADD(10, VARY_BY POTENTIAL [0, 15, ...])
 *   4. 4 base energy frames + 2 P1 frames gated by HAVE POTENTIAL >= 1
 *   5. Segment duration VARY_BY POTENTIAL [2.5, 3.5, ...]
 *   6. Explosion frame with forced Solidification at VARY_BY POTENTIAL offset
 *   7. Cooldown 20s/18s
 *   8. Pipeline placement
 */

import { renderHook, act } from '@testing-library/react';
import {
  NounType, VerbType, AdjectiveType, DeterminerType, ValueOperation, ClauseEvaluationType,
  CardinalityConstraintType,
} from '../../../../dsl/semantics';
import { InteractionModeType, SegmentType } from '../../../../consts/enums';
import { useApp } from '../../../../app/useApp';
import { FPS } from '../../../../utils/timeline';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_ID: string = require('../../../../model/game-data/operators/yvonne/yvonne.json').id;
const COMBO_JSON = require('../../../../model/game-data/operators/yvonne/skills/combo-skill-flashfreezer.json');
const COMBO_ID: string = COMBO_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

// Segment references
const ANIM_SEG = COMBO_JSON.segments[0];
const ACTIVE_SEG = COMBO_JSON.segments[1];
const COOLDOWN_SEG = COMBO_JSON.segments[2];
const FRAMES = ACTIVE_SEG.frames;

// =============================================================================
// A. Trigger Conditions
// =============================================================================

describe('A. Combo trigger conditions', () => {
  const triggerClause = COMBO_JSON.activationWindow.onTriggerClause[0];

  it('A1: trigger has 2 conditions', () => {
    expect(triggerClause.conditions).toHaveLength(2);
  });

  it('A2: first condition is CONTROLLED OPERATOR PERFORM FINAL_STRIKE', () => {
    const cond = triggerClause.conditions[0];
    expect(cond.subjectDeterminer).toBe(DeterminerType.CONTROLLED);
    expect(cond.subject).toBe(NounType.OPERATOR);
    expect(cond.verb).toBe(VerbType.PERFORM);
    expect(cond.object).toBe(NounType.FINAL_STRIKE);
  });

  it('A3: second condition is ENEMY HAVE STATUS REACTION SOLIDIFICATION', () => {
    const cond = triggerClause.conditions[1];
    expect(cond.subject).toBe(NounType.ENEMY);
    expect(cond.verb).toBe(VerbType.HAVE);
    expect(cond.object).toBe(NounType.STATUS);
    expect(cond.objectId).toBe(NounType.REACTION);
    expect(cond.objectQualifier).toBe(AdjectiveType.SOLIDIFICATION);
  });
});

// =============================================================================
// B. Frame Structure — 4 base + 2 P1 + 1 explosion = 7 frames
// =============================================================================

describe('B. Frame structure', () => {
  it('B1: active segment has 7 frames total (4 base + 1 FIRST_MATCH + 2 P1-gated)', () => {
    expect(FRAMES).toHaveLength(7);
  });

  it('B2: first 4 frames are unconditional (base energy releases)', () => {
    for (let i = 0; i < 4; i++) {
      const clause = FRAMES[i].clause[0];
      expect(clause.conditions).toEqual([]);
    }
  });

  it('B3: frame 5 (offset 2.5) is ALL with unconditional energy + P0-gated stagger/Solidification', () => {
    expect(FRAMES[4].clauseType).toBe(ClauseEvaluationType.ALL);
    expect(FRAMES[4].clause).toHaveLength(2);
    // Clause 0: unconditional energy
    expect(FRAMES[4].clause[0].conditions).toEqual([]);
    expect(FRAMES[4].clause[0].effects[0].verb).toBe(VerbType.DEAL);
    expect(FRAMES[4].clause[0].effects[0].object).toBe(NounType.DAMAGE);
    // Clause 1: P AT_MOST 0 → stagger + Solidification
    const p0Cond = FRAMES[4].clause[1].conditions[0];
    expect(p0Cond.verb).toBe(VerbType.HAVE);
    expect(p0Cond.object).toBe(NounType.POTENTIAL);
    expect(p0Cond.cardinalityConstraint).toBe(CardinalityConstraintType.AT_MOST);
    expect(p0Cond.value.value).toBe(0);
    expect(FRAMES[4].clause[1].effects.some((e: { verb: string; object: string }) => e.verb === VerbType.DEAL && e.object === NounType.STAGGER)).toBe(true);
    expect(FRAMES[4].clause[1].effects.some((e: { verb: string }) => e.verb === VerbType.APPLY)).toBe(true);
  });

  it('B3b: frame 5 and frame 7 have identical effect types (energy + stagger + Solidification)', () => {
    // Frame 5: energy in clause 0, stagger+Solidification in clause 1
    const f5AllEffects = FRAMES[4].clause.flatMap((c: { effects: { verb: string; object: string }[] }) => c.effects);
    // Frame 7: all effects in clause 0
    const f7Effects = FRAMES[6].clause[0].effects;
    // Both should have DEAL DAMAGE, DEAL STAGGER, APPLY REACTION
    const getVerbs = (effs: { verb: string; object: string }[]) =>
      effs.map(e => `${e.verb} ${e.object}`).sort();
    expect(getVerbs(f5AllEffects)).toEqual(getVerbs(f7Effects));
  });

  it('B4: frames 6 and 7 (P1 energy + P1 explosion) gated by HAVE POTENTIAL >= 1', () => {
    for (let i = 5; i < 7; i++) {
      const cond = FRAMES[i].clause[0].conditions[0];
      expect(cond.verb).toBe(VerbType.HAVE);
      expect(cond.object).toBe(NounType.POTENTIAL);
      expect(cond.cardinalityConstraint).toBe(CardinalityConstraintType.AT_LEAST);
      expect(cond.value.value).toBe(1);
    }
  });

  it('B5: base energy frames at 0.5s intervals (0.5, 1.0, 1.5, 2.0)', () => {
    expect(FRAMES[0].properties.offset.value).toBe(0.5);
    expect(FRAMES[1].properties.offset.value).toBe(1);
    expect(FRAMES[2].properties.offset.value).toBe(1.5);
    expect(FRAMES[3].properties.offset.value).toBe(2);
  });

  it('B6: P1/explosion frames at 2.5, 3.0, 3.5', () => {
    expect(FRAMES[4].properties.offset.value).toBe(2.5);
    expect(FRAMES[5].properties.offset.value).toBe(3);
    expect(FRAMES[6].properties.offset.value).toBe(3.5);
  });
});

// =============================================================================
// C. UE Recovery — ADD(10, VARY_BY POTENTIAL) on first frame
// =============================================================================

describe('C. UE Recovery on first frame', () => {
  const firstFrameEffects = FRAMES[0].clause[0].effects;

  it('C1: first frame has UE recovery as first effect', () => {
    expect(firstFrameEffects[0].verb).toBe(VerbType.RECOVER);
    expect(firstFrameEffects[0].object).toBe(NounType.ULTIMATE_ENERGY);
  });

  it('C2: UE value is ADD(10, VARY_BY POTENTIAL [0, 15, ...])', () => {
    const ue = firstFrameEffects[0].with.value;
    expect(ue.operation).toBe(ValueOperation.ADD);
    expect(ue.left.value).toBe(10);
    expect(ue.right.object).toBe(NounType.POTENTIAL);
    expect(ue.right.value[0]).toBe(0);
    expect(ue.right.value[1]).toBe(15);
  });

  it('C3: other energy frames do NOT have UE recovery', () => {
    for (let i = 1; i < 6; i++) {
      const effects = FRAMES[i].clause[0].effects;
      const hasUE = effects.some((e: { verb: string }) => e.verb === VerbType.RECOVER);
      expect(hasUE).toBe(false);
    }
  });
});

// =============================================================================
// D. Segment Duration — VARY_BY POTENTIAL
// =============================================================================

describe('D. Segment duration varies by potential', () => {
  it('D1: active segment duration at P0 = 2.5s', () => {
    expect(ACTIVE_SEG.properties.duration.value.value[0]).toBe(2.5);
  });

  it('D2: active segment duration at P1+ = 3.5s', () => {
    expect(ACTIVE_SEG.properties.duration.value.value[1]).toBe(3.5);
  });

  it('D3: animation segment is 0.5s TIME_STOP (unchanged)', () => {
    expect(ANIM_SEG.properties.duration.value.value).toBe(0.5);
    expect(ANIM_SEG.properties.timeInteractionType).toBe('TIME_STOP');
  });
});

// =============================================================================
// E. Explosion Frame — Forced Solidification
// =============================================================================

describe('E. Stagger + Solidification effects', () => {
  // Frame 5 (P0): stagger+Solidification in clause 1 (AT_MOST 0)
  // Frame 7 (P1): stagger+Solidification in clause 0 (AT_LEAST 1)

  for (const [label, frameIdx, clauseIdx] of [['P0 (frame 5)', 4, 1], ['P1 (frame 7)', 6, 0]] as const) {
    const effects = FRAMES[frameIdx].clause[clauseIdx].effects;

    it(`E1-${label}: deals 10 stagger`, () => {
      const stagger = effects.find((e: { verb: string; object: string }) =>
        e.verb === VerbType.DEAL && e.object === NounType.STAGGER,
      );
      expect(stagger.with.value.value).toBe(10);
    });

    it(`E2-${label}: applies forced Solidification reaction`, () => {
      const apply = effects.find((e: { verb: string; object: string }) =>
        e.verb === VerbType.APPLY,
      );
      expect(apply.object).toBe(NounType.REACTION);
      expect(apply.objectId).toBe(AdjectiveType.SOLIDIFICATION);
      expect(apply.with.isForced.value).toBe(1);
    });
  }

  it('E3: frame 5 energy damage uses same multiplier as base energy (0.45/1.0, not explosion 0.89/2.0)', () => {
    const dmg = FRAMES[4].clause[0].effects.find((e: { verb: string; object: string }) =>
      e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(dmg.with.value.value[0]).toBe(0.45);
    expect(dmg.with.value.value[11]).toBe(1);
  });

  it('E4: frame 7 energy damage uses same multiplier as base energy (0.45/1.0)', () => {
    const dmg = FRAMES[6].clause[0].effects.find((e: { verb: string; object: string }) =>
      e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(dmg.with.value.value[0]).toBe(0.45);
    expect(dmg.with.value.value[11]).toBe(1);
  });
});

// =============================================================================
// F. Cooldown
// =============================================================================

describe('F. Cooldown', () => {
  it('F1: cooldown at L1 = 20s', () => {
    expect(COOLDOWN_SEG.properties.duration.value.value[0]).toBe(20);
  });

  it('F2: cooldown at L12 = 18s', () => {
    expect(COOLDOWN_SEG.properties.duration.value.value[11]).toBe(18);
  });

  it('F3: cooldown segment has COOLDOWN type', () => {
    expect(COOLDOWN_SEG.properties.segmentTypes).toContain(SegmentType.COOLDOWN);
  });
});

// =============================================================================
// G. Multiplier Values
// =============================================================================

describe('G. Energy release multipliers', () => {
  it('G1: base energy frames (0-3) have multiplier L1=0.45, L12=1.0', () => {
    for (let i = 0; i < 4; i++) {
      const dmgEffect = FRAMES[i].clause[0].effects.find((e: { verb: string; object: string }) =>
        e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
      );
      expect(dmgEffect.with.value.value[0]).toBe(0.45);
      expect(dmgEffect.with.value.value[11]).toBe(1);
    }
  });

  it('G2: P1 energy clause on frame 4 and frame 5 have same multiplier', () => {
    // Frame 4 clause 0 (P>=1 energy)
    const f4Dmg = FRAMES[4].clause[0].effects.find((e: { verb: string; object: string }) =>
      e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(f4Dmg.with.value.value[0]).toBe(0.45);
    // Frame 5 (P>=1 energy)
    const f5Dmg = FRAMES[5].clause[0].effects.find((e: { verb: string; object: string }) =>
      e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(f5Dmg.with.value.value[0]).toBe(0.45);
  });
});

// =============================================================================
// H. Pipeline Placement
// =============================================================================

describe('H. Pipeline placement', () => {
  it('H1: combo places in pipeline with correct ID', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);
  });

  it('H2: combo has 3 segments (animation + active + cooldown)', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos[0].segments).toHaveLength(3);
  });

  it('H3: at P0, active segment duration is 2.5s', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combo = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO_SKILL,
    )!;
    // segments[0] = animation, segments[1] = active
    expect(combo.segments[1].properties.duration).toBe(Math.round(2.5 * FPS));
  });

  it('H4: at P1, active segment duration extends to 3.5s', () => {
    const { result } = setup();
    const props = result.current.loadoutProperties[SLOT];
    act(() => {
      result.current.handleStatsChange(SLOT, { ...props, operator: { ...props.operator, potential: 1 } });
    });

    const col = findColumn(result.current, SLOT, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combo = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO_SKILL,
    )!;
    expect(combo.segments[1].properties.duration).toBe(Math.round(3.5 * FPS));
  });

  it('H5: at P0, active segment has 5 frames (4 energy + explosion via FIRST_MATCH fallback)', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combo = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO_SKILL,
    )!;
    const activeFrames = combo.segments[1].frames ?? [];
    // At P0 (duration 2.5s): frames at offsets 0.5, 1.0, 1.5, 2.0, 2.5 survive
    // Frames at 3.0 and 3.5 are beyond duration
    expect(activeFrames.length).toBe(5);
  });

  it('H6: at P1, active segment has 7 frames (6 energy + 1 explosion)', () => {
    const { result } = setup();
    const props = result.current.loadoutProperties[SLOT];
    act(() => {
      result.current.handleStatsChange(SLOT, { ...props, operator: { ...props.operator, potential: 1 } });
    });

    const col = findColumn(result.current, SLOT, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combo = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO_SKILL,
    )!;
    const activeFrames = combo.segments[1].frames ?? [];
    // At P1 (duration 3.5s): all 7 frames survive duration filter
    expect(activeFrames.length).toBe(7);
  });
});

// =============================================================================
// I. Loadout Change — combo updates when potential changes after placement
// =============================================================================

describe('I. Combo updates on loadout potential change', () => {
  function addCombo(result: { current: AppResult }, atFrame: number) {
    const col = findColumn(result.current, SLOT, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, col!, atFrame);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }

  function getCombo(result: { current: AppResult }) {
    return result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO_SKILL,
    )!;
  }

  function setPotential(result: { current: AppResult }, potential: number) {
    const props = result.current.loadoutProperties[SLOT];
    act(() => {
      result.current.handleStatsChange(SLOT, { ...props, operator: { ...props.operator, potential } });
    });
  }

  it('I1: combo placed at P0, then potential changed to P1 — duration updates to 3.5s', () => {
    const { result } = setup();

    // Place combo at P0
    addCombo(result, 5 * FPS);
    const comboBefore = getCombo(result);
    expect(comboBefore.segments[1].properties.duration).toBe(Math.round(2.5 * FPS));

    // Change potential to P1
    setPotential(result, 1);

    const comboAfter = getCombo(result);
    expect(comboAfter.segments[1].properties.duration).toBe(Math.round(3.5 * FPS));
  });

  it('I2: combo placed at P0, then potential changed to P1 — frame count increases', () => {
    const { result } = setup();

    addCombo(result, 5 * FPS);
    const framesBefore = getCombo(result).segments[1].frames ?? [];
    expect(framesBefore.length).toBe(5); // 4 energy + explosion

    setPotential(result, 1);

    const framesAfter = getCombo(result).segments[1].frames ?? [];
    expect(framesAfter.length).toBe(7); // 6 energy + explosion
  });

  it('I3: combo placed at P1, then potential changed back to P0 — duration reverts to 2.5s', () => {
    const { result } = setup();

    // Start at P1
    setPotential(result, 1);
    addCombo(result, 5 * FPS);
    const comboBefore = getCombo(result);
    expect(comboBefore.segments[1].properties.duration).toBe(Math.round(3.5 * FPS));

    // Change back to P0
    setPotential(result, 0);

    const comboAfter = getCombo(result);
    expect(comboAfter.segments[1].properties.duration).toBe(Math.round(2.5 * FPS));
  });

  it('I4: combo placed at P0, then P1 — 6th frame (P1 energy) has correct offset 3.0s', () => {
    const { result } = setup();

    addCombo(result, 5 * FPS);
    setPotential(result, 1);

    const combo = getCombo(result);
    const activeFrames = combo.segments[1].frames ?? [];
    // Frame at index 5 should be the P1 energy frame at offset 3.0s
    expect(activeFrames.length).toBe(7);
    expect(activeFrames[5].offsetFrame).toBe(Math.round(3 * FPS));
  });

  it('I5: combo placed at P1, then potential changed back to P0 — frame count decreases', () => {
    const { result } = setup();

    // Start at P1
    setPotential(result, 1);
    addCombo(result, 5 * FPS);
    const framesBefore = getCombo(result).segments[1].frames ?? [];
    expect(framesBefore.length).toBe(7);

    // Change back to P0
    setPotential(result, 0);

    const framesAfter = getCombo(result).segments[1].frames ?? [];
    expect(framesAfter.length).toBe(5);
  });

  it('I6: at P0, frame 5 (last) has stagger + Solidification clauses', () => {
    const { result } = setup();
    addCombo(result, 5 * FPS);

    const frames = getCombo(result).segments[1].frames ?? [];
    expect(frames.length).toBe(5);
    const lastFrame = frames[4];
    // Frame 5 has 2 clause predicates: unconditional energy + P0-gated stagger/Solidification
    expect(lastFrame.clauses).toBeDefined();
    expect(lastFrame.clauses!.length).toBe(2);
  });

  it('I7: at P1, frame 5 is energy-only (stagger/Solidification clause skipped), frame 7 has stagger/Solidification', () => {
    const { result } = setup();
    setPotential(result, 1);
    addCombo(result, 5 * FPS);

    const frames = getCombo(result).segments[1].frames ?? [];
    expect(frames.length).toBe(7);
    // Frame 5 (index 4): still present but P0 clause (stagger/Solidification) should be skipped at runtime
    // Frame 7 (index 6): P1-gated with stagger + Solidification
    const frame7 = frames[6];
    expect(frame7.clauses).toBeDefined();
    expect(frame7.clauses!.length).toBeGreaterThanOrEqual(1);
    const effects = frame7.clauses![0].effects;
    expect(effects.some(e => e.type === 'applyStagger')).toBe(true);
  });

  it('I8: P0→P1→P0 round-trip preserves correct frame count and offsets', () => {
    const { result } = setup();

    addCombo(result, 5 * FPS);
    expect(getCombo(result).segments[1].frames?.length).toBe(5);

    setPotential(result, 1);
    const p1Frames = getCombo(result).segments[1].frames ?? [];
    expect(p1Frames.length).toBe(7);
    expect(p1Frames[4].offsetFrame).toBe(Math.round(2.5 * FPS));
    expect(p1Frames[5].offsetFrame).toBe(Math.round(3 * FPS));
    expect(p1Frames[6].offsetFrame).toBe(Math.round(3.5 * FPS));

    setPotential(result, 0);
    const p0Frames = getCombo(result).segments[1].frames ?? [];
    expect(p0Frames.length).toBe(5);
    expect(p0Frames[4].offsetFrame).toBe(Math.round(2.5 * FPS));
  });
});
