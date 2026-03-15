import { CombatSkillsType, ElementType, ELEMENT_COLORS, ELEMENT_LABELS, StatusType } from '../../consts/enums';
import { TimelineEvent, Operator, Enemy, SkillType } from '../../consts/viewTypes';
import {
  REACTION_LABELS, COMBAT_SKILL_LABELS, STATUS_LABELS,
  INFLICTION_EVENT_LABELS, PHYSICAL_INFLICTION_LABELS, PHYSICAL_STATUS_LABELS,
} from '../../consts/timelineColumnLabels';
import { interactionToLabel } from '../../consts/semantics';
import { COMBO_WINDOW_COLUMN_ID } from '../timeline/processInteractions';
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, REACTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, FRAGILITY_COLUMN_PREFIX, SKILL_COLUMNS, INFLICTION_COLUMN_IDS, PHYSICAL_INFLICTION_COLUMN_IDS } from '../../model/channels';
import { computeSpReturnSummary, SpReturnSummary } from '../calculation/frameCalculator';
import { ELECTRIFICATION_ARTS_FRAGILITY, BREACH_PHYSICAL_FRAGILITY, DEFAULT_AMP_BONUS } from '../calculation/statusQueryService';

// ── Event Identity ──────────────────────────────────────────────────────────

export interface EventIdentity {
  ownerName: string;
  skillName: string;
  ownerColor: string;
  columnLabel: string;
  triggerCondition: string | null;
  comboTriggerLabels: string[];
  comboRequiresLabels: string[];
  sourceName: string;
  sourceColor: string;
  sourceSkillLabel: string;
}

export function resolveEventIdentity(
  event: TimelineEvent,
  slots: { slotId: string; operator: Operator | null }[],
  enemy: Enemy,
): EventIdentity {
  let ownerName = '';
  let skillName = '';
  let ownerColor = '#4488ff';
  let triggerCondition: string | null = null;
  let comboTriggerLabels: string[] = [];
  let comboRequiresLabels: string[] = [];
  let columnLabel = '';

  if (event.ownerId === ENEMY_OWNER_ID) {
    ownerName = enemy.name;
    const status = enemy.statuses.find((s) => s.id === event.columnId);
    const reaction = REACTION_LABELS[event.columnId];
    const physInfliction = PHYSICAL_INFLICTION_LABELS[event.columnId];
    const physStatus = PHYSICAL_STATUS_LABELS[event.columnId];
    if (status) {
      skillName = status.label;
      ownerColor = status.color;
      columnLabel = 'INFLICTION';
    } else if (reaction) {
      skillName = reaction.label;
      ownerColor = reaction.color;
      columnLabel = 'ARTS REACTION';
    } else if (physInfliction) {
      skillName = physInfliction.label;
      ownerColor = physInfliction.color;
      columnLabel = 'PHYSICAL INFLICTION';
    } else if (physStatus) {
      skillName = physStatus.label;
      ownerColor = physStatus.color;
      columnLabel = 'PHYSICAL STATUS';
    } else {
      skillName = STATUS_LABELS[event.columnId as StatusType] ?? event.columnId;
      ownerColor = '#cc3333';
      columnLabel = 'STATUS';
    }
  } else {
    const slot = slots.find((s) => s.slotId === event.ownerId);
    const op = slot?.operator;
    if (op) {
      ownerName = op.name;
      ownerColor = op.color;
      if (event.columnId === OPERATOR_COLUMNS.DASH) {
        skillName = 'Dash';
        columnLabel = 'DASH';
      } else if (event.columnId === OPERATOR_COLUMNS.MELTING_FLAME) {
        skillName = STATUS_LABELS[StatusType.MELTING_FLAME];
        ownerColor = '#f07030';
        columnLabel = 'STATUS';
      } else if (event.columnId === COMBO_WINDOW_COLUMN_ID) {
        skillName = 'Combo Activation Window';
        columnLabel = 'ACTIVATION WINDOW';
      } else {
        const skillType = event.columnId as SkillType;
        const skill = op.skills[skillType];
        if (skill) {
          skillName = skill.name;
          triggerCondition = skill.triggerCondition;
          columnLabel = event.columnId.charAt(0).toUpperCase() + event.columnId.slice(1) + ' skill';
        }
        if (event.columnId === SKILL_COLUMNS.COMBO && op.triggerCapability) {
          comboTriggerLabels = op.triggerCapability.comboRequires.map(
            (i) => interactionToLabel(i),
          );
          if (op.triggerCapability.comboRequiresActiveColumns) {
            comboRequiresLabels = op.triggerCapability.comboRequiresActiveColumns.map(
              (col) => STATUS_LABELS[col as StatusType] ?? col,
            );
          }
        }
      }
    }
  }

  // Resolve source operator for derived events
  let sourceName = '';
  let sourceColor = '';
  let sourceSkillLabel = '';
  if (event.sourceOwnerId) {
    const sourceSlot = slots.find((s) => s.slotId === event.sourceOwnerId);
    if (sourceSlot?.operator) {
      sourceName = sourceSlot.operator.name;
      sourceColor = sourceSlot.operator.color;
    }
    if (event.sourceSkillName) {
      sourceSkillLabel = COMBAT_SKILL_LABELS[event.sourceSkillName as CombatSkillsType]
        ?? STATUS_LABELS[event.sourceSkillName as StatusType]
        ?? event.sourceSkillName;
    }
  }

  // Override skill name with combat label if available
  const combatLabel = COMBAT_SKILL_LABELS[event.name as CombatSkillsType];
  if (combatLabel) {
    skillName = combatLabel;
  } else if (INFLICTION_EVENT_LABELS[event.name]) {
    skillName = INFLICTION_EVENT_LABELS[event.name];
  } else if (STATUS_LABELS[event.name as StatusType]) {
    skillName = STATUS_LABELS[event.name as StatusType];
  } else if (event.name && event.name !== event.columnId) {
    skillName = event.name;
  }

  return {
    ownerName,
    skillName,
    ownerColor,
    columnLabel,
    triggerCondition,
    comboTriggerLabels,
    comboRequiresLabels,
    sourceName,
    sourceColor,
    sourceSkillLabel,
  };
}

