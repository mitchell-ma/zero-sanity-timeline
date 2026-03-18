import { Column, MiniTimeline, Operator, Enemy, VisibleSkills } from '../../consts/viewTypes';
import { CombatSkillsType, ELEMENT_COLORS, ElementType, EventFrameType, SegmentType, StatusType, TimeDependency, TimelineSourceType } from '../../consts/enums';
import { DEBUGGER_OWNER_ID, ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS, OPERATOR_COLUMNS, SKILL_COLUMN_ORDER as SKILL_ORDER, SKILL_COLUMNS, STAGGER_FRAILTY_COLUMN_ID } from '../../model/channels';
import { SKILL_LABELS, ColumnLabel, STATUS_LABELS, REACTION_MICRO_COLUMNS } from '../../consts/timelineColumnLabels';
import { getWeaponEffectDefs, getGearEffectDefs } from '../../model/game-data/weaponGearEffectLoader';
import { TACTICALS } from '../../utils/loadoutRegistry';
import { Tactical } from '../../model/consumables/tactical';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { FPS } from '../../utils/timeline';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { SkillSegmentBuilder } from '../events/basicAttackController';
import { getFrameSequences, getSegmentLabels, getDelayedHitLabel, getOperatorJson } from '../../model/event-frames/operatorJsonLoader';
import { getLinksForSlot } from '../custom/customSkillLinkController';
import { getCustomSkills } from '../custom/customSkillController';
import { COMBAT_SKILL_LABELS } from '../../consts/timelineColumnLabels';
import { getBaseSkillId, formatSkillDisplayName } from '../../utils/semanticsTranslation';

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


