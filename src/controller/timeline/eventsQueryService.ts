/**
 * EventsQueryService — read-only query interface backed by DerivedEventController.
 *
 * Provides domain-specific status lookups (susceptibility, fragility,
 * link bonus, amp, corrosion, etc.) for damage table building and
 * talent evaluation. All queries are frame-based and resolve against
 * the DerivedEventController's event data and time-stop regions.
 */
import { TimelineEvent, eventDuration } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { DamageFactorType, ElementType, StatType, StatusType } from '../../consts/enums';
import { isQualifiedId } from '../../dsl/semantics';
import { StaggerBreak } from './staggerTimeline';
import {
  ENEMY_OWNER_ID,
  FRAGILITY_COLUMN_PREFIX,
  INFLICTION_COLUMNS,
  NODE_STAGGER_COLUMN_ID,
  PHYSICAL_STATUS_COLUMNS,
  REACTION_COLUMNS,
} from '../../model/channels';
import { getCorrosionReduction, MultiplierSource } from '../../model/calculation/damageFormulas';
import { FPS } from '../../utils/timeline';
import type { LoadoutProperties } from '../../view/InformationPane';
import type { DerivedEventController } from './derivedEventController';
import { StatusLevel } from '../../consts/types';

// ── Exported constants ──────────────────────────────────────────────────────

/** Electrification: increased Arts DMG taken by status level. */
export const ELECTRIFICATION_ARTS_FRAGILITY: Readonly<Record<number, number>> = {
  1: 0.12, 2: 0.16, 3: 0.20, 4: 0.24,
};

/** Breach: increased Physical DMG taken by status level. */
export const BREACH_PHYSICAL_FRAGILITY: Readonly<Record<number, number>> = {
  1: 0.11, 2: 0.14, 3: 0.17, 4: 0.20,
};

/** Default amp bonus when statusValue is not specified on the event. */
export const DEFAULT_AMP_BONUS = 0;

/** Maximum 0-based index for skill level arrays (12 levels → index 0–11). */
export const MAX_SKILL_LEVEL_INDEX = 11;

// ── Exported types ──────────────────────────────────────────────────────────

/** Pre-computed weapon fragility effect for a single slot. */
export interface WeaponFragilityEffect {
  elements: ElementType[];
  bonus: number;
}

/** Pre-computed operator talent fragility effect. */
export interface OperatorTalentFragility {
  elements: ElementType[];
  bonus: number;
  requiredColumnId: string;
}

/** Maps a damage bonus stat type to the fragility elements it affects. */
export function statToFragilityElements(stat: string): ElementType[] | null {
  switch (stat) {
    case StatType.CRYO_DAMAGE_BONUS: return [ElementType.CRYO];
    case StatType.HEAT_DAMAGE_BONUS: return [ElementType.HEAT];
    case StatType.ELECTRIC_DAMAGE_BONUS: return [ElementType.ELECTRIC];
    case StatType.NATURE_DAMAGE_BONUS: return [ElementType.NATURE];
    case StatType.PHYSICAL_DAMAGE_BONUS: return [ElementType.PHYSICAL];
    case StatType.ARTS_DAMAGE_BONUS: return [ElementType.HEAT, ElementType.ELECTRIC, ElementType.CRYO, ElementType.NATURE];
    default: return null;
  }
}

// ── Internal constants ──────────────────────────────────────────────────────

const ARTS_ELEMENTS = new Set([ElementType.HEAT, ElementType.ELECTRIC, ElementType.CRYO, ElementType.NATURE]);

const LINK_BATTLE_SKILL_BONUS: Record<number, number> = { 1: 0.30, 2: 0.45, 3: 0.60, 4: 0.75 };
const LINK_ULTIMATE_BONUS: Record<number, number> = { 1: 0.20, 2: 0.30, 3: 0.40, 4: 0.50 };

// ── Query service ───────────────────────────────────────────────────────────

