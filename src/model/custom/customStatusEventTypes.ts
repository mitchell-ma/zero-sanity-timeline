/**
 * Shared type definitions for custom status events.
 * Used by operators, weapon effects, gear effects, operator statuses, and operator talents.
 */
import { ElementType } from '../../consts/enums';
import type { Clause, Interaction } from '../../consts/semantics';
import type { StatType } from '../enums';

/** A resource interaction within a skill or frame. */
export interface CustomResourceInteraction {
  resourceType: string;
  verb: string;
  value: number;
  target?: string;
}

/** A segment within a skill or status event. */
export interface CustomSegmentDef {
  name?: string;
  durationSeconds: number;
  stats?: { statType: StatType | string; value: number[] }[];
  frames?: CustomFrameDef[];
}

/** A frame within a segment. */
export interface CustomFrameDef {
  offsetSeconds: number;
  damage?: {
    elementType: ElementType;
    multiplier: number[];
    damageType: string;
  };
  resourceInteractions?: CustomResourceInteraction[];
  statusInteractions?: Interaction[];
}

/** A custom status event definition (full StatusEvent DSL). */
export interface CustomStatusEventDef {
  name: string;
  target: string;
  element: ElementType;
  isNamedEvent: boolean;
  durationValues: number[];
  durationUnit: string;
  stack: {
    interactionType: string;
    max: number | number[];
    instances: number;
  };
  clause?: Clause;
  onTriggerClause: Clause;
  stats: { statType: StatType | string; value: number[] }[];
  segments?: CustomSegmentDef[];
}
