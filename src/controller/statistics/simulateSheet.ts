/**
 * Standalone simulation runner — replicates the `useApp` pipeline for an
 * arbitrary `SheetData` so the statistics page can compare source loadouts
 * on demand, without needing to open each one in the main view.
 *
 * This mirrors the full pipeline in `useApp.ts`:
 *   1. resolve slots + operators from sheet data
 *   2. create a fresh CombatLoadoutController (so SP/UE/HP state is isolated)
 *   3. build columns
 *   4. filter events to valid columns + attach segments + apply overrides
 *   5. configure SP and UE resource slots
 *   6. run processCombatSimulation (with stagger frailty pass 2)
 *   7. run damage calculation and compute statistics
 *
 * Each call produces an isolated simulation — no shared state across sources.
 */

import { applySheetData, SLOT_IDS } from '../../app/sheetDefaults';
import type { SheetData } from '../../utils/sheetStorage';
import type { TimelineEvent } from '../../consts/viewTypes';
import { CombatLoadoutController } from '../combat-loadout';
import {
  computeSlots,
  computeDefaultResourceConfig,
  attachDefaultSegments,
  getDefaultEnemyStats,
} from '../appStateController';
import { buildColumns } from '../timeline/columnBuilder';
import {
  filterEventsToColumns,
  setNextEventUid,
  getNextEventUid,
} from '../timeline/inputEventController';
import { applyEventOverrides } from '../timeline/overrideApplicator';
import { processCombatSimulation } from '../timeline/eventQueueController';
import { SlotTriggerWiring } from '../timeline/eventQueueTypes';
import { getComboTriggerClause } from '../gameDataStore';
import { resolveGainEfficiencies } from '../timeline/ultimateEnergyController';
import { getUltimateEnergyCost } from '../operators/operatorRegistry';
import { runCalculation } from '../calculation/calculationController';
import {
  buildDamageTableColumns,
  computeDamageStatistics,
  type DamageStatistics,
  type DamageTableColumn,
} from '../calculation/damageTableBuilder';
import { getModelEnemy } from '../calculation/enemyRegistry';
import type { Slot } from '../timeline/columnBuilder';
import type { LoadoutProperties } from '../../view/InformationPane';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import { FPS } from '../../utils/timeline';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { ultimateGraphKey } from '../../model/channels';
import { StatType, CritMode } from '../../consts/enums';

export interface SimulationResult {
  damageStatistics: DamageStatistics;
  slots: Slot[];
  tableColumns: DamageTableColumn[];
  loadouts: Record<string, OperatorLoadoutState>;
  loadoutProperties: Record<string, LoadoutProperties>;
}

/**
 * A single simulation over all crit modes. The non-mode-specific pieces
 * (slots, loadouts, tableColumns) are shared across every variant; only
 * `damageStatisticsByMode` differs per mode. One cache entry can satisfy
 * instant swaps between EXPECTED / NEVER / ALWAYS / MANUAL.
 */
export interface AllModeSimulationResult {
  damageStatisticsByMode: Record<CritMode, DamageStatistics>;
  slots: Slot[];
  tableColumns: DamageTableColumn[];
  loadouts: Record<string, OperatorLoadoutState>;
  loadoutProperties: Record<string, LoadoutProperties>;
}

/** Order the 4 modes are computed in. */
const ALL_CRIT_MODES: readonly CritMode[] = [
  CritMode.EXPECTED,
  CritMode.NEVER,
  CritMode.ALWAYS,
  CritMode.MANUAL,
];

/**
 * Run the combat simulation for every crit mode in one call. Callers should
 * cache the returned bundle; switching crit modes at the view layer then
 * becomes an object lookup instead of a pipeline re-run.
 */
export function simulateSheetAllModes(sheet: SheetData): AllModeSimulationResult {
  const first = simulateSheet(sheet, ALL_CRIT_MODES[0]);
  const byMode: Record<CritMode, DamageStatistics> = {
    [ALL_CRIT_MODES[0]]: first.damageStatistics,
  } as Record<CritMode, DamageStatistics>;
  for (let i = 1; i < ALL_CRIT_MODES.length; i++) {
    byMode[ALL_CRIT_MODES[i]] = simulateSheet(sheet, ALL_CRIT_MODES[i]).damageStatistics;
  }
  return {
    damageStatisticsByMode: byMode,
    slots: first.slots,
    tableColumns: first.tableColumns,
    loadouts: first.loadouts,
    loadoutProperties: first.loadoutProperties,
  };
}

/**
 * Run the full combat simulation for a saved sheet and return its damage
 * statistics. Pure: no side effects outside of its own controllers, and no
 * mutation of the input `sheet`. Safe to call repeatedly in a render.
 */
