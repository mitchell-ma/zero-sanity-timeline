import { TimelineEvent, Operator, computeSegmentsSpan } from '../../consts/viewTypes';
import type { Slot } from '../timeline/columnBuilder';
import { CombatSkillsType } from '../../consts/enums';
import { SubjectType, VerbType, ObjectType, DeterminerType, matchInteraction } from '../../consts/semantics';
import type { Interaction } from '../../consts/semantics';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { ENEMY_OWNER_ID } from '../../model/channels';
import { WeaponRegistryEntry } from '../../utils/loadoutRegistry';
import { TriggerCapability } from '../../consts/triggerCapabilities';
import { CommonSlotController } from '../slot/commonSlotController';
import { collectTimeStopRegions, extendByTimeStops, getFinalStrikeTriggerFrame, TimeStopRegion } from '../timeline/processInteractions';

export interface ActivationWindow {
  startFrame: number;
  endFrame: number;
  sourceEventId: string;
  triggerInteraction?: Interaction;
}

/** key = slotId, value = sorted activation windows for that slot's combo */
export type WindowsMap = Map<string, ActivationWindow[]>;
export type CombatLoadoutListener = (windows: WindowsMap) => void;

const NUM_SLOTS = 4;

interface SlotWiring {
  operatorId: string;
  capability: TriggerCapability;
}

/**
 * Maps derived enemy event columnIds to the trigger conditions they represent.
 * Used to generate combo windows from derived events at their actual frame timing.
 */
const _I = (subject: any, verb: any, object: any, extra?: Partial<Interaction>): Interaction =>
  ({ subject, verb, object, ...extra } as Interaction);

const ENEMY_COLUMN_TO_INTERACTIONS: Record<string, Interaction[]> = {
  heatInfliction:       [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { subjectDeterminer: DeterminerType.THIS, element: 'HEAT' })],
  cryoInfliction:       [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { subjectDeterminer: DeterminerType.THIS, element: 'CRYO' })],
  natureInfliction:     [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { subjectDeterminer: DeterminerType.THIS, element: 'NATURE' })],
  electricInfliction:   [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { subjectDeterminer: DeterminerType.THIS, element: 'ELECTRIC' })],
  combustion:           [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.COMBUSTED)],
  solidification:       [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.SOLIDIFIED)],
  corrosion:            [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.CORRODED)],
  electrification:      [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.ELECTRIFIED)],
  vulnerableInfliction: [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.STATUS, { subjectDeterminer: DeterminerType.THIS, objectId: 'VULNERABILITY' })],
  breach:               [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.STATUS, { subjectDeterminer: DeterminerType.THIS, objectId: 'PHYSICAL' })],
};

const ALWAYS_AVAILABLE_INTERACTIONS: Interaction[] = [
  _I(SubjectType.ENEMY, VerbType.HIT, ObjectType.OPERATOR),
  _I(SubjectType.OPERATOR, VerbType.HAVE, ObjectType.HP, { subjectDeterminer: DeterminerType.THIS, cardinalityConstraint: 'AT_MOST' as any }),
  _I(SubjectType.OPERATOR, VerbType.HAVE, ObjectType.HP, { subjectDeterminer: DeterminerType.THIS, cardinalityConstraint: 'AT_LEAST' as any }),
  _I(SubjectType.OPERATOR, VerbType.HAVE, ObjectType.ULTIMATE_ENERGY, { subjectDeterminer: DeterminerType.THIS, cardinalityConstraint: 'AT_MOST' as any }),
];

function isAlwaysAvailable(i: Interaction): boolean {
  return ALWAYS_AVAILABLE_INTERACTIONS.some((aa) => matchInteraction(i, aa));
}

const DERIVED_INTERACTIONS: Interaction[] = [];
for (const interactions of Object.values(ENEMY_COLUMN_TO_INTERACTIONS)) {
  for (const i of interactions) DERIVED_INTERACTIONS.push(i);
}

function isDerivedInteraction(i: Interaction): boolean {
  return DERIVED_INTERACTIONS.some((d) => matchInteraction(i, d));
}

function isFinalStrike(i: Interaction): boolean {
  return i.verb === VerbType.PERFORM && i.object === ObjectType.FINAL_STRIKE;
}

export class CombatLoadout {
  /**
   * Check if a weapon is compatible with an operator.
   * Returns true if the operator can equip the weapon, false otherwise.
   * Returns true if operator or weapon is null (no constraint to violate).
   */
  static isWeaponCompatible(
    operator: Operator | null,
    weapon: WeaponRegistryEntry | null | undefined,
  ): boolean {
    if (!operator || !weapon) return true;
    return operator.weaponTypes.includes(weapon.weaponType);
  }

