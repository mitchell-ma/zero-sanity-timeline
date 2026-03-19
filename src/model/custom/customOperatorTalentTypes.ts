/**
 * Type definitions for user-created custom operator talents.
 */
import type { CustomStatusEventDef } from './customStatusEventTypes';

/** A user-created custom operator talent. */
export interface CustomOperatorTalent {
  id: string;
  name: string;
  operatorId?: string;
  slot: number;
  maxLevel: number;
  statusEvents: CustomStatusEventDef[];
}
