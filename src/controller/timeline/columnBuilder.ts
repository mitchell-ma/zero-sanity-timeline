import { Column, MiniTimeline, Operator, Enemy, VisibleSkills } from '../../consts/viewTypes';
import type { Predicate } from '../../dsl/semantics';
import { CombatSkillType, ELEMENT_COLORS, ElementType, EnhancementType, EventFrameType, SegmentType, StatusType, TimeDependency, TimelineSourceType } from '../../consts/enums';
import { ENEMY_OWNER_ID, USER_ID, ENEMY_GROUP_COLUMNS, OPERATOR_COLUMNS, PHYSICAL_STATUS_COLUMNS, SKILL_COLUMN_ORDER as SKILL_ORDER, SKILL_COLUMNS, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID } from '../../model/channels';
import { SKILL_LABELS, ColumnLabel, STATUS_LABELS, REACTION_MICRO_COLUMNS } from '../../consts/timelineColumnLabels';
import { getWeaponEffectDefs, getGearEffectDefs } from '../../model/game-data/weaponGearEffectLoader';
import { getTacticalEntry, getWeapon } from '../gameDataController';
import { Tactical } from '../../model/consumables/tactical';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { SkillSegmentBuilder } from '../events/basicAttackController';
import { getFrameSequences, getSegmentLabels, getOperatorJson } from '../../model/event-frames/operatorJsonLoader';
import { getLinksForSlot } from '../custom/customSkillLinkController';
import { getCustomSkills } from '../custom/customSkillController';
import { COMBAT_SKILL_LABELS } from '../../consts/timelineColumnLabels';
import { getBaseSkillId, formatSkillDisplayName } from '../../dsl/semanticsTranslation';
import { buildContextForSkillColumn } from '../calculation/valueResolver';
import { aggregateLoadoutStats } from '../calculation/loadoutAggregator';

export interface Slot {
  slotId: string;
  operator: Operator | null;
  potential?: number;
  /** Equipped weapon ID (for weapon skill subtimeline columns). */
  weaponId?: string;
  /** Equipped tactical ID (for tactical subtimeline column). */
  tacticalId?: string;
  /** Active gear set effect type (3+ matching pieces). */
  gearSetType?: import('../../consts/enums').GearSetType;
  /** Combo skill level (1–12) for level-dependent cooldown computation. */
  comboSkillLevel?: number;
  /** Full loadout properties for context-aware value resolution. */
  loadoutProperties?: import('../../view/InformationPane').LoadoutProperties;
  /** Equipment loadout for stat aggregation. */
  loadout?: import('../../view/OperatorLoadoutHeader').OperatorLoadoutState;
}


