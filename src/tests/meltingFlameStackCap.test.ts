/**
 * Tests for Melting Flame exchange status stack cap (max 4).
 *
 * Exchange statuses (Melting Flame, Thunderlance) use a hard cap:
 * when all slots are occupied, new stacks are silently dropped.
 * Stacks only free up when explicitly consumed (e.g. empowered battle skill).
 *
 * Tests cover:
 * A. applyAbsorptions hard cap
 *    - 4 absorptions → 4 MF events (at cap)
 *    - 5th absorption at cap → silently dropped
 *    - Inflictions survive when absorption is dropped at cap
 *    - After consumeStatus frees slots, new absorptions succeed
 *    - Multi-stack absorption respects remaining slots
 *    - Different operators have independent caps
 *
 * B. effectExecutor APPLY STATUS hard cap
 *    - Covered in effectExecutor.test.ts
 */

jest.mock('../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined, getAllOperatorIds: () => [],
  getFrameSequences: () => [], getSkillIds: () => new Set(), getSkillTypeMap: () => ({}), resolveSkillType: () => null,
  getSegmentLabels: () => undefined, getSkillTimings: () => undefined,
  getUltimateEnergyCost: () => 0, getSkillGaugeGains: () => undefined,
  getBattleSkillSpCost: () => undefined, getSkillCategoryData: () => undefined,
  getBasicAttackDurations: () => undefined,
}));
jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// eslint-disable-next-line import/first
import { applyAbsorptions, EXCHANGE_STATUS_COLUMN, EXCHANGE_EVENT_DURATION } from '../controller/timeline/processInfliction';
// eslint-disable-next-line import/first
import { EXCHANGE_STATUS_MAX_SLOTS } from '../model/channels';
// eslint-disable-next-line import/first
import { TimelineEvent, EventSegmentData } from '../consts/viewTypes';
// eslint-disable-next-line import/first
import { INFLICTION_COLUMNS, ENEMY_OWNER_ID, OPERATOR_COLUMNS } from '../model/channels';

const FPS = 120;
const SLOT_ID = 'slot-laevatain';
const MF_COLUMN = OPERATOR_COLUMNS.MELTING_FLAME;
const HEAT_COLUMN = INFLICTION_COLUMNS.HEAT;

/** Create an enemy Heat infliction event. */
function heatInfliction(id: string, startFrame: number, durationFrames = 20 * FPS): TimelineEvent {
  return {
    id,
    name: HEAT_COLUMN,
    ownerId: ENEMY_OWNER_ID,
    columnId: HEAT_COLUMN,
    startFrame,
    activationDuration: durationFrames,
    activeDuration: 0,
    cooldownDuration: 0,
    sourceOwnerId: SLOT_ID,
  };
}

/**
 * Create an operator skill event with an absorption marker on its first frame.
 * Simulates a Final Strike that absorbs 1 Heat infliction → MELTING_FLAME.
 */
