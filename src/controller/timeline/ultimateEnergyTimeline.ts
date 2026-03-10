import { Subtimeline } from './subtimeline';
import { ResourceTimeline } from './resourceTimeline';
import { TimelineEvent } from '../../consts/viewTypes';
import { FPS } from '../../utils/timeline';

const ULT_ENERGY_MAX = 300;
const ULT_CHARGE_PER_SECOND = 0;

/**
 * Ultimate Energy resource timeline.
 *
 * Range: 0–energyCost, charges at a fixed rate, starts at 0.
 * Each ultimate activation consumes the full energy cost.
 */
export class UltimateEnergyTimeline extends ResourceTimeline {
  min = 0;
  max: number;
  startValue = 0;
  regenPerFrame: number;

  private energyCost: number;

  constructor(subtimeline: Subtimeline, energyCost: number = ULT_ENERGY_MAX, chargePerSecond: number = ULT_CHARGE_PER_SECOND) {
    super(subtimeline);
    this.energyCost = energyCost;
    this.max = energyCost;
    this.regenPerFrame = chargePerSecond / FPS;
    this.init();
  }

  protected getCost(_ev: TimelineEvent): number {
    return this.energyCost;
  }
}