// ── Combo Chain ─────────────────────────────────────────────────────────────

export interface ComboChainLink {
  label: string;
  color: string;
  sublabel?: string;
}

/** Map infliction/physical column IDs to element colors. */
const INFLICTION_COLUMN_COLORS: Record<string, string> = {
  heatInfliction:       ELEMENT_COLORS[ElementType.HEAT],
  cryoInfliction:       ELEMENT_COLORS[ElementType.CRYO],
  natureInfliction:     ELEMENT_COLORS[ElementType.NATURE],
  electricInfliction:   ELEMENT_COLORS[ElementType.ELECTRIC],
  vulnerableInfliction: '#c0c8d0',
  breach:               '#c0c8d0',
};

/**
 * For a combo skill event, trace the full trigger chain back to the original
 * operator action. Returns a list of chain links from source to combo, or
 * null if no chain can be resolved.
 */
export function resolveComboChain(
  event: TimelineEvent,
  allProcessedEvents: readonly TimelineEvent[],
  slots: { slotId: string; operator: Operator | null }[],
): ComboChainLink[] | null {
  if (event.columnId !== SKILL_COLUMNS.COMBO) return null;

  // Find the combo activation window that contains this combo event
  const window = allProcessedEvents.find((e) =>
    e.columnId === COMBO_WINDOW_COLUMN_ID &&
    e.ownerId === event.ownerId &&
    event.startFrame >= e.startFrame &&
    event.startFrame < e.startFrame + e.activationDuration,
  );
  if (!window?.sourceOwnerId) return null;

  const chain: ComboChainLink[] = [];
  const triggerCol = event.comboTriggerColumnId ?? window.comboTriggerColumnId;
  const sourceSlot = slots.find((s) => s.slotId === window.sourceOwnerId);
  const sourceOp = sourceSlot?.operator;
  if (!sourceOp) return null;

  // Is the trigger an enemy column (infliction/status)? If so, trace back to
  // the specific enemy event to find the original operator skill.
  const isEnemyTrigger = triggerCol && (
    INFLICTION_COLUMN_IDS.has(triggerCol) ||
    PHYSICAL_INFLICTION_COLUMN_IDS.has(triggerCol) ||
    triggerCol === 'breach'
  );

  if (isEnemyTrigger) {
    // Find the enemy infliction/status event closest before the combo that
    // came from the same source operator — it has the original skill name.
    let bestMatch: TimelineEvent | undefined;
    for (const e of allProcessedEvents) {
      if (e.ownerId !== ENEMY_OWNER_ID) continue;
      if (e.columnId !== triggerCol) continue;
      if (e.sourceOwnerId !== window.sourceOwnerId) continue;
      if (e.startFrame > event.startFrame) continue;
      if (!bestMatch || e.startFrame > bestMatch.startFrame) bestMatch = e;
    }

    const originalSkillLabel = bestMatch?.sourceSkillName
      ? (COMBAT_SKILL_LABELS[bestMatch.sourceSkillName as CombatSkillsType]
        ?? STATUS_LABELS[bestMatch.sourceSkillName as StatusType]
        ?? bestMatch.sourceSkillName)
      : undefined;

    // Link 1: Source operator + original skill
    chain.push({
      label: sourceOp.name,
      color: sourceOp.color,
      sublabel: originalSkillLabel,
    });

    // Link 2: Intermediary infliction/status on enemy
    const inflLabel = INFLICTION_EVENT_LABELS[triggerCol]
      ?? PHYSICAL_INFLICTION_LABELS[triggerCol]?.label
      ?? PHYSICAL_STATUS_LABELS[triggerCol]?.label
      ?? triggerCol;
    chain.push({
      label: inflLabel,
      color: INFLICTION_COLUMN_COLORS[triggerCol] ?? 'var(--text-muted)',
      sublabel: 'on enemy',
    });
  } else {
    // Direct operator trigger (e.g. FINAL_STRIKE from basic attack)
    const skillLabel = window.sourceSkillName
      ? (COMBAT_SKILL_LABELS[window.sourceSkillName as CombatSkillsType]
        ?? STATUS_LABELS[window.sourceSkillName as StatusType]
        ?? window.sourceSkillName)
      : undefined;

    chain.push({
      label: sourceOp.name,
      color: sourceOp.color,
      sublabel: skillLabel,
    });
  }

  return chain.length > 0 ? chain : null;
}

