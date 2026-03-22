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
 * C. Pipeline integration (processCombatSimulation)
 *    - Source event move causes combo's derived inflictions to update element
 *    - Combo outside window produces no derived inflictions
 */
import { TimelineEvent, eventDuration } from '../../consts/viewTypes';
import { StatusType, SegmentType, TimeDependency } from '../../consts/enums';
import { SKILL_COLUMNS, INFLICTION_COLUMNS, ENEMY_OWNER_ID, COMBO_WINDOW_COLUMN_ID } from '../../model/channels';
import { resolveComboTriggerColumns } from '../../controller/timeline/processComboSkill';
import { ComboSkillEventController } from '../../controller/timeline/comboSkillEventController';
import { processCombatSimulation } from '../../controller/timeline/eventQueueController';
import { SlotTriggerWiring } from '../../controller/timeline/eventQueueTypes';

function mockGetSkillFromJson(id: string) {
  const map: Record<string, { file: string; skillId: string }> = {
    antal: { file: '../../model/game-data/operator-skills/antal-skills.json', skillId: 'EMP_TEST_SITE' },
    laevatain: { file: '../../model/game-data/operator-skills/laevatain-skills.json', skillId: 'SEETHE' },
    akekuri: { file: '../../model/game-data/operator-skills/akekuri-skills.json', skillId: 'FLASH_AND_DASH' },
  };
  const entry = map[id];
  if (!entry) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(entry.file)[entry.skillId];
}

jest.mock('../../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined, getAllOperatorIds: () => [],
  getFrameSequences: () => [], getSkillIds: () => new Set(), getSkillTypeMap: () => ({}), resolveSkillType: () => null,
  getSegmentLabels: () => undefined, getSkillTimings: () => undefined,
  getUltimateEnergyCost: () => 0, getSkillGaugeGains: () => undefined,
  getBattleSkillSpCost: () => undefined, getSkillCategoryData: () => undefined,
  getBasicAttackDurations: () => undefined,
  getComboTriggerClause: (id: string) => mockGetSkillFromJson(id)?.onTriggerClause,
  getComboTriggerInfo: (id: string) => {
    const skill = mockGetSkillFromJson(id);
    const onTriggerClause = skill?.onTriggerClause;
    if (!onTriggerClause?.length) return undefined;
    return { onTriggerClause, description: skill?.properties?.description ?? '', windowFrames: skill?.properties?.windowFrames ?? 720 };
  },
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

// ── Test helpers ─────────────────────────────────────────────────────────────

const FPS = 120;
const SLOT_ANTAL = 'slot-1';
const SLOT_LAEV = 'slot-0';

function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number; ownerId: string }): TimelineEvent {
  return {
    id: overrides.name ?? '',
    name: '', segments: [{ properties: { duration: 0 } }],
    ...overrides,
  };
}

/** Standard wirings: Laevatain (slot-0) + Antal (slot-1) */
function standardWirings(): SlotTriggerWiring[] {
  return [
    { slotId: SLOT_LAEV, operatorId: 'laevatain' },
    { slotId: SLOT_ANTAL, operatorId: 'antal' },
  ];
}

/** Build a Focus status event active for duration frames starting at startFrame */
function makeFocusEvent(startFrame: number, durationFrames: number): TimelineEvent {
  return makeEvent({
    uid: `focus-${startFrame}`,
    name: StatusType.FOCUS,
    ownerId: ENEMY_OWNER_ID,
    columnId: 'focus',
    startFrame,
    segments: [{ properties: { duration: durationFrames } }],
  });
}

/** Build a Laevatain battle skill event with heat infliction frame data */
function makeLaevBattle(startFrame: number): TimelineEvent {
  return makeEvent({
    uid: `laev-battle-${startFrame}`,
    name: 'FLAMING_CINDERS',
    ownerId: SLOT_LAEV,
    columnId: SKILL_COLUMNS.BATTLE,
    startFrame,
    segments: [{
      properties: { duration: FPS },
      frames: [{
        offsetFrame: Math.round(0.67 * FPS),
        applyArtsInfliction: { element: 'HEAT', stacks: 1 },
      }],
    }],
  });
}

/** Build a heat infliction event on the enemy (derived from Laevatain battle) */
function makeHeatInfliction(startFrame: number): TimelineEvent {
  return makeEvent({
    uid: `heat-infliction-${startFrame}`,
    name: 'heatInfliction',
    ownerId: ENEMY_OWNER_ID,
    columnId: INFLICTION_COLUMNS.HEAT,
    startFrame,
    segments: [{ properties: { duration: 20 * FPS } }],
    sourceOwnerId: SLOT_LAEV,
    sourceSkillName: 'FLAMING_CINDERS',
  });
}

