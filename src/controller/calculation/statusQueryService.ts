import { TimelineEvent } from '../../consts/viewTypes';
import { StatusLevel, TalentLevel } from '../../consts/types';
import { CombatSkillType, ElementType, StatType, StatusType } from '../../consts/enums';
import { StaggerBreak } from '../timeline/staggerTimeline';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import {
  ENEMY_OWNER_ID,
  FRAGILITY_COLUMN_PREFIX,
  INFLICTION_COLUMNS,
  OPERATOR_COLUMNS,
  PHYSICAL_STATUS_COLUMNS,
  REACTION_COLUMN_IDS,
  REACTION_COLUMNS,
} from '../../model/channels';
import { getCorrosionReduction, getScorchingHeartIgnoredResistance } from '../../model/calculation/damageFormulas';
import { FPS } from '../../utils/timeline';
import { collectTimeStopRegions, type TimeStopRegion } from '../timeline/processTimeStop';
import type { LoadoutStats } from '../../view/InformationPane';
import type { AggregatedStats } from './loadoutAggregator';

// ── Fragility tables (from combat-status models) ─────────────────────────────

/** Electrification: increased Arts DMG taken by status level. */
export const ELECTRIFICATION_ARTS_FRAGILITY: Readonly<Record<number, number>> = {
  1: 0.12,
  2: 0.16,
  3: 0.20,
  4: 0.24,
};

/** Breach: increased Physical DMG taken by status level. */
export const BREACH_PHYSICAL_FRAGILITY: Readonly<Record<number, number>> = {
  1: 0.11,
  2: 0.14,
  3: 0.17,
  4: 0.20,
};

/** Arts element types that benefit from electrification fragility. */
const ARTS_ELEMENTS = new Set([ElementType.HEAT, ElementType.ELECTRIC, ElementType.CRYO, ElementType.NATURE]);

// ── Weapon fragility ─────────────────────────────────────────────────────────

/** Pre-computed weapon fragility effect for a single slot. */
export interface WeaponFragilityEffect {
  /** Elements that benefit from this fragility debuff. */
  elements: ElementType[];
  /** Bonus percentage (e.g. 0.14 = 14% increased DMG taken). */
  bonus: number;
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

// ── Operator talent fragility ────────────────────────────────────────────────

/** Pre-computed operator talent fragility effect (e.g. Xaihi Execute Process). */
export interface OperatorTalentFragility {
  /** Elements that benefit from this fragility debuff. */
  elements: ElementType[];
  /** Bonus percentage (e.g. 0.07 = 7% increased DMG taken). */
  bonus: number;
  /** Enemy columnId that must be active for this fragility to apply. */
  requiredColumnId: string;
}

/** Xaihi Execute Process: Cryo DMG Taken bonus while Cryo Infliction is active. */
const XAIHI_EXECUTE_PROCESS_BONUS: Record<number, number> = {
  1: 0.07,
  2: 0.10,
};

/** Antal P5: after Focus is active for 20s, susceptibility increases by 4%. */
const FOCUS_P5_THRESHOLD_FRAMES = 2400; // 20s at 120fps
const FOCUS_P5_SUSCEPTIBILITY_BONUS = 0.04;

/**
 * Link bonus table by stack count.
 * Stacks | Battle Skill | Ultimate
 *   1    |    30%       |   20%
 *   2    |    45%       |   30%
 *   3    |    60%       |   40%
 *   4    |    75%       |   50%
 */
const LINK_BATTLE_SKILL_BONUS: Record<number, number> = { 1: 0.30, 2: 0.45, 3: 0.60, 4: 0.75 };
const LINK_ULTIMATE_BONUS: Record<number, number> = { 1: 0.20, 2: 0.30, 3: 0.40, 4: 0.50 };

/** Default amp bonus when statusValue is not specified on the event. */
export const DEFAULT_AMP_BONUS = 0.15;

/** Maximum 0-based index for skill level arrays (12 levels → index 0–11). */
export const MAX_SKILL_LEVEL_INDEX = 11;

/**
 * Stateless query service for status multipliers at any given frame.
 *
 * Constructed with processed timeline events + stagger breaks, provides
 * O(n) lookups (pre-filtered by status type) for the damage table builder.
 */
export class StatusQueryService {
  private susceptibilityEvents: TimelineEvent[];
  private linkEvents: TimelineEvent[];
  private artsAmpEvents: TimelineEvent[];
  private electrificationEvents: TimelineEvent[];
  private breachEvents: TimelineEvent[];
  private corrosionEvents: TimelineEvent[];
  private meltingFlameEvents: TimelineEvent[];
  private weakenEvents: TimelineEvent[];
  private dmgReductionEvents: TimelineEvent[];
  private protectionEvents: TimelineEvent[];
  private weaponFragilityEvents: TimelineEvent[];
  private staggerBreaks: readonly StaggerBreak[];
  private timeStopRegions: readonly TimeStopRegion[];
  private loadoutStats: Record<string, LoadoutStats>;
  private aggregatedStats?: Record<string, { stats: Record<StatType, number> }>;
  private weaponFragility: Record<string, WeaponFragilityEffect[]>;
  private talentFragility: OperatorTalentFragility[];
  private scorchingHeartEvents: TimelineEvent[];
  private wildlandTrekkerEvents!: TimelineEvent[];
  private cryoInflictionEvents: TimelineEvent[];
  private solidificationEvents: TimelineEvent[];
  private originiumCrystalEvents: TimelineEvent[];

