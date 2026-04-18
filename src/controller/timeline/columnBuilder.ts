import { Column, MiniTimeline, MicroColumn, Operator, Enemy, VisibleSkills, EventFrameMarker, EventSegmentData } from '../../consts/viewTypes';
import { AdjectiveType, DeterminerType, NounType, VerbType, isQualifiedId, type Effect, type Predicate } from '../../dsl/semantics';
import type { FrameClausePredicate } from '../../model/event-frames/skillEventFrame';
import { ColumnType, CombatResourceType, DEFAULT_EVENT_COLOR, ELEMENT_COLORS, ElementType, EnemyActionType, EnhancementType, EventFrameType, HeaderVariant, MicroColumnAssignment, PERMANENT_DURATION, SegmentType, StackInteractionType, StatusType, TimeDependency, TimelineSourceType, UNLIMITED_STACKS } from '../../consts/enums';
import { ENEMY_ID, ENEMY_GROUP_COLUMNS, ENEMY_ACTION_COLUMN_ID, OPERATOR_COLUMNS, OPERATOR_STATUS_COLUMN_ID, PHYSICAL_INFLICTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, SKILL_COLUMN_ORDER as SKILL_ORDER, COMBO_WINDOW_COLUMN_ID, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID } from '../../model/channels';
import { isTeamStatus } from '../gameDataStore';
import { SKILL_LABELS, ColumnLabel, STATUS_LABELS, REACTION_MICRO_COLUMNS, ENEMY_ACTION_LABELS } from '../../consts/timelineColumnLabels';
import { getWeapon, getWeaponEffectDefs, getGearEffectDefs, getAllStatusLabels, getStatusById, getStatusCategoryById, getConsumablePassiveDef, getTacticalTriggerDef } from '../gameDataStore';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { SkillSegmentBuilder } from '../events/basicAttackController';
import { buildDealStaggerClause, stripStaggerClauses, buildDealDamageClause } from './clauseQueries';
import { getFrameSequences, getSegmentLabels, getOperatorSkill, getOperatorSkills, getRawSkillTypeMap, getEnabledStatusEvents } from '../gameDataStore';
import { getLinksForSlot } from '../custom/customSkillLinkController';
import { getCustomSkills } from '../custom/customSkillController';
import { COMBAT_SKILL_LABELS } from '../../consts/timelineColumnLabels';
import { getBaseSkillId, formatSkillDisplayName } from '../../dsl/semanticsTranslation';
import { buildContextForSkillColumn } from '../calculation/valueResolver';
import { aggregateLoadoutStats } from '../calculation/loadoutAggregator';
import { ATTRIBUTE_INCREASE_LOOKUP } from '../../model/operators/dataDrivenOperator';

/** Column IDs that are NOT status columns — excluded from the operator status catch-all. */
const OPERATOR_NON_STATUS_COLUMNS: ReadonlySet<string> = new Set([
  ...SKILL_ORDER,
  OPERATOR_COLUMNS.INPUT,
  OPERATOR_COLUMNS.CONTROLLED,
  OPERATOR_COLUMNS.OTHER,
  OPERATOR_STATUS_COLUMN_ID,
  COMBO_WINDOW_COLUMN_ID,
]);

