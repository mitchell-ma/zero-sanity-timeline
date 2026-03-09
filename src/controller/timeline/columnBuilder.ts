import { Column, MiniTimeline, Operator, Enemy, VisibleSkills } from '../../consts/viewTypes';
import { ELEMENT_COLORS, ElementType, TimelineSourceType } from '../../consts/enums';
import { SKILL_COLUMN_ORDER as SKILL_ORDER } from '../../model/channels';
import { SKILL_LABELS, REACTION_MICRO_COLUMNS } from '../../consts/channelLabels';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { BasicAttackController } from '../events/basicAttackController';
import {
  LAEVATAIN_BASIC_ATTACK_SEQUENCES,
  LAEVATAIN_ENHANCED_BASIC_ATTACK_SEQUENCES,
} from '../../model/event-frames/laevatainEventFrames';
import skillsData from '../../model/game-data/skills.json';

export interface Slot {
  slotId: string;
  operator: Operator | null;
}

const MF_MICRO_COLS = 4;
const MIN_SLOT_COLS = 4;

/** Build the full ordered list of timeline columns from app state. */
export function buildColumns(
  slots: Slot[],
  enemy: Enemy,
  visibleSkills: VisibleSkills,
): Column[] {
  const columns: Column[] = [];

  // Common (global) columns — before operator slots
  columns.push({
    key: `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`,
    type: 'mini-timeline',
    source: TimelineSourceType.COMMON,
    ownerId: COMMON_OWNER_ID,
    columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
    label: 'SKILL POINTS',
    color: '#ccaa33',
    headerVariant: 'skill',
    noAdd: true,
  });
  columns.push({
    key: `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.TEAM_STATUS}`,
    type: 'mini-timeline',
    source: TimelineSourceType.COMMON,
    ownerId: COMMON_OWNER_ID,
    columnId: COMMON_COLUMN_IDS.TEAM_STATUS,
    label: 'TEAM STATUS',
    color: '#66aa88',
    headerVariant: 'skill',
    noAdd: true,
  });

  for (const slot of slots) {
    const op = slot.operator;
    const isLaevatain = op?.id === 'laevatain';
    let slotHasCols = false;
    if (op) {
      for (const skillType of SKILL_ORDER) {
        if (visibleSkills[slot.slotId]?.[skillType]) {
          const skill = op.skills[skillType];
          const col: MiniTimeline = {
            key: `${slot.slotId}-${skillType}`,
            type: 'mini-timeline',
            source: TimelineSourceType.OPERATOR,
            ownerId: slot.slotId,
            columnId: skillType,
            label: SKILL_LABELS[skillType],
            color: op.color,
            headerVariant: 'skill',
            defaultEvent: {
              name: skill.name,
              defaultActivationDuration: skill.defaultActivationDuration,
              defaultActiveDuration: skill.defaultActiveDuration,
              defaultCooldownDuration: skill.defaultCooldownDuration,
              triggerCondition: skill.triggerCondition,
            },
          };
          // Laevatain basic attack: multi-sequence event with frame markers
          if (isLaevatain && skillType === 'basic') {
            const base = BasicAttackController.buildSegments(LAEVATAIN_BASIC_ATTACK_SEQUENCES);
            const enhanced = BasicAttackController.buildSegments(LAEVATAIN_ENHANCED_BASIC_ATTACK_SEQUENCES);
            col.defaultEvent = {
              name: 'Flaming Cinders',
              defaultActivationDuration: base.totalDurationFrames,
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
              segments: base.segments,
            };
            col.eventVariants = [
              {
                name: 'Flaming Cinders',
                defaultActivationDuration: base.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: base.segments,
              },
              {
                name: 'Flaming Cinders (Enhanced)',
                defaultActivationDuration: enhanced.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: enhanced.segments,
                triggerCondition: 'Requires: Twilight active',
              },
            ];
          }
          // Laevatain battle skill: 4 variants (base, enhanced, empowered, enhanced+empowered)
          if (isLaevatain && skillType === 'battle') {
            const LAEV_SKILLS = skillsData.operators.LAEVATAIN;
            const baseDur = LAEV_SKILLS.BATTLE_SKILL.LAEVATAIN_BATTLE_SKILL.LAEVATAIN_BATTLE_SKILL_DURATION;
            const enhDur = LAEV_SKILLS.ENHANCED_BATTLE_SKILL.LAEVATAIN_ENHANCED_BATTLE_SKILL.LAEVATAIN_ENHANCED_BATTLE_SKILL_DURATION;
            const empDur = LAEV_SKILLS.EMPOWERED_BATTLE_SKILL.LAEVATAIN_EMPOWERED_BATTLE_SKILL.LAEVATAIN_EMPOWERED_BATTLE_SKILL_DURATION;
            const enhEmpDur = LAEV_SKILLS.ENHANCED_EMPOWERED_BATTLE_SKILL.LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL.LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL_DURATION;
            const toFrames = (s: number) => Math.round(s * 120);
            col.eventVariants = [
              {
                name: 'Smouldering Fire',
                defaultActivationDuration: toFrames(baseDur),
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
              },
              {
                name: 'Smouldering Fire (Enhanced)',
                defaultActivationDuration: toFrames(enhDur),
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                triggerCondition: 'Requires: Twilight active',
              },
              {
                name: 'Smouldering Fire (Empowered)',
                defaultActivationDuration: toFrames(empDur),
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                triggerCondition: 'Requires: Melting Flame ×4',
              },
              {
                name: 'Smouldering Fire (Enhanced + Empowered)',
                defaultActivationDuration: toFrames(enhEmpDur),
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                triggerCondition: 'Requires: Twilight active + Melting Flame ×4',
              },
            ];
          }
          columns.push(col);
          slotHasCols = true;
        }
      }
    }
    // Add single MeltingFlame subtimeline column for Laevatain
    if (isLaevatain) {
      columns.push({
        key: `${slot.slotId}-melting-flame`,
        type: 'mini-timeline',
        source: TimelineSourceType.OPERATOR,
        ownerId: slot.slotId,
        columnId: 'melting-flame',
        label: 'Melting Flames',
        color: op!.color,
        headerVariant: 'mf',
        microColumns: Array.from({ length: MF_MICRO_COLS }, (_, i) => ({
          id: `mf-${i}`,
          label: String(i + 1),
          color: ELEMENT_COLORS[ElementType.HEAT],
        })),
        microColumnAssignment: 'by-order',
        maxEvents: MF_MICRO_COLS,
        requiresMonotonicOrder: true,
        derived: true,
        defaultEvent: {
          name: 'Melting Flame',
          defaultActivationDuration: TOTAL_FRAMES * 10,
          defaultActiveDuration: 0,
          defaultCooldownDuration: 0,
        },
      });
    }
    // Every slot gets at least MIN_SLOT_COLS columns so the loadout row stays visible
    const skillColCount = slotHasCols
      ? SKILL_ORDER.filter((st) => visibleSkills[slot.slotId]?.[st]).length
      : 0;
    const mfColCount = isLaevatain ? 1 : 0;
    const needed = MIN_SLOT_COLS - (skillColCount + mfColCount);
    for (let p = 0; p < Math.max(0, needed); p++) {
      columns.push({
        key: `${slot.slotId}-placeholder${p}`,
        type: 'placeholder',
        ownerId: slot.slotId,
        color: op?.color ?? '#666',
      });
    }
  }

  // Single arts infliction mini-timeline for the enemy (stacking like MF)
  const inflictionStatuses = enemy.statuses;
  const inflictionColumnIds = inflictionStatuses.map((s) => s.id);
  columns.push({
    key: 'enemy-arts-infliction',
    type: 'mini-timeline',
    source: TimelineSourceType.ENEMY,
    ownerId: 'enemy',
    columnId: 'arts-infliction',
    label: 'INFLICTION',
    color: '#cc3333',
    headerVariant: 'infliction',
    microColumns: inflictionStatuses.map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color,
    })),
    microColumnAssignment: 'by-order',
    matchColumnIds: inflictionColumnIds,
    reuseExpiredSlots: true,
    defaultEvent: {
      name: 'Infliction',
      defaultActivationDuration: 2400, // 20 seconds at 120fps
      defaultActiveDuration: 0,
      defaultCooldownDuration: 0,
    },
  });

  // Arts reaction mini-timeline for the enemy
  columns.push({
    key: 'enemy-arts-reaction',
    type: 'mini-timeline',
    source: TimelineSourceType.ENEMY,
    ownerId: 'enemy',
    columnId: 'arts-reaction',
    label: 'ARTS REACTION',
    color: '#dd6644',
    headerVariant: 'infliction',
    microColumns: REACTION_MICRO_COLUMNS,
    microColumnAssignment: 'dynamic-split',
    matchColumnIds: REACTION_MICRO_COLUMNS.map((mc) => mc.id),
  });

  return columns;
}
