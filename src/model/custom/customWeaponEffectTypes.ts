/**
 * Type definitions for user-created custom weapon effects.
 */
import type { CustomStatusEventDef } from './customStatusEventTypes';

/** A user-created custom weapon effect. */
export interface CustomWeaponEffect {
  id: string;
  name: string;
  weaponId?: string;
  statusEvents: CustomStatusEventDef[];
}
