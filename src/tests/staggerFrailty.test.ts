/**
 * Stagger Frailty Tests
 *
 * Validates that:
 * 1. StaggerTimeline correctly detects node crossings and generates frailty events
 * 2. EventsQueryService.isStaggered() returns true during both full stagger breaks
 *    AND node stagger frailty windows
 * 3. The 1.3× stagger multiplier is applied during node stagger frailty
 * 4. CommonSlotController.syncStaggerEvents() configures, syncs, and generates
 *    frailty events in a single call
 */
import { Subtimeline } from '../controller/timeline/subtimeline';
import { StaggerTimeline } from '../controller/timeline/staggerTimeline';
import { DerivedEventController } from '../controller/timeline/derivedEventController';
import { EventsQueryService } from '../controller/timeline/eventsQueryService';
import { StaggerController } from '../controller/slot/staggerController';
import { NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, ENEMY_OWNER_ID, SKILL_COLUMNS } from '../model/channels';
import { StatType, SegmentType, TimeDependency } from '../consts/enums';
import { getStaggerMultiplier } from '../model/calculation/damageFormulas';
import { FPS } from '../utils/timeline';
import { TimelineEvent, eventDuration } from '../consts/viewTypes';

// ── Mock operatorRegistry ────────────────────────────────────────────────────
jest.mock('../controller/operators/operatorRegistry', () => ({
  getOperatorConfig: () => undefined,
  ALL_OPERATORS: [],
}));

