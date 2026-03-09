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
}

export const TRIGGER_CAPABILITIES: Record<string, TriggerCapability> = {
  laevatain: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.COMBUSTION],
    },
    comboRequires: [TriggerConditionType.COMBUSTION, TriggerConditionType.CORROSION],
    comboDescription: 'Enemy has Combustion or Corrosion',
    comboWindowFrames: 720,
  },
  antal: {
    publishesTriggers: {
      battle: [TriggerConditionType.ELECTRIFICATION],
    },
    comboRequires: [TriggerConditionType.ELECTRIFICATION],
    comboDescription: 'Enemy has Electrification',
    comboWindowFrames: 720,
  },
  akekuri: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
    },
    comboRequires: [TriggerConditionType.COMBUSTION],
    comboDescription: 'Enemy has Combustion',
    comboWindowFrames: 720,
  },
  wulfgard: {
    publishesTriggers: {
      battle: [TriggerConditionType.COMBUSTION],
    },
    comboRequires: [TriggerConditionType.COMBUSTION],
    comboDescription: 'Enemy has Combustion',
    comboWindowFrames: 720,
  },
  ardelia: {
    publishesTriggers: {
      battle: [TriggerConditionType.CORROSION],
    },
    comboRequires: [TriggerConditionType.FINAL_STRIKE],
    comboDescription: 'Final Strike on enemy with no Vulnerability or Arts Infliction',
    comboWindowFrames: 720,
    comboForbidsActiveColumns: [
      'heatInfliction', 'cryoInfliction', 'natureInfliction', 'electricInfliction',
    ],
  },
  endministrator: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.APPLY_PHYSICAL_STATUS],
    },
    comboRequires: [TriggerConditionType.CAST_COMBO_SKILL],
    comboDescription: 'Another operator casts combo skill',
    comboWindowFrames: 720,
  },
  lifeng: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.APPLY_PHYSICAL_STATUS],
    },
    comboRequires: [TriggerConditionType.FINAL_STRIKE],
    comboDescription: 'Final Strike on enemy with Breach',
    comboWindowFrames: 720,
  },
  chenQianyu: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.APPLY_PHYSICAL_STATUS],
    },
    comboRequires: [TriggerConditionType.APPLY_VULNERABILITY],
    comboDescription: 'Enemy becomes Vulnerable',
    comboWindowFrames: 720,
  },
  estella: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.SOLIDIFICATION],
    },
    comboRequires: [TriggerConditionType.SOLIDIFICATION],
    comboDescription: 'Enemy has Solidification',
    comboWindowFrames: 720,
  },
  ember: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.COMBUSTION],
    },
    comboRequires: [TriggerConditionType.OPERATOR_ATTACKED],
    comboDescription: 'Controlled operator is attacked',
    comboWindowFrames: 720,
  },
  snowshine: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.SOLIDIFICATION],
    },
    comboRequires: [TriggerConditionType.HP_BELOW_THRESHOLD],
    comboDescription: 'Controlled operator drops below 60% HP',
    comboWindowFrames: 720,
  },
  catcher: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.APPLY_VULNERABILITY],
    },
    comboRequires: [TriggerConditionType.OPERATOR_ATTACKED],
    comboDescription: 'Enemy charges up or operator below 40% HP',
    comboWindowFrames: 720,
  },
  gilberta: {
    publishesTriggers: {
      battle: [TriggerConditionType.CORROSION],
    },
    comboRequires: [TriggerConditionType.COMBUSTION, TriggerConditionType.SOLIDIFICATION, TriggerConditionType.CORROSION, TriggerConditionType.ELECTRIFICATION],
    comboDescription: 'Any Arts Reaction applied',
    comboWindowFrames: 720,
  },
  xaihi: {
    publishesTriggers: {
      battle: [TriggerConditionType.HP_TREATMENT],
    },
    comboRequires: [TriggerConditionType.HP_TREATMENT],
    comboDescription: 'Auxiliary Crystal exhausts HP treatments',
    comboWindowFrames: 720,
  },
  perlica: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.ELECTRIFICATION],
    },
    comboRequires: [TriggerConditionType.FINAL_STRIKE],
    comboDescription: 'Final Strike finisher',
    comboWindowFrames: 720,
  },
  fluorite: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.CORROSION],
    },
    comboRequires: [TriggerConditionType.SOLIDIFICATION, TriggerConditionType.CORROSION],
    comboDescription: '2+ Cryo or Nature Infliction stacks',
    comboWindowFrames: 720,
  },
  lastRite: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.SOLIDIFICATION],
    },
    comboRequires: [TriggerConditionType.SOLIDIFICATION],
    comboDescription: 'Enemy has 3+ Cryo Infliction stacks',
    comboWindowFrames: 720,
  },
  yvonne: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.SOLIDIFICATION],
    },
    comboRequires: [TriggerConditionType.FINAL_STRIKE],
    comboDescription: 'Final Strike on Solidified enemy',
    comboWindowFrames: 720,
  },
  avywenna: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.ELECTRIFICATION],
    },
    comboRequires: [TriggerConditionType.FINAL_STRIKE],
    comboDescription: 'Final Strike on Electric/Electrified enemy',
    comboWindowFrames: 720,
  },
  daPan: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.APPLY_PHYSICAL_STATUS],
    },
    comboRequires: [TriggerConditionType.APPLY_VULNERABILITY],
    comboDescription: 'Enemy reaches 4 Vulnerability stacks',
    comboWindowFrames: 720,
  },
  pogranichnik: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.APPLY_PHYSICAL_STATUS],
    },
    comboRequires: [TriggerConditionType.APPLY_PHYSICAL_STATUS],
    comboDescription: 'Crush or Breach consumes Vulnerability',
    comboWindowFrames: 720,
  },
  alesh: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.SOLIDIFICATION],
    },
    comboRequires: [TriggerConditionType.SOLIDIFICATION],
    comboDescription: 'Arts Reaction or Crystals consumed nearby',
    comboWindowFrames: 720,
  },
  arclight: {
    publishesTriggers: {
      basic: [TriggerConditionType.FINAL_STRIKE],
      battle: [TriggerConditionType.ELECTRIFICATION],
    },
    comboRequires: [TriggerConditionType.ELECTRIFICATION],
    comboDescription: 'Enemy has or consumed Electrification',
    comboWindowFrames: 720,
  },
};
