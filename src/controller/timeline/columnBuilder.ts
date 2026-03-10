import { Column, MiniTimeline, Operator, Enemy, VisibleSkills } from '../../consts/viewTypes';
import { CombatSkillsType, ELEMENT_COLORS, ElementType, StatusType, TimelineSourceType, TriggerConditionType } from '../../consts/enums';
import { SKILL_COLUMN_ORDER as SKILL_ORDER } from '../../model/channels';
import { SKILL_LABELS, ColumnLabel, STATUS_LABELS, REACTION_MICRO_COLUMNS, PHYSICAL_INFLICTION_MICRO_COLUMNS, PHYSICAL_STATUS_MICRO_COLUMNS } from '../../consts/channelLabels';
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
import { AKEKURI_BASIC_ATTACK_SEQUENCES, AKEKURI_BATTLE_SKILL_SEQUENCE, AKEKURI_COMBO_SKILL_SEQUENCE, AKEKURI_ULTIMATE_SEQUENCE } from '../../model/event-frames/akekuriEventFrames';
import { ENDMINISTRATOR_BASIC_ATTACK_SEQUENCES, ENDMINISTRATOR_BATTLE_SKILL_SEQUENCE, ENDMINISTRATOR_COMBO_SKILL_SEQUENCE, ENDMINISTRATOR_ULTIMATE_SEQUENCE } from '../../model/event-frames/endministratorEventFrames';
import { LIFENG_BASIC_ATTACK_SEQUENCES, LIFENG_BATTLE_SKILL_SEQUENCE, LIFENG_COMBO_SKILL_SEQUENCE, LIFENG_ULTIMATE_SEQUENCE, LIFENG_VAJRA_IMPACT_SEQUENCE } from '../../model/event-frames/lifengEventFrames';
import { CHENQIANYU_BASIC_ATTACK_SEQUENCES, CHENQIANYU_BATTLE_SKILL_SEQUENCE, CHENQIANYU_COMBO_SKILL_SEQUENCE, CHENQIANYU_ULTIMATE_SEQUENCE } from '../../model/event-frames/chenQianyuEventFrames';
import { ESTELLA_BASIC_ATTACK_SEQUENCES, ESTELLA_BATTLE_SKILL_SEQUENCE, ESTELLA_COMBO_SKILL_SEQUENCE, ESTELLA_ULTIMATE_SEQUENCE } from '../../model/event-frames/estellaEventFrames';
import { EMBER_BASIC_ATTACK_SEQUENCES, EMBER_BATTLE_SKILL_SEQUENCE, EMBER_COMBO_SKILL_SEQUENCE, EMBER_ULTIMATE_SEQUENCE } from '../../model/event-frames/emberEventFrames';
import { SNOWSHINE_BASIC_ATTACK_SEQUENCES, SNOWSHINE_BATTLE_SKILL_SEQUENCE, SNOWSHINE_COMBO_SKILL_SEQUENCE, SNOWSHINE_ULTIMATE_SEQUENCE } from '../../model/event-frames/snowshineEventFrames';
import { CATCHER_BASIC_ATTACK_SEQUENCES, CATCHER_BATTLE_SKILL_SEQUENCE, CATCHER_COMBO_SKILL_SEQUENCE, CATCHER_ULTIMATE_SEQUENCE } from '../../model/event-frames/catcherEventFrames';
import { GILBERTA_BASIC_ATTACK_SEQUENCES, GILBERTA_BATTLE_SKILL_SEQUENCE, GILBERTA_COMBO_SKILL_SEQUENCE, GILBERTA_ULTIMATE_SEQUENCE } from '../../model/event-frames/gilbertaEventFrames';
import { XAIHI_BASIC_ATTACK_SEQUENCES, XAIHI_BATTLE_SKILL_SEQUENCE, XAIHI_COMBO_SKILL_SEQUENCE } from '../../model/event-frames/xaihiEventFrames';
import { PERLICA_BASIC_ATTACK_SEQUENCES, PERLICA_BATTLE_SKILL_SEQUENCE, PERLICA_COMBO_SKILL_SEQUENCE, PERLICA_ULTIMATE_SEQUENCE } from '../../model/event-frames/perlicaEventFrames';
import { FLUORITE_BASIC_ATTACK_SEQUENCES, FLUORITE_BATTLE_SKILL_SEQUENCE, FLUORITE_COMBO_SKILL_SEQUENCE, FLUORITE_ULTIMATE_SEQUENCE } from '../../model/event-frames/fluoriteEventFrames';
import { LASTRITE_BASIC_ATTACK_SEQUENCES, LASTRITE_BATTLE_SKILL_SEQUENCE, LASTRITE_COMBO_SKILL_SEQUENCE, LASTRITE_ULTIMATE_SEQUENCE } from '../../model/event-frames/lastRiteEventFrames';
import { YVONNE_BASIC_ATTACK_SEQUENCES, YVONNE_BATTLE_SKILL_SEQUENCE, YVONNE_COMBO_SKILL_SEQUENCE } from '../../model/event-frames/yvonneEventFrames';
import { AVYWENNA_BASIC_ATTACK_SEQUENCES, AVYWENNA_BATTLE_SKILL_SEQUENCE, AVYWENNA_COMBO_SKILL_SEQUENCE, AVYWENNA_ULTIMATE_SEQUENCE } from '../../model/event-frames/avywennaEventFrames';
import { DAPAN_BASIC_ATTACK_SEQUENCES, DAPAN_BATTLE_SKILL_SEQUENCE, DAPAN_COMBO_SKILL_SEQUENCE, DAPAN_ULTIMATE_SEQUENCE } from '../../model/event-frames/daPanEventFrames';
import { POGRANICHNK_BASIC_ATTACK_SEQUENCES, POGRANICHNK_BATTLE_SKILL_SEQUENCE, POGRANICHNK_COMBO_SKILL_SEQUENCE, POGRANICHNK_ULTIMATE_SEQUENCE } from '../../model/event-frames/pogranichnikEventFrames';
import { ALESH_BASIC_ATTACK_SEQUENCES, ALESH_BATTLE_SKILL_SEQUENCE, ALESH_COMBO_SKILL_SEQUENCE, ALESH_ULTIMATE_SEQUENCE } from '../../model/event-frames/aleshEventFrames';
import { ARCLIGHT_BASIC_ATTACK_SEQUENCES, ARCLIGHT_BATTLE_SKILL_SEQUENCE, ARCLIGHT_COMBO_SKILL_SEQUENCE, ARCLIGHT_ULTIMATE_SEQUENCE, ARCLIGHT_EXPLOSION_SEQUENCE } from '../../model/event-frames/arclightEventFrames';
import { ARDELIA_BASIC_ATTACK_SEQUENCES, ARDELIA_BATTLE_SKILL_SEQUENCE, ARDELIA_COMBO_SKILL_SEQUENCE, ARDELIA_COMBO_SKILL_EXPLOSION_SEQUENCE, ARDELIA_ULTIMATE_SEQUENCE } from '../../model/event-frames/ardeliaEventFrames';
import { ANTAL_BASIC_ATTACK_SEQUENCES, ANTAL_BATTLE_SKILL_SEQUENCE, ANTAL_COMBO_SKILL_SEQUENCE } from '../../model/event-frames/antalEventFrames';
import { WULFGARD_BASIC_ATTACK_SEQUENCES, WULFGARD_BATTLE_SKILL_SEQUENCE, WULFGARD_COMBO_SKILL_SEQUENCE, WULFGARD_ULTIMATE_SEQUENCE } from '../../model/event-frames/wulfgardEventFrames';
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
  ardelia: ARDELIA_BASIC_ATTACK_SEQUENCES,
  antal: ANTAL_BASIC_ATTACK_SEQUENCES,
  wulfgard: WULFGARD_BASIC_ATTACK_SEQUENCES,
};