// ── SP Return Display ───────────────────────────────────────────────────────

export interface SpReturnDisplay {
  summary: SpReturnSummary;
  spNotes: string[];
}

export function resolveSpReturn(
  event: TimelineEvent,
  slots: { slotId: string; operator: Operator | null }[],
  consumptionRecord?: { naturalConsumed: number; returnedConsumed: number },
): SpReturnDisplay | null {
  if (event.skillPointCost == null) return null;

  const summary = computeSpReturnSummary(event, consumptionRecord);
  const slot = slots.find((s) => s.slotId === event.ownerId);
  const spNotes = slot?.operator?.skills.battle.spReturnNotes ?? [];

  return { summary, spNotes };
}

// ── Active Damage Modifiers ─────────────────────────────────────────────────

export interface ActiveModifier {
  label: string;
  color: string;
  /** Formatted value string (e.g. "+15%", "x1.30") */
  formattedValue: string;
  source: string;
}

/** Column IDs for status effects that are damage modifiers on the enemy. */
const SUSCEPTIBILITY_COLUMNS = new Set<string>([StatusType.SUSCEPTIBILITY, StatusType.FOCUS]);
function isActiveAt(ev: TimelineEvent, frame: number): boolean {
  return ev.startFrame <= frame && frame < ev.startFrame + ev.activationDuration;
}