export interface Slot {
  slotId: string;
  operator: Operator | null;
  potential?: number;
  /** Equipped weapon ID (for weapon skill subtimeline columns). */
  weaponId?: string;
  /** Equipped consumable ID (for consumable passive effects). */
  consumableId?: string;
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


type SuppliedParamDef = { id: string; name: string; lowerRange: number; upperRange: number; default: number };
type SuppliedParams = Record<string, SuppliedParamDef[]>;

/** Collect all suppliedParameters from event-level, segment-level, and frame-level sources. */
function collectSuppliedParameters(
  eventLevel?: SuppliedParams,
  segments?: import('../../consts/viewTypes').EventSegmentData[],
): SuppliedParams | undefined {
  const merged: Record<string, Map<string, SuppliedParamDef>> = {};
  const addDefs = (params: SuppliedParams) => {
    for (const [key, defs] of Object.entries(params)) {
      if (!merged[key]) merged[key] = new Map();
      for (const d of defs) merged[key].set(d.id, d);
    }
  };
  if (eventLevel) addDefs(eventLevel);
  if (segments) {
    for (const seg of segments) {
      if (seg.properties.suppliedParameters) addDefs(seg.properties.suppliedParameters);
      if (seg.frames) {
        for (const f of seg.frames) {
          if (f.suppliedParameters) addDefs(f.suppliedParameters);
        }
      }
    }
  }
  const keys = Object.keys(merged);
  if (keys.length === 0) return undefined;
  const result: SuppliedParams = {};
  for (const k of keys) result[k] = Array.from(merged[k].values());
  return result;
}

/** Resolve a variant skill's display name from its JSON data + base skill label. */
function resolveVariantDisplayName(varId: string, varSkill: Record<string, unknown>): string {
  const baseName = COMBAT_SKILL_LABELS[getBaseSkillId(varId) as string] ?? (varSkill.name as string);
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
  overrides?: { label?: string; permanent?: boolean; durationSeconds?: number },
): MicroColumn {
  const cfg = getStatusById(statusId);
  const categoryType = getStatusCategoryById(statusId);
  const label = overrides?.label ?? getAllStatusLabels()[statusId] ?? cfg?.name ?? statusId;
  const durSec = overrides?.durationSeconds ?? cfg?.durationSeconds ?? 10;
  const durFrames = durSec === PERMANENT_DURATION || durSec === 0 ? TOTAL_FRAMES : Math.round(durSec * FPS);
  const target = cfg?.to ?? NounType.OPERATOR;
  const toDeterminer = cfg?.toDeterminer;

  // Physical statuses (LIFT / KNOCK_DOWN / CRUSH / BREACH) route through
  // `applyPhysicalStatus` via the `objectId: PHYSICAL, objectQualifier: <X>`
  // DSL form. Freeform placements default `isForced=1` so the gate on
  // Vulnerable stacks is bypassed — user can unset to require Vulnerable.
  const isPhysicalStatus = Object.values(PHYSICAL_STATUS_COLUMNS).includes(statusId as typeof PHYSICAL_STATUS_COLUMNS[keyof typeof PHYSICAL_STATUS_COLUMNS]);
  // Reactions (COMBUSTION / SOLIDIFICATION / CORROSION / ELECTRIFICATION /
  // SHATTER) route through `doApply`'s canonical APPLY STATUS REACTION branch
  // via `{ objectId: REACTION, objectQualifier: <X> }`. Freeform placements
  // carry `with.stacks: 1` (one application) and `with.statusLevel: 1` (default
  // level I). The context-menu statusLevel picker swaps `with.statusLevel` to
  // the user's selection before the event is created.
  const isReaction = cfg?.eventCategoryType === NounType.REACTION;
  const applyEffect: Partial<Effect> = isPhysicalStatus
    ? {
      verb: VerbType.APPLY, object: NounType.STATUS,
      objectId: AdjectiveType.PHYSICAL, objectQualifier: statusId as AdjectiveType,
      to: target, ...(toDeterminer ? { toDeterminer: toDeterminer as DeterminerType } : {}),
      with: { isForced: { verb: VerbType.IS, value: 1 } },
    }
    : isReaction
    ? {
      verb: VerbType.APPLY, object: NounType.STATUS,
      objectId: NounType.REACTION, objectQualifier: statusId as NounType,
      to: target, ...(toDeterminer ? { toDeterminer: toDeterminer as DeterminerType } : {}),
      with: {
        stacks: { verb: VerbType.IS, value: 1 },
        statusLevel: { verb: VerbType.IS, value: 1 },
      },
    }
    : {
      verb: VerbType.APPLY, object: NounType.STATUS, objectId: statusId,
      to: target, ...(toDeterminer ? { toDeterminer: toDeterminer as DeterminerType } : {}),
    };

  // Every freeform-placeable non-skill column uses a synthetic segment with
  // only the APPLY clause. When the wrapper's PROCESS_FRAME fires at pipeline
  // runtime, that clause drives `doApply → applyEvent → runStatusCreationLifecycle`
  // which creates the visible event with the config's real frames.
  // Runtime-user-edited fields on the wrapper (e.g. `susceptibility` on
  // qualified-susceptibility / FOCUS events) are threaded from the source
  // event onto the applied child by doApply via `InterpretContext.sourceEvent`.
  const segments = syntheticSegments(durFrames, applyEffect);

  return {
    id: statusId,
    label,
    color,
    ...(categoryType ? { statusType: categoryType } : {}),
    ...(overrides?.permanent
      || ((cfg?.eventCategoryType === NounType.TALENT
        || cfg?.eventCategoryType === NounType.POTENTIAL)
        && !(cfg?.stacks?.interactionType === StackInteractionType.NONE && cfg?.maxStacks >= UNLIMITED_STACKS)
        && !cfg?.onTriggerClause?.length
        // Self-trigger talents with finite durations (Fluorite Unpredictable T2)
        // are transient; not passive. `durationSeconds` is 0 for always-on
        // talents and >=PERMANENT_DURATION for explicitly permanent ones.
        && !(durSec > 0 && durSec < PERMANENT_DURATION))
      ? { permanent: true } : {}),
    defaultEvent: {
      id: statusId,
      name: statusId,
      segments,
      ...(cfg?.stacks ? { stacks: { limit: { value: cfg.maxStacks }, interactionType: cfg.stacks.interactionType } } : {}),
      ...buildDefaultSusceptibility(statusId),
    },
  };
}

/** For element-qualified susceptibility statuses (e.g. HEAT_SUSCEPTIBILITY),
 *  initialize a default susceptibility map so the damage calc recognizes the event. */
function buildDefaultSusceptibility(statusId: string): { susceptibility: Partial<Record<ElementType, number>> } | undefined {
  if (statusId === StatusType.SUSCEPTIBILITY || statusId === StatusType.FOCUS) {
    return { susceptibility: {} };
  }
  if (isQualifiedId(statusId, StatusType.SUSCEPTIBILITY)) {
    const element = statusId.slice(0, statusId.length - `_${StatusType.SUSCEPTIBILITY}`.length) as ElementType;
    if (Object.values(ElementType).includes(element)) {
      return { susceptibility: { [element]: 0 } };
    }
  }
  return undefined;
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
  type OperatorStatusDef = { statusId: string; label: string; columnId: string; duration: number; durationSec: number; color: string; source: 'talent' | 'weapon' | 'gear' | 'other'; stacks?: Record<string, unknown> };
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
        if (isTeamStatus(se.id)) continue;
        if (se.id in ATTRIBUTE_INCREASE_LOOKUP) continue;
        if (se.target === NounType.OPERATOR && (!se.targetDeterminer || se.targetDeterminer === DeterminerType.THIS) && se.id) {
          const durSec = s.potential != null ? se.resolveDurationSeconds(s.potential) : se.durationSeconds;
          const durationFrames = durSec === PERMANENT_DURATION || durSec === 0 ? TOTAL_FRAMES : Math.round(durSec * FPS);
          const colId = (OPERATOR_COLUMNS as Record<string, string>)[se.id]
            ?? se.id;
          const defs = operatorStatusMap.get(s.slotId) ?? [];
          defs.push({
            statusId: se.id,
            label: STATUS_LABELS[se.id as StatusType] ?? se.id,
            columnId: colId,
            duration: durationFrames,
            durationSec: durSec,
            color: se.element ? (ELEMENT_COLORS[se.element as ElementType] ?? DEFAULT_EVENT_COLOR) : DEFAULT_EVENT_COLOR,
            source: 'talent',
            ...(se.stacks ? { stacks: se.stacks as unknown as Record<string, unknown> } : {}),
          });
          operatorStatusMap.set(s.slotId, defs);
        }
      }
    }

    // Scan skill frames for APPLY STATUS effects targeting OPERATOR (e.g. Akekuri ult → LINK)
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
                if (eff.verb !== VerbType.APPLY || eff.object !== NounType.STATUS) continue;
                if (eff.to !== NounType.OPERATOR) continue;
                const statusId = eff.objectId as string;
                if (!statusId) continue;
                // CONTROLLED target: status could land on any operator's column,
                // so add the micro-column to ALL operator slots (even if already
                // added to the source slot by the prescan).
                if (eff.toDeterminer === DeterminerType.CONTROLLED) {
                  const allStatuses = [...getEnabledStatusEvents(s.operator!.id), ...getEnabledStatusEvents('generic')];
                  const statusDef = allStatuses.find(st => st.id === statusId);
                  const colId = (OPERATOR_COLUMNS as Record<string, string>)[statusId] ?? statusId;
                  for (const targetSlot of slots) {
                    if (!targetSlot.operator) continue;
                    const targetDefs = operatorStatusMap.get(targetSlot.slotId) ?? [];
                    if (!targetDefs.some(d => d.statusId === statusId)) {
                      targetDefs.push({
                        statusId,
                        label: STATUS_LABELS[statusId as StatusType] ?? statusDef?.name ?? statusId,
                        columnId: colId,
                        duration: 10 * FPS,
                        durationSec: 10,
                        color: statusDef?.element ? (ELEMENT_COLORS[statusDef.element as ElementType] ?? DEFAULT_EVENT_COLOR) : DEFAULT_EVENT_COLOR,
                        source: 'other',
                        ...(statusDef?.stacks ? { stacks: statusDef.stacks as unknown as Record<string, unknown> } : {}),
                      });
                      operatorStatusMap.set(targetSlot.slotId, targetDefs);
                    }
                  }
                  continue;
                }
                if (seen.has(statusId)) continue;
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
                  durationSec: 10,
                  color: statusDef?.element ? (ELEMENT_COLORS[statusDef.element as ElementType] ?? DEFAULT_EVENT_COLOR) : DEFAULT_EVENT_COLOR,
                  source: 'other',
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
            durationSec: dur,
            color: s.operator!.color,
            source: equipSource,
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

    // Scan consumable passive def → operator status micro-column
    if (s.consumableId) {
      const cDef = getConsumablePassiveDef(s.consumableId);
      if (cDef && cDef.target === NounType.OPERATOR) {
        const durVal = (cDef.properties?.duration?.value as { value?: number })?.value ?? 0;
        const isPermanent = durVal === PERMANENT_DURATION || durVal === 0;
        const durationFrames = isPermanent ? TOTAL_FRAMES : Math.round(durVal * FPS);
        const defs = operatorStatusMap.get(s.slotId) ?? [];
        defs.push({
          statusId: cDef.id,
          label: cDef.name ?? cDef.id,
          columnId: NounType.CONSUMABLE,
          duration: durationFrames,
          durationSec: isPermanent ? TOTAL_FRAMES / FPS : durVal,
          color: s.operator!.color,
          source: 'other',
        });
        operatorStatusMap.set(s.slotId, defs);
      }
    }

    // Scan tactical trigger def → operator status micro-column
    if (s.tacticalId) {
      const tDef = getTacticalTriggerDef(s.tacticalId);
      if (tDef && tDef.target === NounType.OPERATOR) {
        const durVal = (tDef.properties?.duration?.value as { value?: number })?.value ?? 0;
        const isPermanent = durVal === PERMANENT_DURATION || durVal === 0;
        const durationFrames = isPermanent ? TOTAL_FRAMES : Math.round(durVal * FPS);
        const defs = operatorStatusMap.get(s.slotId) ?? [];
        defs.push({
          statusId: tDef.id,
          label: tDef.name ?? tDef.id,
          columnId: NounType.TACTICAL,
          duration: durationFrames,
          durationSec: isPermanent ? TOTAL_FRAMES / FPS : durVal,
          color: s.operator!.color,
          source: 'other',
        });
        operatorStatusMap.set(s.slotId, defs);
      }
    }
  }

  // Common (global) columns — before operator slots
  columns.push({
    key: `${TEAM_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`,
    type: ColumnType.MINI_TIMELINE,
    source: TimelineSourceType.COMMON,
    ownerEntityId: TEAM_ID,
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
    key: `${TEAM_ID}-${COMMON_COLUMN_IDS.TEAM_STATUS}`,
    type: ColumnType.MINI_TIMELINE,
    source: TimelineSourceType.COMMON,
    ownerEntityId: TEAM_ID,
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
      key: `${TEAM_ID}-team-gear-status`,
      type: ColumnType.MINI_TIMELINE,
      source: TimelineSourceType.GEAR_EFFECT,
      ownerEntityId: TEAM_ID,
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
    const basicName = op?.skills[NounType.BASIC_ATTACK]?.name;
    const battleName = op?.skills[NounType.BATTLE]?.name;
    // hasBasicVariants removed — BA categories (BATK/DIVE/FINISHER) are now always discovered
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
        ownerEntityId: slot.slotId,
        columnId: OPERATOR_COLUMNS.INPUT,
        label: ColumnLabel.ACTION,
        color: DEFAULT_EVENT_COLOR,
        headerVariant: HeaderVariant.SKILL,
        eventVariants: [
          {
            id: NounType.DASH,
            segments: [{ properties: { duration: DASH_FRAMES } }],
          },
          {
            id: NounType.DASH,
            isPerfectDodge: true,
            timeInteraction: 'TIME_STOP',
            timeDependency: TimeDependency.REAL_TIME,
            segments: [{ properties: { segmentTypes: [SegmentType.ANIMATION], duration: DODGE_FRAMES, name: 'Animation', timeDependency: TimeDependency.REAL_TIME } }],
          },
          ...(() => {
            if (!op) return [];
            const rawTypeMap = getRawSkillTypeMap(op.id);
            const actionEntry = rawTypeMap[NounType.ACTION];
            const actionSkillId = Array.isArray(actionEntry) ? actionEntry[0] : undefined;
            if (!actionSkillId) return [];
            const actionSkill = getOperatorSkill(op.id, actionSkillId);
            if (!actionSkill) return [];
            // Resolve DSL duration objects to frame counts
            const actionSegs = (actionSkill.segments as EventSegmentData[]).map(seg => {
              const dur = seg.properties.duration;
              if (typeof dur === 'number') return seg;
              const durObj = dur as { value: { value: number }; unit: string } | undefined;
              const seconds = durObj?.value?.value ?? 0;
              return { ...seg, properties: { ...seg.properties, duration: Math.round(seconds * FPS) } };
            });
            return [{
              id: actionSkillId,
              name: actionSkillId,
              segments: actionSegs,
              stacks: { limit: { value: UNLIMITED_STACKS }, interactionType: 'NONE' },
            }];
          })(),
        ],
        defaultEvent: {
          id: NounType.DASH,
          segments: [{ properties: { duration: DASH_FRAMES } }],
        },
      });
      slotHasCols = true;

      for (const skillType of SKILL_ORDER) {
        // skillType is already the NounType key for skills/visibleSkills
        if (visibleSkills[slot.slotId]?.[skillType]) {
          let skill = op.skills[skillType];
          const col: MiniTimeline = {
            key: `${slot.slotId}-${skillType}`,
            type: ColumnType.MINI_TIMELINE,
            source: TimelineSourceType.OPERATOR,
            ownerEntityId: slot.slotId,
            columnId: skillType,
            label: SKILL_LABELS[skillType],
            color: ELEMENT_COLORS[op.element as ElementType] ?? op.color,
            headerVariant: HeaderVariant.SKILL,
            skillElement: skill.element,
            defaultEvent: {
              id: skill.name,
              name: skill.name,
              segments: skill.defaultSegments,
              triggerCondition: skill.triggerCondition,
              ...(skillType === NounType.ULTIMATE && slot.potential != null ? { operatorPotential: slot.potential } : {}),
              ...(skillType === NounType.BATTLE && skill.skillPointCost != null ? { skillPointCost: skill.skillPointCost } : {}),
              ...(() => { const sp = op ? collectSuppliedParameters(getOperatorSkill(op.id, skill.name)?.suppliedParameters, skill.defaultSegments) : undefined; return sp ? { suppliedParameters: sp } : {}; })(),
            },
          };
          // Combo columns: use model's level-dependent cooldown + match activation windows
          if (skillType === NounType.COMBO) {
            col.matchColumnIds = [NounType.COMBO, 'comboActivationWindow'];
          }
          // Basic attack categories: BATK, FINISHER, DIVE are independent categories.
          // Each category can have its own _ENHANCED/_EMPOWERED variants.
          const skillCtx = ctxFor(skillType);
          if (skillType === NounType.BASIC_ATTACK && op) {
            const rawTypeMap = getRawSkillTypeMap(op.id);
            const basicEntry = rawTypeMap?.[NounType.BASIC_ATTACK];
            const basicSubs = !Array.isArray(basicEntry) ? basicEntry as Record<string, string[]> | undefined : undefined;
            const batkId = basicSubs?.[NounType.BATK]?.[0] ?? skill.name;
            const finisherId = basicSubs?.[NounType.FINISHER]?.[0];
            const diveId = basicSubs?.[NounType.DIVE]?.[0];

            // Only build from frame sequences if BATK has frame data
            const batkSeqs = getFrameSequences(op.id, batkId);
            if (batkSeqs.length) {
              const base = SkillSegmentBuilder.buildSegments(batkSeqs, { ctx: skillCtx, useNumeralFallback: true });
              col.defaultEvent = {
                id: batkId,
                name: batkId,
                segments: base.segments,
              };
            }

            // Collect all BA categories + their variants
            const categories: { baseId: string; categoryId: string; label?: string }[] = [
              { baseId: batkId, categoryId: batkId },
            ];
            if (finisherId) categories.push({ baseId: finisherId, categoryId: NounType.FINISHER, label: 'Finisher' });
            if (diveId) categories.push({ baseId: diveId, categoryId: NounType.DIVE, label: 'Dive' });

            // Only populate eventVariants if there are multiple categories or any category has variants
            const hasMultipleCategories = categories.length > 1;
            const hasAnyVariant = categories.some(({ baseId }) =>
              !!getOperatorSkill(op!.id, baseId + '_ENHANCED') || !!getOperatorSkill(op!.id, baseId + '_EMPOWERED'),
            );

            if (hasMultipleCategories || hasAnyVariant) {
              col.eventVariants = [];

              for (const { baseId, categoryId, label } of categories) {
                const seqs = getFrameSequences(op.id, baseId);
                const seg = seqs.length
                  ? SkillSegmentBuilder.buildSegments(seqs, { labels: label ? [label] : undefined, ctx: skillCtx, useNumeralFallback: true })
                  : null;

                if (!seg) {
                  // Fallback for missing frame data
                  const fallbackFrames = categoryId === NounType.FINISHER ? FINISHER_FRAMES : DIVE_FRAMES;
                  const fallbackType = categoryId === NounType.FINISHER ? EventFrameType.FINISHER : EventFrameType.DIVE;
                  col.eventVariants.push({
                    id: categoryId,
                    name: categoryId,
                    segments: [{ properties: { duration: fallbackFrames, name: label ?? categoryId }, frames: [{ offsetFrame: fallbackFrames, frameTypes: [fallbackType] }] }],
                  });
                  continue;
                }

                // Base category entry
                const baCatSkill = getOperatorSkill(op!.id, baseId);
                const baCatParams = collectSuppliedParameters(baCatSkill?.suppliedParameters, seg.segments);
                col.eventVariants.push({
                  id: categoryId,
                  name: categoryId,
                  ...(baseId === batkId ? { enhancementType: EnhancementType.NORMAL } : {}),
                  segments: seg.segments,
                  ...(baCatParams ? { suppliedParameters: baCatParams } : {}),
                });

                // Auto-discover _ENHANCED/_EMPOWERED variants for this category
                for (const suffix of ['_ENHANCED', '_EMPOWERED']) {
                  const varId = baseId + suffix;
                  const baVarSkillObj = getOperatorSkill(op.id, varId);
                  const varSkill = (baVarSkillObj?.serialize() ?? null) as Record<string, unknown> | null;
                  if (!varSkill) continue;
                  const variantSeqs = getFrameSequences(op.id, varId);
                  if (variantSeqs?.length) {
                    const variantSeg = SkillSegmentBuilder.buildSegments(variantSeqs, { ctx: skillCtx, useNumeralFallback: true });
                    const jsonEnhTypes = ((varSkill as Record<string, unknown>).enhancementTypes ?? (varSkill.properties as Record<string, unknown> | undefined)?.enhancementTypes) as string[] | undefined;
                    const enhancementType = jsonEnhTypes?.includes(EnhancementType.ENHANCED) ? EnhancementType.ENHANCED
                      : EnhancementType.EMPOWERED;
                    const baVarParams = collectSuppliedParameters(baVarSkillObj?.suppliedParameters, variantSeg.segments);
                    col.eventVariants.push({
                      id: varId,
                      name: varId,
                      displayName: resolveVariantDisplayName(varId, varSkill),
                      enhancementType,
                      segments: variantSeg.segments,
                      ...(varSkill.triggerCondition ? { triggerCondition: varSkill.triggerCondition as string } : {}),
                      ...(varSkill.activationClause ? { activationClause: varSkill.activationClause as Predicate[] } : {}),
                      ...(baVarParams ? { suppliedParameters: baVarParams } : {}),
                    });
                  }
                }
              }
            }
          }
          // Battle skill variants (derived from ENHANCED_*/EMPOWERED_* skill categories)
          if (hasBattleVariants && skillType === NounType.BATTLE && op) {
            const bsLabels = getSegmentLabels(op.id, skill.name);
            const baseSeg = SkillSegmentBuilder.buildSegments(
              getFrameSequences(op.id, skill.name),
              { labels: bsLabels, ctx: skillCtx },
            );
            col.defaultEvent = {
              ...col.defaultEvent!,
              id: skill.name,
              name: skill.name,
              segments: baseSeg.segments,
            };
            const baseSkillObj = getOperatorSkill(op.id, skill.name);
            const baseBsParams = collectSuppliedParameters(baseSkillObj?.suppliedParameters, baseSeg.segments);
            col.eventVariants = [{ ...col.defaultEvent!, enhancementType: EnhancementType.NORMAL, ...(baseBsParams ? { suppliedParameters: baseBsParams } : {}) }];
            // Auto-discover variant skill IDs
            for (const suffix of ['_ENHANCED', '_EMPOWERED', '_ENHANCED_EMPOWERED']) {
              const varId = skill.name + suffix;
              const varSkillObj = op ? getOperatorSkill(op.id, varId) : undefined;
              const varSkill = varSkillObj?.serialize() ?? null;
              if (!varSkill) continue;
              const variantSeqs = getFrameSequences(op.id, varId);
              if (!variantSeqs?.length) continue;
              const varLabels = getSegmentLabels(op.id, varId);
              const variantSeg = SkillSegmentBuilder.buildSegments(variantSeqs, { labels: varLabels, ctx: skillCtx });
              // Apply frame modifications if defined on the variant
              if (varSkill.frameModifications) {
                for (const fm of varSkill.frameModifications as { segmentIndex: number; frameIndex: number; stagger?: number; consumeStatus?: string; removeConsumeArtsInfliction?: boolean; spReturnP1?: number }[]) {
                  const seg = variantSeg.segments[fm.segmentIndex];
                  const frame = seg?.frames?.[fm.frameIndex];
                  if (frame) {
                    if (fm.stagger != null) {
                      const stripped = stripStaggerClauses(frame.clauses);
                      frame.clauses = [...(stripped ?? []), buildDealStaggerClause(fm.stagger)];
                    }
                  }
                }
              }
              const enhancementType = suffix === '_ENHANCED' ? EnhancementType.ENHANCED
                : suffix === '_EMPOWERED' ? EnhancementType.EMPOWERED
                : EnhancementType.ENHANCED; // ENHANCED_EMPOWERED treated as ENHANCED
              const varParams = collectSuppliedParameters(varSkillObj?.suppliedParameters, variantSeg.segments);
              col.eventVariants!.push({
                ...col.defaultEvent!,
                id: varId,
                name: varId,
                displayName: resolveVariantDisplayName(varId, varSkill),
                enhancementType,
                segments: variantSeg.segments,
                ...(varSkill.triggerCondition ? { triggerCondition: varSkill.triggerCondition as string } : {}),
                ...(varSkill.activationClause ? { activationClause: varSkill.activationClause as Predicate[] } : {}),
                ...(varParams ? { suppliedParameters: varParams } : {}),
              });
            }
          }
          // Generic basic attack: data-driven frame sequences
          const basicSeqs = op && basicName ? getFrameSequences(op.id, basicName) : undefined;
          if (basicSeqs?.length && skillType === NounType.BASIC_ATTACK) {
            const base = SkillSegmentBuilder.buildSegments(basicSeqs, { ctx: skillCtx, useNumeralFallback: true });
            col.defaultEvent = {
              id: skill.name,
              name: skill.name,
              segments: base.segments,
            };
          }
          // Generic battle skill: data-driven frame sequences
          const battleSeqs = op && battleName ? getFrameSequences(op.id, battleName) : undefined;
          if (battleSeqs?.length && skillType === NounType.BATTLE && !hasBattleVariants) {
            const seg = SkillSegmentBuilder.buildSegments(battleSeqs, { ctx: skillCtx });
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
            const nonVarBattleSkill = battleName ? getOperatorSkill(op!.id, battleName) : undefined;
            const nonVarBattleParams = collectSuppliedParameters(nonVarBattleSkill?.suppliedParameters, battleSegments);
            col.defaultEvent = {
              ...col.defaultEvent!,
              segments: battleSegments,
              ...(nonVarBattleParams ? { suppliedParameters: nonVarBattleParams } : {}),
            };
            // Empowered battle skill variant (e.g. Arclight's additional attack on Electrification)
            const empoweredBattleId = battleName + '_EMPOWERED';
            const empoweredBattleSeqs = battleName ? getFrameSequences(op!.id, empoweredBattleId) : undefined;
            if (empoweredBattleSeqs?.length) {
              const empowered = SkillSegmentBuilder.buildSegments(empoweredBattleSeqs, { ctx: skillCtx });
              const empoweredName = empoweredBattleId as string;
              const hasEmpCdSegment = empowered.segments.some(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN));
              // Append cooldown from base skill if empowered segments don't have one
              const cdSeg = battleSegments.find(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN));
              const empVarSegs = hasEmpCdSegment || !cdSeg
                ? empowered.segments
                : [...empowered.segments, cdSeg];
              const baseBattleSkillObj = battleName ? getOperatorSkill(op!.id, battleName) : undefined;
              const baseBattleParams = collectSuppliedParameters(baseBattleSkillObj?.suppliedParameters, battleSegments);
              const empBattleSkillObj = getOperatorSkill(op!.id, empoweredBattleId);
              const empBattleParams = collectSuppliedParameters(empBattleSkillObj?.suppliedParameters, empVarSegs);
              col.eventVariants = [
                {
                  id: col.defaultEvent!.id,
                  name: col.defaultEvent!.name,
                  segments: battleSegments,
                  ...(baseBattleParams ? { suppliedParameters: baseBattleParams } : {}),
                },
                {
                  id: empoweredName,
                  name: empoweredName,
                  displayName: resolveVariantDisplayName(empoweredBattleId, empBattleSkillObj?.serialize() ?? {}),
                  segments: empVarSegs,
                  triggerCondition: 'Requires: Empowered condition',
                  ...(empBattleParams ? { suppliedParameters: empBattleParams } : {}),
                },
              ];
            }
          }
          // Generic combo skill: load all skills matching COMBO_SKILL category
          if (op && skillType === NounType.COMBO) {
            const allSkills = getOperatorSkills(op.id);
            const comboSkills = allSkills
              ? Array.from(allSkills.values()).filter((sk) => sk.eventCategoryType === NounType.COMBO || sk.eventCategoryType === NounType.COMBO)
              : [];
            if (comboSkills.length > 0) {
              const variants: NonNullable<MiniTimeline['eventVariants']> = [];
              for (const cs of comboSkills) {
                const seqs = getFrameSequences(op.id, cs.id);
                if (!seqs?.length) continue;
                const labels = getSegmentLabels(op.id, cs.id);
                const eTypes = cs.enhancementTypes ?? [];
                const isEnhanced = eTypes.includes(EnhancementType.ENHANCED);
                const seg = SkillSegmentBuilder.buildSegments(seqs, { labels, ctx: skillCtx });
                const enhancementType = eTypes.includes(EnhancementType.EMPOWERED) ? EnhancementType.EMPOWERED
                  : isEnhanced ? EnhancementType.ENHANCED
                  : EnhancementType.NORMAL;
                const raw = cs.serialize();
                const comboParams = collectSuppliedParameters(cs.suppliedParameters, seg.segments);
                variants.push({
                  ...col.defaultEvent!,
                  id: cs.id,
                  name: cs.id,
                  displayName: resolveVariantDisplayName(cs.id, raw),
                  enhancementType,
                  segments: seg.segments,
                  ...(raw.activationClause ? { activationClause: raw.activationClause as Predicate[] } : {}),
                  ...(comboParams ? { suppliedParameters: comboParams } : {}),
                });
              }
              // Sort: NORMAL variants first, then ENHANCED/EMPOWERED
              variants.sort((a, b) => {
                const aIsNormal = !a.enhancementType || a.enhancementType === EnhancementType.NORMAL;
                const bIsNormal = !b.enhancementType || b.enhancementType === EnhancementType.NORMAL;
                if (aIsNormal && !bIsNormal) return -1;
                if (!aIsNormal && bIsNormal) return 1;
                return 0;
              });
              if (variants.length === 1) {
                col.defaultEvent = { ...col.defaultEvent!, ...variants[0] };
              } else if (variants.length > 1) {
                col.defaultEvent = { ...col.defaultEvent!, ...variants[0] };
                col.eventVariants = variants;
              }
            }
          }
          // Generic ultimate: build segments from JSON data
          if (skillType === NounType.ULTIMATE) {
            const ultName = op?.skills[NounType.ULTIMATE]?.name;
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
                  id: cs.id,
                  name: cs.id,
                  displayName: cs.name,
                  segments: csSegs,
                  skillPointCost: cs.resourceInteractions?.find((r) => r.resourceType === CombatResourceType.SKILL_POINT)?.value,
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
      // Passive statuses (always-active talents/potentials like Illumination or
      // Catcher's potential) hug the left of the status column group so they
      // stay visually anchored separate from transient statuses.
      // A status is "truly passive" — and should hug the left of the status
      // column group — if it's an always-on talent/potential with no trigger
      // managing its lifecycle. Trigger-managed talents (onTriggerClause fires
      // APPLY EVENT / CONSUME EVENT) are transient and should not hug left.
      const isPassiveStatus = (def: OperatorStatusDef): boolean => {
        const cfg = getStatusById(def.statusId);
        if (cfg?.eventCategoryType !== NounType.TALENT && cfg?.eventCategoryType !== NounType.POTENTIAL) return false;
        const isCounter = cfg?.stacks?.interactionType === StackInteractionType.NONE && (cfg?.maxStacks ?? 0) >= UNLIMITED_STACKS;
        if (isCounter) return false;
        const durSec = cfg?.durationSeconds ?? 0;
        if (durSec > 0 && durSec < PERMANENT_DURATION) return false;
        if ((cfg?.onTriggerClause?.length ?? 0) > 0) return false;
        return true;
      };
      const ownDefs = (operatorStatusMap.get(slot.slotId) ?? [])
        .slice()
        .sort((a, b) => {
          const passiveDelta = Number(isPassiveStatus(b)) - Number(isPassiveStatus(a));
          if (passiveDelta !== 0) return passiveDelta;
          return (STATUS_SOURCE_ORDER[a.source] ?? 3) - (STATUS_SOURCE_ORDER[b.source] ?? 3);
        });
      for (const def of ownDefs) {
        const cfg = getStatusById(def.statusId);
        const isCounter = cfg?.stacks?.interactionType === StackInteractionType.NONE && (cfg?.maxStacks ?? 0) >= UNLIMITED_STACKS;
        // A talent/potential is "permanent" (always-active passive) only if it
        // has no finite duration. Trigger-only talents like Fluorite's
        // Unpredictable (T2) carry a 10s duration — the talent event exists
        // transiently when the onTriggerClause fires, so they are NOT passive.
        // `durationSeconds` is 0 for always-active talents (no `duration` field)
        // and >=PERMANENT_DURATION for explicitly-permanent statuses.
        const durSec = cfg?.durationSeconds ?? 0;
        const hasFiniteDuration = durSec > 0 && durSec < PERMANENT_DURATION;
        const isPermanent = !isCounter
          && !hasFiniteDuration
          && (cfg?.eventCategoryType === NounType.TALENT
            || cfg?.eventCategoryType === NounType.POTENTIAL);
        const mc = buildStatusMicroColumn(def.statusId, def.color, { label: def.label, permanent: isPermanent });
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
          const tsdCfg = getStatusById(tsd.statusId);
          const tsdColor = tsdCfg?.element ? (ELEMENT_COLORS[tsdCfg.element as ElementType] ?? DEFAULT_EVENT_COLOR) : DEFAULT_EVENT_COLOR;
          statusMicroCols.push(buildStatusMicroColumn(tsd.statusId, tsdColor, { label: tsd.label }));
          matchIds.push(tsd.statusId);
        }
      }
      if (statusMicroCols.length > 0) {
        columns.push({
          key: `${slot.slotId}-${OPERATOR_STATUS_COLUMN_ID}`,
          type: ColumnType.MINI_TIMELINE,
          source: TimelineSourceType.OPERATOR,
          ownerEntityId: slot.slotId,
          columnId: OPERATOR_STATUS_COLUMN_ID,
          label: ColumnLabel.STATUS,
          color: ELEMENT_COLORS[op.element as ElementType] ?? op.color,
          headerVariant: HeaderVariant.SKILL,
          derived: true,
          microColumns: statusMicroCols,
          microColumnAssignment: MicroColumnAssignment.DYNAMIC_SPLIT,
          matchColumnIds: matchIds,
          matchAllExcept: OPERATOR_NON_STATUS_COLUMNS,
        });
      statusColCount++;
      }
    }

    // Every slot gets at least MIN_SLOT_COLS columns so the loadout row stays visible
    const skillColCount = slotHasCols
      ? SKILL_ORDER.filter((st) => visibleSkills[slot.slotId]?.[st]).length
      : 0;
    const needed = MIN_SLOT_COLS - (skillColCount + statusColCount);
    for (let p = 0; p < Math.max(0, needed); p++) {
      columns.push({
        key: `${slot.slotId}-placeholder${p}`,
        type: ColumnType.PLACEHOLDER,
        ownerEntityId: slot.slotId,
        color: op?.color ?? '#666',
      });
    }
  }

  // ── Enemy action timeline ──────────────────────────────────────────────────
  const ENEMY_AOE_ELEMENTS: { element: ElementType; id: EnemyActionType }[] = [
    { element: ElementType.PHYSICAL, id: EnemyActionType.AOE_PHYSICAL },
    { element: ElementType.HEAT,     id: EnemyActionType.AOE_HEAT },
    { element: ElementType.CRYO,     id: EnemyActionType.AOE_CRYO },
    { element: ElementType.NATURE,   id: EnemyActionType.AOE_NATURE },
    { element: ElementType.ELECTRIC, id: EnemyActionType.AOE_ELECTRIC },
  ];
  columns.push({
    key: `enemy-${ENEMY_ACTION_COLUMN_ID}`,
    type: ColumnType.MINI_TIMELINE,
    source: TimelineSourceType.ENEMY,
    ownerEntityId: ENEMY_ID,
    columnId: ENEMY_ACTION_COLUMN_ID,
    label: ColumnLabel.ACTION,
    color: '#cc4444',
    headerVariant: HeaderVariant.SKILL,
    eventVariants: [
      ...ENEMY_AOE_ELEMENTS.map(({ element, id }) => ({
        id,
        name: id,
        displayName: ENEMY_ACTION_LABELS[id],
        segments: [{
          properties: { duration: 240, name: ENEMY_ACTION_LABELS[id], element },
          frames: [{
            offsetFrame: 0,
            clauses: [buildDealDamageClause({ multiplier: 1, element })],
          }],
        }],
      })),
      // CHARGE — enemy wind-up state. No damage, no status application — just
      // a timeline marker that satisfies `ENEMY PERFORM STATUS CHARGE` triggers
      // (e.g. Catcher's Timely Suppression combo activation window). Listed
      // last so existing tests that pick the first variant by default still
      // get a damage-dealing AOE_PHYSICAL.
      //
      // The segment carries an explicit frame with an empty `clauses` array
      // so `flattenEventsToQueueFrames` does NOT synthesize a placeholder
      // frame (which would drop into the `!frame.clauses` branch of
      // `handleProcessFrame` → `applyEvent` and duplicate the event on the
      // enemy-action column, stripping `creationInteractionMode` from the
      // duplicate and making the resulting event non-draggable in the view).
      // An empty-array `clauses: []` is truthy, so `!frame.clauses` is false
      // and the synthesis / re-apply path is skipped.
      {
        id: EnemyActionType.CHARGE,
        name: EnemyActionType.CHARGE,
        displayName: ENEMY_ACTION_LABELS[EnemyActionType.CHARGE],
        segments: [{
          properties: { duration: 240, name: ENEMY_ACTION_LABELS[EnemyActionType.CHARGE], element: ElementType.PHYSICAL },
          frames: [{
            offsetFrame: 0,
            clauses: [],
          }],
        }],
      },
    ],
  });

  // ── Enemy stagger resource ─────────────────────────────────────────────────
  columns.push({
    key: `enemy-${COMMON_COLUMN_IDS.STAGGER}`,
    type: ColumnType.MINI_TIMELINE,
    source: TimelineSourceType.ENEMY,
    ownerEntityId: ENEMY_ID,
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
    // Arts inflictions
    ...enemy.statuses.map((s) => buildStatusMicroColumn(s.id, s.color, { label: s.label })),
    // Arts reactions
    ...REACTION_MICRO_COLUMNS.map((mc) => buildStatusMicroColumn(mc.id, mc.color, { label: mc.label })),
    // Physical inflictions
    buildStatusMicroColumn(PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ELEMENT_COLORS[ElementType.PHYSICAL], { label: 'VULN' }),
    // Physical statuses
    buildStatusMicroColumn(PHYSICAL_STATUS_COLUMNS.LIFT, ELEMENT_COLORS[ElementType.PHYSICAL]),
    buildStatusMicroColumn(PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN, ELEMENT_COLORS[ElementType.PHYSICAL]),
    buildStatusMicroColumn(PHYSICAL_STATUS_COLUMNS.CRUSH, ELEMENT_COLORS[ElementType.PHYSICAL]),
    buildStatusMicroColumn(PHYSICAL_STATUS_COLUMNS.BREACH, ELEMENT_COLORS[ElementType.PHYSICAL]),
    // Debuff base types (catch-all for operator-specific susceptibility/fragility effects).
    // Abstract SUSCEPTIBILITY is not freeform-placeable — only element-specific susceptibility
    // variants (CRYO_SUSCEPTIBILITY, HEAT_SUSCEPTIBILITY, …) are concrete placeable items.
    buildStatusMicroColumn(StatusType.FOCUS, '#55aadd'),
    buildStatusMicroColumn(StatusType.FRAGILITY, '#cc6644'),
    // Stagger frailty — durations from enemy config, not static JSON defaults
    buildStatusMicroColumn(NODE_STAGGER_COLUMN_ID, '#dd8844', { durationSeconds: enemy.staggerNodeRecoverySeconds }),
    buildStatusMicroColumn(FULL_STAGGER_COLUMN_ID, '#dd8844', { durationSeconds: enemy.staggerBreakDurationSeconds }),
    // Data-driven enemy status entries: all statuses targeting ENEMY
    // from operator defs and generic defs (deduped by id)
    ...(() => {
      const seen = new Set<string>([
        ...enemy.statuses.map(s => s.id),
        ...REACTION_MICRO_COLUMNS.map(mc => mc.id),
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
        PHYSICAL_STATUS_COLUMNS.LIFT, PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
        PHYSICAL_STATUS_COLUMNS.CRUSH, PHYSICAL_STATUS_COLUMNS.BREACH,
        StatusType.FOCUS, StatusType.SUSCEPTIBILITY, StatusType.FRAGILITY,
        NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID,
      ]);
      const cols: MicroColumn[] = [];
      // Operator-specific statuses targeting ENEMY
      for (const s of slots) {
        if (!s.operator) continue;
        for (const se of getEnabledStatusEvents(s.operator.id)) {
          if (se.target !== NounType.ENEMY || seen.has(se.id)) continue;
          seen.add(se.id);
          cols.push(buildStatusMicroColumn(se.id, ELEMENT_COLORS[s.operator.element as ElementType] ?? ELEMENT_COLORS[s.operator.element as ElementType] ?? s.operator.color));
        }
      }
      // Generic statuses targeting ENEMY
      for (const se of getEnabledStatusEvents('generic')) {
        if (se.target !== NounType.ENEMY || seen.has(se.id)) continue;
        seen.add(se.id);
        cols.push(buildStatusMicroColumn(se.id, '#cc8866'));
      }
      return cols;
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
    ownerEntityId: ENEMY_ID,
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