/** Map operator IDs to their battle skill frame sequence. */
const BATTLE_SKILL_FRAME_SEQUENCES: Record<string, SkillEventSequence> = {
  akekuri: AKEKURI_BATTLE_SKILL_SEQUENCE,
  endministrator: ENDMINISTRATOR_BATTLE_SKILL_SEQUENCE,
  lifeng: LIFENG_BATTLE_SKILL_SEQUENCE,
  chenQianyu: CHENQIANYU_BATTLE_SKILL_SEQUENCE,
  estella: ESTELLA_BATTLE_SKILL_SEQUENCE,
  ember: EMBER_BATTLE_SKILL_SEQUENCE,
  snowshine: SNOWSHINE_BATTLE_SKILL_SEQUENCE,
  catcher: CATCHER_BATTLE_SKILL_SEQUENCE,
  gilberta: GILBERTA_BATTLE_SKILL_SEQUENCE,
  xaihi: XAIHI_BATTLE_SKILL_SEQUENCE,
  perlica: PERLICA_BATTLE_SKILL_SEQUENCE,
  fluorite: FLUORITE_BATTLE_SKILL_SEQUENCE,
  lastRite: LASTRITE_BATTLE_SKILL_SEQUENCE,
  yvonne: YVONNE_BATTLE_SKILL_SEQUENCE,
  avywenna: AVYWENNA_BATTLE_SKILL_SEQUENCE,
  daPan: DAPAN_BATTLE_SKILL_SEQUENCE,
  pogranichnik: POGRANICHNK_BATTLE_SKILL_SEQUENCE,
  alesh: ALESH_BATTLE_SKILL_SEQUENCE,
  arclight: ARCLIGHT_BATTLE_SKILL_SEQUENCE,
  ardelia: ARDELIA_BATTLE_SKILL_SEQUENCE,
  antal: ANTAL_BATTLE_SKILL_SEQUENCE,
  wulfgard: WULFGARD_BATTLE_SKILL_SEQUENCE,
};

