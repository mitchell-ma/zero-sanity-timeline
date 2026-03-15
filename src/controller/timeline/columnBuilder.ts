import { Column, MiniTimeline, Operator, Enemy, VisibleSkills } from '../../consts/viewTypes';
import { CombatSkillsType, ELEMENT_COLORS, ElementType, EventFrameType, StatusType, TimeDependency, TimelineSourceType, TriggerConditionType } from '../../consts/enums';
import type { Potential } from '../../consts/types';
import { DEBUGGER_OWNER_ID, ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS, OPERATOR_COLUMNS, SKILL_COLUMN_ORDER as SKILL_ORDER, SKILL_COLUMNS } from '../../model/channels';
import { SKILL_LABELS, ColumnLabel, STATUS_LABELS, REACTION_MICRO_COLUMNS, PHYSICAL_INFLICTION_MICRO_COLUMNS, PHYSICAL_STATUS_MICRO_COLUMNS } from '../../consts/timelineColumnLabels';
import { getWeaponEffects, WeaponSkillEffect } from '../../consts/weaponSkillEffects';
import { getGearSetEffects } from '../../consts/gearSetEffects';
import { TACTICALS } from '../../utils/loadoutRegistry';
import { Tactical } from '../../model/consumables/tactical';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { SkillSegmentBuilder } from '../events/basicAttackController';
import { getFrameSequences, getSegmentLabels, getOperatorJson } from '../../model/event-frames/operatorJsonLoader';
import { SkillEventSequence } from '../../model/event-frames/skillEventSequence';

// ── Derive columns from statusEvents ────────────────────────────────────────

interface StatusEventDef {
  name: string;
  target: string;
  element?: string;
  stack: { instances: number; interactionType?: string };
  duration?: { value: number[]; unit: string };
  isNamedEvent?: boolean;
}

/**
 * Build micro-column configs derived from operator JSON `statusEvents`.
 * StatusEvents with stack.instances > 1 produce micro-columns.
 * Target determines owner: THIS_OPERATOR → slot, ENEMY → enemy timeline.
 */
function buildDerivedColumnsFromStatusEvents(
  operatorId: string,
  slotId: string,
  operatorColor: string,
): MiniTimeline[] {
  const json = getOperatorJson(operatorId);
  if (!json?.statusEvents) return [];

  const defs = json.statusEvents as StatusEventDef[];
  const result: MiniTimeline[] = [];

  for (const def of defs) {
    if (!def.stack || def.stack.instances <= 1) continue; // Single-instance statuses don't need columns

    const isEnemy = def.target === 'ENEMY';
    const ownerId = isEnemy ? ENEMY_OWNER_ID : slotId;
    const columnId = def.name.toLowerCase().replace(/_/g, '-');
    const key = isEnemy ? `enemy-${columnId}` : `${slotId}-${columnId}`;
    const elementColor = def.element
      ? ELEMENT_COLORS[def.element as ElementType] ?? operatorColor
      : operatorColor;
    const label = (STATUS_LABELS[def.name as StatusType] ?? def.name).toUpperCase();

    const instances = def.stack.instances;
    const durValue = def.duration?.value?.[0] ?? -1;
    const durationFrames = durValue > 0 ? Math.round(durValue * 120) : TOTAL_FRAMES * 10;

    const col: MiniTimeline = {
      key,
      type: 'mini-timeline',
      source: isEnemy ? TimelineSourceType.ENEMY : TimelineSourceType.OPERATOR,
      ownerId,
      columnId,
      label,
      color: operatorColor,
      headerVariant: 'mf',
      derived: true,
      microColumns: Array.from({ length: instances }, (_, i) => ({
        id: `${columnId}-${i}`,
        label: String(i + 1),
        color: elementColor,
      })),
      microColumnAssignment: 'by-order' as any,
      maxEvents: instances,
      reuseExpiredSlots: true,
      requiresMonotonicOrder: true,
      defaultEvent: {
        name: STATUS_LABELS[def.name as StatusType] ?? def.name,
        defaultActivationDuration: durationFrames,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
      },
    };

    result.push(col);
  }

  return result;
}

