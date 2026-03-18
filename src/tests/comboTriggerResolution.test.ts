/**
 * Combo Trigger Resolution — Integration Tests
 *
 * Tests that combo events' comboTriggerColumnId stays in sync with their
 * containing activation window, even when source events move.
 *
 * ═══ What's tested ═══════════════════════════════════════════════════════════
 *
 * A. resolveComboTriggerColumns (pipeline step)
 *    - Updates comboTriggerColumnId when combo moves to different-element window
 *    - No-op when combo is already in the correct window
 *    - Preserves comboTriggerColumnId when combo is outside all windows
 *    - Handles multiple combo events across different slots
 *
 * B. ComboSkillEventController.resolveComboTriggerColumnId
 *    - Returns window's trigger column for combo in valid window
 *    - Returns existing value for non-combo events
 *    - Returns existing value when processedEvents is null
 *
 * C. Pipeline integration (processInflictionEvents)
 *    - Source event move causes combo's derived inflictions to update element
 *    - Combo outside window produces no derived inflictions
 */
import { TimelineEvent } from '../consts/viewTypes';
import { StatusType } from '../consts/enums';
import { SKILL_COLUMNS, ENEMY_OWNER_ID } from '../model/channels';
import { SubjectType, VerbType, ObjectType, DeterminerType } from '../consts/semantics';
// eslint-disable-next-line import/first
import { TriggerCapability } from '../consts/triggerCapabilities';

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
import { resolveComboTriggerColumns, COMBO_WINDOW_COLUMN_ID } from '../controller/timeline/processComboSkill';
// eslint-disable-next-line import/first
import { ComboSkillEventController } from '../controller/timeline/comboSkillEventController';
// eslint-disable-next-line import/first
import { processInflictionEvents, SlotTriggerWiring } from '../controller/timeline/processInteractions';

// ── Test helpers ─────────────────────────────────────────────────────────────

const FPS = 120;
const SLOT_ANTAL = 'slot-1';
const SLOT_LAEV = 'slot-0';

function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number; ownerId: string }): TimelineEvent {
  return {
    name: '', activationDuration: 0, activeDuration: 0, cooldownDuration: 0,
    ...overrides,
  };
}

/** Minimal trigger capability for Antal: combo requires ANY_OPERATOR APPLY INFLICTION */
function antalCapability(): TriggerCapability {
  return {
    publishesTriggers: {},
    comboRequires: [
      { subjectDeterminer: DeterminerType.ANY, subject: SubjectType.OPERATOR, verb: VerbType.APPLY, object: ObjectType.INFLICTION },
    ],
    comboDescription: 'any infliction',
    comboWindowFrames: 720,
    comboRequiresActiveColumns: [StatusType.FOCUS],
  };
}

/** Minimal trigger capability for Laevatain: battle skill publishes APPLY INFLICTION */
function laevCapability(): TriggerCapability {
  return {
    publishesTriggers: {
      [SKILL_COLUMNS.BATTLE]: [
        { subjectDeterminer: DeterminerType.THIS, subject: SubjectType.OPERATOR, verb: VerbType.APPLY, object: ObjectType.INFLICTION, element: 'HEAT' },
      ],
    },
    comboRequires: [],
    comboDescription: '',
    comboWindowFrames: 720,
  };
}

/** Standard wirings: Laevatain (slot-0) + Antal (slot-1) */
function standardWirings(): SlotTriggerWiring[] {
  return [
    { slotId: SLOT_LAEV, capability: laevCapability() },
    { slotId: SLOT_ANTAL, capability: antalCapability() },
  ];
}

/** Build a Focus status event active for duration frames starting at startFrame */
function makeFocusEvent(startFrame: number, durationFrames: number): TimelineEvent {
  return makeEvent({
    id: `focus-${startFrame}`,
    name: StatusType.FOCUS,
    ownerId: ENEMY_OWNER_ID,
    columnId: StatusType.FOCUS,
    startFrame,
    activationDuration: durationFrames,
  });
}

/** Build a Laevatain battle skill event */
function makeLaevBattle(startFrame: number): TimelineEvent {
  return makeEvent({
    id: `laev-battle-${startFrame}`,
    name: 'FLAMING_CINDERS',
    ownerId: SLOT_LAEV,
    columnId: SKILL_COLUMNS.BATTLE,
    startFrame,
    activationDuration: FPS, // 1s
  });
}

