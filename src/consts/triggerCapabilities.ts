import { TriggerConditionType } from './enums';

export interface TriggerCapability {
  /** What this operator's skills publish (keyed by columnId: 'basic'|'battle'|'ultimate') */
  publishesTriggers: Partial<Record<string, TriggerConditionType[]>>;
  /** Trigger conditions the combo skill can activate on (any match = activates) */
  comboRequires: TriggerConditionType[];
  /** Human-readable trigger description */
  comboDescription: string;
  /** Activation window in frames (default 720 = 6s at 120 FPS) */
  comboWindowFrames: number;
  /**
   * If set, combo window is blocked when ANY event with a matching columnId
   * is active at the trigger frame (e.g. no arts infliction on enemy).
   */
  comboForbidsActiveColumns?: string[];
  /**
   * If set, combo window is blocked unless at least one event with a matching
   * columnId is active at the trigger frame (e.g. requires Focus on enemy).
   */
  comboRequiresActiveColumns?: string[];
  /** Enemy column keys that should be shown when this operator is on the team. */
  derivedEnemyColumns?: string[];
  /** Team column keys that should be shown when this operator is on the team. */
  derivedTeamColumns?: string[];
}