  private slots: (SlotWiring | null)[] = Array(NUM_SLOTS).fill(null);
  private slotIds: string[] = [];
  private cachedSlots: Slot[] = [];
  private spCosts: Map<string, number> = new Map();
  private cachedEvents: TimelineEvent[] = [];
  private cachedWindows: WindowsMap = new Map();
  private listeners: Set<CombatLoadoutListener> = new Set();

  // ── Common (global) slot ────────────────────────────────────────────────
  readonly commonSlot = new CommonSlotController();

  setSlotIds(ids: string[]): void {
    this.slotIds = ids;
  }

  /**
   * Sync the full slot array into the combat context.
   * Rebuilds operator wiring, SP costs, and recomputes combo windows.
   */
  syncSlots(slots: Slot[]): void {
    this.cachedSlots = slots;
    this.spCosts.clear();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const op = slot.operator;
      if (!op) {
        this.slots[i] = null;
      } else {
        const capability = op.triggerCapability;
        this.slots[i] = capability
          ? { operatorId: op.id, capability }
          : null;
        this.spCosts.set(slot.slotId, op.skills.battle.skillPointCost ?? 100);
      }
    }
    this.recomputeWindows(this.cachedEvents);
  }

  // ── SP queries ─────────────────────────────────────────────────────────

  hasSufficientSP(ownerId: string, frame: number): boolean {
    const cost = this.spCosts.get(ownerId) ?? 100;
    return this.commonSlot.skillPoints.valueAt(frame) >= cost;
  }

  getSpCost(ownerId: string): number {
    return this.spCosts.get(ownerId) ?? 100;
  }

  // ── Slot queries ───────────────────────────────────────────────────────

  getSlots(): readonly Slot[] {
    return this.cachedSlots;
  }

  recomputeWindows(events: TimelineEvent[]): void {
    this.cachedEvents = events;

    const newWindows: WindowsMap = new Map();
    const stops = collectTimeStopRegions(events);

    // Build a map: slotId → slot index for quick lookup
    const slotIdToIndex = new Map<string, number>();
    for (let i = 0; i < this.slotIds.length; i++) {
      slotIdToIndex.set(this.slotIds[i], i);
    }

    // For each operator event, determine what triggers it produces
    // (skip infliction/reaction triggers — those come from derived enemy events)
    for (const event of events) {
      const slotIndex = slotIdToIndex.get(event.ownerId);
      if (slotIndex === undefined) continue;

      const pubSlot = this.slots[slotIndex];
      if (!pubSlot) continue;

      const publishedTriggers = pubSlot.capability.publishesTriggers[event.columnId];
      if (!publishedTriggers || publishedTriggers.length === 0) continue;

      // Finisher/Dive events don't publish FINAL_STRIKE — only normal basic attack sequences do
      const isNonSequenceBasic = event.name === CombatSkillsType.FINISHER || event.name === CombatSkillsType.DIVE;

      // Default: window starts at end of active duration
      const defaultTriggerFrame = event.startFrame + event.activationDuration;

      // For FINAL_STRIKE on sequenced events, start at the first hit of the last segment
      const finalStrikeTriggerFrame = getFinalStrikeTriggerFrame(event, stops) ?? defaultTriggerFrame;

      for (const interaction of publishedTriggers) {
        if (isDerivedInteraction(interaction)) continue;
        if (isNonSequenceBasic && isFinalStrike(interaction)) continue;

        this.addWindowsForTrigger(interaction, event, events, newWindows, slotIdToIndex,
          isFinalStrike(interaction) ? finalStrikeTriggerFrame : defaultTriggerFrame, stops);
      }
    }

    // For derived enemy events, use their startFrame as the trigger frame
    for (const event of events) {
      if (event.ownerId !== ENEMY_OWNER_ID) continue;

      const interactions = ENEMY_COLUMN_TO_INTERACTIONS[event.columnId];
      if (!interactions) continue;

      const triggerFrame = event.startFrame;

      for (const interaction of interactions) {
        this.addWindowsForTrigger(interaction, event, events, newWindows, slotIdToIndex, triggerFrame, stops);
      }
    }

    // Always-available interactions → full-timeline activation windows
    for (let i = 0; i < NUM_SLOTS; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      const hasAlways = slot.capability.comboRequires.some((req) => isAlwaysAvailable(req));
      if (!hasAlways) continue;
      const slotId = this.slotIds[i];
      if (!slotId) continue;
      const fullWindow: ActivationWindow = {
        startFrame: 0,
        endFrame: TOTAL_FRAMES,
        sourceEventId: '__always_available__',
      };
      if (!newWindows.has(slotId)) {
        newWindows.set(slotId, []);
      }
      newWindows.get(slotId)!.push(fullWindow);
    }

    // Sort and merge overlapping windows per slot
    newWindows.forEach((windows, slotId) => {
      windows.sort((a: ActivationWindow, b: ActivationWindow) => a.startFrame - b.startFrame);
      const merged = mergeWindows(windows);
      newWindows.set(slotId, merged);
    });

    // Only notify if windows actually changed
    if (!windowsEqual(this.cachedWindows, newWindows)) {
      this.cachedWindows = newWindows;
      this.notify(newWindows);
    }
  }

  private addWindowsForTrigger(
    published: Interaction,
    event: TimelineEvent,
    allEvents: TimelineEvent[],
    newWindows: WindowsMap,
    slotIdToIndex: Map<string, number>,
    triggerFrame: number,
    stops: readonly TimeStopRegion[],
  ): void {
    for (let subIdx = 0; subIdx < NUM_SLOTS; subIdx++) {
      const subSlot = this.slots[subIdx];
      if (!subSlot) continue;
      const matchesTrigger = subSlot.capability.comboRequires.some((req) => matchInteraction(published, req));
      if (!matchesTrigger) continue;

      const slotId = this.slotIds[subIdx];
      if (!slotId) continue;

      // Skip self-trigger: don't let an operator's own derived events create
      // trigger windows for its own combo (prevents feedback loop on drag).
      if (event.sourceOwnerId === slotId) continue;

      // Check comboForbidsActiveColumns — skip if any forbidden event is active
      const forbids = subSlot.capability.comboForbidsActiveColumns;
      if (forbids && forbids.length > 0 && hasActiveEventInColumns(allEvents, forbids, triggerFrame)) {
        continue;
      }

      // Check comboRequiresActiveColumns — skip if none of the required events are active
      const requires = subSlot.capability.comboRequiresActiveColumns;
      if (requires && requires.length > 0 && !hasActiveEventInColumns(allEvents, requires, triggerFrame)) {
        continue;
      }

      const baseDuration = subSlot.capability.comboWindowFrames;
      const extendedDuration = extendByTimeStops(triggerFrame, baseDuration, stops);
      const window: ActivationWindow = {
        startFrame: triggerFrame,
        endFrame: triggerFrame + extendedDuration,
        sourceEventId: event.id,
        triggerInteraction: published,
      };

      if (!newWindows.has(slotId)) {
        newWindows.set(slotId, []);
      }
      newWindows.get(slotId)!.push(window);
    }
  }

  subscribe(listener: CombatLoadoutListener): () => void {
    this.listeners.add(listener);
    // Immediately send current state
    listener(this.cachedWindows);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(windows: WindowsMap): void {
    this.listeners.forEach((listener) => listener(windows));
  }
}