  constructor(
    events: TimelineEvent[],
    staggerBreaks: readonly StaggerBreak[],
    loadoutStats?: Record<string, LoadoutStats>,
    aggregatedStats?: Record<string, { stats: Record<StatType, number> }>,
    weaponFragility?: Record<string, WeaponFragilityEffect[]>,
    talentFragility?: OperatorTalentFragility[],
  ) {
    this.susceptibilityEvents = events.filter(e => (e.columnId === StatusType.SUSCEPTIBILITY || e.columnId === StatusType.FOCUS) && e.ownerId === ENEMY_OWNER_ID);
    this.linkEvents = events.filter(e => e.columnId === StatusType.LINK);
    this.artsAmpEvents = events.filter(e => e.columnId === StatusType.ARTS_AMP);
    this.electrificationEvents = events.filter(e => e.columnId === REACTION_COLUMNS.ELECTRIFICATION);
    this.breachEvents = events.filter(e => e.columnId === PHYSICAL_STATUS_COLUMNS.BREACH);
    this.corrosionEvents = events.filter(e => e.ownerId === ENEMY_OWNER_ID && e.columnId === REACTION_COLUMNS.CORROSION);
    this.meltingFlameEvents = events.filter(e => e.columnId === OPERATOR_COLUMNS.MELTING_FLAME);
    this.weakenEvents = events.filter(e => e.columnId === StatusType.WEAKEN);
    this.dmgReductionEvents = events.filter(e => e.columnId === StatusType.DMG_REDUCTION);
    this.protectionEvents = events.filter(e => e.columnId === StatusType.PROTECTION);
    this.weaponFragilityEvents = events.filter(e => e.columnId.startsWith(FRAGILITY_COLUMN_PREFIX));
    this.staggerBreaks = staggerBreaks;
    this.timeStopRegions = collectTimeStopRegions(events);
    this.loadoutStats = loadoutStats ?? {};
    this.aggregatedStats = aggregatedStats;
    this.weaponFragility = weaponFragility ?? {};
    this.talentFragility = talentFragility ?? [];
    this.scorchingHeartEvents = events.filter(e => e.columnId === StatusType.SCORCHING_HEART && e.ownerId === ENEMY_OWNER_ID);
    this.wildlandTrekkerEvents = events.filter(e => e.columnId === StatusType.WILDLAND_TREKKER);
    this.cryoInflictionEvents = events.filter(e => e.ownerId === ENEMY_OWNER_ID && e.columnId === INFLICTION_COLUMNS.CRYO);
    this.solidificationEvents = events.filter(e => e.ownerId === ENEMY_OWNER_ID && e.columnId === REACTION_COLUMNS.SOLIDIFICATION);
    this.originiumCrystalEvents = events.filter(e => e.ownerId === ENEMY_OWNER_ID && e.columnId === OPERATOR_COLUMNS.ORIGINIUM_CRYSTAL);
  }