function absorptionSkillEvent(id: string, startFrame: number, stacks = 1): TimelineEvent {
  const segment: EventSegmentData = {
    durationFrames: 60,
    frames: [{
      offsetFrame: 0,
      absorbArtsInfliction: {
        element: 'HEAT',
        stacks,
        exchangeStatus: 'MELTING_FLAME',
        ratio: '1:1',
      },
    }],
  };
  return {
    id,
    name: 'FINAL_STRIKE',
    ownerId: SLOT_ID,
    columnId: 'basicAttack',
    startFrame,
    activationDuration: 60,
    activeDuration: 0,
    cooldownDuration: 0,
    segments: [segment],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. applyAbsorptions — exchange status hard cap (silent drop)
// ═══════════════════════════════════════════════════════════════════════════════

describe('applyAbsorptions — Melting Flame exchange status hard cap', () => {

  test('4 absorptions with 4 inflictions → exactly 4 MF events', () => {
    const events: TimelineEvent[] = [
      heatInfliction('h1', 0),
      heatInfliction('h2', FPS),
      heatInfliction('h3', 2 * FPS),
      heatInfliction('h4', 3 * FPS),
      absorptionSkillEvent('abs1', 10),
      absorptionSkillEvent('abs2', FPS + 10),
      absorptionSkillEvent('abs3', 2 * FPS + 10),
      absorptionSkillEvent('abs4', 3 * FPS + 10),
    ];
    const result = applyAbsorptions(events, []);
    const mfEvents = result.filter(ev => ev.columnId === MF_COLUMN);
    expect(mfEvents).toHaveLength(4);
  });

  test('5th absorption at cap is silently dropped — no 5th MF event', () => {
    const events: TimelineEvent[] = [
      heatInfliction('h1', 0),
      heatInfliction('h2', FPS),
      heatInfliction('h3', 2 * FPS),
      heatInfliction('h4', 3 * FPS),
      heatInfliction('h5', 4 * FPS),
      absorptionSkillEvent('abs1', 10),
      absorptionSkillEvent('abs2', FPS + 10),
      absorptionSkillEvent('abs3', 2 * FPS + 10),
      absorptionSkillEvent('abs4', 3 * FPS + 10),
      absorptionSkillEvent('abs5', 4 * FPS + 10),
    ];
    const result = applyAbsorptions(events, []);
    const mfEvents = result.filter(ev => ev.columnId === MF_COLUMN);
    expect(mfEvents).toHaveLength(4);
  });

  test('5th absorption does not consume the infliction', () => {
    const events: TimelineEvent[] = [
      heatInfliction('h1', 0),
      heatInfliction('h2', FPS),
      heatInfliction('h3', 2 * FPS),
      heatInfliction('h4', 3 * FPS),
      heatInfliction('h5', 4 * FPS),
      absorptionSkillEvent('abs1', 10),
      absorptionSkillEvent('abs2', FPS + 10),
      absorptionSkillEvent('abs3', 2 * FPS + 10),
      absorptionSkillEvent('abs4', 3 * FPS + 10),
      absorptionSkillEvent('abs5', 4 * FPS + 10),
    ];
    const result = applyAbsorptions(events, []);
    const h5 = result.find(ev => ev.id === 'h5')!;
    expect(h5).toBeDefined();
    expect(h5.activationDuration).toBe(20 * FPS);
  });

  test('6th and 7th absorptions at cap are all dropped', () => {
    const events: TimelineEvent[] = [
      ...Array.from({ length: 7 }, (_, i) => heatInfliction(`h${i + 1}`, i * FPS)),
      ...Array.from({ length: 7 }, (_, i) => absorptionSkillEvent(`abs${i + 1}`, i * FPS + 10)),
    ];
    const result = applyAbsorptions(events, []);
    const mfEvents = result.filter(ev => ev.columnId === MF_COLUMN);
    expect(mfEvents).toHaveLength(4);
    // h5, h6, h7 inflictions survive unclamped
    for (let i = 5; i <= 7; i++) {
      const h = result.find(ev => ev.id === `h${i}`)!;
      expect(h.activationDuration).toBe(20 * FPS);
    }
  });

  test('MF events have indefinite duration (EXCHANGE_EVENT_DURATION)', () => {
    const events: TimelineEvent[] = [
      heatInfliction('h1', 0),
      absorptionSkillEvent('abs1', 10),
    ];
    const result = applyAbsorptions(events, []);
    const mfEvents = result.filter(ev => ev.columnId === MF_COLUMN);
    expect(mfEvents).toHaveLength(1);
    expect(mfEvents[0].activationDuration).toBe(EXCHANGE_EVENT_DURATION);
  });

  test('consumeStatus frees exchange slots for subsequent absorptions', () => {
    function consumeSkillEvent(id: string, startFrame: number): TimelineEvent {
      const segment: EventSegmentData = {
        durationFrames: 120,
        frames: [{
          offsetFrame: 0,
          consumeStatus: 'MELTING_FLAME',
        }],
      };
      return {
        id,
        name: 'SMOULDERING_FIRE',
        ownerId: SLOT_ID,
        columnId: 'battleSkill',
        startFrame,
        activationDuration: 120,
        activeDuration: 0,
        cooldownDuration: 0,
        segments: [segment],
      };
    }

    const events: TimelineEvent[] = [
      ...Array.from({ length: 6 }, (_, i) => heatInfliction(`h${i + 1}`, i * FPS)),
      ...Array.from({ length: 4 }, (_, i) => absorptionSkillEvent(`abs${i + 1}`, i * FPS + 10)),
      consumeSkillEvent('consume1', 5 * FPS),
      absorptionSkillEvent('abs5', 5 * FPS + 60),
      absorptionSkillEvent('abs6', 5 * FPS + FPS + 10),
    ];
    const result = applyAbsorptions(events, []);
    const mfEvents = result.filter(ev => ev.columnId === MF_COLUMN);
    // 4 from first batch + 2 after consume = 6
    expect(mfEvents).toHaveLength(6);
  });

  test('multi-stack absorption respects remaining slots', () => {
    const events: TimelineEvent[] = [
      heatInfliction('h1', 0),
      heatInfliction('h2', FPS),
      heatInfliction('h3', 2 * FPS),
      heatInfliction('h4', 3 * FPS),
      heatInfliction('h5', 4 * FPS),
      heatInfliction('h6', 5 * FPS),
      absorptionSkillEvent('abs1', 10),
      absorptionSkillEvent('abs2', FPS + 10),
      // Third absorption tries to take 3 at once — only 2 slots left
      absorptionSkillEvent('abs3', 5 * FPS + 10, 3),
    ];
    const result = applyAbsorptions(events, []);
    const mfEvents = result.filter(ev => ev.columnId === MF_COLUMN);
    // 2 from individual absorptions + 2 from the multi-stack (clamped to available) = 4
    expect(mfEvents).toHaveLength(4);
  });

  test('absorbed inflictions are clamped, unabsorbed inflictions are not', () => {
    const events: TimelineEvent[] = [
      heatInfliction('h1', 0),
      heatInfliction('h2', FPS),
      absorptionSkillEvent('abs1', 10),
    ];
    const result = applyAbsorptions(events, []);
    const h1 = result.find(ev => ev.id === 'h1')!;
    expect(h1.activationDuration).toBe(10);
    const h2 = result.find(ev => ev.id === 'h2')!;
    expect(h2.activationDuration).toBe(20 * FPS);
  });

  test('different operators have independent exchange status caps', () => {
    const SLOT_B = 'slot-antal';

    function absorptionForSlot(id: string, slotId: string, startFrame: number): TimelineEvent {
      const segment: EventSegmentData = {
        durationFrames: 60,
        frames: [{
          offsetFrame: 0,
          absorbArtsInfliction: {
            element: 'HEAT',
            stacks: 1,
            exchangeStatus: 'MELTING_FLAME',
            ratio: '1:1',
          },
        }],
      };
      return {
        id,
        name: 'FINAL_STRIKE',
        ownerId: slotId,
        columnId: 'basicAttack',
        startFrame,
        activationDuration: 60,
        activeDuration: 0,
        cooldownDuration: 0,
        segments: [segment],
      };
    }

    const events: TimelineEvent[] = [
      ...Array.from({ length: 9 }, (_, i) => heatInfliction(`h${i + 1}`, i * FPS)),
      // Slot A absorbs 4 (fills cap), 5th dropped
      ...Array.from({ length: 5 }, (_, i) => absorptionForSlot(`absA${i + 1}`, SLOT_ID, i * FPS + 10)),
      // Slot B absorbs 4 (independent cap)
      ...Array.from({ length: 4 }, (_, i) => absorptionForSlot(`absB${i + 1}`, SLOT_B, (i + 5) * FPS + 20)),
    ];
    const result = applyAbsorptions(events, []);
    const mfA = result.filter(ev => ev.columnId === MF_COLUMN && ev.ownerId === SLOT_ID);
    const mfB = result.filter(ev => ev.columnId === MF_COLUMN && ev.ownerId === SLOT_B);
    expect(mfA).toHaveLength(4);
    expect(mfB).toHaveLength(4);
  });

  test('EXCHANGE_STATUS_MAX_SLOTS constants are correct', () => {
    expect(EXCHANGE_STATUS_MAX_SLOTS.MELTING_FLAME).toBe(4);
    expect(EXCHANGE_STATUS_MAX_SLOTS.THUNDERLANCE).toBe(4);
  });

  test('EXCHANGE_STATUS_COLUMN maps to correct column IDs', () => {
    expect(EXCHANGE_STATUS_COLUMN.MELTING_FLAME).toBe('melting-flame');
    expect(EXCHANGE_STATUS_COLUMN.THUNDERLANCE).toBe('thunderlance');
  });
});
