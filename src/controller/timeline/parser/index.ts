/**
 * Phase 8 step 7 parser module.
 *
 * Goal state: `flatten(rawEvents, loadoutContext)` takes raw user-placed
 * events + context and emits `QueueFrame[]` that the engine drains via
 * `interpret() → DEC.createSkillEvent`. Today it only exports the legacy
 * registered-event flattener; future sub-commits will add cloneAndSplit,
 * talent/control seed emission, and the `doApplySkill` route.
 */
export { flattenEventsToQueueFrames } from './flattenEvents';
export { cloneAndSplitEvents, resetSegmentCloneCache } from './cloneAndSplit';
export { selectNewTalents } from './selectNewTalents';
export { buildControlSeed } from './buildControlSeed';