/** Resolve a variant skill's display name from its JSON data + base skill label. */
function resolveVariantDisplayName(varId: string, varSkill: Record<string, any>): string {
  const baseName = COMBAT_SKILL_LABELS[getBaseSkillId(varId) as CombatSkillsType] ?? varSkill.name;
  return formatSkillDisplayName(baseName, varSkill.enhancementTypes, varSkill.name);
}

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
  // Pre-scan: collect THIS_OPERATOR status defs per operator for operator status column
  type OperatorStatusDef = { statusName: string; label: string; columnId: string; duration: number; color: string };
  const operatorStatusMap = new Map<string, OperatorStatusDef[]>();
  // Pre-scan: collect team-targeting weapon/gear effects
  type TeamEquipDef = { slotId: string; statusName: string; label: string; durationFrames: number; color: string };
  const teamWeaponGearDefs: TeamEquipDef[] = [];
  // Pre-scan: collect enemy-targeting weapon/gear effects
  type EnemyEquipDef = { statusName: string; label: string; color: string };
  const enemyWeaponGearDefs: EnemyEquipDef[] = [];

  for (const s of slots) {
    if (!s.operator) continue;
    const json = getOperatorJson(s.operator.id);
    const statusEvents = json?.statusEvents as any[] | undefined;
    if (statusEvents) {
      for (const se of statusEvents) {
        if (se.p3TeamShare) {
          const dur = se.duration?.value?.[0] ?? se.properties?.duration?.value?.[0] ?? 15;
          const durationFrames = dur > 0 ? Math.round(dur * 120) : 10 * 120;
          teamStatusDefs.push({
            sourceSlot: s,
            statusName: se.name,
            label: STATUS_LABELS[se.name as StatusType] ?? se.name,
            duration: durationFrames,
            minPotentialForTeam: 3, // P3 required for team share
          });
        }
        if (se.target === 'OPERATOR' && (!se.targetDeterminer || se.targetDeterminer === 'THIS')) {
          const dur = se.properties?.duration?.value?.[0] ?? se.duration?.value?.[0] ?? -1;
          const durationFrames = dur > 0 ? Math.round(dur * 120) : 10 * 120;
          const colId = (OPERATOR_COLUMNS as Record<string, string>)[se.name]
            ?? se.name.toLowerCase().replace(/_/g, '-');
          const defs = operatorStatusMap.get(s.slotId) ?? [];
          defs.push({
            statusName: se.name,
            label: STATUS_LABELS[se.name as StatusType] ?? se.name,
            columnId: colId,
            duration: durationFrames,
            color: s.operator.color,
          });
          operatorStatusMap.set(s.slotId, defs);
        }
      }
    }

    // Scan weapon effect DSL defs
    const addEquipDefs = (dslDefs: any[]) => {
      for (const se of dslDefs) {
        const dur = se.properties?.duration?.value?.[0] ?? 10;
        const durationFrames = dur > 0 ? Math.round(dur * 120) : 10 * 120;
        const colId = se.name.toLowerCase().replace(/_/g, '-');
        if (se.target === 'OPERATOR' && (!se.targetDeterminer || se.targetDeterminer === 'THIS')) {
          // Wielder-targeted → operator status micro-column
          const defs = operatorStatusMap.get(s.slotId) ?? [];
          defs.push({
            statusName: se.name,
            label: se.label ?? se.name,
            columnId: colId,
            duration: durationFrames,
            color: s.operator!.color,
          });
          operatorStatusMap.set(s.slotId, defs);
        } else if (se.target === 'OPERATOR' && se.targetDeterminer === 'OTHER') {
          // Team-targeted → team weapon/gear column
          teamWeaponGearDefs.push({
            slotId: s.slotId,
            statusName: se.name,
            label: se.label ?? se.name,
            durationFrames,
            color: s.operator!.color,
          });
        } else if (se.target === 'ENEMY') {
          // Enemy-targeted → enemy status micro-column
          enemyWeaponGearDefs.push({
            statusName: se.name,
            label: se.label ?? se.name,
            color: s.operator!.color,
          });
        }
      }
    };
    if (s.weaponName) addEquipDefs(getWeaponEffectDefs(s.weaponName));
    if (s.gearSetType) addEquipDefs(getGearEffectDefs(s.gearSetType));
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

  // ── Shared team weapon/gear effect column ─────────────────────────────────
  const teamGearBuffs = teamWeaponGearDefs;
  if (teamGearBuffs.length > 0) {
    const microCols = teamGearBuffs.map((tgb) => {
      const id = tgb.statusName.toLowerCase().replace(/_/g, '-');
      return {
        id,
        label: tgb.label,
        color: tgb.color,
        defaultEvent: {
          name: tgb.label,
          defaultActivationDuration: tgb.durationFrames,
          defaultActiveDuration: 0,
          defaultCooldownDuration: 0,
        },
      };
    });
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
      microColumns: microCols,
      microColumnAssignment: 'dynamic-split',
      matchColumnIds: microCols.map((mc) => mc.id),
    });
  }

  for (const slot of slots) {
    const op = slot.operator;
    const opJson = op ? getOperatorJson(op.id) : null;
    const opSkills = (opJson?.skills ?? {}) as Record<string, any>;
    // Detect variants by presence of _ENHANCED/_EMPOWERED skill ID suffixes
    const basicName = op?.skills.basic?.name;
    const battleName = op?.skills.battle?.name;
    const hasBasicVariants = basicName && (!!opSkills[basicName + '_ENHANCED'] || !!opSkills[basicName + '_EMPOWERED']);
    const hasBattleVariants = battleName && (!!opSkills[battleName + '_ENHANCED'] || !!opSkills[battleName + '_EMPOWERED']);
    const hasComboOverride = false; // Combo frame overrides now handled generically
    let slotHasCols = false;
    if (op) {
      // Dash subtimeline — before basic attack
      const DASH_FRAMES = Math.round(0.416 * 120); // 0.416s
      const DODGE_FRAMES = Math.round(0.351 * 120); // 0.351s game-time
      const FINISHER_FRAMES = Math.round(GENERAL_MECHANICS.basicAttack.finisherDurationSeconds * FPS);
      const DIVE_FRAMES = Math.round(GENERAL_MECHANICS.basicAttack.diveDurationSeconds * FPS);
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
            const base = SkillSegmentBuilder.buildSegments(getFrameSequences(op.id, skill.name));
            col.defaultEvent = {
              name: skill.name,
              defaultActivationDuration: base.totalDurationFrames,
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
              segments: base.segments,
            };
            col.eventVariants = [{ ...col.defaultEvent }];
            // Auto-discover variant skill IDs
            for (const suffix of ['_ENHANCED', '_EMPOWERED']) {
              const varId = skill.name + suffix;
              const varSkill = opSkills[varId];
              if (!varSkill) continue;
              const variantSeqs = getFrameSequences(op.id, varId);
              if (variantSeqs?.length) {
                const variantSeg = SkillSegmentBuilder.buildSegments(variantSeqs);
                col.eventVariants.push({
                  name: varId,
                  displayName: resolveVariantDisplayName(varId, varSkill),
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
                segments: [{ durationFrames: FINISHER_FRAMES, label: 'Finisher', frames: [{ offsetFrame: 0, skillPointRecovery: 0, stagger: 0, frameTypes: [EventFrameType.FINISHER] }] }],
              },
              {
                name: CombatSkillsType.DIVE,
                defaultActivationDuration: DIVE_FRAMES,
                defaultActiveDuration: 0,
                defaultCooldownDuration: 0,
                segments: [{ durationFrames: DIVE_FRAMES, label: 'Dive', frames: [{ offsetFrame: 0, skillPointRecovery: 0, stagger: 0, frameTypes: [EventFrameType.DIVE] }] }],
              },
            );
          }
          // Battle skill variants (derived from ENHANCED_*/EMPOWERED_* skill categories)
          if (hasBattleVariants && skillType === SKILL_COLUMNS.BATTLE && op) {
            const baseSeg = SkillSegmentBuilder.buildSegments(
              getFrameSequences(op.id, skill.name),
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
            // Auto-discover variant skill IDs
            for (const suffix of ['_ENHANCED', '_EMPOWERED', '_ENHANCED_EMPOWERED']) {
              const varId = skill.name + suffix;
              const varSkill = opSkills[varId];
              if (!varSkill) continue;
              const variantSeqs = getFrameSequences(op.id, varId);
              if (!variantSeqs?.length) continue;
              // Enhanced variants default to 0 gauge gain; empowered inherits base
              const isEnhanced = suffix.includes('ENHANCED');
              const gg = isEnhanced ? 0 : skill.gaugeGain;
              const tgg = isEnhanced ? 0 : skill.teamGaugeGain;
              const variantSeg = SkillSegmentBuilder.buildSegments(variantSeqs, { gaugeGain: gg, teamGaugeGain: tgg });
              // Apply frame modifications if defined on the variant
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
                name: varId,
                displayName: resolveVariantDisplayName(varId, varSkill),
                defaultActivationDuration: variantSeg.totalDurationFrames,
                segments: variantSeg.segments,
                ...(varSkill.triggerCondition ? { triggerCondition: varSkill.triggerCondition } : {}),
                gaugeGain: gg,
                teamGaugeGain: tgg,
              });
            }
          }
          // Generic basic attack: data-driven frame sequences
          const basicSeqs = op && basicName ? getFrameSequences(op.id, basicName) : undefined;
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
          const battleSeqs = op && battleName ? getFrameSequences(op.id, battleName) : undefined;
          if (battleSeqs?.length && skillType === SKILL_COLUMNS.BATTLE && !hasBattleVariants) {
            const battleDelayLabel = getDelayedHitLabel(op!.id, battleName!);
            const seg = SkillSegmentBuilder.buildSegments(battleSeqs, { gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain, delayedHitLabel: battleDelayLabel });
            const battleCd = col.defaultEvent!.defaultCooldownDuration ?? 0;
            const battleSegments = battleCd > 0
              ? [...seg.segments, { durationFrames: battleCd, label: 'Cooldown', timeDependency: TimeDependency.REAL_TIME, segmentType: SegmentType.COOLDOWN, offset: 0 }]
              : seg.segments;
            col.defaultEvent = {
              ...col.defaultEvent!,
              defaultActivationDuration: seg.totalDurationFrames,
              segments: battleSegments,
            };
            // Empowered battle skill variant (e.g. Arclight's additional attack on Electrification)
            const empoweredBattleId = battleName + '_EMPOWERED';
            const empoweredBattleSeqs = battleName ? getFrameSequences(op!.id, empoweredBattleId) : undefined;
            if (empoweredBattleSeqs?.length) {
              const empowered = SkillSegmentBuilder.buildSegments(empoweredBattleSeqs);
              const empoweredName = empoweredBattleId as CombatSkillsType;
              const empBattleCd = col.defaultEvent!.defaultCooldownDuration ?? 0;
              const empBaseSegs = empBattleCd > 0
                ? [...seg.segments, { durationFrames: empBattleCd, label: 'Cooldown', timeDependency: TimeDependency.REAL_TIME, segmentType: SegmentType.COOLDOWN, offset: 0 }]
                : seg.segments;
              const empVarSegs = empBattleCd > 0
                ? [...empowered.segments, { durationFrames: empBattleCd, label: 'Cooldown', timeDependency: TimeDependency.REAL_TIME, segmentType: SegmentType.COOLDOWN, offset: 0 }]
                : empowered.segments;
              col.eventVariants = [
                {
                  name: col.defaultEvent!.name!,
                  defaultActivationDuration: seg.totalDurationFrames,
                  defaultActiveDuration: 0,
                  defaultCooldownDuration: 0,
                  segments: empBaseSegs,
                },
                {
                  name: empoweredName,
                  displayName: resolveVariantDisplayName(empoweredBattleId, opSkills[empoweredBattleId] ?? {}),
                  defaultActivationDuration: empowered.totalDurationFrames,
                  defaultActiveDuration: 0,
                  defaultCooldownDuration: 0,
                  segments: empVarSegs,
                  triggerCondition: 'Requires: Empowered condition',
                },
              ];
            }
          }
          // Generic combo skill: data-driven frame sequences
          const comboName = op?.skills.combo?.name;
          const comboSeqs = op && comboName ? getFrameSequences(op.id, comboName) : undefined;
          if (comboSeqs?.length && skillType === SKILL_COLUMNS.COMBO && !hasComboOverride) {
            const comboLabels = getSegmentLabels(op!.id, comboName!);
            const comboDelayLabel = getDelayedHitLabel(op!.id, comboName!);
            const seg = SkillSegmentBuilder.buildSegments(comboSeqs, { labels: comboLabels, gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain, gaugeGainByEnemies: skill.gaugeGainByEnemies, delayedHitLabel: comboDelayLabel });
            const comboCd = skill.defaultCooldownDuration ?? 0;
            col.defaultEvent = {
              ...col.defaultEvent!,
              defaultActivationDuration: seg.totalDurationFrames,
              segments: [...seg.segments, { durationFrames: comboCd, label: 'Cooldown', timeDependency: TimeDependency.REAL_TIME, segmentType: SegmentType.COOLDOWN, offset: 0 }],
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
            const ultName = op?.skills.ultimate?.name;
            const ultSeqs = op && ultName ? getFrameSequences(op!.id, ultName) : undefined;
            let activeSegment: import('../../consts/viewTypes').EventSegmentData;
            if (ultSeqs?.length) {
              const ultLabels = getSegmentLabels(op!.id, ultName!);
              const seg = SkillSegmentBuilder.buildSegments(ultSeqs, { labels: ultLabels });
              activeSegment = { ...seg.segments[0], durationFrames: activeDur > 0 ? activeDur : seg.segments[0].durationFrames, label: 'Active', segmentType: SegmentType.ACTIVE };
            } else {
              activeSegment = { durationFrames: activeDur, label: 'Active', segmentType: SegmentType.ACTIVE };
            }

            const ultSegments: import('../../consts/viewTypes').EventSegmentData[] = [
              { durationFrames: animDur, label: 'Animation', timeDependency: TimeDependency.REAL_TIME, segmentType: SegmentType.ANIMATION },
              { durationFrames: statisDur, label: 'Statis', segmentType: SegmentType.NORMAL },
              activeSegment,
              { durationFrames: cooldownDur, label: 'Cooldown', timeDependency: TimeDependency.REAL_TIME, segmentType: SegmentType.COOLDOWN },
            ];

            col.defaultEvent = {
              ...col.defaultEvent!,
              segments: ultSegments,
            };
          }
          // ── Append linked custom skills as event variants ──
          if (op) {
            const linkedIds = getLinksForSlot(op.id, skillType);
            if (linkedIds.length > 0) {
              const allCustom = getCustomSkills();
              if (!col.eventVariants) {
                col.eventVariants = col.defaultEvent ? [{ ...col.defaultEvent }] : [];
              }
              for (const csId of linkedIds) {
                const cs = allCustom.find((s) => s.id === csId);
                if (!cs) continue;
                col.eventVariants.push({
                  name: cs.id,
                  displayName: cs.name,
                  defaultActivationDuration: Math.round(cs.durationSeconds * FPS),
                  defaultActiveDuration: 0,
                  defaultCooldownDuration: Math.round((cs.cooldownSeconds ?? 0) * FPS),
                  animationDuration: cs.animationSeconds ? Math.round(cs.animationSeconds * FPS) : undefined,
                  skillPointCost: cs.resourceInteractions?.find((r) => r.resourceType === 'SKILL_POINT')?.value,
                });
              }
            }
          }

          columns.push(col);
          slotHasCols = true;
        }
      }
    }
    // ── OTHER column — uncategorized operator damage ──────────────────────────
    let otherColCount = 0;
    if (op) {
      const OTHER_DEFAULT_FRAMES = Math.round(1 * FPS); // 1 second at 120fps
      columns.push({
        key: `${slot.slotId}-${OPERATOR_COLUMNS.OTHER}`,
        type: 'mini-timeline',
        source: TimelineSourceType.OPERATOR,
        ownerId: slot.slotId,
        columnId: OPERATOR_COLUMNS.OTHER,
        label: ColumnLabel.OTHER,
        color: op.color,
        headerVariant: 'skill',
        defaultEvent: {
          name: 'Other',
          defaultActivationDuration: OTHER_DEFAULT_FRAMES,
          defaultActiveDuration: 0,
          defaultCooldownDuration: 0,
        },
      });
      otherColCount++;
      slotHasCols = true;
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

    // ── Operator status column (Melting Flame, Scorching Fangs, etc.) ────────
    let statusColCount = 0;
    if (op) {
      // Collect micro-columns: own statuses + team-shared statuses from other operators
      const statusMicroCols: { id: string; label: string; color: string; defaultEvent?: any }[] = [];
      const matchIds: string[] = [];
      const ownDefs = operatorStatusMap.get(slot.slotId) ?? [];
      for (const def of ownDefs) {
        statusMicroCols.push({
          id: def.columnId,
          label: def.label,
          color: def.color,
          defaultEvent: {
            name: def.label,
            defaultActivationDuration: def.duration,
            defaultActiveDuration: 0,
            defaultCooldownDuration: 0,
          },
        });
        matchIds.push(def.columnId);
        // Also match StatusType enum value (e.g. 'SCORCHING_FANGS') used by processStatus.ts
        if (def.statusName !== def.columnId) matchIds.push(def.statusName);
      }
      // Team-shared statuses from other operators (e.g. Scorching Fangs shared at P3)
      for (const tsd of teamStatusDefs) {
        const isSource = slot === tsd.sourceSlot;
        if (!isSource && (tsd.sourceSlot.potential ?? 0) >= tsd.minPotentialForTeam) {
          // Use statusName directly as ID — matches events from processStatus.ts
          statusMicroCols.push({
            id: tsd.statusName,
            label: tsd.label,
            color: op.color,
            defaultEvent: {
              name: tsd.label,
              defaultActivationDuration: tsd.duration,
              defaultActiveDuration: 0,
              defaultCooldownDuration: 0,
            },
          });
          matchIds.push(tsd.statusName);
          // Also match kebab-case form used by statusDerivationEngine
          const kebab = tsd.statusName.toLowerCase().replace(/_/g, '-');
          if (kebab !== tsd.statusName) matchIds.push(kebab);
        }
      }
      if (statusMicroCols.length > 0) {
        columns.push({
          key: `${slot.slotId}-operator-status`,
          type: 'mini-timeline',
          source: TimelineSourceType.OPERATOR,
          ownerId: slot.slotId,
          columnId: 'operator-status',
          label: ColumnLabel.STATUS,
          color: op.color,
          headerVariant: 'skill',
          derived: true,
          microColumns: statusMicroCols,
          microColumnAssignment: 'dynamic-split',
          matchColumnIds: matchIds,
        });
        statusColCount++;
      }
    }

    // Every slot gets at least MIN_SLOT_COLS columns so the loadout row stays visible
    const skillColCount = slotHasCols
      ? SKILL_ORDER.filter((st) => visibleSkills[slot.slotId]?.[st]).length
      : 0;
    const needed = MIN_SLOT_COLS - (skillColCount + otherColCount + tacticalColCount + statusColCount);
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

  // ── Unified enemy status column ─────────────────────────────────────────────
  // Single column collecting all enemy statuses: inflictions, reactions, physical
  // statuses, stagger frailty, and debuffs.
  const statusMicroColumns = [
    // Stagger frailty
    {
      id: STAGGER_FRAILTY_COLUMN_ID,
      label: 'STAGGER',
      color: '#dd8844',
    },
    // Arts inflictions
    ...enemy.statuses.map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color,
    })),
    // Arts reactions
    ...REACTION_MICRO_COLUMNS.map((mc) => ({
      id: mc.id,
      label: mc.label,
      color: mc.color,
    })),
    // Physical inflictions
    {
      id: 'vulnerableInfliction',
      label: 'VULN',
      color: '#c0c8d0',
    },
    // Physical statuses
    {
      id: 'breach',
      label: 'BREACH',
      color: '#c0c8d0',
    },
    // Debuffs
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
    // Data-driven enemy status entries from operator statusEvents (deduped by id)
    ...(() => {
      const seen = new Set<string>();
      return slots.flatMap(s => {
        if (!s.operator) return [];
        const json = getOperatorJson(s.operator.id);
        const statusEvents = json?.statusEvents as any[] | undefined;
        if (!statusEvents) return [];
        return statusEvents
          .filter((se: any) => se.target === 'ENEMY')
          .filter((se: any) => {
            const id = se.name.toLowerCase().replace(/_/g, '-');
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          })
          .map((se: any) => ({
            id: se.name.toLowerCase().replace(/_/g, '-'),
            label: STATUS_LABELS[se.name as StatusType] ?? se.name,
            color: s.operator!.color,
          }));
      });
    })(),
  ];

  // Enemy-targeting weapon/gear effects (deduped against existing micro-column ids)
  const existingEnemyIds = new Set(statusMicroColumns.map((mc) => mc.id));
  for (const d of enemyWeaponGearDefs) {
    const id = d.statusName.toLowerCase().replace(/_/g, '-');
    if (existingEnemyIds.has(id)) continue;
    existingEnemyIds.add(id);
    statusMicroColumns.push({ id, label: d.label, color: d.color });
  }

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