  /** Compute game-time frames elapsed in [startFrame, endFrame), subtracting time-stop pauses. */
  private gameTimeElapsed(startFrame: number, endFrame: number): number {
    let paused = 0;
    for (const s of this.timeStopRegions) {
      const stopEnd = s.startFrame + s.durationFrames;
      if (stopEnd <= startFrame) continue;
      if (s.startFrame >= endFrame) break;
      paused += Math.min(stopEnd, endFrame) - Math.max(s.startFrame, startFrame);
    }
    return (endFrame - startFrame) - paused;
  }

  private isActive(ev: TimelineEvent, frame: number): boolean {
    return ev.startFrame <= frame && frame < ev.startFrame + ev.activationDuration;
  }

  isStaggered(frame: number): boolean {
    return this.staggerBreaks.some(b => frame >= b.startFrame && frame < b.endFrame);
  }

  getSusceptibilityBonus(frame: number, element: ElementType): number {
    let sum = 0;
    for (const ev of this.susceptibilityEvents) {
      if (this.isActive(ev, frame) && ev.susceptibility?.[element]) {
        // Susceptibility stored as percentage (e.g. 0.15 for 15%), use directly as bonus
        let bonus = ev.susceptibility[element];
        // Focus P5: after Focus active for 20s game-time on the same target, +4% susceptibility
        if (ev.name === StatusType.FOCUS && ev.sourceOwnerId) {
          const potential = this.loadoutStats[ev.sourceOwnerId]?.potential ?? 0;
          if (potential >= 5 && this.gameTimeElapsed(ev.startFrame, frame) >= FOCUS_P5_THRESHOLD_FRAMES) {
            bonus += FOCUS_P5_SUSCEPTIBILITY_BONUS;
          }
        }
        sum += bonus;
      }
    }
    return sum;
  }

  isLinkActive(frame: number): boolean {
    return this.linkEvents.some(ev => this.isActive(ev, frame));
  }

  /**
   * Get the link damage bonus at a given frame for a given skill type.
   *
   * Link bonus depends on the number of active link stacks and the skill type:
   *   Stacks | Battle Skill | Ultimate
   *     1    |    30%       |   20%
   *     2    |    45%       |   30%
   *     3    |    60%       |   40%
   *     4    |    75%       |   50%
   *
   * If the event carries a statusValue, that overrides the table lookup.
   * Returns 0 if no link is active or skill type doesn't benefit from link.
   */
  getLinkBonus(frame: number, skillType: CombatSkillType): number {
    // Link only boosts battle skills and ultimates
    if (skillType !== CombatSkillType.BATTLE_SKILL && skillType !== CombatSkillType.ULTIMATE) return 0;

    let stacks = 0;
    let explicitValue: number | undefined;
    for (const ev of this.linkEvents) {
      if (!this.isActive(ev, frame)) continue;
      stacks++;
      if (ev.statusValue != null) explicitValue = ev.statusValue;
    }

    if (stacks === 0) return 0;
    if (explicitValue != null) return explicitValue;

    const clampedStacks = Math.min(stacks, 4);
    const table = skillType === CombatSkillType.ULTIMATE ? LINK_ULTIMATE_BONUS : LINK_BATTLE_SKILL_BONUS;
    return table[clampedStacks] ?? 0;
  }

  isArtsAmpActive(frame: number): boolean {
    return this.artsAmpEvents.some(ev => this.isActive(ev, frame));
  }

  /**
   * Get the total amp bonus at a given frame.
   *
   * Amp effects stack additively. If statusValue is present on the event, use it;
   * otherwise default to 15% (most common amp source value).
   */
  getAmpBonus(frame: number): number {
    let sum = 0;
    for (const ev of this.artsAmpEvents) {
      if (!this.isActive(ev, frame)) continue;
      sum += ev.statusValue ?? DEFAULT_AMP_BONUS;
    }
    return sum;
  }

