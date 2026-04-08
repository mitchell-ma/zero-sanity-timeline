/**
 * Unified status configuration cache.
 *
 * Phase 1 consolidates the two private caches that previously lived in
 * `eventInterpretorController.ts` (`_statusConfigCache` + `_statusDefCache`)
 * into one module with a shared invalidation point. Both caches walk the same
 * merged status list (operator + weapon + gear statuses), so a single build
 * pass emits both projections.
 *
 * Invalidation. User-created custom operator statuses mutate the underlying
 * store at runtime (see `customOperatorStatusController.ts`), so the cache
 * must be invalidated after any custom-status create/update/delete AND before
 * each pipeline run to pick up anything that changed since last frame. The
 * previous code invalidated only `_statusDefCache`; the unified cache
 * invalidates both projections at once via `invalidateConfigCache()`.
 */
import type { ValueNode } from '../../dsl/semantics';
import type { EventSegmentData } from '../../consts/viewTypes';
import type { StatusEventDef } from './eventQueueTypes';
import { getAllOperatorStatuses } from '../gameDataStore';
import { getAllWeaponStatuses } from '../../model/game-data/weaponStatusesStore';
import { getAllGearStatuses } from '../../model/game-data/gearStatusesStore';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import { PERMANENT_DURATION } from '../../consts/enums';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';

/** Resolved status config used by doApply / column strategies at runtime. */
export interface StatusConfig {
  duration: number;
  /** Raw duration ValueNode — stored for runtime resolution with operator-specific context (e.g. potential). */
  durationNode?: ValueNode;
  stackingMode?: string;
  maxStacks?: number;
  /** Raw ValueNode for maxStacks — stored when the limit is a runtime expression (e.g. status-dependent). */
  maxStacksNode?: unknown;
  cooldownFrames?: number;
  segments?: EventSegmentData[];
  susceptibility?: Record<string, number>;
}

let _configCache: Map<string, StatusConfig> | null = null;
let _defCache: Map<string, StatusEventDef> | null = null;

function buildCaches(): void {
  _configCache = new Map();
  _defCache = new Map();
  const allStatuses = [
    ...getAllOperatorStatuses(),
    ...getAllWeaponStatuses(),
    ...getAllGearStatuses(),
  ];
  for (const s of allStatuses) {
    // ── config projection (duration / stacks / cooldown / susceptibility) ──
    const dur = s.durationSeconds;
    const durationFrames = dur === PERMANENT_DURATION || dur === 0 ? TOTAL_FRAMES : Math.round(dur * FPS);
    const stackLimit = s.stacks?.limit;
    const isExpression = stackLimit && typeof stackLimit === 'object' && 'operation' in stackLimit;
    const maxStacks = stackLimit && !isExpression
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (typeof stackLimit === 'number' ? stackLimit : resolveValueNode(stackLimit as any, DEFAULT_VALUE_CONTEXT) ?? undefined)
      : undefined;
    const cdSecs = (s as unknown as { cooldownSeconds?: number }).cooldownSeconds;
    const cfg: StatusConfig = {
      duration: durationFrames,
      ...(s.duration?.value ? { durationNode: s.duration.value as ValueNode } : {}),
      stackingMode: s.stacks?.interactionType,
      maxStacks: typeof maxStacks === 'number' ? maxStacks : undefined,
      ...(isExpression ? { maxStacksNode: stackLimit } : {}),
      cooldownFrames: cdSecs && cdSecs > 0 ? Math.round(cdSecs * FPS) : undefined,
    };
    _configCache.set(s.id, cfg);

    // ── def projection (full serialized def for clause evaluation) ──
    _defCache.set(s.id, s.serialize() as unknown as StatusEventDef);
  }
}

/** Look up a status's runtime-resolved config (duration/stacking/cooldown). */
export function getStatusConfig(statusId?: string): StatusConfig | undefined {
  if (!statusId) return undefined;
  if (!_configCache) buildCaches();
  return _configCache!.get(statusId);
}

/** Look up the full serialized status def (for clause / onEntryClause / onExitClause). */
export function getStatusDef(statusId?: string): StatusEventDef | undefined {
  if (!statusId) return undefined;
  if (!_defCache) buildCaches();
  return _defCache!.get(statusId);
}

/**
 * Invalidate both projections so the next access rebuilds from the current
 * merged status list. Called per pipeline run (by `eventQueueController`)
 * and after any custom-status mutation.
 */
export function invalidateConfigCache(): void {
  _configCache = null;
  _defCache = null;
}
