import { Subtimeline } from './subtimeline';
import { ResourceTimeline } from './resourceTimeline';
import { FPS } from '../../utils/timeline';

const SP_MAX = 300;
const SP_REGEN_PER_SECOND = 8;

/**
 * Skill Point resource timeline.
 *
 * Range: 0–300, regenerates at 8 SP/second, starts at max.
 * Events represent SP costs (activationDuration = cost amount).
 */
export class SkillPointTimeline extends ResourceTimeline {
  min = 0;
  max = SP_MAX;
  startValue = 200;
  regenPerFrame = SP_REGEN_PER_SECOND / FPS;

  constructor(subtimeline: Subtimeline) {
    super(subtimeline);
    this.init();
  }
}
