import { Column, MiniTimeline, Operator, Enemy, VisibleSkills } from '../../consts/viewTypes';
import { CombatSkillsType, ELEMENT_COLORS, ElementType, StatusType, TimeDependency, TimelineSourceType, TriggerConditionType } from '../../consts/enums';
import type { Potential } from '../../consts/types';
import { SKILL_COLUMN_ORDER as SKILL_ORDER } from '../../model/channels';
import { SKILL_LABELS, ColumnLabel, STATUS_LABELS, REACTION_MICRO_COLUMNS, PHYSICAL_INFLICTION_MICRO_COLUMNS, PHYSICAL_STATUS_MICRO_COLUMNS } from '../../consts/channelLabels';
import { getWeaponEffects, WeaponSkillEffect } from '../../consts/weaponSkillEffects';
import { getGearSetEffects } from '../../consts/gearSetEffects';
import { TACTICALS } from '../../utils/loadoutRegistry';
import { Tactical } from '../../model/consumables/tactical';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { MODEL_FACTORIES } from '../operators/operatorRegistry';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
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
import { SmoulderingFire } from '../../model/combat-skills/laevatainSkills';
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
  /** Equipped weapon name (for weapon skill subtimeline columns). */
  weaponName?: string;
  /** Equipped tactical name (for tactical subtimeline column). */
  tacticalName?: string;
  /** Active gear set effect type (3+ matching pieces). */
  gearSetType?: import('../../consts/enums').GearEffectType;
  /** Combo skill level (1–12) for level-dependent cooldown computation. */
  comboSkillLevel?: number;
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

  // Pre-scan: detect Wulfgard on the team (for Scorching Fangs talent columns)
  const wulfgardSlot = slots.find((s) => s.operator?.id === 'wulfgard');
  const SCORCHING_FANGS_DURATION = 10 * 120; // 10s at 120fps

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

  // ── Unbridled Edge team buff (OBJ Edge of Lightness) ─────────────────────
  const UNBRIDLED_EDGE_MAX_STACKS = 3;
  const hasUnbridledEdge = slots.some((s) => s.weaponName === 'OBJ Edge of Lightness');
  if (hasUnbridledEdge) {
    columns.push({
      key: `${COMMON_OWNER_ID}-unbridled-edge`,
      type: 'mini-timeline',
      source: TimelineSourceType.WEAPON,
      ownerId: COMMON_OWNER_ID,
      columnId: StatusType.UNBRIDLED_EDGE,
      label: STATUS_LABELS[StatusType.UNBRIDLED_EDGE].toUpperCase(),
      color: '#88ddaa',
      headerVariant: 'mf',
      microColumns: Array.from({ length: UNBRIDLED_EDGE_MAX_STACKS }, (_, i) => ({
        id: `ue-${i}`,
        label: String(i + 1),
        color: '#88ddaa',
      })),
      microColumnAssignment: 'by-order',
      maxEvents: UNBRIDLED_EDGE_MAX_STACKS,
      reuseExpiredSlots: true,
      derived: true,
      defaultEvent: {
        name: StatusType.UNBRIDLED_EDGE,
        defaultActivationDuration: 2400, // 20s at 120fps
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
      },
    });
  }

  // ── Shared team weapon buff column ────────────────────────────────────────
  const teamWeaponBuffs: { slotId: string; label: string; durationFrames: number; color: string }[] = [];
  for (const slot of slots) {
    if (!slot.operator || !slot.weaponName) continue;
    const weaponEntry = getWeaponEffects(slot.weaponName);
    if (!weaponEntry) continue;
    for (const effect of weaponEntry.effects) {
      if (effect.target === 'team') {
        teamWeaponBuffs.push({
          slotId: slot.slotId,
          label: effect.label,
          durationFrames: Math.round(effect.durationSeconds * 120),
          color: slot.operator.color,
        });
      }
    }
  }
  if (teamWeaponBuffs.length > 0) {
    columns.push({
      key: `${COMMON_OWNER_ID}-team-weapon-status`,
      type: 'mini-timeline',
      source: TimelineSourceType.WEAPON,
      ownerId: COMMON_OWNER_ID,
      columnId: 'team-weapon-status',
      label: ColumnLabel.WEAPON_BUFF,
      color: '#66aa88',
      headerVariant: 'skill',
      derived: true,
      microColumns: teamWeaponBuffs.map((twb) => ({
        id: `weapon-team-${twb.slotId}`,
        label: twb.label,
        color: twb.color,
        defaultEvent: {
          name: twb.label,
          defaultActivationDuration: twb.durationFrames,
          defaultActiveDuration: 0,
          defaultCooldownDuration: 0,
        },
      })),
      microColumnAssignment: 'dynamic-split',
      matchColumnIds: teamWeaponBuffs.map((twb) => `weapon-team-${twb.slotId}`),
    });
  }

  // ── Shared team gear set buff column ──────────────────────────────────────
  const teamGearBuffs: { slotId: string; label: string; durationFrames: number; color: string }[] = [];
  for (const slot of slots) {
    if (!slot.operator || !slot.gearSetType) continue;
    const gearEntry = getGearSetEffects(slot.gearSetType);
    if (!gearEntry) continue;
    for (const effect of gearEntry.effects) {
      if (effect.target === 'team') {
        teamGearBuffs.push({
          slotId: slot.slotId,
          label: effect.label,
          durationFrames: Math.round(effect.durationSeconds * 120),
          color: slot.operator.color,
        });
      }
    }
  }
  if (teamGearBuffs.length > 0) {
    columns.push({
      key: `${COMMON_OWNER_ID}-team-gear-status`,
      type: 'mini-timeline',
      source: TimelineSourceType.GEAR_EFFECT,
      ownerId: COMMON_OWNER_ID,
      columnId: 'team-gear-status',
      label: ColumnLabel.GEAR_BUFF,
      color: '#88aa66',
      headerVariant: 'skill',
      derived: true,
      microColumns: teamGearBuffs.map((tgb) => ({
        id: `gear-team-${tgb.slotId}`,
        label: tgb.label,
        color: tgb.color,
        defaultEvent: {
          name: tgb.label,
          defaultActivationDuration: tgb.durationFrames,
          defaultActiveDuration: 0,
          defaultCooldownDuration: 0,
        },
      })),
      microColumnAssignment: 'dynamic-split',
      matchColumnIds: teamGearBuffs.map((tgb) => `gear-team-${tgb.slotId}`),
    });
  }

  for (const slot of slots) {
    const op = slot.operator;
    const isLaevatain = op?.id === 'laevatain';
    let slotHasCols = false;
    if (op) {
      // Dash subtimeline — before basic attack
      const DASH_FRAMES = Math.round(0.416 * 120); // 0.416s
      const DODGE_FRAMES = Math.round(0.351 * 120); // 0.351s game-time
      columns.push({
        key: `${slot.slotId}-dash`,
        type: 'mini-timeline',
        source: TimelineSourceType.OPERATOR,
        ownerId: slot.slotId,
        columnId: 'dash',
        label: 'DASH',
        color: ELEMENT_COLORS[ElementType.PHYSICAL],
        headerVariant: 'skill',
        eventVariants: [
          {
            name: CombatSkillsType.DASH,
            defaultActivationDuration: DASH_FRAMES,
            defaultActiveDuration: 0,
            defaultCooldownDuration: 0,
          },
          {
            name: CombatSkillsType.DASH,
            defaultActivationDuration: DODGE_FRAMES,
            defaultActiveDuration: 0,
            defaultCooldownDuration: 0,
            isPerfectDodge: true,
            timeInteraction: 'TIME_STOP',
            animationDuration: DODGE_FRAMES,
            timeDependency: TimeDependency.REAL_TIME,
          },
        ],
        defaultEvent: {
          name: CombatSkillsType.DASH,
          defaultActivationDuration: DASH_FRAMES,
          defaultActiveDuration: 0,
          defaultCooldownDuration: 0,
        },
      });
      slotHasCols = true;

      for (const skillType of SKILL_ORDER) {
        if (visibleSkills[slot.slotId]?.[skillType]) {
          let skill = op.skills[skillType];
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
              ...(skillType === 'battle' && skill.skillPointCost != null ? { skillPointCost: skill.skillPointCost } : {}),
            },
          };
          // Combo columns: use model's level-dependent cooldown + match activation windows
          if (skillType === 'combo') {
            col.matchColumnIds = ['combo', 'comboActivationWindow'];
            // Override cooldown with level-dependent value from operator model
            const comboLevel = slot.comboSkillLevel;
            if (comboLevel && op.id) {
              const factory = MODEL_FACTORIES[op.id];
              if (factory) {
                const model = factory();
                if ('getCooldownSeconds' in model.comboSkill) {
                  const cdSeconds = (model.comboSkill as any).getCooldownSeconds(comboLevel as import('../../consts/types').SkillLevel);
                  skill = { ...skill, defaultCooldownDuration: Math.round(cdSeconds * FPS) };
                }
              }
            }
            col.defaultEvent!.defaultCooldownDuration = skill.defaultCooldownDuration;
          }
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
            const baseSeg = SkillSegmentBuilder.buildSegments([LAEVATAIN_BATTLE_SKILL_SEQUENCE], { labels: ['Explosion'], gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain });
            const enhSeg = SkillSegmentBuilder.buildSegments([LAEVATAIN_ENHANCED_BATTLE_SKILL_SEQUENCE], { gaugeGain: 0, teamGaugeGain: 0 });
            // Enhanced battle skill: tick 2 grants 100 ult energy (additional attack hit)
            if (enhSeg.segments[0]?.frames && enhSeg.segments[0].frames.length >= 2) {
              enhSeg.segments[0].frames[1].gaugeGain = SmoulderingFire.ADDITIONAL_ATK_ULT_ENERGY_GAIN;
            }
            const empSeg = SkillSegmentBuilder.buildSegments(LAEVATAIN_EMPOWERED_BATTLE_SKILL_SEQUENCES, { labels: ['Explosion', 'Additional Attack'], gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain });
            // P1: Empowered additional attack restores 20 SP on hit
            const empSpReturn = new SmoulderingFire().getAdditionalAtkSpReturnOnHit((slot.potential ?? 0) as Potential);
            if (empSpReturn > 0 && empSeg.segments[1]?.frames?.[0]) {
              empSeg.segments[1].frames[0].skillPointRecovery = empSpReturn;
            }
            const enhEmpSeg = SkillSegmentBuilder.buildSegments([LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL_SEQUENCE], { gaugeGain: 0, teamGaugeGain: 0 });
            col.defaultEvent = {
              ...col.defaultEvent!,
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
                ...col.defaultEvent!,
              },
              {
                ...col.defaultEvent!,
                name: CombatSkillsType.SMOULDERING_FIRE_ENHANCED,
                defaultActivationDuration: enhSeg.totalDurationFrames,
                segments: enhSeg.segments,
                triggerCondition: 'Requires: Twilight active',
                gaugeGain: 0,
                teamGaugeGain: 0,
              },
              {
                ...col.defaultEvent!,
                name: CombatSkillsType.SMOULDERING_FIRE_EMPOWERED,
                defaultActivationDuration: empSeg.totalDurationFrames,
                segments: empSeg.segments,
                triggerCondition: 'Requires: Melting Flame ×4',
                gaugeGain: skill.gaugeGain,
                teamGaugeGain: skill.teamGaugeGain,
              },
              {
                ...col.defaultEvent!,
                name: CombatSkillsType.SMOULDERING_FIRE_ENHANCED_EMPOWERED,
                defaultActivationDuration: enhEmpSeg.totalDurationFrames,
                segments: enhEmpSeg.segments,
                triggerCondition: 'Requires: Twilight active + Melting Flame ×4',
                gaugeGain: 0,
                teamGaugeGain: 0,
              },
            ];
          }
          // Laevatain combo skill: single-sequence event with frame data
          if (isLaevatain && skillType === 'combo') {
            const comboSeg = SkillSegmentBuilder.buildSegments([LAEVATAIN_COMBO_SKILL_SEQUENCE], { gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain });
            const comboCd = skill.defaultCooldownDuration ?? 0;
            col.defaultEvent = {
              ...col.defaultEvent!,
              defaultActivationDuration: comboSeg.totalDurationFrames,
              segments: [...comboSeg.segments, { durationFrames: comboCd, label: 'Cooldown', timeDependency: TimeDependency.REAL_TIME }],
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
            const seg = SkillSegmentBuilder.buildSegments([battleSeq], { gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain });
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
              ? SkillSegmentBuilder.buildSegments(comboEntry.sequences, { labels: comboEntry.labels, gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain })
              : SkillSegmentBuilder.buildSegments([comboEntry], { gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain });
            const comboCd = skill.defaultCooldownDuration ?? 0;
            col.defaultEvent = {
              ...col.defaultEvent!,
              defaultActivationDuration: seg.totalDurationFrames,
              segments: [...seg.segments, { durationFrames: comboCd, label: 'Cooldown', timeDependency: TimeDependency.REAL_TIME }],
            };
          }
          // Generic ultimate: build Animation / Statis / Active / Cooldown segments
          if (skillType === 'ultimate') {
            const animDur = col.defaultEvent!.animationDuration ?? 0;
            const activationDur = col.defaultEvent!.defaultActivationDuration ?? 0;
            const statisDur = Math.max(0, activationDur - animDur);
            const activeDur = col.defaultEvent!.defaultActiveDuration ?? 0;
            const cooldownDur = col.defaultEvent!.defaultCooldownDuration ?? 0;

            // Build active-phase segment from frame data if available
            const ultEntry = op && ULTIMATE_FRAME_SEQUENCES[op.id];
            let activeSegment: import('../../consts/viewTypes').EventSegmentData;
            if (ultEntry) {
              const isMultiUlt = 'sequences' in ultEntry;
              const seg = isMultiUlt
                ? SkillSegmentBuilder.buildSegments(ultEntry.sequences, { labels: ultEntry.labels })
                : SkillSegmentBuilder.buildSegments([ultEntry]);
              activeSegment = { ...seg.segments[0], durationFrames: activeDur > 0 ? activeDur : seg.segments[0].durationFrames, label: 'Active' };
            } else {
              activeSegment = { durationFrames: activeDur, label: 'Active' };
            }

            const ultSegments: import('../../consts/viewTypes').EventSegmentData[] = [
              { durationFrames: animDur, label: 'Animation', timeDependency: TimeDependency.REAL_TIME },
              { durationFrames: statisDur, label: 'Statis' },
              activeSegment,
              { durationFrames: cooldownDur, label: 'Cooldown', timeDependency: TimeDependency.REAL_TIME },
            ];

            col.defaultEvent = {
              ...col.defaultEvent!,
              segments: ultSegments,
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
    // ── Weapon skill buff column (shared dynamic-split) ──────────────────────
    let weaponColCount = 0;
    if (op && slot.weaponName) {
      const weaponEntry = getWeaponEffects(slot.weaponName);
      if (weaponEntry) {
        const wielderEffects = weaponEntry.effects.filter((e) => e.target === 'wielder');
        if (wielderEffects.length > 0) {
          const microCols = wielderEffects.map((eff, i) => ({
            id: i === 0 ? 'weapon-buff' : `weapon-buff-${i}`,
            label: eff.label,
            color: op.color,
            defaultEvent: {
              name: eff.label,
              defaultActivationDuration: Math.round(eff.durationSeconds * 120),
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
            },
          }));
          columns.push({
            key: `${slot.slotId}-weapon-buff`,
            type: 'mini-timeline',
            source: TimelineSourceType.WEAPON,
            ownerId: slot.slotId,
            columnId: 'operator-weapon-status',
            label: ColumnLabel.WEAPON_BUFF,
            color: op.color,
            headerVariant: 'skill',
            derived: true,
            microColumns: microCols,
            microColumnAssignment: 'dynamic-split',
            matchColumnIds: microCols.map((mc) => mc.id),
          });
          weaponColCount++;
        }
      }
    }

    // ── Gear set buff column (wielder effects) ─────────────────────────────────
    let gearColCount = 0;
    if (op && slot.gearSetType) {
      const gearEntry = getGearSetEffects(slot.gearSetType);
      if (gearEntry) {
        const wielderEffects = gearEntry.effects.filter((e) => e.target === 'wielder');
        if (wielderEffects.length > 0) {
          const microCols = wielderEffects.map((eff, i) => ({
            id: i === 0 ? 'gear-buff' : `gear-buff-${i}`,
            label: eff.label,
            color: op.color,
            defaultEvent: {
              name: eff.label,
              defaultActivationDuration: Math.round(eff.durationSeconds * 120),
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
            },
          }));
          columns.push({
            key: `${slot.slotId}-gear-buff`,
            type: 'mini-timeline',
            source: TimelineSourceType.GEAR_EFFECT,
            ownerId: slot.slotId,
            columnId: 'operator-gear-status',
            label: ColumnLabel.GEAR_BUFF,
            color: op.color,
            headerVariant: 'skill',
            derived: true,
            microColumns: microCols,
            microColumnAssignment: 'dynamic-split',
            matchColumnIds: microCols.map((mc) => mc.id),
          });
          gearColCount++;
        }
      }
    }

    // ── Tactical subtimeline column ───────────────────────────────────────────
    let tacticalColCount = 0;
    if (op && slot.tacticalName) {
      const entry = TACTICALS.find((t) => t.name === slot.tacticalName);
      if (entry) {
        const tactical = entry.create() as Tactical;
        const TACTICAL_DURATION_FRAMES = Math.round(1 * 120); // 1 second at 120fps
        columns.push({
          key: `${slot.slotId}-tactical`,
          type: 'mini-timeline',
          source: TimelineSourceType.TACTICAL,
          ownerId: slot.slotId,
          columnId: 'tactical',
          label: ColumnLabel.TACTICAL,
          color: op.color,
          headerVariant: 'skill',
          derived: true,
          microColumns: [{ id: 'tactical', label: tactical.name, color: op.color }],
          microColumnAssignment: 'dynamic-split',
          matchColumnIds: ['tactical'],
          defaultEvent: {
            name: tactical.name,
            defaultActivationDuration: TACTICAL_DURATION_FRAMES,
            defaultActiveDuration: 0,
            defaultCooldownDuration: 0,
          },
        });
        tacticalColCount++;
      }
    }

    // ── Scorching Fangs talent buff column (Wulfgard on team) ───────────────
    let scFangsColCount = 0;
    if (op && wulfgardSlot) {
      // Wulfgard always gets Scorching Fangs column; others only if Wulfgard has P3+
      const isWulfgard = slot === wulfgardSlot;
      if (isWulfgard || (wulfgardSlot.potential ?? 0) >= 3) {
        columns.push({
          key: `${slot.slotId}-scorching-fangs`,
          type: 'mini-timeline',
          source: TimelineSourceType.OPERATOR,
          ownerId: slot.slotId,
          columnId: StatusType.SCORCHING_FANGS,
          label: ColumnLabel.SCORCHING_FANGS,
          color: op.color,
          headerVariant: 'skill',
          derived: true,
          defaultEvent: {
            name: STATUS_LABELS[StatusType.SCORCHING_FANGS],
            defaultActivationDuration: SCORCHING_FANGS_DURATION,
            defaultActiveDuration: 0,
            defaultCooldownDuration: 0,
          },
        });
        scFangsColCount++;
      }
    }

    // Every slot gets at least MIN_SLOT_COLS columns so the loadout row stays visible
    const skillColCount = slotHasCols
      ? SKILL_ORDER.filter((st) => visibleSkills[slot.slotId]?.[st]).length
      : 0;
    const mfColCount = isLaevatain ? 1 : isAvywenna ? 1 : 0;
    const needed = MIN_SLOT_COLS - (skillColCount + mfColCount + weaponColCount + gearColCount + tacticalColCount + scFangsColCount);
    for (let p = 0; p < Math.max(0, needed); p++) {
      columns.push({
        key: `${slot.slotId}-placeholder${p}`,
        type: 'placeholder',
        ownerId: slot.slotId,
        color: op?.color ?? '#666',
      });
    }
  }

  // ── Enemy stagger resource ─────────────────────────────────────────────────
  columns.push({
    key: `enemy-${COMMON_COLUMN_IDS.STAGGER}`,
    type: 'mini-timeline',
    source: TimelineSourceType.ENEMY,
    ownerId: 'enemy',
    columnId: COMMON_COLUMN_IDS.STAGGER,
    label: ColumnLabel.STAGGER,
    color: '#dd8844',
    headerVariant: 'skill',
    noAdd: true,
  });

  // ── Stagger status (node stagger + full stagger break) ───────────────────
  const nodeStaggerFrames = Math.round(enemy.staggerNodeRecoverySeconds * FPS);
  const fullStaggerFrames = Math.round(enemy.staggerBreakDurationSeconds * FPS);
  columns.push({
    key: 'enemy-stagger-frailty',
    type: 'mini-timeline',
    source: TimelineSourceType.ENEMY,
    ownerId: 'enemy',
    columnId: 'stagger-frailty',
    label: ColumnLabel.STAGGER_FRAILTY,
    color: '#dd8844',
    headerVariant: 'skill',
    noAdd: true,
    derived: true,
    eventVariants: [
      {
        name: 'Node Stagger',
        defaultActivationDuration: nodeStaggerFrames,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
      },
      {
        name: 'Full Stagger',
        defaultActivationDuration: fullStaggerFrames,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
      },
    ],
    defaultEvent: {
      name: 'Node Stagger',
      defaultActivationDuration: nodeStaggerFrames,
      defaultActiveDuration: 0,
      defaultCooldownDuration: 0,
    },
  });

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

  if (teamEnemyColumns.has('enemy-susceptibility')) {
    // Susceptibility debuff on enemy (Focus from Antal, Susceptibility from Ardelia/Gilberta/Avywenna)
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

  // ── Shared enemy fragility column from weapon effects ─────────────────────
  const enemyWeaponDebuffs: { slotId: string; label: string; durationFrames: number; color: string }[] = [];
  for (const slot of slots) {
    if (!slot.operator || !slot.weaponName) continue;
    const weaponEntry = getWeaponEffects(slot.weaponName);
    if (!weaponEntry) continue;
    for (const effect of weaponEntry.effects) {
      if (effect.target === 'enemy') {
        enemyWeaponDebuffs.push({
          slotId: slot.slotId,
          label: effect.label,
          durationFrames: Math.round(effect.durationSeconds * 120),
          color: slot.operator.color,
        });
      }
    }
  }
  if (enemyWeaponDebuffs.length > 0) {
    columns.push({
      key: 'enemy-fragility',
      type: 'mini-timeline',
      source: TimelineSourceType.ENEMY,
      ownerId: 'enemy',
      columnId: 'enemy-fragility',
      label: ColumnLabel.FRAGILITY,
      color: '#cc6644',
      headerVariant: 'skill',
      derived: true,
      microColumns: enemyWeaponDebuffs.map((ewd) => ({
        id: `fragility-${ewd.slotId}`,
        label: ewd.label,
        color: ewd.color,
        defaultEvent: {
          name: ewd.label,
          defaultActivationDuration: ewd.durationFrames,
          defaultActiveDuration: 0,
          defaultCooldownDuration: 0,
        },
      })),
      microColumnAssignment: 'dynamic-split',
      matchColumnIds: enemyWeaponDebuffs.map((ewd) => `fragility-${ewd.slotId}`),
    });
  }

  return columns;
}