  /**
   * Get active weaken effects at a given frame.
   * Weaken reduces the target's damage output. Multiplicative stacking.
   * Returns array of individual weaken fractions (e.g. [0.10, 0.15]).
   */
  getWeakenEffects(frame: number): number[] {
    const effects: number[] = [];
    for (const ev of this.weakenEvents) {
      if (!this.isActive(ev, frame)) continue;
      if (ev.statusValue != null && ev.statusValue > 0) {
        effects.push(ev.statusValue);
      }
    }
    return effects;
  }

  /**
   * Get active damage reduction effects at a given frame.
   * DMG Reduction reduces incoming damage. Multiplicative stacking.
   * Returns array of individual reduction fractions (e.g. [0.126, 0.126]).
   */
  getDmgReductionEffects(frame: number): number[] {
    const effects: number[] = [];
    for (const ev of this.dmgReductionEvents) {
      if (!this.isActive(ev, frame)) continue;
      if (ev.statusValue != null && ev.statusValue > 0) {
        effects.push(ev.statusValue);
      }
    }
    return effects;
  }

  /**
   * Get active protection (Sanctuary) effects at a given frame.
   * Only the strongest protection effect applies.
   * Returns array of protection fractions (caller takes max).
   */
  getProtectionEffects(frame: number): number[] {
    const effects: number[] = [];
    for (const ev of this.protectionEvents) {
      if (!this.isActive(ev, frame)) continue;
      if (ev.statusValue != null && ev.statusValue > 0) {
        effects.push(ev.statusValue);
      }
    }
    return effects;
  }

  /**
   * Get the Wildland Trekker Electric DMG bonus at a given frame.
   * The event's statusValue stores the per-Intellect multiplier;
   * multiply by Arclight's Intellect from aggregated stats.
   */
  getWildlandTrekkerBonus(frame: number): number {
    for (const ev of this.wildlandTrekkerEvents) {
      if (!this.isActive(ev, frame)) continue;
      const perIntellect = ev.statusValue ?? 0;
      if (perIntellect === 0 || !ev.sourceOwnerId) continue;
      const intellect = this.aggregatedStats?.[ev.sourceOwnerId]?.stats[StatType.INTELLECT] ?? 0;
      return perIntellect * Math.floor(intellect);
    }
    return 0;
  }

  /**
   * Sum all active fragility bonuses at a given frame for a given element.
   *
   * Sources:
   * - Electrification: arts fragility (all 4 arts elements), bonus by status level
   * - Breach: physical fragility, bonus by status level
   * - Weapon debuffs: element-specific fragility from weapon skill effects
   * - Operator talents: conditional fragility (e.g. Xaihi Execute Process)
   */
  getFragilityBonus(frame: number, element: ElementType): number {
    let sum = 0;

    // Electrification → arts fragility (HEAT, ELECTRIC, CRYO, NATURE)
    if (ARTS_ELEMENTS.has(element)) {
      for (const ev of this.electrificationEvents) {
        if (!this.isActive(ev, frame)) continue;
        const statusLevel = Math.min(ev.statusLevel ?? ev.inflictionStacks ?? 1, 4);
        sum += ELECTRIFICATION_ARTS_FRAGILITY[statusLevel] ?? 0;
      }
    }

    // Breach → physical fragility
    if (element === ElementType.PHYSICAL) {
      for (const ev of this.breachEvents) {
        if (!this.isActive(ev, frame)) continue;
        const statusLevel = Math.min(ev.statusLevel ?? ev.inflictionStacks ?? 1, 4);
        sum += BREACH_PHYSICAL_FRAGILITY[statusLevel] ?? 0;
      }
    }

    // Weapon debuff fragility (e.g. Finchaser Cryo DMG Taken, Clannibal Arts DMG Taken)
    for (const ev of this.weaponFragilityEvents) {
      if (!this.isActive(ev, frame)) continue;
      const slotId = ev.columnId.slice(FRAGILITY_COLUMN_PREFIX.length);
      const effects = this.weaponFragility[slotId];
      if (!effects) continue;
      for (const eff of effects) {
        if (eff.elements.includes(element)) {
          sum += eff.bonus;
        }
      }
    }

    // Operator talent fragility (e.g. Xaihi Execute Process: Cryo DMG Taken while Cryo Infliction active)
    for (const tf of this.talentFragility) {
      if (!tf.elements.includes(element)) continue;
      // Check if the required enemy status is active at this frame
      const events = tf.requiredColumnId === INFLICTION_COLUMNS.CRYO ? this.cryoInflictionEvents
        : tf.requiredColumnId === OPERATOR_COLUMNS.ORIGINIUM_CRYSTAL ? this.originiumCrystalEvents
        : [];
      if (events.some(ev => this.isActive(ev, frame))) {
        sum += tf.bonus;
      }
    }

    return sum;
  }