/** Build an Antal combo skill event with a trigger column */
function makeAntalCombo(startFrame: number, comboTriggerColumnId: string): TimelineEvent {
  return makeEvent({
    id: `antal-combo-${startFrame}`,
    name: 'EMP_TEST_SITE',
    ownerId: SLOT_ANTAL,
    columnId: SKILL_COLUMNS.COMBO,
    startFrame,
    activationDuration: Math.round(0.8 * FPS),
    animationDuration: Math.round(0.5 * FPS),
    comboTriggerColumnId,
    segments: [{
      durationFrames: Math.round(0.8 * FPS),
      frames: [{ offsetFrame: Math.round(0.7 * FPS) }],
    }],
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Combo Trigger Resolution', () => {

// ═══════════════════════════════════════════════════════════════════════════════
// Group A: resolveComboTriggerColumns
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. resolveComboTriggerColumns', () => {
  test('A1: Updates comboTriggerColumnId when combo is in a heat window', () => {
    const focus = makeFocusEvent(0, 120 * FPS);
    const laevBattle = makeLaevBattle(100);
    // Combo was placed with wrong trigger column (e.g., stale from previous position)
    const antalCombo = makeAntalCombo(250, 'electricInfliction');
    const events = [focus, laevBattle, antalCombo];

    const result = resolveComboTriggerColumns(events, standardWirings(), []);
    const combo = result.find((e) => e.id === antalCombo.id)!;
    expect(combo.comboTriggerColumnId).toBe('heatInfliction');
  });

  test('A2: No-op when comboTriggerColumnId already matches window', () => {
    const focus = makeFocusEvent(0, 120 * FPS);
    const laevBattle = makeLaevBattle(100);
    const antalCombo = makeAntalCombo(250, 'heatInfliction');
    const events = [focus, laevBattle, antalCombo];

    const result = resolveComboTriggerColumns(events, standardWirings(), []);
    // Should return same array reference (no changes)
    expect(result).toBe(events);
  });

  test('A3: Clears comboTriggerColumnId when combo is outside all windows', () => {
    const focus = makeFocusEvent(0, 120 * FPS);
    const laevBattle = makeLaevBattle(100);
    // Combo at frame 5000, well outside the 720-frame window from frame 220
    const antalCombo = makeAntalCombo(5000, 'heatInfliction');
    const events = [focus, laevBattle, antalCombo];

    const result = resolveComboTriggerColumns(events, standardWirings(), []);
    const combo = result.find((e) => e.id === antalCombo.id)!;
    // No matching window → clear trigger column so no inflictions derive
    expect(combo.comboTriggerColumnId).toBeUndefined();
  });

  test('A4: Non-combo events are not modified', () => {
    const focus = makeFocusEvent(0, 120 * FPS);
    const laevBattle = makeLaevBattle(100);
    const events = [focus, laevBattle];

    const result = resolveComboTriggerColumns(events, standardWirings(), []);
    expect(result).toBe(events);
  });

  test('A5: Empty wirings returns events unchanged', () => {
    const events = [makeFocusEvent(0, 120 * FPS), makeLaevBattle(100)];
    const result = resolveComboTriggerColumns(events, [], []);
    expect(result).toBe(events);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: ComboSkillEventController.resolveComboTriggerColumnId
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. ComboSkillEventController.resolveComboTriggerColumnId', () => {
  function makeWindow(ownerId: string, startFrame: number, durationFrames: number, triggerCol: string): TimelineEvent {
    return makeEvent({
      id: `window-${ownerId}-${startFrame}`,
      name: COMBO_WINDOW_COLUMN_ID,
      ownerId,
      columnId: COMBO_WINDOW_COLUMN_ID,
      startFrame,
      activationDuration: durationFrames,
      comboTriggerColumnId: triggerCol,
      segments: [{ durationFrames }],
    });
  }

  test('B1: Returns window trigger column when combo is inside window', () => {
    const combo = makeAntalCombo(300, 'electricInfliction');
    const window = makeWindow(SLOT_ANTAL, 200, 720, 'heatInfliction');
    const result = ComboSkillEventController.resolveComboTriggerColumnId(combo, 300, [window]);
    expect(result).toBe('heatInfliction');
  });

  test('B2: Returns existing value when combo is outside all windows', () => {
    const combo = makeAntalCombo(5000, 'electricInfliction');
    const window = makeWindow(SLOT_ANTAL, 200, 720, 'heatInfliction');
    const result = ComboSkillEventController.resolveComboTriggerColumnId(combo, 5000, [window]);
    expect(result).toBe('electricInfliction');
  });

  test('B3: Returns existing value for non-combo events', () => {
    const battle = makeEvent({
      id: 'battle-1', ownerId: SLOT_LAEV, columnId: SKILL_COLUMNS.BATTLE,
      startFrame: 100, comboTriggerColumnId: 'heatInfliction',
    });
    const result = ComboSkillEventController.resolveComboTriggerColumnId(battle, 100, []);
    expect(result).toBe('heatInfliction');
  });

  test('B4: Returns existing value when processedEvents is null', () => {
    const combo = makeAntalCombo(300, 'electricInfliction');
    const result = ComboSkillEventController.resolveComboTriggerColumnId(combo, 300, null);
    expect(result).toBe('electricInfliction');
  });

  test('B5: Matches correct window when multiple windows exist', () => {
    const combo = makeAntalCombo(1500, 'electricInfliction');
    const w1 = makeWindow(SLOT_ANTAL, 200, 720, 'heatInfliction');
    const w2 = makeWindow(SLOT_ANTAL, 1400, 720, 'cryoInfliction');
    const result = ComboSkillEventController.resolveComboTriggerColumnId(combo, 1500, [w1, w2]);
    expect(result).toBe('cryoInfliction');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Pipeline integration (processInflictionEvents)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Pipeline integration', () => {
  test('C1: Combo derives correct element infliction after source event moves', () => {
    const focus = makeFocusEvent(0, 120 * FPS);
    // Laev battle at frame 100 → combo window from ~220 (activation end)
    const laevBattle = makeLaevBattle(100);
    // Antal combo within the window, but with stale trigger column
    const antalCombo = makeAntalCombo(250, 'electricInfliction');

    const processed = processInflictionEvents(
      [focus, laevBattle, antalCombo],
      undefined, undefined, standardWirings(),
    );

    // The combo event in processed output should have updated trigger column
    const processedCombo = processed.find((e) => e.id === antalCombo.id);
    expect(processedCombo).toBeDefined();
    expect(processedCombo!.comboTriggerColumnId).toBe('heatInfliction');

    // Should have derived a heat infliction from the combo
    const derivedInflictions = processed.filter(
      (e) => e.id.startsWith(`${antalCombo.id}-combo-inflict`),
    );
    expect(derivedInflictions.length).toBeGreaterThan(0);
    expect(derivedInflictions[0].columnId).toBe('heatInfliction');
  });

  test('C2: Combo window events generated when derived infliction exists with Focus', () => {
    const focus = makeFocusEvent(0, 120 * FPS);
    // Simulate a derived heat infliction event (as if Laev's frame already created it)
    const heatInfliction = makeEvent({
      id: 'heat-inf-1',
      name: 'heatInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame: 220,
      activationDuration: 10 * FPS,
      sourceOwnerId: SLOT_LAEV,
      sourceSkillName: 'FLAMING_CINDERS',
    });

    const processed = processInflictionEvents(
      [focus, heatInfliction],
      undefined, undefined, standardWirings(),
    );

    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ANTAL,
    );
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].comboTriggerColumnId).toBe('heatInfliction');
  });

  test('C3: Source dragged below combo clears derived inflictions', () => {
    const focus = makeFocusEvent(0, 120 * FPS);
    // Source event originally at frame 100, combo was placed in window at frame 250
    // Now source has been dragged to frame 500 (below the combo at 250)
    const laevBattle = makeLaevBattle(500);
    // Combo still at frame 250 with stale trigger column
    const antalCombo = makeAntalCombo(250, 'heatInfliction');

    const processed = processInflictionEvents(
      [focus, laevBattle, antalCombo],
      undefined, undefined, standardWirings(),
    );

    // The combo's trigger column should be cleared (outside all windows)
    const processedCombo = processed.find((e) => e.id === antalCombo.id);
    expect(processedCombo).toBeDefined();
    expect(processedCombo!.comboTriggerColumnId).toBeUndefined();

    // No derived inflictions from the combo (source is no longer before it)
    const derivedInflictions = processed.filter(
      (e) => e.id.startsWith(`${antalCombo.id}-combo-inflict`),
    );
    expect(derivedInflictions.length).toBe(0);
  });

  test('C4: No combo window without Focus active at trigger time', () => {
    // Focus ends before Laev battle trigger
    const focus = makeFocusEvent(0, 50);
    const laevBattle = makeLaevBattle(100);

    const processed = processInflictionEvents(
      [focus, laevBattle],
      undefined, undefined, standardWirings(),
    );

    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ANTAL,
    );
    expect(windows.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Antal + Akekuri cross-operator combo trigger
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Antal battle skill → Focus, Akekuri battle skill → infliction triggers combo window', () => {
  const SLOT_AKEKURI = 'slot-0';
  const ANTAL_SLOT = 'slot-1';

  /** Akekuri: Heat Vanguard, battle skill publishes Heat infliction */
  function akekuriCapability(): TriggerCapability {
    return {
      publishesTriggers: {
        [SKILL_COLUMNS.BASIC]: [
          { subjectDeterminer: DeterminerType.THIS, subject: SubjectType.OPERATOR, verb: VerbType.PERFORM, object: ObjectType.FINAL_STRIKE },
        ],
        [SKILL_COLUMNS.BATTLE]: [
          { subjectDeterminer: DeterminerType.THIS, subject: SubjectType.OPERATOR, verb: VerbType.PERFORM, object: ObjectType.BATTLE_SKILL },
          { subject: SubjectType.ENEMY, verb: VerbType.IS, object: ObjectType.COMBUSTED },
          { subjectDeterminer: DeterminerType.THIS, subject: SubjectType.OPERATOR, verb: VerbType.APPLY, object: ObjectType.INFLICTION, element: 'HEAT' },
        ],
      },
      comboRequires: [
        { subject: SubjectType.ENEMY, verb: VerbType.IS, object: ObjectType.COMBUSTED },
      ],
      comboDescription: 'Enemy is Combusted',
      comboWindowFrames: 720,
    };
  }

  /** Full Antal capability: both Physical Status and Infliction clauses */
  function antalFullCapability(): TriggerCapability {
    return {
      publishesTriggers: {
        [SKILL_COLUMNS.BASIC]: [
          { subjectDeterminer: DeterminerType.THIS, subject: SubjectType.OPERATOR, verb: VerbType.PERFORM, object: ObjectType.FINAL_STRIKE },
        ],
        [SKILL_COLUMNS.BATTLE]: [
          { subjectDeterminer: DeterminerType.THIS, subject: SubjectType.OPERATOR, verb: VerbType.PERFORM, object: ObjectType.BATTLE_SKILL },
          { subject: SubjectType.ENEMY, verb: VerbType.IS, object: ObjectType.ELECTRIFIED },
          { subjectDeterminer: DeterminerType.THIS, subject: SubjectType.OPERATOR, verb: VerbType.APPLY, object: ObjectType.INFLICTION, element: 'ELECTRIC' },
        ],
      },
      comboRequires: [
        { subjectDeterminer: DeterminerType.ANY, subject: SubjectType.OPERATOR, verb: VerbType.APPLY, object: ObjectType.STATUS, objectId: 'PHYSICAL' },
        { subjectDeterminer: DeterminerType.ANY, subject: SubjectType.OPERATOR, verb: VerbType.APPLY, object: ObjectType.INFLICTION },
      ],
      comboDescription: 'Enemy with Focus suffers Physical Status or Arts Infliction',
      comboWindowFrames: 720,
      comboRequiresActiveColumns: ['FOCUS'],
    };
  }

  function akekuriAntalWirings(): SlotTriggerWiring[] {
    return [
      { slotId: SLOT_AKEKURI, capability: akekuriCapability() },
      { slotId: ANTAL_SLOT, capability: antalFullCapability() },
    ];
  }

  test('D1: Akekuri battle skill with Focus active produces Antal combo window', () => {
    // Antal applies Focus at frame 0 (derived from her battle skill — simulated here)
    const focus = makeEvent({
      id: 'antal-focus',
      name: 'Focus',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'FOCUS',
      startFrame: 80, // offset ~0.67s from Antal battle skill at frame 0
      activationDuration: 60 * FPS, // 60s Focus duration
      sourceOwnerId: ANTAL_SLOT,
      sourceSkillName: 'SPECIFIED_RESEARCH_SUBJECT',
    });

    // Akekuri casts battle skill after Antal, causing Heat infliction on enemy
    const heatInfliction = makeEvent({
      id: 'akekuri-heat-inf',
      name: 'heatInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame: 400, // some time after Focus is active
      activationDuration: 10 * FPS,
      sourceOwnerId: SLOT_AKEKURI,
      sourceSkillName: 'BURST_OF_PASSION',
    });

    const processed = processInflictionEvents(
      [focus, heatInfliction],
      undefined, undefined, akekuriAntalWirings(),
    );

    // Antal should have a combo activation window starting at the infliction frame
    const antalWindows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === ANTAL_SLOT,
    );
    expect(antalWindows.length).toBeGreaterThan(0);
    expect(antalWindows[0].startFrame).toBe(400);
  });

  test('D2: No Antal combo window when Focus has expired before infliction', () => {
    // Focus expires before Akekuri's infliction
    const focus = makeEvent({
      id: 'antal-focus',
      name: 'Focus',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'FOCUS',
      startFrame: 80,
      activationDuration: 200, // short Focus — expires at frame 280
      sourceOwnerId: ANTAL_SLOT,
      sourceSkillName: 'SPECIFIED_RESEARCH_SUBJECT',
    });

    const heatInfliction = makeEvent({
      id: 'akekuri-heat-inf',
      name: 'heatInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame: 400, // after Focus expired at 280
      activationDuration: 10 * FPS,
      sourceOwnerId: SLOT_AKEKURI,
      sourceSkillName: 'BURST_OF_PASSION',
    });

    const processed = processInflictionEvents(
      [focus, heatInfliction],
      undefined, undefined, akekuriAntalWirings(),
    );

    const antalWindows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === ANTAL_SLOT,
    );
    expect(antalWindows.length).toBe(0);
  });

  test('D3: No Antal combo window when no Focus at all', () => {
    // Akekuri infliction without any Focus on enemy
    const heatInfliction = makeEvent({
      id: 'akekuri-heat-inf',
      name: 'heatInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame: 400,
      activationDuration: 10 * FPS,
      sourceOwnerId: SLOT_AKEKURI,
      sourceSkillName: 'BURST_OF_PASSION',
    });

    const processed = processInflictionEvents(
      [heatInfliction],
      undefined, undefined, akekuriAntalWirings(),
    );

    const antalWindows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === ANTAL_SLOT,
    );
    expect(antalWindows.length).toBe(0);
  });

  test('D4: Antal combo window duration is 720 frames', () => {
    const focus = makeEvent({
      id: 'antal-focus',
      name: 'Focus',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'FOCUS',
      startFrame: 0,
      activationDuration: 60 * FPS,
      sourceOwnerId: ANTAL_SLOT,
    });

    const heatInfliction = makeEvent({
      id: 'akekuri-heat-inf',
      name: 'heatInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame: 400,
      activationDuration: 10 * FPS,
      sourceOwnerId: SLOT_AKEKURI,
    });

    const processed = processInflictionEvents(
      [focus, heatInfliction],
      undefined, undefined, akekuriAntalWirings(),
    );

    const antalWindows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === ANTAL_SLOT,
    );
    expect(antalWindows.length).toBe(1);
    expect(antalWindows[0].activationDuration).toBe(720);
  });

  test('D5: Antal self-infliction does not trigger her own combo window', () => {
    // Focus is active, but the infliction comes from Antal herself
    const focus = makeEvent({
      id: 'antal-focus',
      name: 'Focus',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'FOCUS',
      startFrame: 0,
      activationDuration: 60 * FPS,
      sourceOwnerId: ANTAL_SLOT,
    });

    const electricInfliction = makeEvent({
      id: 'antal-elec-inf',
      name: 'electricInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'electricInfliction',
      startFrame: 400,
      activationDuration: 10 * FPS,
      sourceOwnerId: ANTAL_SLOT, // Antal's own infliction
      sourceSkillName: 'SPECIFIED_RESEARCH_SUBJECT',
    });

    const processed = processInflictionEvents(
      [focus, electricInfliction],
      undefined, undefined, akekuriAntalWirings(),
    );

    const antalWindows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === ANTAL_SLOT,
    );
    // Self-trigger should be blocked
    expect(antalWindows.length).toBe(0);
  });
});

}); // end Combo Trigger Resolution
