/**
 * Type definitions for user-created custom gear effects.
 */
import type { StatType } from '../enums';
import type { CustomStatusEventDef } from './customStatusEventTypes';

/** A user-created custom gear effect. */
export interface CustomGearEffect {
  id: string;
  name: string;
  gearSetId?: string;
  passiveStats?: Partial<Record<StatType | string, number>>;
  statusEvents: CustomStatusEventDef[];
}