/** Resolve a variant skill's display name from its JSON data + base skill label. */
function resolveVariantDisplayName(varId: string, varSkill: Record<string, unknown>): string {
  const baseName = COMBAT_SKILL_LABELS[getBaseSkillId(varId) as CombatSkillType] ?? (varSkill.name as string);
  return formatSkillDisplayName(baseName, (varSkill.properties as Record<string, unknown> | undefined)?.enhancementTypes as string[] | undefined, varSkill.name as string | undefined);
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
  type OperatorStatusDef = { statusName: string; label: string; columnId: string; duration: number; color: string; source: 'talent' | 'weapon' | 'gear' | 'other'; statusType?: string; stacks?: Record<string, unknown> };
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
    const statusEvents = json?.statusEvents as Record<string, unknown>[] | undefined;
    if (statusEvents) {
      for (const se of statusEvents) {
        const seProps = se.properties as Record<string, unknown> | undefined;
        const target = se.target ?? seProps?.target;
        const targetDeterminer = se.targetDeterminer ?? seProps?.targetDeterminer;
        const seId = se.id ?? seProps?.id;
        if (target === 'OPERATOR' && (!targetDeterminer || targetDeterminer === 'THIS') && seId) {
          const seStacks = seProps?.stacks as { limit?: { value?: number }; duration?: { value?: { value?: number } | number | number[] }; interactionType?: string } | undefined;
          const seDur = (seProps?.duration ?? se.duration ?? seStacks?.duration) as { value?: { value?: number } | number | number[] } | undefined;
          const rawVal = seDur?.value;
          const durVal = typeof rawVal === 'object' && rawVal !== null && !Array.isArray(rawVal)
            ? (rawVal as { value?: number }).value
            : Array.isArray(rawVal) ? rawVal[0] : rawVal;
          const dur = durVal ?? -1;
          const durationFrames = dur === -1 ? TOTAL_FRAMES : dur > 0 ? Math.round(dur * FPS) : 10 * FPS;
          const colId = (OPERATOR_COLUMNS as Record<string, string>)[seId as string]
            ?? (seId as string).toLowerCase().replace(/_/g, '-');
          const seType = (seProps?.type ?? se.type) as string | undefined;
          const defs = operatorStatusMap.get(s.slotId) ?? [];
          defs.push({
            statusName: seId as string,
            label: STATUS_LABELS[seId as StatusType] ?? (seId as string),
            columnId: colId,
            duration: durationFrames,
            color: s.operator.color,
            source: 'talent',
            statusType: seType ?? 'STATUS',
          });
          operatorStatusMap.set(s.slotId, defs);
        }
      }
    }

    // Scan weapon effect DSL defs
    const addEquipDefs = (dslDefs: Record<string, unknown>[], equipSource: 'weapon' | 'gear') => {
      for (const se of dslDefs) {
        const sePropsEquip = se.properties as Record<string, Record<string, unknown[]>> | undefined;
        const dur = sePropsEquip?.duration?.value?.[0] as number ?? 10;
        const durationFrames = dur > 0 ? Math.round(dur * 120) : 10 * 120;
        const equipId = se.id as string;
        const colId = equipId.toLowerCase().replace(/_/g, '-');
        if (se.target === 'OPERATOR' && (!se.targetDeterminer || se.targetDeterminer === 'THIS')) {
          // Wielder-targeted → operator status micro-column
          const defs = operatorStatusMap.get(s.slotId) ?? [];
          defs.push({
            statusName: equipId,
            label: (se.label as string) ?? equipId,
            columnId: colId,
            duration: durationFrames,
            color: s.operator!.color,
            source: equipSource,
            statusType: equipSource === 'weapon' ? 'WEAPON_STATUS' : 'GEAR_STATUS',
          });
          operatorStatusMap.set(s.slotId, defs);
        } else if (se.target === 'OPERATOR' && se.targetDeterminer === 'OTHER') {
          // Team-targeted → team weapon/gear column
          teamWeaponGearDefs.push({
            slotId: s.slotId,
            statusName: equipId,
            label: (se.label as string) ?? equipId,
            durationFrames,
            color: s.operator!.color,
          });
        } else if (se.target === 'ENEMY') {
          // Enemy-targeted → enemy status micro-column
          enemyWeaponGearDefs.push({
            statusName: equipId,
            label: (se.label as string) ?? equipId,
            color: s.operator!.color,
          });
        }
      }
    };
    const weaponDisplayName = s.weaponId ? getWeapon(s.weaponId)?.name : undefined;
    if (weaponDisplayName) addEquipDefs(getWeaponEffectDefs(weaponDisplayName), 'weapon');
    if (s.gearSetType) addEquipDefs(getGearEffectDefs(s.gearSetType), 'gear');
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

  const teamTeamColumns = new Set<string>();

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
        segments: [{ properties: { duration: 2400 } }], // 20 seconds at 120fps
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
        segments: [{ properties: { duration: 1800 } }], // 15 seconds at 120fps
      },
    });
  }

  if (teamTeamColumns.has('team-wildland-trekker')) {
    columns.push({
      key: `${COMMON_OWNER_ID}-wildland-trekker`,
      type: 'mini-timeline',
      source: TimelineSourceType.COMMON,
      ownerId: COMMON_OWNER_ID,
      columnId: 'WILDLAND_TREKKER',
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
      columnId: 'MESSENGERS_SONG',
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
          segments: [{ properties: { duration: tgb.durationFrames } }],
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
    const opSkills = (opJson?.skills ?? {}) as Record<string, Record<string, unknown>>;
    // Detect variants by presence of _ENHANCED/_EMPOWERED skill ID suffixes
    const basicName = op?.skills.basic?.name;
    const battleName = op?.skills.battle?.name;
    const hasBasicVariants = basicName && (!!opSkills[basicName + '_ENHANCED'] || !!opSkills[basicName + '_EMPOWERED']);
    const hasBattleVariants = battleName && (!!opSkills[battleName + '_ENHANCED'] || !!opSkills[battleName + '_EMPOWERED']);
    let slotHasCols = false;
    // ── Aggregated stats for value resolution context ──
    const slotAggStats = op && slot.loadout && slot.loadoutProperties
      ? aggregateLoadoutStats(op.id, slot.loadout, slot.loadoutProperties)?.stats
      : undefined;
    /** Build a ValueResolutionContext for a given skill column on this slot. */
    const ctxFor = (skillColumn: string) =>
      buildContextForSkillColumn(slot.loadoutProperties, skillColumn, slotAggStats);
    if (op) {
      // Input subtimeline — dash, dodge, finisher, dive, controlled
      const DASH_FRAMES = Math.round(0.416 * 120); // 0.416s
      const DODGE_FRAMES = Math.round(0.351 * 120); // 0.351s game-time
      const FINISHER_FRAMES = Math.round(GENERAL_MECHANICS.basicAttack.finisherDurationSeconds * FPS);
      const DIVE_FRAMES = Math.round(GENERAL_MECHANICS.basicAttack.diveDurationSeconds * FPS);
      columns.push({
        key: `${slot.slotId}-input`,
        type: 'mini-timeline',
        source: TimelineSourceType.OPERATOR,
        ownerId: slot.slotId,
        columnId: OPERATOR_COLUMNS.INPUT,
        label: 'INPUT',
        color: ELEMENT_COLORS[ElementType.PHYSICAL],
        headerVariant: 'skill',
        eventVariants: [
          {
            name: CombatSkillType.DASH,
            segments: [{ properties: { duration: DASH_FRAMES } }],
          },
          {
            name: CombatSkillType.DASH,
            isPerfectDodge: true,
            timeInteraction: 'TIME_STOP',
            timeDependency: TimeDependency.REAL_TIME,
            segments: [{ properties: { segmentTypes: [SegmentType.ANIMATION], duration: DODGE_FRAMES, name: 'Animation', timeDependency: TimeDependency.REAL_TIME } }],
          },
        ],
        defaultEvent: {
          name: CombatSkillType.DASH,
          segments: [{ properties: { duration: DASH_FRAMES } }],
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
              segments: skill.defaultSegments,
              triggerCondition: skill.triggerCondition,
              gaugeGain: skill.gaugeGain,
              teamGaugeGain: skill.teamGaugeGain,
              ...(skill.gaugeGainByEnemies ? { gaugeGainByEnemies: skill.gaugeGainByEnemies } : {}),
              ...(skillType === SKILL_COLUMNS.ULTIMATE && slot.potential != null ? { operatorPotential: slot.potential } : {}),
              ...(skillType === SKILL_COLUMNS.BATTLE && skill.skillPointCost != null ? { skillPointCost: skill.skillPointCost } : {}),
            },
          };
          // Combo columns: use model's level-dependent cooldown + match activation windows
          if (skillType === SKILL_COLUMNS.COMBO) {
            col.matchColumnIds = [SKILL_COLUMNS.COMBO, 'comboActivationWindow'];
          }
          // Basic attack variants (derived from ENHANCED_*/EMPOWERED_* skill categories)
          const skillCtx = ctxFor(skillType);
          if (hasBasicVariants && skillType === SKILL_COLUMNS.BASIC && op) {
            const base = SkillSegmentBuilder.buildSegments(getFrameSequences(op.id, skill.name), { ctx: skillCtx });
            col.defaultEvent = {
              name: skill.name,
              segments: base.segments,
            };
            col.eventVariants = [{ ...col.defaultEvent, enhancementType: EnhancementType.NORMAL }];
            // Auto-discover variant skill IDs
            for (const suffix of ['_ENHANCED', '_EMPOWERED']) {
              const varId = skill.name + suffix;
              const varSkill = opSkills[varId];
              if (!varSkill) continue;
              const variantSeqs = getFrameSequences(op.id, varId);
              if (variantSeqs?.length) {
                const variantSeg = SkillSegmentBuilder.buildSegments(variantSeqs, { ctx: skillCtx });
                const enhancementType = suffix === '_ENHANCED' ? EnhancementType.ENHANCED : EnhancementType.EMPOWERED;
                col.eventVariants!.push({
                  name: varId,
                  displayName: resolveVariantDisplayName(varId, varSkill),
                  enhancementType,
                  segments: variantSeg.segments,
                  ...(varSkill.triggerCondition ? { triggerCondition: varSkill.triggerCondition as string } : {}),
                  ...(varSkill.activationClause ? { activationClause: varSkill.activationClause as Predicate[] } : {}),
                });
              }
            }
            // Finisher + Dive — built from per-operator skills JSON when available
            const rawTypeMap = opJson?.skillTypeMap as Record<string, unknown> | undefined;
            const basicEntry = rawTypeMap?.BASIC_ATTACK as Record<string, string> | undefined;
            const finisherId = basicEntry?.FINISHER;
            const diveId = basicEntry?.DIVE;

            const finSeqs = finisherId ? getFrameSequences(op.id, finisherId) : [];
            const diveSeqs = diveId ? getFrameSequences(op.id, diveId) : [];

            const finSeg = finSeqs.length
              ? SkillSegmentBuilder.buildSegments(finSeqs, { labels: ['Finisher'], ctx: skillCtx })
              : { totalDurationFrames: FINISHER_FRAMES, segments: [{ properties: { duration: FINISHER_FRAMES, name: 'Finisher' }, frames: [{ offsetFrame: FINISHER_FRAMES, skillPointRecovery: 0, stagger: 0, frameTypes: [EventFrameType.FINISHER] }] }] };
            const diveSeg = diveSeqs.length
              ? SkillSegmentBuilder.buildSegments(diveSeqs, { labels: ['Dive'], ctx: skillCtx })
              : { totalDurationFrames: DIVE_FRAMES, segments: [{ properties: { duration: DIVE_FRAMES, name: 'Dive' }, frames: [{ offsetFrame: DIVE_FRAMES, skillPointRecovery: 0, stagger: 0, frameTypes: [EventFrameType.DIVE] }] }] };

            col.eventVariants!.push(
              {
                name: CombatSkillType.FINISHER,
                segments: finSeg.segments,
              },
              {
                name: CombatSkillType.DIVE,
                segments: diveSeg.segments,
              },
            );
          }
          // Battle skill variants (derived from ENHANCED_*/EMPOWERED_* skill categories)
          if (hasBattleVariants && skillType === SKILL_COLUMNS.BATTLE && op) {
            const baseSeg = SkillSegmentBuilder.buildSegments(
              getFrameSequences(op.id, skill.name),
              { gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain, ctx: skillCtx },
            );
            col.defaultEvent = {
              ...col.defaultEvent!,
              name: skill.name,
              segments: baseSeg.segments,
              gaugeGain: skill.gaugeGain,
              teamGaugeGain: skill.teamGaugeGain,
            };
            col.eventVariants = [{ ...col.defaultEvent!, enhancementType: EnhancementType.NORMAL }];
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
              const variantSeg = SkillSegmentBuilder.buildSegments(variantSeqs, { gaugeGain: gg, teamGaugeGain: tgg, ctx: skillCtx });
              // Apply frame modifications if defined on the variant
              if (varSkill.frameModifications) {
                for (const fm of varSkill.frameModifications as { segmentIndex: number; frameIndex: number; stagger?: number; gaugeGain?: number; consumeStatus?: string; removeConsumeArtsInfliction?: boolean; spReturnP1?: number }[]) {
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
              const enhancementType = suffix === '_ENHANCED' ? EnhancementType.ENHANCED
                : suffix === '_EMPOWERED' ? EnhancementType.EMPOWERED
                : EnhancementType.ENHANCED; // ENHANCED_EMPOWERED treated as ENHANCED
              col.eventVariants!.push({
                ...col.defaultEvent!,
                name: varId,
                displayName: resolveVariantDisplayName(varId, varSkill),
                enhancementType,
                segments: variantSeg.segments,
                ...(varSkill.triggerCondition ? { triggerCondition: varSkill.triggerCondition as string } : {}),
                ...(varSkill.activationClause ? { activationClause: varSkill.activationClause as Predicate[] } : {}),
                gaugeGain: gg,
                teamGaugeGain: tgg,
              });
            }
          }
          // Generic basic attack: data-driven frame sequences
          const basicSeqs = op && basicName ? getFrameSequences(op.id, basicName) : undefined;
          if (basicSeqs?.length && skillType === SKILL_COLUMNS.BASIC) {
            const base = SkillSegmentBuilder.buildSegments(basicSeqs, { ctx: skillCtx });
            col.defaultEvent = {
              name: skill.name,
              segments: base.segments,
            };
          }
          // Generic battle skill: data-driven frame sequences
          const battleSeqs = op && battleName ? getFrameSequences(op.id, battleName) : undefined;
          if (battleSeqs?.length && skillType === SKILL_COLUMNS.BATTLE && !hasBattleVariants) {
            const seg = SkillSegmentBuilder.buildSegments(battleSeqs, { gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain, ctx: skillCtx });
            // Only append cooldown if the data-driven segments don't already include one
            const hasBattleCdSegment = seg.segments.some(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN));
            let battleSegments: import('../../consts/viewTypes').EventSegmentData[];
            if (hasBattleCdSegment) {
              battleSegments = seg.segments;
            } else {
              const battleCdSeg = skill.defaultSegments?.find(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN));
              const battleCd = battleCdSeg?.properties.duration ?? 0;
              battleSegments = battleCd > 0
                ? [...seg.segments, { properties: { segmentTypes: [SegmentType.COOLDOWN, SegmentType.IMMEDIATE_COOLDOWN], duration: battleCd, name: 'Cooldown', timeDependency: TimeDependency.REAL_TIME } }]
                : seg.segments;
            }
            col.defaultEvent = {
              ...col.defaultEvent!,
              segments: battleSegments,
            };
            // Empowered battle skill variant (e.g. Arclight's additional attack on Electrification)
            const empoweredBattleId = battleName + '_EMPOWERED';
            const empoweredBattleSeqs = battleName ? getFrameSequences(op!.id, empoweredBattleId) : undefined;
            if (empoweredBattleSeqs?.length) {
              const empowered = SkillSegmentBuilder.buildSegments(empoweredBattleSeqs, { ctx: skillCtx });
              const empoweredName = empoweredBattleId as CombatSkillType;
              const hasEmpCdSegment = empowered.segments.some(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN));
              // Append cooldown from base skill if empowered segments don't have one
              const cdSeg = battleSegments.find(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN));
              const empVarSegs = hasEmpCdSegment || !cdSeg
                ? empowered.segments
                : [...empowered.segments, cdSeg];
              col.eventVariants = [
                {
                  name: col.defaultEvent!.name!,
                  segments: battleSegments,
                },
                {
                  name: empoweredName,
                  displayName: resolveVariantDisplayName(empoweredBattleId, opSkills[empoweredBattleId] ?? {}),
                  segments: empVarSegs,
                  triggerCondition: 'Requires: Empowered condition',
                },
              ];
            }
          }
          // Generic combo skill: data-driven frame sequences
          const comboName = op?.skills.combo?.name;
          const comboSeqs = op && comboName ? getFrameSequences(op.id, comboName) : undefined;
          if (comboSeqs?.length && skillType === SKILL_COLUMNS.COMBO) {
            const comboLabels = getSegmentLabels(op!.id, comboName!);
            const seg = SkillSegmentBuilder.buildSegments(comboSeqs, { labels: comboLabels, gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain, gaugeGainByEnemies: skill.gaugeGainByEnemies, ctx: skillCtx });
            col.defaultEvent = { ...col.defaultEvent!, segments: seg.segments };
          }
          // Generic ultimate: build segments from JSON data
          if (skillType === SKILL_COLUMNS.ULTIMATE) {
            const ultName = op?.skills.ultimate?.name;
            const ultSeqs = op && ultName ? getFrameSequences(op!.id, ultName) : undefined;
            if (ultSeqs?.length) {
              const ultLabels = getSegmentLabels(op!.id, ultName!);
              const seg = SkillSegmentBuilder.buildSegments(ultSeqs!, { labels: ultLabels, ctx: skillCtx });
              col.defaultEvent = {
                ...col.defaultEvent!,
                segments: seg.segments,
              };
            }
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
                const csCd = Math.round((cs.cooldownSeconds ?? 0) * FPS);
                const csSegs: import('../../consts/viewTypes').EventSegmentData[] = [
                  { properties: { duration: Math.round(cs.durationSeconds * FPS) } },
                  ...(csCd > 0 ? [{ properties: { segmentTypes: [SegmentType.COOLDOWN, SegmentType.IMMEDIATE_COOLDOWN], duration: csCd, name: 'Cooldown', timeDependency: TimeDependency.REAL_TIME } }] : []),
                ];
                col.eventVariants.push({
                  name: cs.id,
                  displayName: cs.name,
                  segments: csSegs,
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
    // OTHER column is sheet-only (damageTableBuilder) — not shown in the timeline.

    // ── Tactical subtimeline column ───────────────────────────────────────────
    let tacticalColCount = 0;
    if (op && slot.tacticalId) {
      const entry = getTacticalEntry(slot.tacticalId);
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
            segments: [{ properties: { duration: TACTICAL_DURATION_FRAMES } }],
          },
        });
        tacticalColCount++;
      }
    }

    // ── Operator status column (Melting Flame, Scorching Fangs, etc.) ────────
    let statusColCount = 0;
    if (op) {
      // Collect micro-columns: own statuses + team-shared statuses from other operators
      const statusMicroCols: import('../../consts/viewTypes').MicroColumn[] = [];
      const matchIds: string[] = [];
      const STATUS_SOURCE_ORDER: Record<string, number> = { talent: 0, weapon: 1, gear: 2, other: 3 };
      const ownDefs = (operatorStatusMap.get(slot.slotId) ?? [])
        .slice()
        .sort((a, b) => (STATUS_SOURCE_ORDER[a.source] ?? 3) - (STATUS_SOURCE_ORDER[b.source] ?? 3));
      for (const def of ownDefs) {
        statusMicroCols.push({
          id: def.columnId,
          label: def.label,
          color: def.color,
          statusType: def.statusType,
          defaultEvent: {
            name: def.label,
            segments: [{ properties: { duration: def.duration } }],
            ...(def.stacks ? { stacks: def.stacks } : {}),
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
              segments: [{ properties: { duration: tsd.duration } }],
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
    const needed = MIN_SLOT_COLS - (skillColCount + tacticalColCount + statusColCount);
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
      id: NODE_STAGGER_COLUMN_ID,
      label: 'Stagger (Partial)',
      color: '#dd8844',
      defaultEvent: {
        name: 'Node Stagger',
        segments: [{ properties: { duration: 600 } }],
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    },
    {
      id: FULL_STAGGER_COLUMN_ID,
      label: 'Stagger (Full)',
      color: '#ee6633',
      defaultEvent: {
        name: 'Full Stagger',
        segments: [{ properties: { duration: 600 } }],
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    },
    // Arts inflictions
    ...enemy.statuses.map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color,
      defaultEvent: {
        name: s.id,
        segments: [{ properties: { duration: 120 } }],
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    })),
    // Arts reactions
    ...REACTION_MICRO_COLUMNS.map((mc) => ({
      id: mc.id,
      label: mc.label,
      color: mc.color,
      defaultEvent: {
        name: mc.id,
        segments: [{ properties: { duration: 600 } }], // 5s
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    })),
    // Physical inflictions
    {
      id: 'vulnerableInfliction',
      label: 'VULN',
      color: '#c0c8d0',
      defaultEvent: {
        name: 'vulnerableInfliction',
        segments: [{ properties: { duration: 120 } }],
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    },
    // Physical statuses
    {
      id: PHYSICAL_STATUS_COLUMNS.LIFT,
      label: STATUS_LABELS[StatusType.LIFT],
      color: '#c0c8d0',
      defaultEvent: {
        name: PHYSICAL_STATUS_COLUMNS.LIFT,
        segments: [{ properties: { duration: 120 } }],
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    },
    {
      id: PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
      label: STATUS_LABELS[StatusType.KNOCK_DOWN],
      color: '#c0c8d0',
      defaultEvent: {
        name: PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
        segments: [{ properties: { duration: 120 } }],
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    },
    {
      id: PHYSICAL_STATUS_COLUMNS.CRUSH,
      label: STATUS_LABELS[StatusType.CRUSH],
      color: '#c0c8d0',
      defaultEvent: {
        name: PHYSICAL_STATUS_COLUMNS.CRUSH,
        segments: [{ properties: { duration: 120 } }],
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    },
    {
      id: PHYSICAL_STATUS_COLUMNS.BREACH,
      label: STATUS_LABELS[StatusType.BREACH],
      color: '#c0c8d0',
      defaultEvent: {
        name: PHYSICAL_STATUS_COLUMNS.BREACH,
        segments: [{ properties: { duration: 1800 } }],
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    },
    // Debuffs
    {
      id: StatusType.FOCUS,
      label: STATUS_LABELS[StatusType.FOCUS],
      color: '#55aadd',
      defaultEvent: {
        name: StatusType.FOCUS,
        segments: [{ properties: { duration: 7200 } }], // 60s at 120fps (Focus duration)
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    },
    {
      id: StatusType.SUSCEPTIBILITY,
      label: STATUS_LABELS[StatusType.SUSCEPTIBILITY],
      color: '#cc8866',
      defaultEvent: {
        name: StatusType.SUSCEPTIBILITY,
        segments: [{ properties: { duration: 1800 } }], // 15s at 120fps
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    },
    {
      id: StatusType.FRAGILITY,
      label: STATUS_LABELS[StatusType.FRAGILITY],
      color: '#cc6644',
      defaultEvent: {
        name: StatusType.FRAGILITY,
        segments: [{ properties: { duration: 1800 } }], // 15s at 120fps
        sourceOwnerId: USER_ID,
        sourceSkillName: 'Freeform',
      },
    },
    // Data-driven enemy status entries from operator statusEvents (deduped by id)
    ...(() => {
      const seen = new Set<string>();
      return slots.flatMap(s => {
        if (!s.operator) return [];
        const json = getOperatorJson(s.operator.id);
        const statusEvents = json?.statusEvents as Record<string, unknown>[] | undefined;
        if (!statusEvents) return [];
        return statusEvents
          .filter((se) => se.target === 'ENEMY')
          .filter((se) => {
            const id = (se.id as string).toLowerCase().replace(/_/g, '-');
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          })
          .map((se) => ({
            id: (se.id as string).toLowerCase().replace(/_/g, '-'),
            label: STATUS_LABELS[se.id as StatusType] ?? se.id,
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