/** Map operator IDs to their combo skill frame sequence(s). */
const COMBO_SKILL_FRAME_SEQUENCES: Record<string, SkillEventSequence | { sequences: SkillEventSequence[]; labels: string[] }> = {
  akekuri: AKEKURI_COMBO_SKILL_SEQUENCE,
  endministrator: ENDMINISTRATOR_COMBO_SKILL_SEQUENCE,
  lifeng: LIFENG_COMBO_SKILL_SEQUENCE,
  chenQianyu: CHENQIANYU_COMBO_SKILL_SEQUENCE,
  estella: ESTELLA_COMBO_SKILL_SEQUENCE,
  ember: EMBER_COMBO_SKILL_SEQUENCE,
  snowshine: SNOWSHINE_COMBO_SKILL_SEQUENCE,
  catcher: CATCHER_COMBO_SKILL_SEQUENCE,
  gilberta: GILBERTA_COMBO_SKILL_SEQUENCE,
  xaihi: XAIHI_COMBO_SKILL_SEQUENCE,
  perlica: PERLICA_COMBO_SKILL_SEQUENCE,
  fluorite: FLUORITE_COMBO_SKILL_SEQUENCE,
  lastRite: LASTRITE_COMBO_SKILL_SEQUENCE,
  yvonne: YVONNE_COMBO_SKILL_SEQUENCE,
  avywenna: AVYWENNA_COMBO_SKILL_SEQUENCE,
  daPan: DAPAN_COMBO_SKILL_SEQUENCE,
  pogranichnik: POGRANICHNK_COMBO_SKILL_SEQUENCE,
  alesh: ALESH_COMBO_SKILL_SEQUENCE,
  arclight: ARCLIGHT_COMBO_SKILL_SEQUENCE,
  ardelia: { sequences: [ARDELIA_COMBO_SKILL_SEQUENCE, ARDELIA_COMBO_SKILL_EXPLOSION_SEQUENCE], labels: ['Eruption Column', 'Explosion'] },
  antal: ANTAL_COMBO_SKILL_SEQUENCE,
  wulfgard: WULFGARD_COMBO_SKILL_SEQUENCE,
};