export class EventsQueryService {
  private susceptibilityEvents: TimelineEvent[];
  private linkEvents: TimelineEvent[];
  private artsAmpEvents: TimelineEvent[];
  private electrificationEvents: TimelineEvent[];
  private breachEvents: TimelineEvent[];
  private corrosionEvents: TimelineEvent[];
  private weakenEvents: TimelineEvent[];
  private dmgReductionEvents: TimelineEvent[];
  private protectionEvents: TimelineEvent[];
  private shieldEvents: TimelineEvent[];
  private weaponFragilityEvents: TimelineEvent[];
  private cryoInflictionEvents: TimelineEvent[];
  private solidificationEvents: TimelineEvent[];
  private nodeStaggerEvents: TimelineEvent[];
  private staggerBreaks: readonly StaggerBreak[];
  private state: DerivedEventController;
  private loadoutProperties: Record<string, LoadoutProperties>;
  private aggregatedStats?: Record<string, { stats: Record<StatType, number> }>;
  private weaponFragility: Record<string, WeaponFragilityEffect[]>;
  private talentFragility: OperatorTalentFragility[];

  constructor(
    state: DerivedEventController,
    staggerBreaks: readonly StaggerBreak[],
    loadoutProperties?: Record<string, LoadoutProperties>,
    aggregatedStats?: Record<string, { stats: Record<StatType, number> }>,
    weaponFragility?: Record<string, WeaponFragilityEffect[]>,
    talentFragility?: OperatorTalentFragility[],
  ) {
    this.state = state;
    this.staggerBreaks = staggerBreaks;
    this.loadoutProperties = loadoutProperties ?? {};
    this.aggregatedStats = aggregatedStats;
    this.weaponFragility = weaponFragility ?? {};
    this.talentFragility = talentFragility ?? [];

    // Pre-filter from DerivedEventController for O(n) per-column queries
    const events = state.getRegisteredEvents();
    this.susceptibilityEvents = events.filter(e => (e.columnId === StatusType.SUSCEPTIBILITY || e.columnId === StatusType.FOCUS || isQualifiedId(e.columnId, StatusType.SUSCEPTIBILITY)) && e.ownerId === ENEMY_OWNER_ID);
    this.linkEvents = events.filter(e => e.columnId === StatusType.LINK);
    this.artsAmpEvents = events.filter(e => e.damageFactorType === DamageFactorType.AMP);
    this.electrificationEvents = events.filter(e => e.columnId === REACTION_COLUMNS.ELECTRIFICATION);
    this.breachEvents = events.filter(e => e.columnId === PHYSICAL_STATUS_COLUMNS.BREACH);
    this.corrosionEvents = events.filter(e => e.ownerId === ENEMY_OWNER_ID && e.columnId === REACTION_COLUMNS.CORROSION);
    this.weakenEvents = events.filter(e => e.columnId === StatusType.WEAKEN);
    this.dmgReductionEvents = events.filter(e => e.columnId === StatusType.DMG_REDUCTION);
    this.protectionEvents = events.filter(e => e.columnId === StatusType.PROTECTION);
    this.shieldEvents = events.filter(e => e.columnId === StatusType.SHIELD);
    this.weaponFragilityEvents = events.filter(e => e.columnId.startsWith(FRAGILITY_COLUMN_PREFIX));
    this.cryoInflictionEvents = events.filter(e => e.ownerId === ENEMY_OWNER_ID && e.columnId === INFLICTION_COLUMNS.CRYO);
    this.solidificationEvents = events.filter(e => e.ownerId === ENEMY_OWNER_ID && e.columnId === REACTION_COLUMNS.SOLIDIFICATION);
    this.nodeStaggerEvents = events.filter(e => e.ownerId === ENEMY_OWNER_ID && e.columnId === NODE_STAGGER_COLUMN_ID);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private gameTimeElapsed(startFrame: number, endFrame: number): number {
    let paused = 0;
    for (const s of this.state.getStops()) {
      const stopEnd = s.startFrame + s.durationFrames;
      if (stopEnd <= startFrame) continue;
      if (s.startFrame >= endFrame) break;
      paused += Math.min(stopEnd, endFrame) - Math.max(s.startFrame, startFrame);
    }
    return (endFrame - startFrame) - paused;
  }

  // ── Intra-frame exclusion ────────────────────────────────────────────────
  // The damage builder sets these before querying to exclude statuses that
  // were created by the current or later damage frames at the same absFrame.
  private _exclusionFrame = -1;
  private _exclusionKeys: Set<string> | null = null;

  setFrameExclusion(frame: number, keys: Set<string>) {
    this._exclusionFrame = frame;
    this._exclusionKeys = keys;
  }

  clearFrameExclusion() {
    this._exclusionFrame = -1;
    this._exclusionKeys = null;
  }

  private isActive(ev: TimelineEvent, frame: number): boolean {
    if (ev.startFrame > frame || frame >= ev.startFrame + eventDuration(ev)) return false;
    if (this._exclusionKeys && ev.startFrame === this._exclusionFrame
        && ev.sourceFrameKey && this._exclusionKeys.has(ev.sourceFrameKey)) {
      return false;
    }
    return true;
  }

  private resolveSegmentSusceptibility(ev: TimelineEvent, frame: number, element: ElementType): number {
    if (ev.segments.length > 0) {
      const elapsed = this.gameTimeElapsed(ev.startFrame, frame);
      let segStart = 0;
      for (const seg of ev.segments) {
        if (elapsed >= segStart && elapsed < segStart + seg.properties.duration) {
          const susc = seg.unknown?.susceptibility as Partial<Record<ElementType, number>> | undefined;
          return susc?.[element] ?? ev.susceptibility?.[element] ?? 0;
        }
        segStart += seg.properties.duration;
      }
    }
    return ev.susceptibility?.[element] ?? 0;
  }

  private resolveSegmentLabel(ev: TimelineEvent, frame: number): string {
    if (ev.segments.length > 0) {
      const elapsed = this.gameTimeElapsed(ev.startFrame, frame);
      let segStart = 0;
      for (const seg of ev.segments) {
        if (elapsed >= segStart && elapsed < segStart + seg.properties.duration) {
          return seg.properties.name ?? ev.name ?? ev.columnId;
        }
        segStart += seg.properties.duration;
      }
    }
    return ev.name ?? ev.columnId;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  isStaggered(frame: number): boolean {
    return this.staggerBreaks.some(b => frame >= b.startFrame && frame < b.endFrame)
      || this.nodeStaggerEvents.some(e => this.isActive(e, frame));
  }

  /**
   * Count active operator-owned status events with the given columnId at the frame.
   * Returns the sum of stacks across active matching events.
   */
  getActiveOperatorStatusStacks(frame: number, ownerId: string, statusId: string): number {
    let n = 0;
    for (const ev of this.state.getRegisteredEvents()) {
      if (ev.ownerId !== ownerId || ev.columnId !== statusId) continue;
      if (!this.isActive(ev, frame)) continue;
      n += ev.stacks ?? 1;
    }
    return n;
  }

  /**
   * Count active enemy susceptibility events at the given frame for the given element.
   * Existence counts — a 0%-value susceptibility event still contributes 1 stack,
   * so DSL formulas referencing `STACKS of <ELEMENT> SUSCEPTIBILITY of ENEMY` see
   * the event as present.
   */
  getActiveSusceptibilityStacks(frame: number, element: ElementType): number {
    let n = 0;
    for (const ev of this.susceptibilityEvents) {
      if (!this.isActive(ev, frame)) continue;
      // Only count events targeting the requested element. Column ID is
      // either `<ELEMENT>_SUSCEPTIBILITY` or a generic SUSCEPTIBILITY/FOCUS
      // that carries per-element values on the event itself.
      const qualified = isQualifiedId(ev.columnId, StatusType.SUSCEPTIBILITY);
      if (qualified) {
        const elem = ev.columnId.slice(0, -(StatusType.SUSCEPTIBILITY.length + 1));
        if (elem !== element) continue;
      } else if (ev.susceptibility?.[element] === undefined) {
        continue;
      }
      n += ev.stacks ?? 1;
    }
    return n;
  }

  getSusceptibilityBonus(frame: number, element: ElementType): number {
    let sum = 0;
    for (const ev of this.susceptibilityEvents) {
      if (!this.isActive(ev, frame)) continue;
      const bonus = this.resolveSegmentSusceptibility(ev, frame, element);
      if (bonus) sum += bonus;
    }
    return sum;
  }

  isLinkActive(frame: number): boolean {
    return this.linkEvents.some(ev => this.isActive(ev, frame));
  }

  getLinkBonus(frame: number, skillType: string): number {
    if (skillType !== NounType.BATTLE && skillType !== NounType.ULTIMATE) return 0;
    // Find the registered event that owns this frame and check if it consumed Link
    const events = this.state.getRegisteredEvents();
    for (const ev of events) {
      if (ev.columnId !== NounType.BATTLE && ev.columnId !== NounType.ULTIMATE) continue;
      if (ev.startFrame > frame || frame >= ev.startFrame + eventDuration(ev)) continue;
      const stacks = this.state.getLinkStacks(ev.uid);
      if (stacks === 0) continue;
      const table = skillType === NounType.ULTIMATE ? LINK_ULTIMATE_BONUS : LINK_BATTLE_SKILL_BONUS;
      return table[stacks] ?? 0;
    }
    return 0;
  }

  isArtsAmpActive(frame: number): boolean {
    return this.artsAmpEvents.some(ev => this.isActive(ev, frame));
  }

  getAmpBonus(frame: number): number {
    let sum = 0;
    for (const ev of this.artsAmpEvents) {
      if (!this.isActive(ev, frame)) continue;
      sum += ev.statusValue ?? DEFAULT_AMP_BONUS;
    }
    return sum;
  }

  getWeakenEffects(frame: number): number[] {
    const effects: number[] = [];
    for (const ev of this.weakenEvents) {
      if (!this.isActive(ev, frame)) continue;
      if (ev.statusValue != null && ev.statusValue > 0) effects.push(ev.statusValue);
    }
    return effects;
  }

  getWeakenSources(frame: number): MultiplierSource[] {
    const sources: MultiplierSource[] = [];
    for (const ev of this.weakenEvents) {
      if (!this.isActive(ev, frame)) continue;
      if (ev.statusValue != null && ev.statusValue > 0) {
        sources.push({ label: ev.name ?? ev.columnId, value: ev.statusValue });
      }
    }
    return sources;
  }

  getDmgReductionEffects(frame: number): number[] {
    const effects: number[] = [];
    for (const ev of this.dmgReductionEvents) {
      if (!this.isActive(ev, frame)) continue;
      if (ev.statusValue != null && ev.statusValue > 0) effects.push(ev.statusValue);
    }
    return effects;
  }

  getDmgReductionSources(frame: number): MultiplierSource[] {
    const sources: MultiplierSource[] = [];
    for (const ev of this.dmgReductionEvents) {
      if (!this.isActive(ev, frame)) continue;
      if (ev.statusValue != null && ev.statusValue > 0) {
        sources.push({ label: ev.name ?? ev.columnId, value: ev.statusValue });
      }
    }
    return sources;
  }

  getProtectionEffects(frame: number): number[] {
    const effects: number[] = [];
    for (const ev of this.protectionEvents) {
      if (!this.isActive(ev, frame)) continue;
      if (ev.statusValue != null && ev.statusValue > 0) effects.push(ev.statusValue);
    }
    return effects;
  }

  getProtectionSources(frame: number): MultiplierSource[] {
    const sources: MultiplierSource[] = [];
    for (const ev of this.protectionEvents) {
      if (!this.isActive(ev, frame)) continue;
      if (ev.statusValue != null && ev.statusValue > 0) {
        sources.push({ label: ev.name ?? ev.columnId, value: ev.statusValue });
      }
    }
    return sources;
  }

  getShieldEffects(frame: number): { operatorId: string; value: number }[] {
    const effects: { operatorId: string; value: number }[] = [];
    for (const ev of this.shieldEvents) {
      if (!this.isActive(ev, frame)) continue;
      if (ev.statusValue != null && ev.statusValue > 0) {
        effects.push({ operatorId: ev.ownerId, value: ev.statusValue });
      }
    }
    return effects;
  }

  /** Get events for a given column ID. */
  getColumnEvents(columnId: string): TimelineEvent[] {
    return this.state.getRegisteredEvents().filter(e => e.columnId === columnId);
  }

  /**
   * Compute intellect-scaled damage bonus from active status events.
   * Scans all events with DAMAGE_BONUS factor type that carry a per-intellect
   * statusValue and a sourceOwnerId for stat lookup.
   */
  getIntellectScaledDamageBonus(frame: number): number {
    let sum = 0;
    for (const ev of this.state.getRegisteredEvents()) {
      if (ev.damageFactorType !== DamageFactorType.DAMAGE_BONUS) continue;
      if (!this.isActive(ev, frame)) continue;
      const perIntellect = ev.statusValue ?? 0;
      if (perIntellect === 0 || !ev.sourceOwnerId) continue;
      const intellect = this.aggregatedStats?.[ev.sourceOwnerId]?.stats[StatType.INTELLECT] ?? 0;
      sum += perIntellect * intellect;
    }
    return sum;
  }

  getFragilityBonus(frame: number, element: ElementType): number {
    let sum = 0;
    if (ARTS_ELEMENTS.has(element)) {
      for (const ev of this.electrificationEvents) {
        if (!this.isActive(ev, frame)) continue;
        const stackCount = Math.min(ev.stacks ?? 1, 4);
        sum += ELECTRIFICATION_ARTS_FRAGILITY[stackCount] ?? 0;
      }
    }
    if (element === ElementType.PHYSICAL) {
      for (const ev of this.breachEvents) {
        if (!this.isActive(ev, frame)) continue;
        const stackCount = Math.min(ev.stacks ?? 1, 4);
        sum += BREACH_PHYSICAL_FRAGILITY[stackCount] ?? 0;
      }
    }
    for (const ev of this.weaponFragilityEvents) {
      if (!this.isActive(ev, frame)) continue;
      const slotId = ev.columnId.slice(FRAGILITY_COLUMN_PREFIX.length);
      const effects = this.weaponFragility[slotId];
      if (!effects) continue;
      for (const eff of effects) {
        if (eff.elements.includes(element)) sum += eff.bonus;
      }
    }
    for (const tf of this.talentFragility) {
      if (!tf.elements.includes(element)) continue;
      const events = this.getColumnEvents(tf.requiredColumnId);
      if (events.some(ev => this.isActive(ev, frame))) sum += tf.bonus;
    }
    return sum;
  }

  getCorrosionResistanceReduction(frame: number): number {
    let maxReduction = 0;
    for (const ev of this.corrosionEvents) {
      if (!this.isActive(ev, frame)) continue;
      const cappedStacks = Math.min(ev.stacks ?? 1, 4) as StatusLevel;
      const elapsedSeconds = (frame - ev.startFrame) / FPS;
      let artsIntensity = 0;
      if (ev.sourceOwnerId) {
        const agg = this.aggregatedStats?.[ev.sourceOwnerId];
        if (agg) artsIntensity = agg.stats[StatType.ARTS_INTENSITY] ?? 0;
      }
      maxReduction = Math.max(maxReduction, getCorrosionReduction(cappedStacks, elapsedSeconds, artsIntensity));
    }
    return maxReduction;
  }

  isCryoInflictionActive(frame: number): boolean {
    return this.cryoInflictionEvents.some(ev => this.isActive(ev, frame));
  }

  isSolidificationActive(frame: number): boolean {
    return this.solidificationEvents.some(ev => this.isActive(ev, frame));
  }

  getSusceptibilitySources(frame: number, element: ElementType): MultiplierSource[] {
    const sources: MultiplierSource[] = [];
    for (const ev of this.susceptibilityEvents) {
      if (!this.isActive(ev, frame)) continue;
      const bonus = this.resolveSegmentSusceptibility(ev, frame, element);
      if (bonus) sources.push({ label: this.resolveSegmentLabel(ev, frame), value: bonus, category: ev.name });
    }
    return sources;
  }

  getFragilitySources(frame: number, element: ElementType): MultiplierSource[] {
    const sources: MultiplierSource[] = [];
    if (ARTS_ELEMENTS.has(element)) {
      for (const ev of this.electrificationEvents) {
        if (!this.isActive(ev, frame)) continue;
        const stackCount = Math.min(ev.stacks ?? 1, 4);
        const value = ELECTRIFICATION_ARTS_FRAGILITY[stackCount] ?? 0;
        if (value > 0) sources.push({ label: `Electrification Lv${stackCount}`, value, category: 'Arts' });
      }
    }
    if (element === ElementType.PHYSICAL) {
      for (const ev of this.breachEvents) {
        if (!this.isActive(ev, frame)) continue;
        const stackCount = Math.min(ev.stacks ?? 1, 4);
        const value = BREACH_PHYSICAL_FRAGILITY[stackCount] ?? 0;
        if (value > 0) sources.push({ label: `Breach Lv${stackCount}`, value, category: 'Physical' });
      }
    }
    for (const ev of this.weaponFragilityEvents) {
      if (!this.isActive(ev, frame)) continue;
      const slotId = ev.columnId.slice(FRAGILITY_COLUMN_PREFIX.length);
      const effects = this.weaponFragility[slotId];
      if (!effects) continue;
      for (const eff of effects) {
        if (eff.elements.includes(element)) sources.push({ label: `Weapon debuff (${slotId})`, value: eff.bonus, category: 'Weapon' });
      }
    }
    for (const tf of this.talentFragility) {
      if (!tf.elements.includes(element)) continue;
      const events = this.getColumnEvents(tf.requiredColumnId);
      if (events.some(ev => this.isActive(ev, frame))) sources.push({ label: 'Talent fragility', value: tf.bonus, category: 'Talent' });
    }
    return sources;
  }

  getAmpSources(frame: number): MultiplierSource[] {
    const sources: MultiplierSource[] = [];
    for (const ev of this.artsAmpEvents) {
      if (!this.isActive(ev, frame)) continue;
      sources.push({ label: ev.name ?? NounType.ARTS_AMP, value: ev.statusValue ?? DEFAULT_AMP_BONUS, category: ev.name ?? NounType.ARTS_AMP });
    }
    return sources;
  }

  /**
   * Sum ignored resistance from all active status events owned by the attacker
   * whose element matches. The pipeline resolves IGNORE RESISTANCE clause effects
   * into statusValue at event creation time.
   */
  getIgnoredResistance(frame: number, _element: ElementType, attackerOwnerId: string): number {
    let sum = 0;
    for (const ev of this.state.getRegisteredEvents()) {
      if (ev.damageFactorType !== DamageFactorType.RESISTANCE) continue;
      if (ev.ownerId !== attackerOwnerId) continue;
      if (!this.isActive(ev, frame)) continue;
      sum += ev.statusValue ?? 0;
    }
    return sum;
  }
}
