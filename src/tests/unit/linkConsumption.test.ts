/**
 * Link Consumption — Unit Tests
 *
 * Validates that the Link team status is consumed by battle skills and ultimates,
 * but NOT by combo skills, basic attacks, finishers, or dive attacks.
 *
 * Link is a team-wide damage buff that applies to the entire consuming event.
 * When a battle skill or ultimate starts, it checks for active Link and consumes it.
 * The consumption is recorded on the DerivedEventController so the calculation
 * controller can apply the Link multiplier to all frames of the consuming event.
 */
import { TimelineEvent, eventDuration } from '../../consts/viewTypes';
import { EventStatusType, StatusType } from '../../consts/enums';
import { SKILL_COLUMNS } from '../../model/channels';
import { processCombatSimulation, getLastController } from '../../controller/timeline/eventQueueController';
import { COMMON_OWNER_ID } from '../../controller/slot/commonSlotController';

// ── Mock require.context before importing modules that use it ────────────────

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [],
  getConditionalValues: () => [],
  getConditionalScalar: () => null,
  getBaseAttackForLevel: () => 0,
}));

jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// ── Test helpers ─────────────────────────────────────────────────────────────

const SLOT_ID = 'slot1';
const FPS = 120;
let eventIdCounter = 0;

function resetIdCounter() { eventIdCounter = 0; }

/** Create a Link team status as a derived event (simulates what the queue would create from a frame marker). */
function linkStatusEvent(startFrame: number, durationFrames: number): TimelineEvent {
  return {
    uid: `link-${eventIdCounter++}`,
    id: 'team-status',
    name: 'team-status',
    ownerId: COMMON_OWNER_ID,
    columnId: 'team-status',
    startFrame,
    segments: [{ properties: { duration: durationFrames } }],
    sourceOwnerId: SLOT_ID,
    sourceSkillName: 'Test Link Source',
  };
}

/** Create a simple battle skill event. */
function simpleBattleSkill(startFrame: number, duration = 2 * FPS): TimelineEvent {
  return {
    uid: `battle-${eventIdCounter++}`,
    id: 'TEST_BATTLE_SKILL',
    name: 'TEST_BATTLE_SKILL',
    ownerId: SLOT_ID,
    columnId: SKILL_COLUMNS.BATTLE,
    startFrame,
    segments: [{ properties: { duration }, frames: [{ offsetFrame: 0 }] }],
  };
}

/** Create a simple ultimate event with animation + active segments. */
function simpleUltimate(startFrame: number, activeDuration = 3 * FPS): TimelineEvent {
  return {
    uid: `ult-${eventIdCounter++}`,
    id: 'TEST_ULTIMATE',
    name: 'TEST_ULTIMATE',
    ownerId: SLOT_ID,
    columnId: SKILL_COLUMNS.ULTIMATE,
    startFrame,
    segments: [{ properties: { duration: activeDuration }, frames: [{ offsetFrame: 0 }] }],
  };
}

/** Create a basic attack event. */
function simpleBasicAttack(startFrame: number, duration = 1 * FPS): TimelineEvent {
  return {
    uid: `basic-${eventIdCounter++}`,
    id: 'TEST_BASIC_ATTACK',
    name: 'TEST_BASIC_ATTACK',
    ownerId: SLOT_ID,
    columnId: SKILL_COLUMNS.BASIC,
    startFrame,
    segments: [{ properties: { duration }, frames: [{ offsetFrame: 0 }] }],
  };
}

/** Create a combo skill event. */
function simpleComboSkill(startFrame: number, duration = 2 * FPS): TimelineEvent {
  return {
    uid: `combo-${eventIdCounter++}`,
    id: 'TEST_COMBO_SKILL',
    name: 'TEST_COMBO_SKILL',
    ownerId: SLOT_ID,
    columnId: SKILL_COLUMNS.COMBO,
    startFrame,
    segments: [{ properties: { duration }, frames: [{ offsetFrame: 0 }] }],
  };
}

function filterByColumn(events: TimelineEvent[], columnId: string): TimelineEvent[] {
  return events.filter(ev => ev.columnId === columnId);
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => resetIdCounter());

// ═════════════════════════════════════════════════════════════════════════════
// Link consumption by battle skill
// ═════════════════════════════════════════════════════════════════════════════