/**
 * Finds active enemy damage modifiers at the given frame range.
 * Returns modifiers like susceptibility, fragility, weaken, etc. that would
 * affect damage dealt by an operator event at this time.
 */
export function resolveActiveModifiers(
  eventStartFrame: number,
  eventEndFrame: number,
  allProcessedEvents: readonly TimelineEvent[],
): ActiveModifier[] {
  const modifiers: ActiveModifier[] = [];
  const midFrame = Math.floor((eventStartFrame + eventEndFrame) / 2);

  for (const ev of allProcessedEvents) {
    if (ev.ownerId !== ENEMY_OWNER_ID) continue;
    if (!isActiveAt(ev, midFrame)) continue;

    // Susceptibility / Focus
    if (SUSCEPTIBILITY_COLUMNS.has(ev.columnId) && ev.susceptibility) {
      for (const [element, value] of Object.entries(ev.susceptibility)) {
        const elType = element as ElementType;
        const color = ELEMENT_COLORS[elType] ?? '#aaa';
        const label = ELEMENT_LABELS[elType] ?? element;
        modifiers.push({
          label: `${STATUS_LABELS[ev.name as StatusType] ?? ev.name} (${label})`,
          color,
          formattedValue: `+${Math.round(value * 100)}%`,
          source: 'Susceptibility',
        });
      }
    }

    // Electrification fragility
    if (ev.columnId === REACTION_COLUMNS.ELECTRIFICATION) {
      const level = Math.min(ev.statusLevel ?? ev.inflictionStacks ?? 1, 4);
      const bonus = ELECTRIFICATION_ARTS_FRAGILITY[level] ?? 0;
      modifiers.push({
        label: `Electrification Lv.${level}`,
        color: ELEMENT_COLORS[ElementType.ELECTRIC],
        formattedValue: `+${Math.round(bonus * 100)}% Arts DMG Taken`,
        source: 'Fragility',
      });
    }

    // Breach fragility
    if (ev.columnId === PHYSICAL_STATUS_COLUMNS.BREACH) {
      const level = Math.min(ev.statusLevel ?? ev.inflictionStacks ?? 1, 4);
      const bonus = BREACH_PHYSICAL_FRAGILITY[level] ?? 0;
      modifiers.push({
        label: `Breach Lv.${level}`,
        color: ELEMENT_COLORS[ElementType.PHYSICAL],
        formattedValue: `+${Math.round(bonus * 100)}% Physical DMG Taken`,
        source: 'Fragility',
      });
    }

    // Corrosion
    if (ev.columnId === REACTION_COLUMNS.CORROSION) {
      modifiers.push({
        label: 'Corrosion',
        color: ELEMENT_COLORS[ElementType.NATURE],
        formattedValue: 'Resistance reduction',
        source: 'Resistance',
      });
    }

    // Weapon fragility
    if (ev.columnId.startsWith(FRAGILITY_COLUMN_PREFIX)) {
      modifiers.push({
        label: STATUS_LABELS[ev.name as StatusType] ?? ev.name,
        color: '#dd8844',
        formattedValue: ev.statusValue ? `+${Math.round(ev.statusValue * 100)}%` : 'Active',
        source: 'Fragility',
      });
    }
  }

  // Team-wide modifiers (weaken, amp, etc.)
  for (const ev of allProcessedEvents) {
    if (!isActiveAt(ev, midFrame)) continue;

    if (ev.columnId === StatusType.ARTS_AMP) {
      const bonus = ev.statusValue ?? DEFAULT_AMP_BONUS;
      modifiers.push({
        label: 'Arts Amp',
        color: '#aa66dd',
        formattedValue: `+${Math.round(bonus * 100)}%`,
        source: 'Amp',
      });
    }

    if (ev.columnId === StatusType.WEAKEN) {
      const val = ev.statusValue ?? 0;
      modifiers.push({
        label: 'Weaken',
        color: '#cc6666',
        formattedValue: val > 0 ? `-${Math.round(val * 100)}% DMG` : 'Active',
        source: 'Weaken',
      });
    }
  }

  return modifiers;
}