/**
 * Check if any event whose columnId is in `columnIds` is active at `frame`.
 * An event is "active" if frame falls within [startFrame, startFrame + totalDuration).
 */
function hasActiveEventInColumns(events: TimelineEvent[], columnIds: string[], frame: number): boolean {
  for (const ev of events) {
    if (!columnIds.includes(ev.columnId) && !columnIds.includes(ev.name)) continue;
    const totalDuration = ev.segments
      ? computeSegmentsSpan(ev.segments)
      : ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
    if (frame >= ev.startFrame && frame < ev.startFrame + totalDuration) {
      return true;
    }
  }
  return false;
}

function mergeWindows(sorted: ActivationWindow[]): ActivationWindow[] {
  if (sorted.length === 0) return [];

  const result: ActivationWindow[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];

    if (curr.startFrame <= prev.endFrame) {
      // Overlapping — extend
      prev.endFrame = Math.max(prev.endFrame, curr.endFrame);
    } else {
      result.push({ ...curr });
    }
  }

  return result;
}

function windowsEqual(a: WindowsMap, b: WindowsMap): boolean {
  if (a.size !== b.size) return false;
  let equal = true;
  a.forEach((aWindows, key) => {
    if (!equal) return;
    const bWindows = b.get(key);
    if (!bWindows || aWindows.length !== bWindows.length) { equal = false; return; }
    for (let i = 0; i < aWindows.length; i++) {
      if (aWindows[i].startFrame !== bWindows[i].startFrame ||
          aWindows[i].endFrame !== bWindows[i].endFrame ||
          aWindows[i].sourceEventId !== bWindows[i].sourceEventId) {
        equal = false;
        return;
      }
    }
  });
  return equal;
}