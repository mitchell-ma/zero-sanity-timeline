import { TriggerConditionType } from './enums';

export interface TriggerCapability {
  /** What this operator's skills publish (keyed by columnId: 'basic'|'battle'|'ultimate') */
  publishesTriggers: Partial<Record<string, TriggerConditionType[]>>;
  /** Primary trigger key the combo subscribes to */
  comboRequires: TriggerConditionType;
  /** Human-readable trigger description */
  comboDescription: string;
  /** Activation window in frames (default 720 = 6s at 120 FPS) */
  comboWindowFrames: number;
}

export const TRIGGER_CAPABILITIES: Record<string, TriggerCapability> = {
  laevatain: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.COMBUSTION],
    },
    comboRequires: TriggerConditionType.COMBUSTION,
    comboDescription: 'Enemy has Combustion',
    comboWindowFrames: 720,
  },
  antal: {
    publishesTriggers: {
      battle: [TriggerConditionType.ELECTRIFICATION],
    },
    comboRequires: TriggerConditionType.ELECTRIFICATION,
    comboDescription: 'Enemy has Electrification',
    comboWindowFrames: 720,
  },
  akekuri: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
    },
    comboRequires: TriggerConditionType.COMBUSTION,
    comboDescription: 'Enemy has Combustion',
    comboWindowFrames: 720,
  },
  wulfgard: {
    publishesTriggers: {
      battle: [TriggerConditionType.COMBUSTION],
    },
    comboRequires: TriggerConditionType.COMBUSTION,
    comboDescription: 'Enemy has Combustion',
    comboWindowFrames: 720,
  },
  ardelia: {
    publishesTriggers: {
      battle: [TriggerConditionType.CORROSION],
    },
    comboRequires: TriggerConditionType.CORROSION,
    comboDescription: 'Enemy has Corrosion',
    comboWindowFrames: 720,
  },
};
