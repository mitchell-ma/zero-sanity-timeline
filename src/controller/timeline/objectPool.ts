/**
 * Object pools for the event processing pipeline.
 *
 * Eliminates per-tick allocation of TimelineEvent and QueueFrame objects.
 * All creation sites use allocInputEvent()/allocDerivedEvent()/allocQueueFrame()
 * instead of object literals. At the start of each pipeline run, resetPools()
 * reclaims all objects for reuse — no individual free() calls needed.
 *
 * Pooling flags and pool size limit are read from GlobalSettings.
 */

import type { TimelineEvent } from '../../consts/viewTypes';
import { QueueFrameType } from './eventQueueTypes';
import type { QueueFrame } from './eventQueueTypes';
import { DEFAULT_SETTINGS } from '../../consts/settings';

// ── Runtime settings (synced from GlobalSettings via configurePool) ──────────

let _enablePooling = DEFAULT_SETTINGS.enablePooling;
let _eventPoolLimit = DEFAULT_SETTINGS.eventPoolLimit;
let _enableReconciler = DEFAULT_SETTINGS.enableReconciler;

/** Update pool configuration from GlobalSettings. Call when settings change. */
export function configurePool(enablePooling: boolean, eventPoolLimit: number, enableReconciler: boolean) {
  _enablePooling = enablePooling;
  _eventPoolLimit = eventPoolLimit;
  _enableReconciler = enableReconciler;
}

export function isReconcilerEnabled() { return _enableReconciler; }

// ── TimelineEvent pool ──────────────────────────────────────────────────────

const _eventPool: TimelineEvent[] = [];
let _eventPoolIdx = 0;

const EVENT_DEFAULTS: TimelineEvent = {
  uid: '', id: '', name: '', ownerId: '', columnId: '',
  startFrame: 0, segments: [],
};

/** All keys to clear when recycling an event. Only optional/derived fields. */
const EVENT_OPTIONAL_KEYS: (keyof TimelineEvent)[] = [
  'isForced', 'stacks', 'nonOverlappableRange',
  'gaugeGain', 'teamGaugeGain', 'gaugeGainByEnemies', 'enemiesHit',
  'susceptibility', 'comboTriggerColumnId',
  'timeInteraction', 'isPerfectDodge', 'timeStop', 'timeDependency',
  'sourceOwnerId', 'sourceSkillName',
  'eventStatus', 'eventStatusOwnerId', 'eventStatusSkillName',
  'forcedReaction', 'isArtsBurst', 'reductionFloor', 'artsIntensity',
  'operatorPotential', 'skillPointCost', 'enhancementType',
  'activationClause', 'comboChainFreezeEnd', 'warnings',
  'statusValue', 'damageFactorType', '_pendingSegmentOverrides', 'segmentOrigin',
];

function pooledEvent(): TimelineEvent {
  if (_eventPoolIdx < _eventPool.length) {
    const ev = _eventPool[_eventPoolIdx++];
    ev.uid = '';
    ev.id = '';
    ev.name = '';
    ev.ownerId = '';
    ev.columnId = '';
    ev.startFrame = 0;
    ev.segments = [];
    for (let i = 0; i < EVENT_OPTIONAL_KEYS.length; i++) {
      (ev as unknown as Record<string, unknown>)[EVENT_OPTIONAL_KEYS[i]] = undefined;
    }
    return ev;
  }
  const ev = { ...EVENT_DEFAULTS, segments: [] };
  // Only grow the pool up to the configured limit
  if (_eventPool.length < _eventPoolLimit) {
    _eventPool.push(ev);
  }
  _eventPoolIdx++;
  return ev;
}

function freshEvent(): TimelineEvent {
  return { ...EVENT_DEFAULTS, segments: [] };
}

/** Allocate an input event (controlled operator seed, SP recovery, etc.). */
export function allocInputEvent(): TimelineEvent {
  return _enablePooling ? pooledEvent() : freshEvent();
}

/** Allocate a derived event (infliction, reaction, status). */
export function allocDerivedEvent(): TimelineEvent {
  return _enablePooling ? pooledEvent() : freshEvent();
}

// ── QueueFrame pool ─────────────────────────────────────────────────────────

const _qfPool: QueueFrame[] = [];
let _qfPoolIdx = 0;

export function allocQueueFrame(): QueueFrame {
  if (!_enablePooling) {
    return {
      frame: 0, priority: 0, type: QueueFrameType.PROCESS_FRAME,
      statusId: '', columnId: '', ownerId: '',
      sourceOwnerId: '', sourceSkillName: '',
      maxStacks: 0, durationFrames: 0, operatorSlotId: '',
    };
  }
  if (_qfPoolIdx < _qfPool.length) {
    const qf = _qfPool[_qfPoolIdx++];
    qf.frame = 0;
    qf.priority = 0;
    qf.type = QueueFrameType.PROCESS_FRAME;
    qf.statusId = '';
    qf.columnId = '';
    qf.ownerId = '';
    qf.sourceOwnerId = '';
    qf.sourceSkillName = '';
    qf.maxStacks = 0;
    qf.durationFrames = 0;
    qf.operatorSlotId = '';
    qf.uid = undefined;
    qf.frameMarker = undefined;
    qf.sourceEvent = undefined;
    qf.segmentIndex = undefined;
    qf.frameIndex = undefined;
    qf.engineTrigger = undefined;
    qf.comboResolveEvent = undefined;
    return qf;
  }
  const qf: QueueFrame = {
    frame: 0, priority: 0, type: QueueFrameType.PROCESS_FRAME,
    statusId: '', columnId: '', ownerId: '',
    sourceOwnerId: '', sourceSkillName: '',
    maxStacks: 0, durationFrames: 0, operatorSlotId: '',
  };
  _qfPool.push(qf);
  _qfPoolIdx++;
  return qf;
}

// ── Reset ───────────────────────────────────────────────────────────────────

/** Reclaim all pooled objects for reuse. Call at the start of each pipeline run. */
export function resetPools() {
  _eventPoolIdx = 0;
  _qfPoolIdx = 0;
}

// ── Debug stats ─────────────────────────────────────────────────────────────

export function getPoolStats() {
  return {
    enabled: _enablePooling,
    eventPoolSize: _eventPool.length,
    eventPoolUsed: _eventPoolIdx,
    eventPoolLimit: _eventPoolLimit,
    qfPoolSize: _qfPool.length,
    qfPoolUsed: _qfPoolIdx,
  };
}