export function simulateSheet(sheet: SheetData, critMode: CritMode = CritMode.EXPECTED): SimulationResult {
  // setNextEventUid lives at module scope — preserve it so event-add flows in
  // the main view aren't poisoned by our simulation advancing the counter.
  const previousUid = saveCurrentUid();
  try {
    const resolved = applySheetData(sheet);

    const {
      operators,
      enemy,
      enemyStats: resolvedEnemyStats,
      events: resolvedEvents,
      loadouts,
      loadoutProperties,
      visibleSkills,
      resourceConfigs,
      overrides,
    } = resolved;
    const enemyStats = resolvedEnemyStats ?? getDefaultEnemyStats(enemy.id);

    const slots = computeSlots(SLOT_IDS, operators, loadouts, loadoutProperties);

    const combatLoadout = new CombatLoadoutController();
    combatLoadout.setSlotIds(SLOT_IDS);
    combatLoadout.syncSlots(slots);

    const columns = buildColumns(slots, enemy, visibleSkills, combatLoadout.getTeamStatusIds());

    const validEvents = applyEventOverrides(
      attachDefaultSegments(filterEventsToColumns(resolvedEvents, columns), columns),
      overrides,
    );

    const spKey = `${TEAM_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
    const staggerKey = `enemy-${COMMON_COLUMN_IDS.STAGGER}`;

    const spCfg = resourceConfigs?.[spKey] ?? computeDefaultResourceConfig(
      operators, loadoutProperties, SLOT_IDS, spKey, spKey, staggerKey, enemyStats[StatType.STAGGER_HP],
    );
    combatLoadout.commonSlot.skillPoints.updateConfig({
      startValue: spCfg.startValue,
      max: spCfg.max,
      regenPerFrame: spCfg.regenPerSecond / FPS,
    });

    const ue = combatLoadout.commonSlot.ultimateEnergy;
    const base = resolveGainEfficiencies(operators, SLOT_IDS, loadouts, loadoutProperties);
    for (let i = 0; i < SLOT_IDS.length; i++) {
      const op = operators[i];
      if (!op) continue;
      const slotId = SLOT_IDS[i];
      const cfg = resourceConfigs?.[ultimateGraphKey(slotId)];
      ue.configureSlot(slotId, {
        max: cfg?.max ?? getUltimateEnergyCost(op.id),
        startValue: cfg?.startValue ?? 0,
        chargePerFrame: (cfg?.regenPerSecond ?? 0) / FPS,
        efficiency: base[slotId] ?? 0,
      });
    }

    const slotWirings: SlotTriggerWiring[] = [];
    for (let i = 0; i < SLOT_IDS.length; i++) {
      const op = operators[i];
      if (op && getComboTriggerClause(op.id)) {
        slotWirings.push({ slotId: SLOT_IDS[i], operatorId: op.id });
      }
    }

    const slotOperatorMap: Record<string, string> = {};
    for (let i = 0; i < operators.length; i++) {
      if (operators[i]) slotOperatorMap[SLOT_IDS[i]] = operators[i]!.id;
    }

    const slotWeapons: Record<string, string | undefined> = {};
    const slotGearSets: Record<string, string | undefined> = {};
    for (const s of slots) {
      slotWeapons[s.slotId] = s.weaponId;
      slotGearSets[s.slotId] = s.gearSetType;
    }

    const bossMaxHp = (() => {
      const model = getModelEnemy(enemy.id);
      return model ? model.getHp() : null;
    })();

    const pipelineCritMode = critMode === CritMode.ALWAYS ? CritMode.EXPECTED : critMode;

    const runPipeline = (events: TimelineEvent[]) => processCombatSimulation(
      events, loadoutProperties, slotWeapons, slotWirings, slotOperatorMap, slotGearSets,
      bossMaxHp, enemy.id, loadouts,
      combatLoadout.commonSlot.skillPoints,
      combatLoadout.commonSlot.ultimateEnergy,
      combatLoadout.commonSlot.hp,
      combatLoadout.commonSlot.shield,
      combatLoadout.getAllSpCosts(),
      combatLoadout.getTriggerIndex() ?? undefined,
      pipelineCritMode, overrides, enemyStats,
    );

    const pass1 = runPipeline(validEvents);
    combatLoadout.commonSlot.stagger.sync(pass1, enemyStats, loadoutProperties, slotOperatorMap);
    const frailty = combatLoadout.commonSlot.stagger.frailtyEvents;
    const processedEvents = frailty.length > 0 ? runPipeline([...validEvents, ...frailty]) : pass1;

    const staggerBreaks = combatLoadout.commonSlot.stagger.breaks;

    const calc = runCalculation(
      processedEvents,
      columns,
      slots,
      enemy,
      loadoutProperties,
      loadouts,
      staggerBreaks,
      critMode,
      overrides,
    );

    const tableColumns = buildDamageTableColumns(columns);
    const damageStatistics = computeDamageStatistics(calc.rows, tableColumns, bossMaxHp, undefined, undefined, processedEvents);

    return { damageStatistics, slots, tableColumns, loadouts, loadoutProperties };
  } finally {
    restoreUid(previousUid);
  }
}

// ── UID preservation ────────────────────────────────────────────────────────
// applySheetData calls setNextEventUid which mutates a module-scoped counter.
// For the statistics page we simulate many sheets per render; if we didn't
// restore the counter, the main view would start issuing uids that collide with
// the sheet's own events.

function saveCurrentUid(): number {
  return getNextEventUid();
}

function restoreUid(uid: number): void {
  setNextEventUid(uid);
}