// ── Mock loadoutRegistry ─────────────────────────────────────────────────────
jest.mock('../utils/loadoutRegistry', () => ({
  WEAPON_REGISTRY: [],
  GEAR_REGISTRY: [],
  CONSUMABLE_REGISTRY: [],
  TACTICAL_REGISTRY: [],
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const STAGGER_COLUMN = 'stagger';

function makeStaggerTimeline(nodeCount: number, maxHp = 60, breakDurationSec = 5) {
  const sub = new Subtimeline(ENEMY_OWNER_ID, STAGGER_COLUMN);
  const stagger = new StaggerTimeline(sub);
  stagger.updateConfig({ max: maxHp });
  stagger.setNodeCount(nodeCount);
  stagger.setBreakDuration(Math.round(breakDurationSec * FPS));
  return { sub, stagger };
}

/** Add a stagger damage event to the subtimeline. activationDuration = damage value. */
function addStaggerDamage(sub: Subtimeline, frame: number, damage: number) {
  sub.addEvent({
    name: 'stagger-hit',
    startFrame: frame,
    activationDuration: damage,
    activeDuration: 0,
    cooldownDuration: 0,
  });
}

function buildQueryService(frailtyEvents: ReturnType<StaggerTimeline['generateFrailtyEvents']>, breaks: ReturnType<StaggerTimeline['getBreaks']>) {
  const ctrl = new DerivedEventController();
  ctrl.registerEvents(frailtyEvents);
  return new EventsQueryService(ctrl, breaks);
}

// ═════════════════════════════════════════════════════════════════════════════
// Group A: StaggerTimeline node crossing detection
// ═════════════════════════════════════════════════════════════════════════════

describe('A. StaggerTimeline node crossing detection', () => {
  test('A1: Single node at midpoint is crossed when meter passes threshold', () => {
    const { sub, stagger } = makeStaggerTimeline(1, 60);
    // Threshold at 30 (60 / 2)
    addStaggerDamage(sub, 100, 35); // 0 → 35, crosses 30
    const crossings = stagger.getNodeCrossings();
    expect(crossings).toHaveLength(1);
    expect(crossings[0].frame).toBe(100);
    expect(crossings[0].nodeIndex).toBe(1);
  });

  test('A2: Multiple nodes are crossed independently', () => {
    const { sub, stagger } = makeStaggerTimeline(3, 80);
    // Thresholds at 20, 40, 60
    addStaggerDamage(sub, 100, 25); // 0 → 25, crosses 20
    addStaggerDamage(sub, 200, 20); // 25 → 45, crosses 40
    addStaggerDamage(sub, 300, 20); // 45 → 65, crosses 60
    const crossings = stagger.getNodeCrossings();
    expect(crossings).toHaveLength(3);
    expect(crossings[0]).toEqual({ frame: 100, nodeIndex: 1 });
    expect(crossings[1]).toEqual({ frame: 200, nodeIndex: 2 });
    expect(crossings[2]).toEqual({ frame: 300, nodeIndex: 3 });
  });

  test('A3: Single large hit crosses multiple nodes at once', () => {
    const { sub, stagger } = makeStaggerTimeline(2, 60);
    // Thresholds at 20, 40
    addStaggerDamage(sub, 100, 50); // 0 → 50, crosses 20 and 40
    const crossings = stagger.getNodeCrossings();
    expect(crossings).toHaveLength(2);
    expect(crossings[0]).toEqual({ frame: 100, nodeIndex: 1 });
    expect(crossings[1]).toEqual({ frame: 100, nodeIndex: 2 });
  });

  test('A4: No crossings when damage stays below first threshold', () => {
    const { sub, stagger } = makeStaggerTimeline(1, 60);
    // Threshold at 30
    addStaggerDamage(sub, 100, 10); // 0 → 10
    addStaggerDamage(sub, 200, 10); // 10 → 20
    expect(stagger.getNodeCrossings()).toHaveLength(0);
  });

  test('A5: Node crossings reset after full stagger break', () => {
    const { sub, stagger } = makeStaggerTimeline(1, 60, 5);
    // Threshold at 30
    addStaggerDamage(sub, 100, 35);  // 0 → 35, crosses node
    addStaggerDamage(sub, 200, 30);  // 35 → 60 = max → break starts at 200, ends at 200 + 5*120 = 800
    // After break: meter is back at 0, crossedNodes reset
    addStaggerDamage(sub, 900, 35);  // 0 → 35, crosses node again
    const crossings = stagger.getNodeCrossings();
    expect(crossings).toHaveLength(2);
    expect(crossings[0].frame).toBe(100);
    expect(crossings[1].frame).toBe(900);
  });

  test('A6: Zero nodes produces no crossings', () => {
    const { sub, stagger } = makeStaggerTimeline(0, 60);
    addStaggerDamage(sub, 100, 50);
    expect(stagger.getNodeCrossings()).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group B: Frailty event generation
// ═════════════════════════════════════════════════════════════════════════════

describe('B. Frailty event generation', () => {
  const NODE_RECOVERY_FRAMES = Math.round(5 * FPS); // 5 seconds

  test('B1: Node crossing generates a frailty event with correct duration and column', () => {
    const { sub, stagger } = makeStaggerTimeline(1, 60);
    addStaggerDamage(sub, 100, 35);
    const events = stagger.generateFrailtyEvents(
      NODE_RECOVERY_FRAMES, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, ENEMY_OWNER_ID, 'test',
    );
    const nodeEvents = events.filter(e => e.columnId === NODE_STAGGER_COLUMN_ID);
    expect(nodeEvents).toHaveLength(1);
    expect(nodeEvents[0].startFrame).toBe(100);
    expect(eventDuration(nodeEvents[0])).toBe(NODE_RECOVERY_FRAMES);
    expect(nodeEvents[0].ownerId).toBe(ENEMY_OWNER_ID);
  });

  test('B2: Full stagger break generates a frailty event with break duration', () => {
    const { sub, stagger } = makeStaggerTimeline(0, 60, 5);
    addStaggerDamage(sub, 100, 60); // hits max
    const events = stagger.generateFrailtyEvents(
      NODE_RECOVERY_FRAMES, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, ENEMY_OWNER_ID, 'test',
    );
    const fullEvents = events.filter(e => e.columnId === FULL_STAGGER_COLUMN_ID);
    expect(fullEvents).toHaveLength(1);
    expect(fullEvents[0].startFrame).toBe(100);
    expect(eventDuration(fullEvents[0])).toBe(Math.round(5 * FPS));
  });

  test('B3: Both node and full stagger events are generated together', () => {
    const { sub, stagger } = makeStaggerTimeline(1, 60, 5);
    addStaggerDamage(sub, 100, 60); // crosses node at 30, then hits max at 60
    const events = stagger.generateFrailtyEvents(
      NODE_RECOVERY_FRAMES, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, ENEMY_OWNER_ID, 'test',
    );
    expect(events.filter(e => e.columnId === NODE_STAGGER_COLUMN_ID)).toHaveLength(1);
    expect(events.filter(e => e.columnId === FULL_STAGGER_COLUMN_ID)).toHaveLength(1);
  });

  test('B4: Event IDs are stable for override persistence', () => {
    const { sub, stagger } = makeStaggerTimeline(1, 60);
    addStaggerDamage(sub, 200, 40);
    const events = stagger.generateFrailtyEvents(
      NODE_RECOVERY_FRAMES, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, ENEMY_OWNER_ID, 'stagger-frailty',
    );
    expect(events[0].id).toBe('stagger-frailty-node-1-200');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group C: EventsQueryService.isStaggered() — node stagger frailty
// ═════════════════════════════════════════════════════════════════════════════

describe('C. EventsQueryService.isStaggered() includes node stagger', () => {
  test('C1: isStaggered returns true during full stagger break', () => {
    const breaks = [{ startFrame: 100, endFrame: 700 }];
    const query = buildQueryService([], breaks);
    expect(query.isStaggered(100)).toBe(true);
    expect(query.isStaggered(400)).toBe(true);
    expect(query.isStaggered(699)).toBe(true);
    expect(query.isStaggered(700)).toBe(false);
  });

  test('C2: isStaggered returns true during node stagger frailty window', () => {
    const nodeEvent = {
      id: 'node-1',
      name: 'Node Stagger',
      ownerId: ENEMY_OWNER_ID,
      columnId: NODE_STAGGER_COLUMN_ID,
      startFrame: 200,
      segments: [{ properties: { duration: 600 } }], // 5 seconds at 120fps
    };
    const query = buildQueryService([nodeEvent], []);
    expect(query.isStaggered(200)).toBe(true);
    expect(query.isStaggered(500)).toBe(true);
    expect(query.isStaggered(799)).toBe(true);
    expect(query.isStaggered(800)).toBe(false);
  });

  test('C3: isStaggered returns false when no stagger is active', () => {
    const query = buildQueryService([], []);
    expect(query.isStaggered(0)).toBe(false);
    expect(query.isStaggered(500)).toBe(false);
  });

  test('C4: isStaggered returns false before node stagger starts', () => {
    const nodeEvent = {
      id: 'node-1',
      name: 'Node Stagger',
      ownerId: ENEMY_OWNER_ID,
      columnId: NODE_STAGGER_COLUMN_ID,
      startFrame: 300,
      segments: [{ properties: { duration: 600 } }],
    };
    const query = buildQueryService([nodeEvent], []);
    expect(query.isStaggered(0)).toBe(false);
    expect(query.isStaggered(299)).toBe(false);
    expect(query.isStaggered(300)).toBe(true);
  });

  test('C5: Both node stagger and full stagger active at same frame', () => {
    const nodeEvent = {
      id: 'node-1',
      name: 'Node Stagger',
      ownerId: ENEMY_OWNER_ID,
      columnId: NODE_STAGGER_COLUMN_ID,
      startFrame: 100,
      segments: [{ properties: { duration: 600 } }],
    };
    const breaks = [{ startFrame: 200, endFrame: 800 }];
    const query = buildQueryService([nodeEvent], breaks);
    // Both active at frame 300
    expect(query.isStaggered(300)).toBe(true);
    // Only node stagger at frame 150
    expect(query.isStaggered(150)).toBe(true);
    // Only full stagger at frame 750
    expect(query.isStaggered(750)).toBe(true);
    // Neither active at frame 900
    expect(query.isStaggered(900)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group D: Stagger multiplier integration
// ═════════════════════════════════════════════════════════════════════════════

describe('D. Stagger frailty multiplier', () => {
  test('D1: Stagger multiplier is 1.3 during node stagger', () => {
    const nodeEvent = {
      id: 'node-1',
      name: 'Node Stagger',
      ownerId: ENEMY_OWNER_ID,
      columnId: NODE_STAGGER_COLUMN_ID,
      startFrame: 100,
      segments: [{ properties: { duration: 600 } }],
    };
    const query = buildQueryService([nodeEvent], []);
    const isStaggered = query.isStaggered(300);
    expect(getStaggerMultiplier(isStaggered)).toBe(1.3);
  });

  test('D2: Stagger multiplier is 1.0 outside frailty window', () => {
    const nodeEvent = {
      id: 'node-1',
      name: 'Node Stagger',
      ownerId: ENEMY_OWNER_ID,
      columnId: NODE_STAGGER_COLUMN_ID,
      startFrame: 100,
      segments: [{ properties: { duration: 600 } }],
    };
    const query = buildQueryService([nodeEvent], []);
    const isStaggered = query.isStaggered(800);
    expect(getStaggerMultiplier(isStaggered)).toBe(1.0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group E: End-to-end — stagger damage → node crossing → frailty → isStaggered
// ═════════════════════════════════════════════════════════════════════════════

describe('E. End-to-end stagger frailty flow', () => {
  test('E1: Stagger damage crossing a node produces frailty that isStaggered detects', () => {
    const { sub, stagger } = makeStaggerTimeline(1, 60, 5);
    const nodeRecoveryFrames = Math.round(5 * FPS);

    // Deal 35 stagger at frame 240 — crosses node threshold at 30
    addStaggerDamage(sub, 240, 35);

    const frailtyEvents = stagger.generateFrailtyEvents(
      nodeRecoveryFrames, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, ENEMY_OWNER_ID, 'e2e',
    );
    const breaks = stagger.getBreaks();

    const query = buildQueryService(frailtyEvents, breaks);

    // Before the hit: not staggered
    expect(query.isStaggered(239)).toBe(false);
    // During node frailty window: staggered
    expect(query.isStaggered(240)).toBe(true);
    expect(query.isStaggered(240 + nodeRecoveryFrames - 1)).toBe(true);
    // After frailty expires: not staggered
    expect(query.isStaggered(240 + nodeRecoveryFrames)).toBe(false);
  });

  test('E2: Full stagger break detected via isStaggered after meter hits max', () => {
    const breakDurationSec = 5;
    const { sub, stagger } = makeStaggerTimeline(0, 60, breakDurationSec);

    addStaggerDamage(sub, 300, 60); // hits max

    const frailtyEvents = stagger.generateFrailtyEvents(
      0, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, ENEMY_OWNER_ID, 'e2e',
    );
    const breaks = stagger.getBreaks();

    const query = buildQueryService(frailtyEvents, breaks);

    expect(query.isStaggered(299)).toBe(false);
    expect(query.isStaggered(300)).toBe(true);
    expect(query.isStaggered(300 + Math.round(breakDurationSec * FPS) - 1)).toBe(true);
    expect(query.isStaggered(300 + Math.round(breakDurationSec * FPS))).toBe(false);
  });

  test('E3: Multiple node crossings each produce their own frailty window', () => {
    const { sub, stagger } = makeStaggerTimeline(2, 90, 5);
    const nodeRecoveryFrames = Math.round(3 * FPS); // 3 second recovery
    // Thresholds at 30, 60

    addStaggerDamage(sub, 100, 35);   // 0 → 35, crosses 30
    addStaggerDamage(sub, 1000, 30);  // 35 → 65, crosses 60

    const frailtyEvents = stagger.generateFrailtyEvents(
      nodeRecoveryFrames, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, ENEMY_OWNER_ID, 'e2e',
    );
    const breaks = stagger.getBreaks();
    const query = buildQueryService(frailtyEvents, breaks);

    // First node frailty window
    expect(query.isStaggered(100)).toBe(true);
    expect(query.isStaggered(100 + nodeRecoveryFrames - 1)).toBe(true);
    expect(query.isStaggered(100 + nodeRecoveryFrames)).toBe(false);

    // Gap between frailty windows
    expect(query.isStaggered(500)).toBe(false);

    // Second node frailty window
    expect(query.isStaggered(1000)).toBe(true);
    expect(query.isStaggered(1000 + nodeRecoveryFrames - 1)).toBe(true);
    expect(query.isStaggered(1000 + nodeRecoveryFrames)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group F: CommonSlotController.syncStaggerEvents integration
// ═════════════════════════════════════════════════════════════════════════════

describe('F. StaggerController.sync', () => {
  function makeEnemyStats(staggerHp: number, nodes: number, nodeRecoverySec: number, breakRecoverySec = 5) {
    return {
      staggerNodes: nodes,
      staggerNodeRecoverySeconds: nodeRecoverySec,
      staggerStartValue: 0,
      [StatType.STAGGER_HP]: staggerHp,
      [StatType.STAGGER_RECOVERY]: breakRecoverySec,
    };
  }

  /** Create a minimal processed event with a single stagger frame. */
  function makeStaggerEvent(id: string, ownerId: string, startFrame: number, staggerValue: number): TimelineEvent {
    return {
      id,
      name: 'test-skill',
      ownerId,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame,
            segments: [{
        properties: { duration: 120 },
        frames: [{
          offsetFrame: 0,
          stagger: staggerValue,
        }],
      }],
    };
  }

  test('F1: sync configures max and nodeCount from enemy stats', () => {
    const ctrl = new StaggerController();
    const stats = makeEnemyStats(280, 1, 3.5);
    ctrl.sync([], stats);

    expect(ctrl.max).toBe(280);
    expect(ctrl.getNodeThresholds()).toEqual([140]);
  });

  test('F2: sync extracts stagger damage from segment frames', () => {
    const ctrl = new StaggerController();
    const stats = makeEnemyStats(280, 1, 3.5);
    const events = [
      makeStaggerEvent('ev-1', 'slot-0', 100, 150),
    ];
    ctrl.sync(events, stats);

    // 150 stagger crosses the node at 140
    expect(ctrl.frailtyEvents.length).toBeGreaterThanOrEqual(1);
    const nodeEvents = ctrl.frailtyEvents.filter(e => e.columnId === NODE_STAGGER_COLUMN_ID);
    expect(nodeEvents).toHaveLength(1);
    expect(nodeEvents[0].startFrame).toBe(100);
    expect(eventDuration(nodeEvents[0])).toBe(Math.round(3.5 * FPS));
  });

  test('F3: sync produces full stagger break when meter hits max', () => {
    const ctrl = new StaggerController();
    const stats = makeEnemyStats(100, 0, 0, 5);
    const events = [
      makeStaggerEvent('ev-1', 'slot-0', 200, 100),
    ];
    ctrl.sync(events, stats);

    expect(ctrl.breaks).toHaveLength(1);
    expect(ctrl.breaks[0].startFrame).toBe(200);

    const fullEvents = ctrl.frailtyEvents.filter(e => e.columnId === FULL_STAGGER_COLUMN_ID);
    expect(fullEvents).toHaveLength(1);
  });

  test('F4: sync updates on re-sync with different enemy stats', () => {
    const ctrl = new StaggerController();
    const events = [
      makeStaggerEvent('ev-1', 'slot-0', 100, 35),
    ];

    // First sync: max=60, 1 node at 30 → crosses node
    ctrl.sync(events, makeEnemyStats(60, 1, 3.5));
    expect(ctrl.frailtyEvents.filter(e => e.columnId === NODE_STAGGER_COLUMN_ID)).toHaveLength(1);

    // Second sync: max=280, 1 node at 140 → doesn't cross node (35 < 140)
    ctrl.sync(events, makeEnemyStats(280, 1, 3.5));
    expect(ctrl.frailtyEvents.filter(e => e.columnId === NODE_STAGGER_COLUMN_ID)).toHaveLength(0);
  });

  test('F5: sync handles combo/ultimate animation offsets', () => {
    const ctrl = new StaggerController();
    const stats = makeEnemyStats(60, 1, 3.5);

    const comboEvent: TimelineEvent = {
      id: 'combo-1',
      name: 'test-combo',
      ownerId: 'slot-0',
      columnId: SKILL_COLUMNS.COMBO,
      startFrame: 100,
            segments: [
        { properties: { duration: 60, timeDependency: TimeDependency.REAL_TIME }, metadata: { segmentType: SegmentType.ANIMATION } },
        {
          properties: { duration: 200 },
          frames: [{
            offsetFrame: 20,
            stagger: 35,
          }],
        },
      ],
    };

    ctrl.sync([comboEvent], stats);

    // Stagger frame should be at startFrame + animOffset + segOffset + offsetFrame
    // = 100 + 60 + 0 + 20 = 180
    const nodeEvents = ctrl.frailtyEvents.filter(e => e.columnId === NODE_STAGGER_COLUMN_ID);
    expect(nodeEvents).toHaveLength(1);
    expect(nodeEvents[0].startFrame).toBe(180);
  });

  test('F6: sync with no stagger frames produces no frailty events', () => {
    const ctrl = new StaggerController();
    const stats = makeEnemyStats(280, 1, 3.5);
    const events: TimelineEvent[] = [{
      id: 'ev-1',
      name: 'no-stagger-skill',
      ownerId: 'slot-0',
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 100,
            segments: [{
        properties: { duration: 120 },
        frames: [{ offsetFrame: 0 }],
      }],
    }];

    ctrl.sync(events, stats);
    expect(ctrl.frailtyEvents).toHaveLength(0);
    expect(ctrl.breaks).toHaveLength(0);
  });
});
