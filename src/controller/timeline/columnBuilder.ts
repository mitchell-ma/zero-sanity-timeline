import { Column, MiniTimeline, Operator, Enemy, VisibleSkills } from '../../consts/viewTypes';
import { CombatSkillsType, ELEMENT_COLORS, ElementType, TimelineSourceType } from '../../consts/enums';
import { SKILL_COLUMN_ORDER as SKILL_ORDER } from '../../model/channels';
import { SKILL_LABELS, REACTION_MICRO_COLUMNS } from '../../consts/channelLabels';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { SkillSegmentBuilder } from '../events/basicAttackController';
import {
  LAEVATAIN_BASIC_ATTACK_SEQUENCES,
  LAEVATAIN_ENHANCED_BASIC_ATTACK_SEQUENCES,
  LAEVATAIN_BATTLE_SKILL_SEQUENCE,
  LAEVATAIN_ENHANCED_BATTLE_SKILL_SEQUENCE,
  LAEVATAIN_EMPOWERED_BATTLE_SKILL_SEQUENCES,
  LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL_SEQUENCE,
  LAEVATAIN_COMBO_SKILL_SEQUENCE,
} from '../../model/event-frames/laevatainEventFrames';
import { AKEKURI_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/akekuriEventFrames';
import { ENDMINISTRATOR_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/endministratorEventFrames';
import { LIFENG_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/lifengEventFrames';
import { CHENQIANYU_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/chenQianyuEventFrames';
import { ESTELLA_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/estellaEventFrames';
import { EMBER_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/emberEventFrames';
import { SNOWSHINE_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/snowshineEventFrames';
import { CATCHER_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/catcherEventFrames';
import { GILBERTA_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/gilbertaEventFrames';
import { XAIHI_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/xaihiEventFrames';
import { PERLICA_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/perlicaEventFrames';
import { FLUORITE_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/fluoriteEventFrames';
import { LASTRITE_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/lastRiteEventFrames';
import { YVONNE_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/yvonneEventFrames';
import { AVYWENNA_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/avywennaEventFrames';
import { DAPAN_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/daPanEventFrames';
import { POGRANICHNK_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/pogranichnikEventFrames';
import { ALESH_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/aleshEventFrames';
import { ARCLIGHT_BASIC_ATTACK_SEQUENCES } from '../../model/event-frames/arclightEventFrames';
import { SkillEventSequence } from '../../model/event-frames/skillEventSequence';

/** Map operator IDs to their basic attack frame sequences. */
const BASIC_ATTACK_FRAME_SEQUENCES: Record<string, readonly SkillEventSequence[]> = {
  akekuri: AKEKURI_BASIC_ATTACK_SEQUENCES,
  endministrator: ENDMINISTRATOR_BASIC_ATTACK_SEQUENCES,
  lifeng: LIFENG_BASIC_ATTACK_SEQUENCES,
  chenQianyu: CHENQIANYU_BASIC_ATTACK_SEQUENCES,
  estella: ESTELLA_BASIC_ATTACK_SEQUENCES,
  ember: EMBER_BASIC_ATTACK_SEQUENCES,
  snowshine: SNOWSHINE_BASIC_ATTACK_SEQUENCES,
  catcher: CATCHER_BASIC_ATTACK_SEQUENCES,
  gilberta: GILBERTA_BASIC_ATTACK_SEQUENCES,
  xaihi: XAIHI_BASIC_ATTACK_SEQUENCES,
  perlica: PERLICA_BASIC_ATTACK_SEQUENCES,
  fluorite: FLUORITE_BASIC_ATTACK_SEQUENCES,
  lastRite: LASTRITE_BASIC_ATTACK_SEQUENCES,
  yvonne: YVONNE_BASIC_ATTACK_SEQUENCES,
  avywenna: AVYWENNA_BASIC_ATTACK_SEQUENCES,
  daPan: DAPAN_BASIC_ATTACK_SEQUENCES,
  pogranichnik: POGRANICHNK_BASIC_ATTACK_SEQUENCES,
  alesh: ALESH_BASIC_ATTACK_SEQUENCES,
  arclight: ARCLIGHT_BASIC_ATTACK_SEQUENCES,
};

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
            const base = SkillSegmentBuilder.buildSegments(LAEVATAIN_BASIC_ATTACK_SEQUENCES);
            const enhanced = SkillSegmentBuilder.buildSegments(LAEVATAIN_ENHANCED_BASIC_ATTACK_SEQUENCES);
            col.defaultEvent = {
              name: CombatSkillsType.FLAMING_CINDERS,
              defaultActivationDuration: base.totalDurationFrames,
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
              segments: base.segments,
            };
            col.eventVariants = [
              {
                name: CombatSkillsType.FLAMING_CINDERS,
                defaultActivationDuration: base.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: base.segments,
              },
              {
                name: CombatSkillsType.FLAMING_CINDERS_ENHANCED,
                defaultActivationDuration: enhanced.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: enhanced.segments,
                triggerCondition: 'Requires: Twilight active',
              },
            ];
          }
          // Laevatain battle skill: 4 variants with frame data from skills.json
          if (isLaevatain && skillType === 'battle') {
            const baseSeg = SkillSegmentBuilder.buildSegments([LAEVATAIN_BATTLE_SKILL_SEQUENCE], { labels: ['Explosion'] });
            const enhSeg = SkillSegmentBuilder.buildSegments([LAEVATAIN_ENHANCED_BATTLE_SKILL_SEQUENCE]);
            const empSeg = SkillSegmentBuilder.buildSegments(LAEVATAIN_EMPOWERED_BATTLE_SKILL_SEQUENCES, { labels: ['Explosion', 'Additional Attack'] });
            const enhEmpSeg = SkillSegmentBuilder.buildSegments([LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL_SEQUENCE]);
            col.defaultEvent = {
              name: CombatSkillsType.SMOULDERING_FIRE,
              defaultActivationDuration: baseSeg.totalDurationFrames,
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
              segments: baseSeg.segments,
            };
            col.eventVariants = [
              {
                name: CombatSkillsType.SMOULDERING_FIRE,
                defaultActivationDuration: baseSeg.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: baseSeg.segments,
              },
              {
                name: CombatSkillsType.SMOULDERING_FIRE_ENHANCED,
                defaultActivationDuration: enhSeg.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: enhSeg.segments,
                triggerCondition: 'Requires: Twilight active',
              },
              {
                name: CombatSkillsType.SMOULDERING_FIRE_EMPOWERED,
                defaultActivationDuration: empSeg.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: empSeg.segments,
                triggerCondition: 'Requires: Melting Flame ×4',
              },
              {
                name: CombatSkillsType.SMOULDERING_FIRE_ENHANCED_EMPOWERED,
                defaultActivationDuration: enhEmpSeg.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: enhEmpSeg.segments,
                triggerCondition: 'Requires: Twilight active + Melting Flame ×4',
              },
            ];
          }
          // Laevatain combo skill: single-sequence event with frame data
          if (isLaevatain && skillType === 'combo') {
            const comboSeg = SkillSegmentBuilder.buildSegments([LAEVATAIN_COMBO_SKILL_SEQUENCE]);
            col.defaultEvent = {
              ...col.defaultEvent!,
              defaultActivationDuration: comboSeg.totalDurationFrames,
              segments: comboSeg.segments,
            };
          }
          // Generic basic attack: map-based lookup for operators with frame data
          const basicSeqs = op && BASIC_ATTACK_FRAME_SEQUENCES[op.id];
          if (basicSeqs && skillType === 'basic') {
            const base = SkillSegmentBuilder.buildSegments(basicSeqs);
            col.defaultEvent = {
              name: skill.name,
              defaultActivationDuration: base.totalDurationFrames,
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
              segments: base.segments,
            };
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
    derived: true,
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
    derived: true,
  });

  return columns;
}