/** Map operator IDs to their ultimate frame sequence(s). */
const ULTIMATE_FRAME_SEQUENCES: Record<string, SkillEventSequence | { sequences: SkillEventSequence[]; labels: string[] }> = {
  akekuri: AKEKURI_ULTIMATE_SEQUENCE,
  ardelia: ARDELIA_ULTIMATE_SEQUENCE,
  endministrator: ENDMINISTRATOR_ULTIMATE_SEQUENCE,
  lifeng: { sequences: [LIFENG_ULTIMATE_SEQUENCE, LIFENG_VAJRA_IMPACT_SEQUENCE], labels: ['Heart of the Unmoving', 'Vajra Impact'] },
  chenQianyu: CHENQIANYU_ULTIMATE_SEQUENCE,
  estella: ESTELLA_ULTIMATE_SEQUENCE,
  ember: EMBER_ULTIMATE_SEQUENCE,
  snowshine: SNOWSHINE_ULTIMATE_SEQUENCE,
  catcher: CATCHER_ULTIMATE_SEQUENCE,
  gilberta: GILBERTA_ULTIMATE_SEQUENCE,
  perlica: PERLICA_ULTIMATE_SEQUENCE,
  fluorite: FLUORITE_ULTIMATE_SEQUENCE,
  lastRite: LASTRITE_ULTIMATE_SEQUENCE,
  avywenna: AVYWENNA_ULTIMATE_SEQUENCE,
  daPan: DAPAN_ULTIMATE_SEQUENCE,
  pogranichnik: POGRANICHNK_ULTIMATE_SEQUENCE,
  alesh: ALESH_ULTIMATE_SEQUENCE,
  arclight: { sequences: [ARCLIGHT_ULTIMATE_SEQUENCE, ARCLIGHT_EXPLOSION_SEQUENCE], labels: ['Exploding Blitz', 'Explosion'] },
  wulfgard: WULFGARD_ULTIMATE_SEQUENCE,
};