  /**
   * Get the total corrosion resistance reduction (in resistance points) active at a given frame.
   *
   * Corrosion reduces ALL arts resistance on the enemy:
   *   - Starts at initial value (3.6–7.2 by level)
   *   - Ramps linearly to max (12–24 by level) over 10 seconds
   *   - Stays at max for remaining duration
   *   - Scaled by source operator's Arts Intensity: base × (1 + 2×AI / (AI+300))
   *
   * Multiple active corrosions: uses the strongest (max reduction) at the queried frame.
   */
  getCorrosionResistanceReduction(frame: number): number {
    let maxReduction = 0;

    for (const ev of this.corrosionEvents) {
      if (!this.isActive(ev, frame)) continue;

      const stacks = ev.inflictionStacks ?? 1;
      const statusLevel = Math.min(stacks, 4) as StatusLevel;
      const elapsedFrames = frame - ev.startFrame;
      const elapsedSeconds = elapsedFrames / FPS;

      // Look up source operator's Arts Intensity
      let artsIntensity = 0;
      if (ev.sourceOwnerId) {
        // Use aggregated stats if available (includes gear/weapon/consumable bonuses)
        const agg = this.aggregatedStats?.[ev.sourceOwnerId];
        if (agg) {
          artsIntensity = agg.stats[StatType.ARTS_INTENSITY] ?? 0;
        }
      }

      const reduction = getCorrosionReduction(statusLevel, elapsedSeconds, artsIntensity);
      maxReduction = Math.max(maxReduction, reduction);
    }

    return maxReduction;
  }

  /**
   * Get ignored resistance points for a given attacker at a given frame.
   *
   * Currently only Laevatain's Scorching Heart provides ignored resistance:
   * when she has 4+ active Melting Flame stacks, she ignores a portion of
   * enemy Heat Resistance (10/15/20 by talent level).
   *
   * Ignored resistance stacks additively with corrosion reduction and can
   * push the effective resistance multiplier above 1.0 (bonus damage).
   */
  /** Whether enemy has active Cryo Infliction at the given frame. */
  isCryoInflictionActive(frame: number): boolean {
    return this.cryoInflictionEvents.some(ev => this.isActive(ev, frame));
  }

  /** Whether enemy has active Solidification at the given frame. */
  isSolidificationActive(frame: number): boolean {
    return this.solidificationEvents.some(ev => this.isActive(ev, frame));
  }

  getIgnoredResistance(frame: number, element: ElementType, attackerOwnerId: string): number {
    if (element !== ElementType.HEAT) return 0;

    // Check for active Scorching Heart debuff on enemy (derived when Laevatain reaches 4 MF stacks)
    const activeSH = this.scorchingHeartEvents.find(
      (ev) => ev.sourceOwnerId === attackerOwnerId && this.isActive(ev, frame),
    );
    if (!activeSH) return 0;

    // Look up talent level from loadout stats
    const stats = this.loadoutStats[attackerOwnerId];
    const talentLevel = Math.min(stats?.talentOneLevel ?? 0, 3) as TalentLevel;
    return getScorchingHeartIgnoredResistance(talentLevel);
  }
}
