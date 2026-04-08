import { EventSegmentData } from '../../../consts/viewTypes';
import { SegmentType } from '../../../consts/enums';

/** Set the ANIMATION segment's durationFrames, returning updated segments. */
export function setAnimationSegmentDuration(
  segments: EventSegmentData[],
  duration: number,
): EventSegmentData[] {
  return segments.map(s =>
    s.properties.segmentTypes?.includes(SegmentType.ANIMATION)
      ? { ...s, properties: { ...s.properties, duration } }
      : s,
  );
}
