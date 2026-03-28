import { Column, MiniTimeline, MicroColumn, Operator, Enemy, VisibleSkills, EventFrameMarker, NOUN_TO_SKILL_TYPE } from '../../consts/viewTypes';
import { DeterminerType, NounType, VerbType, type Effect, type Predicate } from '../../dsl/semantics';
import type { FrameClausePredicate } from '../../model/event-frames/skillEventFrame';
import { ColumnType, CombatSkillType, ELEMENT_COLORS, ElementType, EnhancementType, EventFrameType, HeaderVariant, MicroColumnAssignment, SegmentType, StatusType, TimeDependency, TimelineSourceType } from '../../consts/enums';
import { ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS, ENEMY_ACTION_COLUMN_ID, OPERATOR_COLUMNS, PHYSICAL_INFLICTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, SKILL_COLUMN_ORDER as SKILL_ORDER, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID } from '../../model/channels';
import { getTeamStatusColumnId } from '../gameDataStore';
import { SKILL_LABELS, ColumnLabel, STATUS_LABELS, REACTION_MICRO_COLUMNS } from '../../consts/timelineColumnLabels';
import { getWeapon, getWeaponEffectDefs, getGearEffectDefs, getAllStatusLabels, getStatusById } from '../gameDataStore';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { SkillSegmentBuilder } from '../events/basicAttackController';
import { getFrameSequences, getSegmentLabels, getOperatorSkill, getOperatorSkills, getRawSkillTypeMap, getEnabledStatusEvents } from '../gameDataStore';
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

// ── Synthetic clause helpers ─────────────────────────────────────────────────

function syntheticFrame(effect: Partial<Effect>): EventFrameMarker {
  const clause: FrameClausePredicate = {
    conditions: [],
    effects: [{ type: 'dsl', dslEffect: effect as Effect }],
  };
  return { offsetFrame: 0, clauses: [clause] };
}

function syntheticSegments(duration: number, effect: Partial<Effect>) {
  return [{ properties: { duration }, frames: [syntheticFrame(effect)] }];
}

/**
 * Build a status micro-column entry from a status config.
 * Universal for all status types — operator, team, enemy, weapon, gear.
 */
function buildStatusMicroColumn(
  statusId: string,
  color: string,
  overrides?: { label?: string; statusType?: string },
): MicroColumn {
  const cfg = getStatusById(statusId);
  const label = overrides?.label ?? getAllStatusLabels()[statusId] ?? cfg?.name ?? statusId;
  const durSec = cfg?.durationSeconds ?? 10;
  const durFrames = durSec > 0 ? Math.round(durSec * FPS) : TOTAL_FRAMES;
  const target = cfg?.to ?? NounType.OPERATOR;
  const toDeterminer = cfg?.toDeterminer;
  const applyEffect: Partial<Effect> = {
    verb: VerbType.APPLY, object: NounType.STATUS, objectId: statusId,
    to: target, ...(toDeterminer ? { toDeterminer: toDeterminer as DeterminerType } : {}),
  };

  // Use config segments when available (preserves real frame data like DEAL DAMAGE).
  // Inject the synthetic APPLY clause into the first frame so freeform events go through interpret().
  let segments;
  if (cfg?.segments && cfg.segments.length > 0 && cfg.segments.some(s => s.frames?.length)) {
    segments = cfg.segments.map((seg, si) => {
      if (si === 0) {
        const firstFrame = seg.frames?.[0];
        const synClause: FrameClausePredicate = { conditions: [], effects: [{ type: 'dsl', dslEffect: applyEffect as Effect }] };
        const existingClauses = firstFrame?.clauses ? [...firstFrame.clauses] : [];
        return {
          ...seg,
          frames: [
            { ...firstFrame, offsetFrame: firstFrame?.offsetFrame ?? 0, clauses: [synClause, ...existingClauses] },
            ...(seg.frames?.slice(1) ?? []),
          ],
        };
      }
      return seg;
    });
  } else {
    segments = syntheticSegments(durFrames, applyEffect);
  }

  return {
    id: statusId,
    label,
    color,
    ...(overrides?.statusType ? { statusType: overrides.statusType } : {}),
    defaultEvent: {
      id: statusId,
      name: statusId,
      segments,
      ...(cfg?.stacks ? { stacks: { limit: { value: cfg.maxStacks }, interactionType: cfg.stacks.interactionType } } : {}),
    },
  };
}