/** Build an Antal combo skill event with a trigger column */
function makeAntalCombo(startFrame: number, comboTriggerColumnId: string): TimelineEvent {
  return makeEvent({
    uid: `antal-combo-${startFrame}`,
    name: 'EMP_TEST_SITE',
    ownerId: SLOT_ANTAL,
    columnId: SKILL_COLUMNS.COMBO,
    startFrame,
    comboTriggerColumnId,
    segments: [
      { properties: { duration: Math.round(0.5 * FPS), timeDependency: TimeDependency.REAL_TIME }, metadata: { segmentType: SegmentType.ANIMATION } },
      {
        properties: { duration: Math.round(0.8 * FPS) },
        frames: [{ offsetFrame: Math.round(0.7 * FPS), duplicatesSourceInfliction: true }],
      },
    ],
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
    const heatInfliction = makeHeatInfliction(150);
    // Combo was placed with wrong trigger column (e.g., stale from previous position)
    const antalCombo = makeAntalCombo(250, 'electricInfliction');
    const events = [focus, laevBattle, heatInfliction, antalCombo];

    const result = resolveComboTriggerColumns(events, standardWirings(), []);
    const combo = result.find((e) => e.uid === antalCombo.uid)!;
    expect(combo.comboTriggerColumnId).toBe('heatInfliction');
  });

  test('A2: No-op when comboTriggerColumnId already matches window', () => {
    const focus = makeFocusEvent(0, 120 * FPS);
    const laevBattle = makeLaevBattle(100);
    const heatInfliction = makeHeatInfliction(150);
    const antalCombo = makeAntalCombo(250, 'heatInfliction');
    const events = [focus, laevBattle, heatInfliction, antalCombo];

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
    const combo = result.find((e) => e.uid === antalCombo.uid)!;
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
      uid: `window-${ownerId}-${startFrame}`,
      name: COMBO_WINDOW_COLUMN_ID,
      ownerId,
      columnId: COMBO_WINDOW_COLUMN_ID,
      startFrame,
      comboTriggerColumnId: triggerCol,
      segments: [{ properties: { duration: durationFrames } }],
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
      uid: 'battle-1', ownerId: SLOT_LAEV, columnId: SKILL_COLUMNS.BATTLE,
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
// Group C: Pipeline integration (processCombatSimulation)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Pipeline integration', () => {
  test('C1: Combo derives correct element infliction after source event moves', () => {
    const focus = makeFocusEvent(0, 120 * FPS);
    // Laev battle at frame 100 → combo window from ~220 (activation end)
    const laevBattle = makeLaevBattle(100);
    // Antal combo within the window, but with stale trigger column
    const antalCombo = makeAntalCombo(250, 'electricInfliction');

    const processed = processCombatSimulation(
      [focus, laevBattle, antalCombo],
      undefined, undefined, standardWirings(),
    );

    // The combo event in processed output should have updated trigger column
    const processedCombo = processed.find((e) => e.uid === antalCombo.uid);
    expect(processedCombo).toBeDefined();
    expect(processedCombo!.comboTriggerColumnId).toBe('heatInfliction');

    // Antal has APPLY SOURCE INFLICTION — should mirror the resolved trigger
    const derivedInflictions = processed.filter(
      (e) => e.uid.startsWith(`${antalCombo.uid}-combo-inflict`),
    );
    expect(derivedInflictions.length).toBe(1);
    expect(derivedInflictions[0].columnId).toBe('heatInfliction');
  });

  test('C2: Combo window events generated when derived infliction exists with Focus', () => {
    const focus = makeFocusEvent(0, 120 * FPS);
    // Simulate a derived heat infliction event (as if Laev's frame already created it)
    const heatInfliction = makeEvent({
      uid: 'heat-inf-1',
      name: 'heatInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame: 220,
      segments: [{ properties: { duration: 10 * FPS } }],
      sourceOwnerId: SLOT_LAEV,
      sourceSkillName: 'FLAMING_CINDERS',
    });

    const processed = processCombatSimulation(
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

    const processed = processCombatSimulation(
      [focus, laevBattle, antalCombo],
      undefined, undefined, standardWirings(),
    );

    // The combo's trigger column should be cleared (outside all windows)
    const processedCombo = processed.find((e) => e.uid === antalCombo.uid);
    expect(processedCombo).toBeDefined();
    expect(processedCombo!.comboTriggerColumnId).toBeUndefined();

    // No derived inflictions from the combo (source is no longer before it)
    const derivedInflictions = processed.filter(
      (e) => e.uid.startsWith(`${antalCombo.uid}-combo-inflict`),
    );
    expect(derivedInflictions.length).toBe(0);
  });

  test('C4: No combo window without Focus active at trigger time', () => {
    // Focus ends before Laev battle trigger
    const focus = makeFocusEvent(0, 50);
    const laevBattle = makeLaevBattle(100);

    const processed = processCombatSimulation(
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

  function akekuriAntalWirings(): SlotTriggerWiring[] {
    return [
      { slotId: SLOT_AKEKURI, operatorId: 'akekuri' },
      { slotId: ANTAL_SLOT, operatorId: 'antal' },
    ];
  }

  test('D1: Akekuri battle skill with Focus active produces Antal combo window', () => {
    // Antal applies Focus at frame 0 (derived from her battle skill — simulated here)
    const focus = makeEvent({
      uid: 'antal-focus',
      name: 'Focus',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'focus',
      startFrame: 80, // offset ~0.67s from Antal battle skill at frame 0
      segments: [{ properties: { duration: 60 * FPS } }], // 60s Focus duration
      sourceOwnerId: ANTAL_SLOT,
      sourceSkillName: 'SPECIFIED_RESEARCH_SUBJECT',
    });

    // Akekuri casts battle skill after Antal, causing Heat infliction on enemy
    const heatInfliction = makeEvent({
      uid: 'akekuri-heat-inf',
      name: 'heatInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame: 400, // some time after Focus is active
      segments: [{ properties: { duration: 10 * FPS } }],
      sourceOwnerId: SLOT_AKEKURI,
      sourceSkillName: 'BURST_OF_PASSION',
    });

    const processed = processCombatSimulation(
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
      uid: 'antal-focus',
      name: 'Focus',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'focus',
      startFrame: 80,
      segments: [{ properties: { duration: 200 } }], // short Focus — expires at frame 280
      sourceOwnerId: ANTAL_SLOT,
      sourceSkillName: 'SPECIFIED_RESEARCH_SUBJECT',
    });

    const heatInfliction = makeEvent({
      uid: 'akekuri-heat-inf',
      name: 'heatInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame: 400, // after Focus expired at 280
      segments: [{ properties: { duration: 10 * FPS } }],
      sourceOwnerId: SLOT_AKEKURI,
      sourceSkillName: 'BURST_OF_PASSION',
    });

    const processed = processCombatSimulation(
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
      uid: 'akekuri-heat-inf',
      name: 'heatInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame: 400,
      segments: [{ properties: { duration: 10 * FPS } }],
      sourceOwnerId: SLOT_AKEKURI,
      sourceSkillName: 'BURST_OF_PASSION',
    });

    const processed = processCombatSimulation(
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
      uid: 'antal-focus',
      name: 'Focus',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'focus',
      startFrame: 0,
      segments: [{ properties: { duration: 60 * FPS } }],
      sourceOwnerId: ANTAL_SLOT,
    });

    const heatInfliction = makeEvent({
      uid: 'akekuri-heat-inf',
      name: 'heatInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame: 400,
      segments: [{ properties: { duration: 10 * FPS } }],
      sourceOwnerId: SLOT_AKEKURI,
    });

    const processed = processCombatSimulation(
      [focus, heatInfliction],
      undefined, undefined, akekuriAntalWirings(),
    );

    const antalWindows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === ANTAL_SLOT,
    );
    expect(antalWindows.length).toBe(1);
    expect(eventDuration(antalWindows[0])).toBe(720);
  });

  test('D5: Antal self-infliction does not trigger her own combo window', () => {
    // Focus is active, but the infliction comes from Antal herself
    const focus = makeEvent({
      uid: 'antal-focus',
      name: 'Focus',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'focus',
      startFrame: 0,
      segments: [{ properties: { duration: 60 * FPS } }],
      sourceOwnerId: ANTAL_SLOT,
    });

    const electricInfliction = makeEvent({
      uid: 'antal-elec-inf',
      name: 'electricInfliction',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'electricInfliction',
      startFrame: 400,
      segments: [{ properties: { duration: 10 * FPS } }],
      sourceOwnerId: ANTAL_SLOT, // Antal's own infliction
      sourceSkillName: 'SPECIFIED_RESEARCH_SUBJECT',
    });

    const processed = processCombatSimulation(
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
