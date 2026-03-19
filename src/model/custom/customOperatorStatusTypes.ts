/**
 * Type definitions for user-created custom operator statuses.
 */
import type { CustomStatusEventDef } from './customStatusEventTypes';

/** A user-created custom operator status. */
export interface CustomOperatorStatus {
  id: string;
  name: string;
  operatorId?: string;
  statusEvent: CustomStatusEventDef;
}