/** Build the full ordered list of timeline columns from app state. */
export function buildColumns(
  slots: Slot[],
  enemy: Enemy,
  visibleSkills: VisibleSkills,
  teamStatusIds?: ReadonlySet<string>,
): Column[] {
  const columns: Column[] = [];

  // Pre-scan: detect operators with team-shared status effects (e.g. Scorching Fangs)
  type TeamStatusDef = { sourceSlot: Slot; statusId: string; label: string; duration: number };
  const teamStatusDefs: TeamStatusDef[] = [];
  // Pre-scan: collect THIS_OPERATOR status defs per operator for operator status column
  type OperatorStatusDef = { statusId: string; label: string; columnId: string; duration: number; color: string; source: 'talent' | 'weapon' | 'gear' | 'other'; statusType?: string; stacks?: Record<string, unknown> };
  const operatorStatusMap = new Map<string, OperatorStatusDef[]>();
  // Pre-scan: collect team-targeting weapon/gear effects
  type TeamEquipDef = { slotId: string; statusId: string; label: string; durationFrames: number; color: string };
  const teamWeaponGearDefs: TeamEquipDef[] = [];
  // Pre-scan: collect enemy-targeting weapon/gear effects
  type EnemyEquipDef = { statusId: string; label: string; color: string };
  const enemyWeaponGearDefs: EnemyEquipDef[] = [];

  for (const s of slots) {
    if (!s.operator) continue;
    const statusEvents = [...getEnabledStatusEvents(s.operator.id), ...getEnabledStatusEvents('generic')];
    if (statusEvents.length) {
      for (const se of statusEvents) {
        if (getTeamStatusColumnId(se.id)) continue;
        if (se.target === NounType.OPERATOR && (!se.targetDeterminer || se.targetDeterminer === DeterminerType.THIS) && se.id) {
          const seDur = se.duration as { value?: { value?: number } | number | number[] } | undefined;
          const rawVal = seDur?.value;
          const durVal = typeof rawVal === 'object' && rawVal !== null && !Array.isArray(rawVal)
            ? (rawVal as { value?: number }).value
            : Array.isArray(rawVal) ? rawVal[0] : rawVal;
          const dur = durVal ?? -1;
          const durationFrames = dur === -1 ? TOTAL_FRAMES : dur > 0 ? Math.round(dur * FPS) : 10 * FPS;
          const colId = (OPERATOR_COLUMNS as Record<string, string>)[se.id]
            ?? se.id;
          const defs = operatorStatusMap.get(s.slotId) ?? [];
          defs.push({
            statusId: se.id,
            label: STATUS_LABELS[se.id as StatusType] ?? se.id,
            columnId: colId,
            duration: durationFrames,
            color: s.operator.color,
            source: 'talent',
            statusType: se.type ?? 'STATUS',
            ...(se.stacks ? { stacks: se.stacks as unknown as Record<string, unknown> } : {}),
          });
          operatorStatusMap.set(s.slotId, defs);
        }
      }
    }

    // Scan skill frames for APPLY STATUS effects targeting THIS OPERATOR (e.g. Akekuri ult → LINK)
    const skills = getOperatorSkills(s.operator.id);
    if (skills) {
      const seen = new Set(operatorStatusMap.get(s.slotId)?.map(d => d.statusId) ?? []);
      skills.forEach((skill) => {
        const serialized = skill.serialize() as Record<string, unknown>;
        const segments = (serialized.segments ?? []) as { frames?: { clause?: { effects?: Record<string, unknown>[] }[] }[] }[];
        for (const seg of segments) {
          for (const frame of (seg.frames ?? [])) {
            for (const clause of (frame.clause ?? [])) {
              for (const eff of (clause.effects ?? [])) {
                if (eff.verb !== 'APPLY' || eff.object !== 'STATUS') continue;
                if (eff.to !== NounType.OPERATOR) continue;
                const statusId = eff.objectId as string;
                if (!statusId || seen.has(statusId)) continue;
                seen.add(statusId);
                // Look up status config for duration/stacks
                const allStatuses = [...getEnabledStatusEvents(s.operator!.id), ...getEnabledStatusEvents('generic')];
                const statusDef = allStatuses.find(st => st.id === statusId);
                const colId = (OPERATOR_COLUMNS as Record<string, string>)[statusId]
                  ?? statusId;
                const defs = operatorStatusMap.get(s.slotId) ?? [];
                defs.push({
                  statusId: statusId,
                  label: STATUS_LABELS[statusId as StatusType] ?? statusDef?.name ?? statusId,
                  columnId: colId,
                  duration: 10 * FPS,
                  color: s.operator!.color,
                  source: 'other',
                  statusType: statusDef?.type ?? 'STATUS',
                  ...(statusDef?.stacks ? { stacks: statusDef.stacks as unknown as Record<string, unknown> } : {}),
                });
                operatorStatusMap.set(s.slotId, defs);
              }
            }
          }
        }
      });
    }

    // Scan weapon effect DSL defs
    const addEquipDefs = (dslDefs: Record<string, unknown>[], equipSource: 'weapon' | 'gear') => {
      for (const se of dslDefs) {
        const sePropsEquip = se.properties as Record<string, Record<string, unknown[]>> | undefined;
        const dur = sePropsEquip?.duration?.value?.[0] as number ?? 10;
        const durationFrames = dur > 0 ? Math.round(dur * 120) : 10 * 120;
        const equipId = se.id as string;
        const colId = equipId;
        if (se.target === NounType.OPERATOR && (!se.targetDeterminer || se.targetDeterminer === DeterminerType.THIS)) {
          // Wielder-targeted → operator status micro-column
          const defs = operatorStatusMap.get(s.slotId) ?? [];
          defs.push({
            statusId: equipId,
            label: (se.label as string) ?? equipId,
            columnId: colId,
            duration: durationFrames,
            color: s.operator!.color,
            source: equipSource,
            statusType: equipSource === 'weapon' ? 'WEAPON_STATUS' : 'GEAR_STATUS',
          });
          operatorStatusMap.set(s.slotId, defs);
        } else if (se.target === NounType.OPERATOR && se.targetDeterminer === DeterminerType.OTHER) {
          // Team-targeted → team weapon/gear column
          teamWeaponGearDefs.push({
            slotId: s.slotId,
            statusId: equipId,
            label: (se.label as string) ?? equipId,
            durationFrames,
            color: s.operator!.color,
          });
        } else if (se.target === NounType.ENEMY) {
          // Enemy-targeted → enemy status micro-column
          enemyWeaponGearDefs.push({
            statusId: equipId,
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
    type: ColumnType.MINI_TIMELINE,
    source: TimelineSourceType.COMMON,
    ownerId: COMMON_OWNER_ID,
    columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
    label: ColumnLabel.SKILL_POINTS,
    color: '#ccaa33',
    headerVariant: HeaderVariant.SKILL,
    noAdd: true,
  });
  // ── Team-targeted status columns (derived from skill configs) ─────────────
  // Uses microColumns + matchColumnIds — same architecture as operator/enemy statuses.
  // Each team status gets its own columnId so overlap/RESET logic works per-status.
  const teamStatusMicroCols: MicroColumn[] = [];
  const teamStatusMatchIds: string[] = [];
  for (const statusId of Array.from(teamStatusIds ?? [])) {
    teamStatusMicroCols.push(buildStatusMicroColumn(statusId, '#66aa88'));
    teamStatusMatchIds.push(statusId);
  }
  columns.push({
    key: `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.TEAM_STATUS}`,
    type: ColumnType.MINI_TIMELINE,
    source: TimelineSourceType.COMMON,
    ownerId: COMMON_OWNER_ID,
    columnId: COMMON_COLUMN_IDS.TEAM_STATUS,
    label: ColumnLabel.TEAM_STATUS,
    color: '#66aa88',
    headerVariant: HeaderVariant.SKILL,
    ...(teamStatusMicroCols.length > 0
      ? { microColumns: teamStatusMicroCols, microColumnAssignment: MicroColumnAssignment.DYNAMIC_SPLIT as const, matchColumnIds: teamStatusMatchIds }
      : { noAdd: true }),
  });

  // ── Shared team weapon/gear effect column ─────────────────────────────────
  const teamGearBuffs = teamWeaponGearDefs;
  if (teamGearBuffs.length > 0) {
    const microCols = teamGearBuffs.map((tgb) =>
      buildStatusMicroColumn(tgb.statusId, tgb.color, { label: tgb.label }),
    );
    columns.push({
      key: `${COMMON_OWNER_ID}-team-gear-status`,
      type: ColumnType.MINI_TIMELINE,
      source: TimelineSourceType.GEAR_EFFECT,
      ownerId: COMMON_OWNER_ID,
      columnId: 'team-gear-status',
      label: ColumnLabel.GEAR_BUFF,
      color: '#88aa66',
      headerVariant: HeaderVariant.SKILL,
      derived: true,
      microColumns: microCols,
      microColumnAssignment: MicroColumnAssignment.DYNAMIC_SPLIT,
      matchColumnIds: microCols.map((mc) => mc.id),
    });
  }

  for (const slot of slots) {
    const op = slot.operator;
    // Detect variants by presence of _ENHANCED/_EMPOWERED skill ID suffixes
    const basicName = op?.skills.basic?.name;
    const battleName = op?.skills.battle?.name;
    const hasBasicVariants = op && basicName && (!!getOperatorSkill(op.id, basicName + '_ENHANCED') || !!getOperatorSkill(op.id, basicName + '_EMPOWERED'));
    const hasBattleVariants = op && battleName && (!!getOperatorSkill(op.id, battleName + '_ENHANCED') || !!getOperatorSkill(op.id, battleName + '_EMPOWERED'));
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
        type: ColumnType.MINI_TIMELINE,
        source: TimelineSourceType.OPERATOR,
        ownerId: slot.slotId,
        columnId: OPERATOR_COLUMNS.INPUT,
        label: 'INPUT',
        color: ELEMENT_COLORS[ElementType.PHYSICAL],
        headerVariant: HeaderVariant.SKILL,
        eventVariants: [
          {
            id: CombatSkillType.DASH,
            segments: [{ properties: { duration: DASH_FRAMES } }],
          },
          {
            id: CombatSkillType.DASH,
            isPerfectDodge: true,
            timeInteraction: 'TIME_STOP',
            timeDependency: TimeDependency.REAL_TIME,
            segments: [{ properties: { segmentTypes: [SegmentType.ANIMATION], duration: DODGE_FRAMES, name: 'Animation', timeDependency: TimeDependency.REAL_TIME } }],
          },
        ],
        defaultEvent: {
          id: CombatSkillType.DASH,
          segments: [{ properties: { duration: DASH_FRAMES } }],
        },
      });
      slotHasCols = true;

      for (const skillType of SKILL_ORDER) {
        const skillKey = NOUN_TO_SKILL_TYPE[skillType];
        if (visibleSkills[slot.slotId]?.[skillKey]) {
          let skill = op.skills[skillKey];
          const col: MiniTimeline = {
            key: `${slot.slotId}-${skillType}`,
            type: ColumnType.MINI_TIMELINE,
            source: TimelineSourceType.OPERATOR,
            ownerId: slot.slotId,
            columnId: skillType,
            label: SKILL_LABELS[skillKey],
            color: op.color,
            headerVariant: HeaderVariant.SKILL,
            skillElement: skill.element,
            defaultEvent: {
              id: skill.name,
              name: skill.name,
              segments: skill.defaultSegments,
              triggerCondition: skill.triggerCondition,
              gaugeGain: skill.gaugeGain,
              teamGaugeGain: skill.teamGaugeGain,
              ...(skill.gaugeGainByEnemies ? { gaugeGainByEnemies: skill.gaugeGainByEnemies } : {}),
              ...(skillType === NounType.ULTIMATE && slot.potential != null ? { operatorPotential: slot.potential } : {}),
              ...(skillType === NounType.BATTLE_SKILL && skill.skillPointCost != null ? { skillPointCost: skill.skillPointCost } : {}),
            },
          };
          // Combo columns: use model's level-dependent cooldown + match activation windows
          if (skillType === NounType.COMBO_SKILL) {
            col.matchColumnIds = [NounType.COMBO_SKILL, 'comboActivationWindow'];
          }
          // Basic attack variants (derived from ENHANCED_*/EMPOWERED_* skill categories)
          const skillCtx = ctxFor(skillType);
          if (hasBasicVariants && skillType === NounType.BASIC_ATTACK && op) {
            const base = SkillSegmentBuilder.buildSegments(getFrameSequences(op.id, skill.name), { ctx: skillCtx });
            col.defaultEvent = {
              id: skill.name,
              name: skill.name,
              segments: base.segments,
            };
            col.eventVariants = [{ ...col.defaultEvent, enhancementType: EnhancementType.NORMAL }];
            // Auto-discover variant skill IDs
            for (const suffix of ['_ENHANCED', '_EMPOWERED']) {
              const varId = skill.name + suffix;
              const varSkill = op ? (getOperatorSkill(op.id, varId)?.serialize() ?? null) as Record<string, unknown> | null : null;
              if (!varSkill) continue;
              const variantSeqs = getFrameSequences(op.id, varId);
              if (variantSeqs?.length) {
                const variantSeg = SkillSegmentBuilder.buildSegments(variantSeqs, { ctx: skillCtx });
                const enhancementType = suffix === '_ENHANCED' ? EnhancementType.ENHANCED : EnhancementType.EMPOWERED;
                col.eventVariants!.push({
                  id: varId,
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
            const rawTypeMap = op ? getRawSkillTypeMap(op.id) as Record<string, unknown> : undefined;
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
                id: CombatSkillType.FINISHER,
                name: CombatSkillType.FINISHER,
                segments: finSeg.segments,
              },
              {
                id: CombatSkillType.DIVE,
                name: CombatSkillType.DIVE,
                segments: diveSeg.segments,
              },
            );
          }
          // Battle skill variants (derived from ENHANCED_*/EMPOWERED_* skill categories)
          if (hasBattleVariants && skillType === NounType.BATTLE_SKILL && op) {
            const baseSeg = SkillSegmentBuilder.buildSegments(
              getFrameSequences(op.id, skill.name),
              { gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain, ctx: skillCtx },
            );
            col.defaultEvent = {
              ...col.defaultEvent!,
              id: skill.name,
              name: skill.name,
              segments: baseSeg.segments,
              gaugeGain: skill.gaugeGain,
              teamGaugeGain: skill.teamGaugeGain,
            };
            col.eventVariants = [{ ...col.defaultEvent!, enhancementType: EnhancementType.NORMAL }];
            // Auto-discover variant skill IDs
            for (const suffix of ['_ENHANCED', '_EMPOWERED', '_ENHANCED_EMPOWERED']) {
              const varId = skill.name + suffix;
              const varSkill = op ? (getOperatorSkill(op.id, varId)?.serialize() ?? null) as Record<string, unknown> | null : null;
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
                  }
                }
              }
              const enhancementType = suffix === '_ENHANCED' ? EnhancementType.ENHANCED
                : suffix === '_EMPOWERED' ? EnhancementType.EMPOWERED
                : EnhancementType.ENHANCED; // ENHANCED_EMPOWERED treated as ENHANCED
              col.eventVariants!.push({
                ...col.defaultEvent!,
                id: varId,
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
          if (basicSeqs?.length && skillType === NounType.BASIC_ATTACK) {
            const base = SkillSegmentBuilder.buildSegments(basicSeqs, { ctx: skillCtx });
            col.defaultEvent = {
              id: skill.name,
              name: skill.name,
              segments: base.segments,
            };
          }
          // Generic battle skill: data-driven frame sequences
          const battleSeqs = op && battleName ? getFrameSequences(op.id, battleName) : undefined;
          if (battleSeqs?.length && skillType === NounType.BATTLE_SKILL && !hasBattleVariants) {
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
                  id: col.defaultEvent!.id,
                  name: col.defaultEvent!.name,
                  segments: battleSegments,
                },
                {
                  id: empoweredName,
                  name: empoweredName,
                  displayName: resolveVariantDisplayName(empoweredBattleId, getOperatorSkill(op!.id, empoweredBattleId)?.serialize() ?? {}),
                  segments: empVarSegs,
                  triggerCondition: 'Requires: Empowered condition',
                },
              ];
            }
          }
          // Generic combo skill: data-driven frame sequences
          const comboName = op?.skills.combo?.name;
          const comboSeqs = op && comboName ? getFrameSequences(op.id, comboName) : undefined;
          if (comboSeqs?.length && skillType === NounType.COMBO_SKILL) {
            const comboLabels = getSegmentLabels(op!.id, comboName!);
            const seg = SkillSegmentBuilder.buildSegments(comboSeqs, { labels: comboLabels, gaugeGain: skill.gaugeGain, teamGaugeGain: skill.teamGaugeGain, gaugeGainByEnemies: skill.gaugeGainByEnemies, ctx: skillCtx });
            col.defaultEvent = { ...col.defaultEvent!, segments: seg.segments };
          }
          // Generic ultimate: build segments from JSON data
          if (skillType === NounType.ULTIMATE) {
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
            const linkedIds = getLinksForSlot(op.id, skillKey);
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
                  id: cs.id,
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
        const mc = buildStatusMicroColumn(def.statusId, def.color, { label: def.label, statusType: def.statusType });
        // Use columnId (may differ from statusId for OPERATOR_COLUMNS entries)
        mc.id = def.columnId;
        statusMicroCols.push(mc);
        matchIds.push(def.columnId);
        // Also match StatusType enum value (e.g. 'SCORCHING_FANGS') used by processStatus.ts
        if (def.statusId !== def.columnId) matchIds.push(def.statusId);
      }
      // Team-shared statuses from other operators (e.g. Scorching Fangs shared at P3)
      for (const tsd of teamStatusDefs) {
        const isSource = slot === tsd.sourceSlot;
        if (!isSource) {
          // Use statusId directly as ID — matches events from processStatus.ts
          statusMicroCols.push(buildStatusMicroColumn(tsd.statusId, op.color, { label: tsd.label }));
          matchIds.push(tsd.statusId);
        }
      }
      if (statusMicroCols.length > 0) {
        columns.push({
          key: `${slot.slotId}-operator-status`,
          type: ColumnType.MINI_TIMELINE,
          source: TimelineSourceType.OPERATOR,
          ownerId: slot.slotId,
          columnId: 'operator-status',
          label: ColumnLabel.STATUS,
          color: op.color,
          headerVariant: HeaderVariant.SKILL,
          derived: true,
          microColumns: statusMicroCols,
          microColumnAssignment: MicroColumnAssignment.DYNAMIC_SPLIT,
          matchColumnIds: matchIds,
        });
      statusColCount++;
      }
    }

    // Every slot gets at least MIN_SLOT_COLS columns so the loadout row stays visible
    const skillColCount = slotHasCols
      ? SKILL_ORDER.filter((st) => visibleSkills[slot.slotId]?.[NOUN_TO_SKILL_TYPE[st]]).length
      : 0;
    const needed = MIN_SLOT_COLS - (skillColCount + statusColCount);
    for (let p = 0; p < Math.max(0, needed); p++) {
      columns.push({
        key: `${slot.slotId}-placeholder${p}`,
        type: ColumnType.PLACEHOLDER,
        ownerId: slot.slotId,
        color: op?.color ?? '#666',
      });
    }
  }

  // ── Enemy action timeline ──────────────────────────────────────────────────
  const ENEMY_AOE_ELEMENTS: { element: ElementType; objectQualifier: string }[] = [
    { element: ElementType.PHYSICAL, objectQualifier: 'PHYSICAL' },
    { element: ElementType.HEAT,     objectQualifier: 'HEAT' },
    { element: ElementType.CRYO,     objectQualifier: 'CRYO' },
    { element: ElementType.NATURE,   objectQualifier: 'NATURE' },
    { element: ElementType.ELECTRIC, objectQualifier: 'ELECTRIC' },
  ];
  columns.push({
    key: `enemy-${ENEMY_ACTION_COLUMN_ID}`,
    type: ColumnType.MINI_TIMELINE,
    source: TimelineSourceType.ENEMY,
    ownerId: ENEMY_OWNER_ID,
    columnId: ENEMY_ACTION_COLUMN_ID,
    label: ColumnLabel.ACTION,
    color: '#cc4444',
    headerVariant: HeaderVariant.SKILL,
    eventVariants: ENEMY_AOE_ELEMENTS.map(({ element, objectQualifier }) => ({
      id: `AOE_${objectQualifier}`,
      name: `AOE_${objectQualifier}`,
      displayName: `Deal ${objectQualifier} damage`,
      segments: [{
        properties: { duration: 240, name: `Deal ${objectQualifier} DMG` },
        frames: [{ offsetFrame: 0, damageElement: element }],
        clause: [{
          conditions: [],
          effects: [{ verb: 'DEAL', objectQualifier, object: 'DAMAGE', toDeterminer: 'ALL', to: 'OPERATOR' }],
        }],
      }],
    })),
  });

  // ── Enemy stagger resource ─────────────────────────────────────────────────
  columns.push({
    key: `enemy-${COMMON_COLUMN_IDS.STAGGER}`,
    type: ColumnType.MINI_TIMELINE,
    source: TimelineSourceType.ENEMY,
    ownerId: ENEMY_OWNER_ID,
    columnId: COMMON_COLUMN_IDS.STAGGER,
    label: ColumnLabel.STAGGER,
    color: '#dd8844',
    headerVariant: HeaderVariant.SKILL,
    noAdd: true,
  });

  // ── Unified enemy status column ─────────────────────────────────────────────
  // Single column collecting all enemy statuses: inflictions, reactions, physical
  // statuses, stagger frailty, and debuffs.
  const statusMicroColumns = [
    // Stagger
    buildStatusMicroColumn(NODE_STAGGER_COLUMN_ID, '#dd8844'),
    buildStatusMicroColumn(FULL_STAGGER_COLUMN_ID, '#ee6633'),
    // Arts inflictions
    ...enemy.statuses.map((s) => buildStatusMicroColumn(s.id, s.color, { label: s.label })),
    // Arts reactions
    ...REACTION_MICRO_COLUMNS.map((mc) => buildStatusMicroColumn(mc.id, mc.color, { label: mc.label })),
    // Physical inflictions
    buildStatusMicroColumn(PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, '#c0c8d0', { label: 'VULN' }),
    // Physical statuses
    buildStatusMicroColumn(PHYSICAL_STATUS_COLUMNS.LIFT, '#c0c8d0'),
    buildStatusMicroColumn(PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN, '#c0c8d0'),
    buildStatusMicroColumn(PHYSICAL_STATUS_COLUMNS.CRUSH, '#c0c8d0'),
    buildStatusMicroColumn(PHYSICAL_STATUS_COLUMNS.BREACH, '#c0c8d0'),
    // Debuffs
    buildStatusMicroColumn(StatusType.FOCUS, '#55aadd'),
    buildStatusMicroColumn(StatusType.SUSCEPTIBILITY, '#cc8866'),
    buildStatusMicroColumn(StatusType.FRAGILITY, '#cc6644'),
    // Data-driven enemy status entries from operator statusEvents (deduped by id)
    ...(() => {
      const seen = new Set<string>();
      return slots.flatMap(s => {
        if (!s.operator) return [];
        const statusEvents = getEnabledStatusEvents(s.operator.id);
        if (!statusEvents.length) return [];
        return statusEvents
          .filter((se) => se.target === 'ENEMY')
          .filter((se) => {
            if (seen.has(se.id)) return false;
            seen.add(se.id);
            return true;
          })
          .map((se) => buildStatusMicroColumn(se.id, s.operator!.color));
      });
    })(),
  ];

  // Enemy-targeting weapon/gear effects (deduped against existing micro-column ids)
  const existingEnemyIds = new Set(statusMicroColumns.map((mc) => mc.id));
  for (const d of enemyWeaponGearDefs) {
    const id = d.statusId;
    if (existingEnemyIds.has(id)) continue;
    existingEnemyIds.add(id);
    statusMicroColumns.push(buildStatusMicroColumn(id, d.color, { label: d.label }));
  }

  columns.push({
    key: ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    type: ColumnType.MINI_TIMELINE,
    source: TimelineSourceType.ENEMY,
    ownerId: ENEMY_OWNER_ID,
    columnId: ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    label: ColumnLabel.STATUS,
    color: '#cc8866',
    headerVariant: HeaderVariant.INFLICTION,
    microColumns: statusMicroColumns,
    microColumnAssignment: MicroColumnAssignment.DYNAMIC_SPLIT,
    matchColumnIds: statusMicroColumns.map((mc) => mc.id),
  });

  return columns;
}