export interface Slot {
  slotId: string;
  operator: Operator | null;
  potential?: number;
  /** Equipped weapon name (for weapon skill subtimeline columns). */
  weaponName?: string;
  /** Equipped tactical name (for tactical subtimeline column). */
  tacticalName?: string;
  /** Active gear set effect type (3+ matching pieces). */
  gearSetType?: import('../../consts/enums').GearSetType;
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

  // Pre-scan: detect operators with team-shared status effects (e.g. Scorching Fangs)
  type TeamStatusDef = { sourceSlot: Slot; statusName: string; label: string; duration: number; minPotentialForTeam: number };
  const teamStatusDefs: TeamStatusDef[] = [];
  for (const s of slots) {
    if (!s.operator) continue;
    const json = getOperatorJson(s.operator.id);
    const statusEvents = json?.statusEvents as any[] | undefined;
    if (!statusEvents) continue;
    for (const se of statusEvents) {
      if (se.p3TeamShare) {
        const dur = se.duration?.value?.[0] ?? 15;
        const durationFrames = dur > 0 ? Math.round(dur * 120) : 10 * 120;
        teamStatusDefs.push({
          sourceSlot: s,
          statusName: se.name,
          label: STATUS_LABELS[se.name as StatusType] ?? se.name,
          duration: durationFrames,
          minPotentialForTeam: 3, // P3 required for team share
        });
      }
    }
  }

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

  if (teamTeamColumns.has('team-wildland-trekker')) {
    columns.push({
      key: `${COMMON_OWNER_ID}-wildland-trekker`,
      type: 'mini-timeline',
      source: TimelineSourceType.COMMON,
      ownerId: COMMON_OWNER_ID,
      columnId: StatusType.WILDLAND_TREKKER,
      label: ColumnLabel.WILDLAND_TREKKER,
      color: '#eebb44',
      headerVariant: 'skill',
      derived: true,
    });
  }

