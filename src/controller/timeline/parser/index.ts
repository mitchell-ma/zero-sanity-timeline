/**
 * Parser module. Turns raw events + loadout context into the queue-frame
 * + DEC-ingress inputs the engine consumes. Single authority for:
 *   - Raw event cloning + input/derived classification (cloneAndSplit)
 *   - Event → QueueFrame[] flattening (flattenEventsToQueueFrames)
 *   - Talent selection (selectNewTalents)
 *   - Controlled-operator seed construction (buildControlSeed)
 */
export { flattenEventsToQueueFrames } from './flattenEvents';
export { cloneAndSplitEvents, resetSegmentCloneCache } from './cloneAndSplit';
export { selectNewTalents } from './selectNewTalents';
export { buildControlSeed } from './buildControlSeed';