export interface Slot {
  slotId: string;
  operator: Operator | null;
  potential?: number;
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
    label: ColumnLabel.SKILL_POINTS,
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
    label: ColumnLabel.TEAM_STATUS,
    color: '#66aa88',
    headerVariant: 'skill',
    noAdd: true,
  });

  // ── Dynamic team columns based on team composition ──────────────────────
  const teamTeamColumns = new Set<string>();
  for (const slot of slots) {
    const cap = slot.operator?.triggerCapability;
    if (cap?.derivedTeamColumns) {
      cap.derivedTeamColumns.forEach((c) => teamTeamColumns.add(c));
    }
  }

  if (teamTeamColumns.has('team-link')) {
    columns.push({
      key: `${COMMON_OWNER_ID}-link`,
      type: 'mini-timeline',
      source: TimelineSourceType.COMMON,
      ownerId: COMMON_OWNER_ID,
      columnId: StatusType.LINK,
      label: ColumnLabel.LINK,
      color: '#e05555',
      headerVariant: 'skill',
      derived: true,
      defaultEvent: {
        name: 'Link',
        defaultActivationDuration: 2400, // 20 seconds at 120fps
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
      },
    });
  }

  if (teamTeamColumns.has('team-amp')) {
    columns.push({
      key: `${COMMON_OWNER_ID}-amp`,
      type: 'mini-timeline',
      source: TimelineSourceType.COMMON,
      ownerId: COMMON_OWNER_ID,
      columnId: StatusType.ARTS_AMP,
      label: ColumnLabel.ARTS_AMP,
      color: '#dd88cc',
      headerVariant: 'skill',
      derived: true,
      defaultEvent: {
        name: 'Arts Amp',
        defaultActivationDuration: 1440, // 12 seconds at 120fps
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
      },
    });
  }

  if (teamTeamColumns.has('team-shield')) {
    columns.push({
      key: `${COMMON_OWNER_ID}-shield`,
      type: 'mini-timeline',
      source: TimelineSourceType.COMMON,
      ownerId: COMMON_OWNER_ID,
      columnId: StatusType.SHIELD,
      label: ColumnLabel.SHIELD,
      color: '#88aacc',
      headerVariant: 'skill',
      derived: true,
      defaultEvent: {
        name: 'Shield',
        defaultActivationDuration: 1800, // 15 seconds at 120fps
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
      },
    });
  }

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
            skillElement: skill.element,
            defaultEvent: {
              name: skill.name,
              defaultActivationDuration: skill.defaultActivationDuration,
              defaultActiveDuration: skill.defaultActiveDuration,
              defaultCooldownDuration: skill.defaultCooldownDuration,
              triggerCondition: skill.triggerCondition,
              gaugeGain: skill.gaugeGain,
              teamGaugeGain: skill.teamGaugeGain,
              ...(skill.gaugeGainByEnemies ? { gaugeGainByEnemies: skill.gaugeGainByEnemies } : {}),
              animationDuration: skill.animationDuration,
              ...(skillType === 'ultimate' && slot.potential != null ? { operatorPotential: slot.potential } : {}),
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
              gaugeGain: skill.gaugeGain,
              teamGaugeGain: skill.teamGaugeGain,
            };
            col.eventVariants = [
              {
                name: CombatSkillsType.SMOULDERING_FIRE,
                defaultActivationDuration: baseSeg.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: baseSeg.segments,
                gaugeGain: skill.gaugeGain,
                teamGaugeGain: skill.teamGaugeGain,
              },
              {
                name: CombatSkillsType.SMOULDERING_FIRE_ENHANCED,
                defaultActivationDuration: enhSeg.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: enhSeg.segments,
                triggerCondition: 'Requires: Twilight active',
                gaugeGain: 0,
                teamGaugeGain: 0,
              },
              {
                name: CombatSkillsType.SMOULDERING_FIRE_EMPOWERED,
                defaultActivationDuration: empSeg.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: empSeg.segments,
                triggerCondition: 'Requires: Melting Flame ×4',
                gaugeGain: skill.gaugeGain,
                teamGaugeGain: skill.teamGaugeGain,
              },
              {
                name: CombatSkillsType.SMOULDERING_FIRE_ENHANCED_EMPOWERED,
                defaultActivationDuration: enhEmpSeg.totalDurationFrames,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: enhEmpSeg.segments,
                triggerCondition: 'Requires: Twilight active + Melting Flame ×4',
                gaugeGain: 0,
                teamGaugeGain: 0,
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
          // Generic battle skill: map-based lookup for operators with frame data
          const battleSeq = op && BATTLE_SKILL_FRAME_SEQUENCES[op.id];
          if (battleSeq && skillType === 'battle' && !isLaevatain) {
            const seg = SkillSegmentBuilder.buildSegments([battleSeq]);
            col.defaultEvent = {
              ...col.defaultEvent!,
              defaultActivationDuration: seg.totalDurationFrames,
              segments: seg.segments,
            };
          }
          // Generic combo skill: map-based lookup for operators with frame data
          const comboEntry = op && COMBO_SKILL_FRAME_SEQUENCES[op.id];
          if (comboEntry && skillType === 'combo' && !isLaevatain) {
            const isMulti = 'sequences' in comboEntry;
            const seg = isMulti
              ? SkillSegmentBuilder.buildSegments(comboEntry.sequences, { labels: comboEntry.labels })
              : SkillSegmentBuilder.buildSegments([comboEntry]);
            col.defaultEvent = {
              ...col.defaultEvent!,
              defaultActivationDuration: seg.totalDurationFrames,
              segments: seg.segments,
            };
          }
          // Generic ultimate: attach frame data, stretch segment to match activeDuration
          const ultEntry = op && ULTIMATE_FRAME_SEQUENCES[op.id];
          if (ultEntry && skillType === 'ultimate') {
            const isMultiUlt = 'sequences' in ultEntry;
            const seg = isMultiUlt
              ? SkillSegmentBuilder.buildSegments(ultEntry.sequences, { labels: ultEntry.labels })
              : SkillSegmentBuilder.buildSegments([ultEntry]);
            const activeDur = col.defaultEvent!.defaultActiveDuration ?? 0;
            // Stretch segment to cover the full Active phase so frames are draggable
            if (activeDur > 0 && seg.segments.length > 0) {
              seg.segments[0].durationFrames = activeDur;
            }
            col.defaultEvent = {
              ...col.defaultEvent!,
              segments: seg.segments,
            };
          }
          columns.push(col);
          slotHasCols = true;
        }
      }
    }
    // Add Thunderlance subtimeline column for Avywenna
    const isAvywenna = op?.id === 'avywenna';
    if (isAvywenna) {
      columns.push({
        key: `${slot.slotId}-thunderlance`,
        type: 'mini-timeline',
        source: TimelineSourceType.OPERATOR,
        ownerId: slot.slotId,
        columnId: 'thunderlance',
        label: STATUS_LABELS[StatusType.THUNDERLANCE].toUpperCase(),
        color: op!.color,
        headerVariant: 'mf',
        microColumns: Array.from({ length: MF_MICRO_COLS }, (_, i) => ({
          id: `tl-${i}`,
          label: String(i + 1),
          color: ELEMENT_COLORS[ElementType.ELECTRIC],
        })),
        microColumnAssignment: 'by-order',
        maxEvents: MF_MICRO_COLS,
        requiresMonotonicOrder: true,
        reuseExpiredSlots: true,
        derived: true,
        defaultEvent: {
          name: 'Thunderlance',
          defaultActivationDuration: 2400, // 20s at 120fps
          defaultActiveDuration: 0,
          defaultCooldownDuration: 0,
        },
      });
    }
    // Add single MeltingFlame subtimeline column for Laevatain
    if (isLaevatain) {
      columns.push({
        key: `${slot.slotId}-melting-flame`,
        type: 'mini-timeline',
        source: TimelineSourceType.OPERATOR,
        ownerId: slot.slotId,
        columnId: 'melting-flame',
        label: STATUS_LABELS[StatusType.MELTING_FLAME].toUpperCase(),
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
    const mfColCount = isLaevatain ? 1 : isAvywenna ? 1 : 0;
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

  // ── Dynamic enemy columns based on team composition ──────────────────────
  // Collect all published triggers and explicit enemy columns from team operators
  const ARTS_INFLICTION_TRIGGERS = new Set([
    TriggerConditionType.COMBUSTION,
    TriggerConditionType.SOLIDIFICATION,
    TriggerConditionType.CORROSION,
    TriggerConditionType.ELECTRIFICATION,
    TriggerConditionType.APPLY_ARTS_INFLICTION,
    TriggerConditionType.APPLY_HEAT_INFLICTION,
    TriggerConditionType.APPLY_CRYO_INFLICTION,
    TriggerConditionType.APPLY_NATURE_INFLICTION,
    TriggerConditionType.APPLY_ELECTRIC_INFLICTION,
  ]);

  const teamPublishedTriggers = new Set<TriggerConditionType>();
  const teamEnemyColumns = new Set<string>();

  for (const slot of slots) {
    const op = slot.operator;
    if (!op) continue;
    const cap = op.triggerCapability;
    if (!cap) continue;
    for (const triggers of Object.values(cap.publishesTriggers)) {
      if (triggers) triggers.forEach((t) => teamPublishedTriggers.add(t));
    }
    if (cap.derivedEnemyColumns) {
      cap.derivedEnemyColumns.forEach((c) => teamEnemyColumns.add(c));
    }
  }

  let hasArtsInfliction = false;
  teamPublishedTriggers.forEach((t) => { if (ARTS_INFLICTION_TRIGGERS.has(t)) hasArtsInfliction = true; });
  const hasPhysicalStatus = teamPublishedTriggers.has(TriggerConditionType.APPLY_PHYSICAL_STATUS);
  const hasVulnerable = teamPublishedTriggers.has(TriggerConditionType.APPLY_VULNERABILITY);

  if (hasArtsInfliction) {
    // Arts infliction mini-timeline for the enemy (stacking like MF)
    const inflictionStatuses = enemy.statuses;
    const inflictionColumnIds = inflictionStatuses.map((s) => s.id);
    columns.push({
      key: 'enemy-arts-infliction',
      type: 'mini-timeline',
      source: TimelineSourceType.ENEMY,
      ownerId: 'enemy',
      columnId: 'arts-infliction',
      label: ColumnLabel.INFLICTION,
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
      label: ColumnLabel.ARTS_REACTION,
      color: '#dd6644',
      headerVariant: 'infliction',
      microColumns: REACTION_MICRO_COLUMNS,
      microColumnAssignment: 'dynamic-split',
      matchColumnIds: REACTION_MICRO_COLUMNS.map((mc) => mc.id),
      derived: true,
    });
  }

  if (hasVulnerable) {
    // Physical infliction mini-timeline for the enemy (Vulnerable stacking)
    columns.push({
      key: 'enemy-physical-infliction',
      type: 'mini-timeline',
      source: TimelineSourceType.ENEMY,
      ownerId: 'enemy',
      columnId: 'physical-infliction',
      label: ColumnLabel.PHYSICAL_INFLICTION,
      color: '#c0c8d0',
      headerVariant: 'infliction',
      microColumns: PHYSICAL_INFLICTION_MICRO_COLUMNS,
      microColumnAssignment: 'by-order',
      matchColumnIds: ['vulnerableInfliction'],
      reuseExpiredSlots: true,
      derived: true,
      defaultEvent: {
        name: 'Vulnerable',
        defaultActivationDuration: 2400, // 20 seconds at 120fps
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
      },
    });
  }

  if (hasPhysicalStatus) {
    // Physical status mini-timeline for the enemy (Breach)
    columns.push({
      key: 'enemy-physical-status',
      type: 'mini-timeline',
      source: TimelineSourceType.ENEMY,
      ownerId: 'enemy',
      columnId: 'physical-status',
      label: ColumnLabel.PHYSICAL_STATUS,
      color: '#c0c8d0',
      headerVariant: 'infliction',
      microColumns: PHYSICAL_STATUS_MICRO_COLUMNS,
      microColumnAssignment: 'dynamic-split',
      matchColumnIds: PHYSICAL_STATUS_MICRO_COLUMNS.map((mc) => mc.id),
      derived: true,
    });
  }

  if (teamEnemyColumns.has('enemy-focus')) {
    // Focus status mini-timeline for the enemy (applied by Antal battle skill, 60s duration)
    columns.push({
      key: 'enemy-focus',
      type: 'mini-timeline',
      source: TimelineSourceType.ENEMY,
      ownerId: 'enemy',
      columnId: StatusType.FOCUS,
      label: STATUS_LABELS[StatusType.FOCUS].toUpperCase(),
      color: '#55aadd',
      headerVariant: 'skill',
      derived: true,
      defaultEvent: {
        name: 'Focus',
        defaultActivationDuration: 7200, // 60 seconds at 120fps
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
      },
    });
  }

  if (teamEnemyColumns.has('enemy-susceptibility')) {
    // Susceptibility debuff on enemy (applied by Ardelia Dolly Rush, Gilberta Gravity Field,
    // Avywenna Thunderlance: Final Shock talent 3)
    columns.push({
      key: 'enemy-susceptibility',
      type: 'mini-timeline',
      source: TimelineSourceType.ENEMY,
      ownerId: 'enemy',
      columnId: StatusType.SUSCEPTIBILITY,
      label: ColumnLabel.SUSCEPTIBILITY,
      color: '#cc8866',
      headerVariant: 'skill',
      derived: true,
      defaultEvent: {
        name: 'Susceptibility',
        defaultActivationDuration: 1800, // 15 seconds at 120fps
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
      },
    });
  }

  return columns;
}