  if (teamTeamColumns.has('team-ultimate-gain')) {
    columns.push({
      key: `${COMMON_OWNER_ID}-messengers-song`,
      type: 'mini-timeline',
      source: TimelineSourceType.COMMON,
      ownerId: COMMON_OWNER_ID,
      columnId: StatusType.MESSENGERS_SONG,
      label: ColumnLabel.MESSENGERS_SONG,
      color: '#88cc88',
      headerVariant: 'skill',
      derived: true,
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
    const opJson = op ? getOperatorJson(op.id) : null;
    const opSkills = (opJson?.skills ?? {}) as Record<string, any>;
    // Detect variants by presence of ENHANCED_*/EMPOWERED_* skill categories
    const hasBasicVariants = !!opSkills.ENHANCED_BASIC_ATTACK || !!opSkills.EMPOWERED_BASIC_ATTACK;
    const hasBattleVariants = !!opSkills.ENHANCED_BATTLE_SKILL || !!opSkills.EMPOWERED_BATTLE_SKILL;
    const hasComboOverride = false; // Combo frame overrides now handled generically
    let slotHasCols = false;
    if (op) {
      // Dash subtimeline — before basic attack
      const DASH_FRAMES = Math.round(0.416 * 120); // 0.416s
      const DODGE_FRAMES = Math.round(0.351 * 120); // 0.351s game-time
      const FINISHER_FRAMES = Math.round(1.0 * 120); // ~1.0s
      const DIVE_FRAMES = Math.round(0.8 * 120); // ~0.8s
      columns.push({
        key: `${slot.slotId}-dash`,
        type: 'mini-timeline',
        source: TimelineSourceType.OPERATOR,
        ownerId: slot.slotId,
        columnId: OPERATOR_COLUMNS.DASH,
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
              ...(skillType === SKILL_COLUMNS.ULTIMATE && slot.potential != null ? { operatorPotential: slot.potential } : {}),
              ...(skillType === SKILL_COLUMNS.BATTLE && skill.skillPointCost != null ? { skillPointCost: skill.skillPointCost } : {}),
            },
          };
          // Combo columns: use model's level-dependent cooldown + match activation windows
          if (skillType === SKILL_COLUMNS.COMBO) {
            col.matchColumnIds = [SKILL_COLUMNS.COMBO, 'comboActivationWindow'];
            col.defaultEvent!.defaultCooldownDuration = skill.defaultCooldownDuration;
          }
          // Basic attack variants (derived from ENHANCED_*/EMPOWERED_* skill categories)
          if (hasBasicVariants && skillType === SKILL_COLUMNS.BASIC && op) {
            const base = SkillSegmentBuilder.buildSegments(getFrameSequences(op.id, 'BASIC_ATTACK'));
            col.defaultEvent = {
              name: skill.name,
              defaultActivationDuration: base.totalDurationFrames,
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
              segments: base.segments,
            };
            col.eventVariants = [{ ...col.defaultEvent }];
            // Auto-discover variant categories
            for (const varCat of ['ENHANCED_BASIC_ATTACK', 'EMPOWERED_BASIC_ATTACK']) {
              const varSkill = opSkills[varCat];
              if (!varSkill) continue;
              const variantSeqs = getFrameSequences(op.id, varCat);
              if (variantSeqs?.length) {
                const variantSeg = SkillSegmentBuilder.buildSegments(variantSeqs);
                col.eventVariants.push({
                  name: varSkill.id ?? `${skill.name}_${varCat}`,
                  defaultActivationDuration: variantSeg.totalDurationFrames,
                  defaultActiveDuration: 0,
                  defaultCooldownDuration: 0,
                  segments: variantSeg.segments,
                  ...(varSkill.triggerCondition ? { triggerCondition: varSkill.triggerCondition } : {}),
                });
              }
            }
            // Finisher + Dive (universal)
            col.eventVariants.push(
              {
                name: CombatSkillsType.FINISHER,
                defaultActivationDuration: FINISHER_FRAMES,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: [{ durationFrames: FINISHER_FRAMES, label: 'Finisher', frames: [{ offsetFrame: 0, skillPointRecovery: 0, stagger: 0, hitType: EventFrameType.FINISHER }] }],
              },
              {
                name: CombatSkillsType.DIVE,
                defaultActivationDuration: DIVE_FRAMES,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: [{ durationFrames: DIVE_FRAMES, label: 'Dive', frames: [{ offsetFrame: 0, skillPointRecovery: 0, stagger: 0, hitType: EventFrameType.DIVE }] }],
              },
            );
          }
          // Battle skill variants (derived from ENHANCED_*/EMPOWERED_* skill categories)
          if (hasBattleVariants && skillType === SKILL_COLUMNS.BATTLE && op) {
            const baseSeg = SkillSegmentBuilder.buildSegments(
              getFrameSequences(op.id, 'BATTLE_SKILL'),
              { gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain },
            );
            col.defaultEvent = {
              ...col.defaultEvent!,
              name: skill.name,
              defaultActivationDuration: baseSeg.totalDurationFrames,
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
              segments: baseSeg.segments,
              gaugeGain: skill.gaugeGain,
              teamGaugeGain: skill.teamGaugeGain,
            };
            col.eventVariants = [{ ...col.defaultEvent! }];
            // Auto-discover variant categories
            for (const varCat of ['ENHANCED_BATTLE_SKILL', 'EMPOWERED_BATTLE_SKILL', 'ENHANCED_EMPOWERED_BATTLE_SKILL']) {
              const varSkill = opSkills[varCat];
              if (!varSkill) continue;
              const variantSeqs = getFrameSequences(op.id, varCat);
              if (!variantSeqs?.length) continue;
              // Enhanced variants default to 0 gauge gain; empowered inherits base
              const isEnhanced = varCat.startsWith('ENHANCED');
              const gg = isEnhanced ? 0 : skill.gaugeGain;
              const tgg = isEnhanced ? 0 : skill.teamGaugeGain;
              const variantSeg = SkillSegmentBuilder.buildSegments(variantSeqs, { gaugeGain: gg, teamGaugeGain: tgg });
              // Apply frame modifications if defined on the variant category
              if (varSkill.frameModifications) {
                for (const fm of varSkill.frameModifications) {
                  const seg = variantSeg.segments[fm.segmentIndex];
                  const frame = seg?.frames?.[fm.frameIndex];
                  if (frame) {
                    if (fm.stagger != null) frame.stagger = fm.stagger;
                    if (fm.gaugeGain != null) frame.gaugeGain = fm.gaugeGain;
                    if (fm.consumeStatus) frame.consumeStatus = fm.consumeStatus;
                    if (fm.removeConsumeArtsInfliction) delete frame.consumeArtsInfliction;
                    if (fm.spReturnP1 != null && (slot.potential ?? 0) >= 1) {
                      frame.skillPointRecovery = fm.spReturnP1;
                    }
                  }
                }
              }
              col.eventVariants!.push({
                ...col.defaultEvent!,
                name: varSkill.id ?? `${skill.name}_${varCat}`,
                defaultActivationDuration: variantSeg.totalDurationFrames,
                segments: variantSeg.segments,
                ...(varSkill.triggerCondition ? { triggerCondition: varSkill.triggerCondition } : {}),
                gaugeGain: gg,
                teamGaugeGain: tgg,
              });
            }
          }
          // Generic basic attack: data-driven frame sequences
          const basicSeqs = op && getFrameSequences(op.id, 'BASIC_ATTACK');
          if (basicSeqs?.length && skillType === SKILL_COLUMNS.BASIC) {
            const base = SkillSegmentBuilder.buildSegments(basicSeqs);
            col.defaultEvent = {
              name: skill.name,
              defaultActivationDuration: base.totalDurationFrames,
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
              segments: base.segments,
            };
          }
          // Generic battle skill: data-driven frame sequences
          const battleSeqs = op && getFrameSequences(op.id, 'BATTLE_SKILL');
          if (battleSeqs?.length && skillType === SKILL_COLUMNS.BATTLE && !hasBattleVariants) {
            const seg = SkillSegmentBuilder.buildSegments(battleSeqs, { gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain });
            col.defaultEvent = {
              ...col.defaultEvent!,
              defaultActivationDuration: seg.totalDurationFrames,
              segments: seg.segments,
            };
            // Empowered battle skill variant (e.g. Arclight's additional attack on Electrification)
            const empoweredBattleSeqs = getFrameSequences(op!.id, 'EMPOWERED_BATTLE_SKILL');
            if (empoweredBattleSeqs?.length) {
              const empowered = SkillSegmentBuilder.buildSegments(empoweredBattleSeqs, { gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain });
              const empoweredName = `${col.defaultEvent!.name}_EMPOWERED` as CombatSkillsType;
              col.eventVariants = [
                {
                  name: col.defaultEvent!.name!,
                  defaultActivationDuration: seg.totalDurationFrames,
                  defaultActiveDuration: 0,
                  defaultCooldownDuration: col.defaultEvent!.defaultCooldownDuration ?? 0,
                  segments: seg.segments,
                },
                {
                  name: empoweredName,
                  defaultActivationDuration: empowered.totalDurationFrames,
                  defaultActiveDuration: 0,
                  defaultCooldownDuration: col.defaultEvent!.defaultCooldownDuration ?? 0,
                  segments: empowered.segments,
                  triggerCondition: 'Requires: Empowered condition',
                },
              ];
            }
          }
          // Generic combo skill: data-driven frame sequences
          const comboSeqs = op && getFrameSequences(op.id, 'COMBO_SKILL');
          if (comboSeqs?.length && skillType === SKILL_COLUMNS.COMBO && !hasComboOverride) {
            const comboLabels = getSegmentLabels(op!.id, 'COMBO_SKILL');
            const seg = SkillSegmentBuilder.buildSegments(comboSeqs, { labels: comboLabels, gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain });
            const comboCd = skill.defaultCooldownDuration ?? 0;
            col.defaultEvent = {
              ...col.defaultEvent!,
              defaultActivationDuration: seg.totalDurationFrames,
              segments: [...seg.segments, { durationFrames: comboCd, label: 'Cooldown', timeDependency: TimeDependency.REAL_TIME }],
            };
          }
          // Generic ultimate: build Animation / Statis / Active / Cooldown segments
          if (skillType === SKILL_COLUMNS.ULTIMATE) {
            const animDur = col.defaultEvent!.animationDuration ?? 0;
            const activationDur = col.defaultEvent!.defaultActivationDuration ?? 0;
            const statisDur = Math.max(0, activationDur - animDur);
            const activeDur = col.defaultEvent!.defaultActiveDuration ?? 0;
            const cooldownDur = col.defaultEvent!.defaultCooldownDuration ?? 0;

            // Build active-phase segment from frame data if available
            const ultSeqs = op && getFrameSequences(op!.id, 'ULTIMATE');
            let activeSegment: import('../../consts/viewTypes').EventSegmentData;
            if (ultSeqs?.length) {
              const ultLabels = getSegmentLabels(op!.id, 'ULTIMATE');
              const seg = SkillSegmentBuilder.buildSegments(ultSeqs, { labels: ultLabels });
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
    // ── JSON-driven derived columns (Melting Flame, Thunderlance, Crit Stacks, etc.) ──
    const derivedCols = op ? buildDerivedColumnsFromStatusEvents(op.id, slot.slotId, op.color) : [];
    const operatorDerivedCols = derivedCols.filter(c => c.source === TimelineSourceType.OPERATOR);
    for (const col of operatorDerivedCols) {
      columns.push(col);
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

    // ── Team-shared status columns (e.g. Scorching Fangs) ───────────────────
    let teamStatusColCount = 0;
    if (op) {
      for (const tsd of teamStatusDefs) {
        const isSource = slot === tsd.sourceSlot;
        if (isSource || (tsd.sourceSlot.potential ?? 0) >= tsd.minPotentialForTeam) {
          columns.push({
            key: `${slot.slotId}-${tsd.statusName.toLowerCase().replace(/_/g, '-')}`,
            type: 'mini-timeline',
            source: TimelineSourceType.OPERATOR,
            ownerId: slot.slotId,
            columnId: tsd.statusName,
            label: tsd.label.toUpperCase(),
            color: op.color,
            headerVariant: 'skill',
            derived: true,
            defaultEvent: {
              name: tsd.label,
              defaultActivationDuration: tsd.duration,
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
            },
          });
          teamStatusColCount++;
        }
      }
    }

    // Every slot gets at least MIN_SLOT_COLS columns so the loadout row stays visible
    const skillColCount = slotHasCols
      ? SKILL_ORDER.filter((st) => visibleSkills[slot.slotId]?.[st]).length
      : 0;
    const mfColCount = operatorDerivedCols.length;
    const needed = MIN_SLOT_COLS - (skillColCount + mfColCount + weaponColCount + gearColCount + tacticalColCount + teamStatusColCount);
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
    ownerId: ENEMY_OWNER_ID,
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
    ownerId: ENEMY_OWNER_ID,
    columnId: ENEMY_GROUP_COLUMNS.STAGGER_FRAILTY,
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
      ownerId: ENEMY_OWNER_ID,
      columnId: ENEMY_GROUP_COLUMNS.ARTS_INFLICTION,
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
      maxEvents: 4,
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
      ownerId: ENEMY_OWNER_ID,
      columnId: ENEMY_GROUP_COLUMNS.ARTS_REACTION,
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
      ownerId: ENEMY_OWNER_ID,
      columnId: ENEMY_GROUP_COLUMNS.PHYSICAL_INFLICTION,
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
      ownerId: ENEMY_OWNER_ID,
      columnId: ENEMY_GROUP_COLUMNS.PHYSICAL_STATUS,
      label: ColumnLabel.PHYSICAL_STATUS,
      color: '#c0c8d0',
      headerVariant: 'infliction',
      microColumns: PHYSICAL_STATUS_MICRO_COLUMNS,
      microColumnAssignment: 'dynamic-split',
      matchColumnIds: PHYSICAL_STATUS_MICRO_COLUMNS.map((mc) => mc.id),
      derived: true,
    });
  }

  // ── JSON-driven enemy-side derived columns (Originium Crystal, etc.) ────────
  for (const slot of slots) {
    if (!slot.operator) continue;
    const enemyCols = buildDerivedColumnsFromStatusEvents(slot.operator.id, slot.slotId, slot.operator.color)
      .filter(c => c.source === TimelineSourceType.ENEMY);
    for (const col of enemyCols) {
      // Avoid duplicates (enemy columns are global)
      if (!columns.some(c => c.type === 'mini-timeline' && (c as MiniTimeline).columnId === col.columnId)) {
        columns.push(col);
      }
    }
  }

  // ── Unified enemy status column ─────────────────────────────────────────────
  // Collects all enemy debuff statuses (Focus, Susceptibility, Fragility, weapon debuffs).
  // Always present — supports both derived events from operator skills and manual debug additions.
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

  const statusMicroColumns = [
    {
      id: StatusType.FOCUS,
      label: STATUS_LABELS[StatusType.FOCUS],
      color: '#55aadd',
      defaultEvent: {
        name: StatusType.FOCUS,
        defaultActivationDuration: 7200, // 60s at 120fps (Focus duration)
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        sourceOwnerId: DEBUGGER_OWNER_ID,
        sourceSkillName: 'Debug',
      },
    },
    {
      id: StatusType.SUSCEPTIBILITY,
      label: STATUS_LABELS[StatusType.SUSCEPTIBILITY],
      color: '#cc8866',
      defaultEvent: {
        name: StatusType.SUSCEPTIBILITY,
        defaultActivationDuration: 1800, // 15s at 120fps
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        sourceOwnerId: DEBUGGER_OWNER_ID,
        sourceSkillName: 'Debug',
      },
    },
    {
      id: StatusType.FRAGILITY,
      label: STATUS_LABELS[StatusType.FRAGILITY],
      color: '#cc6644',
      defaultEvent: {
        name: StatusType.FRAGILITY,
        defaultActivationDuration: 1800, // 15s at 120fps
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        sourceOwnerId: DEBUGGER_OWNER_ID,
        sourceSkillName: 'Debug',
      },
    },
    // Scorching Heart (Laevatain talent — ignored Heat RES for 20s)
    // Data-driven enemy status entries from operator statusEvents
    ...slots.flatMap(s => {
      if (!s.operator) return [];
      const json = getOperatorJson(s.operator.id);
      const statusEvents = json?.statusEvents as any[] | undefined;
      if (!statusEvents) return [];
      return statusEvents
        .filter((se: any) => se.target === 'ENEMY' && se.isNamedEvent)
        .map((se: any) => ({
          id: se.name,
          label: STATUS_LABELS[se.name as StatusType] ?? se.name,
          color: s.operator!.color,
        }));
    }),
    ...enemyWeaponDebuffs.map((ewd) => ({
      id: `fragility-${ewd.slotId}`,
      label: ewd.label,
      color: ewd.color,
      defaultEvent: {
        name: ewd.label,
        defaultActivationDuration: ewd.durationFrames,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        sourceOwnerId: DEBUGGER_OWNER_ID,
        sourceSkillName: 'Debug',
      },
    })),
  ];

  columns.push({
    key: ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    type: 'mini-timeline',
    source: TimelineSourceType.ENEMY,
    ownerId: ENEMY_OWNER_ID,
    columnId: ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    label: ColumnLabel.STATUS,
    color: '#cc8866',
    headerVariant: 'infliction',
    microColumns: statusMicroColumns,
    microColumnAssignment: 'dynamic-split',
    matchColumnIds: statusMicroColumns.map((mc) => mc.id),
  });

  return columns;
}