describe('Link Consumption — Battle Skill', () => {
  test('L1: Battle skill consumes active Link status', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const battle = simpleBattleSkill(2 * FPS);
    const result = processCombatSimulation([link, battle]);
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents.length).toBe(1);
    expect(linkEvents[0].eventStatus).toBe(EventStatusType.CONSUMED);
  });

  test('L2: Battle skill records Link stacks on DEC', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const battle = simpleBattleSkill(2 * FPS);
    processCombatSimulation([link, battle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(battle.uid)).toBe(1);
  });

  test('L3: Multiple Link stacks are recorded correctly', () => {
    const link1 = linkStatusEvent(0, 10 * FPS);
    const link2 = linkStatusEvent(FPS, 10 * FPS);
    const battle = simpleBattleSkill(3 * FPS);
    processCombatSimulation([link1, link2, battle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(battle.uid)).toBe(2);
  });

  test('L4: Link stacks clamped to 4', () => {
    const links = Array.from({ length: 6 }, (_, i) => linkStatusEvent(i * 10, 10 * FPS));
    const battle = simpleBattleSkill(5 * FPS);
    processCombatSimulation([...links, battle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(battle.uid)).toBe(4);
  });

  test('L5: Link clamped at battle skill start frame', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const battle = simpleBattleSkill(2 * FPS);
    const result = processCombatSimulation([link, battle]);
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents.length).toBe(1);
    expect(eventDuration(linkEvents[0])).toBe(2 * FPS);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Link consumption by ultimate
// ═════════════════════════════════════════════════════════════════════════════

describe('Link Consumption — Ultimate', () => {
  test('L6: Ultimate consumes active Link status', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const ult = simpleUltimate(2 * FPS);
    const result = processCombatSimulation([link, ult]);
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents.length).toBe(1);
    expect(linkEvents[0].eventStatus).toBe(EventStatusType.CONSUMED);
  });

  test('L7: Ultimate records Link stacks on DEC', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const ult = simpleUltimate(2 * FPS);
    processCombatSimulation([link, ult]);
    const controller = getLastController();
    expect(controller.getLinkStacks(ult.uid)).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Non-consuming skill types
// ═════════════════════════════════════════════════════════════════════════════

describe('Link NOT consumed by non-qualifying skills', () => {
  test('L8: Basic attack does NOT consume Link', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const basic = simpleBasicAttack(2 * FPS);
    const result = processCombatSimulation([link, basic]);
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents.length).toBe(1);
    expect(linkEvents[0].eventStatus).toBeUndefined();
    const controller = getLastController();
    expect(controller.getLinkStacks(basic.uid)).toBe(0);
  });

  test('L9: Combo skill does NOT consume Link', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const combo = simpleComboSkill(2 * FPS);
    const result = processCombatSimulation([link, combo]);
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents.length).toBe(1);
    expect(linkEvents[0].eventStatus).toBeUndefined();
    const controller = getLastController();
    expect(controller.getLinkStacks(combo.uid)).toBe(0);
  });

  test('L10: Finisher (basic column) does NOT consume Link', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const finisher: TimelineEvent = {
      uid: `finisher-${eventIdCounter++}`,
      id: 'TEST_FINISHER',
      name: 'TEST_FINISHER',
      ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 2 * FPS,
      segments: [{ properties: { duration: FPS }, frames: [{ offsetFrame: 0 }] }],
    };
    const result = processCombatSimulation([link, finisher]);
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents.length).toBe(1);
    expect(linkEvents[0].eventStatus).toBeUndefined();
    const controller = getLastController();
    expect(controller.getLinkStacks(finisher.uid)).toBe(0);
  });

  test('L11: Dive attack (basic column) does NOT consume Link', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const dive: TimelineEvent = {
      uid: `dive-${eventIdCounter++}`,
      id: 'TEST_DIVE',
      name: 'TEST_DIVE',
      ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 2 * FPS,
      segments: [{ properties: { duration: FPS }, frames: [{ offsetFrame: 0 }] }],
    };
    const result = processCombatSimulation([link, dive]);
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents.length).toBe(1);
    expect(linkEvents[0].eventStatus).toBeUndefined();
    const controller = getLastController();
    expect(controller.getLinkStacks(dive.uid)).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('Link Consumption — Edge Cases', () => {
  test('L12: No Link active → battle skill records 0 stacks', () => {
    const battle = simpleBattleSkill(2 * FPS);
    processCombatSimulation([battle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(battle.uid)).toBe(0);
  });

  test('L13: Link that expires before skill start is not consumed', () => {
    const link = linkStatusEvent(0, FPS); // expires at frame 120
    const battle = simpleBattleSkill(2 * FPS); // starts at frame 240
    const result = processCombatSimulation([link, battle]);
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents.length).toBe(1);
    expect(linkEvents[0].eventStatus).toBeUndefined();
    const controller = getLastController();
    expect(controller.getLinkStacks(battle.uid)).toBe(0);
  });

  test('L14: First qualifying skill consumes Link, second does not', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const battle1 = simpleBattleSkill(2 * FPS);
    const battle2 = simpleBattleSkill(4 * FPS);
    processCombatSimulation([link, battle1, battle2]);
    const controller = getLastController();
    expect(controller.getLinkStacks(battle1.uid)).toBe(1);
    expect(controller.getLinkStacks(battle2.uid)).toBe(0);
  });

  test('L15: Link created mid-battle-skill is NOT consumed by that skill', () => {
    // Battle skill starts at frame 0, Link arrives at frame 120 (1s into the skill)
    const battle = simpleBattleSkill(0, 4 * FPS); // 4s duration
    const link = linkStatusEvent(FPS, 10 * FPS); // created 1s after skill starts
    const result = processCombatSimulation([link, battle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(battle.uid)).toBe(0);
    // Link should remain unconsumed
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents.length).toBe(1);
    expect(linkEvents[0].eventStatus).toBeUndefined();
  });

  test('L16: Link created mid-ultimate is NOT consumed by that ultimate', () => {
    const ult = simpleUltimate(0, 5 * FPS); // 5s duration
    const link = linkStatusEvent(2 * FPS, 10 * FPS); // created 2s into ultimate
    const result = processCombatSimulation([link, ult]);
    const controller = getLastController();
    expect(controller.getLinkStacks(ult.uid)).toBe(0);
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents.length).toBe(1);
    expect(linkEvents[0].eventStatus).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Mixed interactions — multiple skill types and operators
// ═════════════════════════════════════════════════════════════════════════════

const SLOT_A = 'op-a';
const SLOT_B = 'op-b';

function battleSkillFor(slotId: string, startFrame: number, duration = 2 * FPS): TimelineEvent {
  return {
    uid: `battle-${slotId}-${eventIdCounter++}`,
    id: 'TEST_BATTLE_SKILL',
    name: 'TEST_BATTLE_SKILL',
    ownerId: slotId,
    columnId: SKILL_COLUMNS.BATTLE,
    startFrame,
    segments: [{ properties: { duration }, frames: [{ offsetFrame: 0 }] }],
  };
}

function ultimateFor(slotId: string, startFrame: number, duration = 3 * FPS): TimelineEvent {
  return {
    uid: `ult-${slotId}-${eventIdCounter++}`,
    id: 'TEST_ULTIMATE',
    name: 'TEST_ULTIMATE',
    ownerId: slotId,
    columnId: SKILL_COLUMNS.ULTIMATE,
    startFrame,
    segments: [{ properties: { duration }, frames: [{ offsetFrame: 0 }] }],
  };
}

function basicAttackFor(slotId: string, startFrame: number, duration = 1 * FPS): TimelineEvent {
  return {
    uid: `basic-${slotId}-${eventIdCounter++}`,
    id: 'TEST_BASIC',
    name: 'TEST_BASIC',
    ownerId: slotId,
    columnId: SKILL_COLUMNS.BASIC,
    startFrame,
    segments: [{ properties: { duration }, frames: [{ offsetFrame: 0 }] }],
  };
}

function comboSkillFor(slotId: string, startFrame: number, duration = 2 * FPS): TimelineEvent {
  return {
    uid: `combo-${slotId}-${eventIdCounter++}`,
    id: 'TEST_COMBO',
    name: 'TEST_COMBO',
    ownerId: slotId,
    columnId: SKILL_COLUMNS.COMBO,
    startFrame,
    segments: [{ properties: { duration }, frames: [{ offsetFrame: 0 }] }],
  };
}

describe('Link Consumption — Mixed Interactions', () => {
  test('M1: Basic attack before battle skill — only battle skill consumes Link', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const basic = simpleBasicAttack(1 * FPS);
    const battle = simpleBattleSkill(3 * FPS);
    processCombatSimulation([link, basic, battle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(basic.uid)).toBe(0);
    expect(controller.getLinkStacks(battle.uid)).toBe(1);
  });

  test('M2: Combo before battle skill — only battle skill consumes Link', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const combo = simpleComboSkill(1 * FPS);
    const battle = simpleBattleSkill(4 * FPS);
    processCombatSimulation([link, combo, battle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(combo.uid)).toBe(0);
    expect(controller.getLinkStacks(battle.uid)).toBe(1);
  });

  test('M3: Basic + combo + battle + ultimate — only the earliest qualifying skill consumes', () => {
    const link = linkStatusEvent(0, 20 * FPS);
    const basic = simpleBasicAttack(1 * FPS);
    const combo = simpleComboSkill(2 * FPS);
    const battle = simpleBattleSkill(4 * FPS);
    const ult = simpleUltimate(8 * FPS);
    processCombatSimulation([link, basic, combo, battle, ult]);
    const controller = getLastController();
    expect(controller.getLinkStacks(basic.uid)).toBe(0);
    expect(controller.getLinkStacks(combo.uid)).toBe(0);
    expect(controller.getLinkStacks(battle.uid)).toBe(1);
    expect(controller.getLinkStacks(ult.uid)).toBe(0); // Link already consumed by battle
  });

  test('M4: Ultimate before battle skill — ultimate consumes, battle skill does not', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const ult = simpleUltimate(2 * FPS);
    const battle = simpleBattleSkill(6 * FPS);
    processCombatSimulation([link, ult, battle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(ult.uid)).toBe(1);
    expect(controller.getLinkStacks(battle.uid)).toBe(0);
  });

  test('M5: Two operators — operator A battle skill consumes, operator B basic + combo do not', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const basicB = basicAttackFor(SLOT_B, 1 * FPS);
    const comboB = comboSkillFor(SLOT_B, 2 * FPS);
    const battleA = battleSkillFor(SLOT_A, 3 * FPS);
    processCombatSimulation([link, basicB, comboB, battleA]);
    const controller = getLastController();
    expect(controller.getLinkStacks(basicB.uid)).toBe(0);
    expect(controller.getLinkStacks(comboB.uid)).toBe(0);
    expect(controller.getLinkStacks(battleA.uid)).toBe(1);
  });

  test('M6: Two operators competing — earlier battle skill wins', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const battleA = battleSkillFor(SLOT_A, 2 * FPS);
    const battleB = battleSkillFor(SLOT_B, 4 * FPS);
    processCombatSimulation([link, battleA, battleB]);
    const controller = getLastController();
    expect(controller.getLinkStacks(battleA.uid)).toBe(1);
    expect(controller.getLinkStacks(battleB.uid)).toBe(0);
  });

  test('M7: Two operators — operator A ultimate and operator B battle skill, ult first consumes', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const ultA = ultimateFor(SLOT_A, 2 * FPS);
    const battleB = battleSkillFor(SLOT_B, 5 * FPS);
    processCombatSimulation([link, ultA, battleB]);
    const controller = getLastController();
    expect(controller.getLinkStacks(ultA.uid)).toBe(1);
    expect(controller.getLinkStacks(battleB.uid)).toBe(0);
  });

  test('M8: Interleaved non-consuming skills do not interfere with Link', () => {
    // basic → combo → basic → battle — Link survives through non-consuming skills
    const link = linkStatusEvent(0, 20 * FPS);
    const basic1 = simpleBasicAttack(1 * FPS);
    const combo1 = simpleComboSkill(3 * FPS);
    const basic2 = simpleBasicAttack(5 * FPS);
    const battle = simpleBattleSkill(8 * FPS);
    const result = processCombatSimulation([link, basic1, combo1, basic2, battle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(basic1.uid)).toBe(0);
    expect(controller.getLinkStacks(combo1.uid)).toBe(0);
    expect(controller.getLinkStacks(basic2.uid)).toBe(0);
    expect(controller.getLinkStacks(battle.uid)).toBe(1);
    // Link should be consumed at battle start (8s)
    const linkEvents = filterByColumn(result, 'team-status');
    expect(linkEvents[0].eventStatus).toBe(EventStatusType.CONSUMED);
    expect(eventDuration(linkEvents[0])).toBe(8 * FPS);
  });

  test('M9: Multiple Link stacks with mixed skills — only battle skill/ultimate consume', () => {
    const link1 = linkStatusEvent(0, 15 * FPS);
    const link2 = linkStatusEvent(FPS, 15 * FPS);
    const basic = simpleBasicAttack(2 * FPS);
    const combo = simpleComboSkill(3 * FPS);
    const battle = simpleBattleSkill(5 * FPS);
    processCombatSimulation([link1, link2, basic, combo, battle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(basic.uid)).toBe(0);
    expect(controller.getLinkStacks(combo.uid)).toBe(0);
    expect(controller.getLinkStacks(battle.uid)).toBe(2);
  });

  test('M10: Two operators simultaneous battle skills at same frame — both see Link', () => {
    const link = linkStatusEvent(0, 10 * FPS);
    const link2 = linkStatusEvent(0, 10 * FPS);
    const battleA = battleSkillFor(SLOT_A, 3 * FPS);
    const battleB = battleSkillFor(SLOT_B, 3 * FPS);
    processCombatSimulation([link, link2, battleA, battleB]);
    const controller = getLastController();
    // Both fire at same frame; first processed consumes both links,
    // second finds none left
    const stacksA = controller.getLinkStacks(battleA.uid);
    const stacksB = controller.getLinkStacks(battleB.uid);
    // One should get the stacks, the other should get 0
    expect(stacksA + stacksB).toBe(2);
    expect([stacksA, stacksB]).toContain(0);
  });
});
