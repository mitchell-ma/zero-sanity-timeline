/**
 * Gear set effect data registry.
 *
 * Single source of truth for all gear set effects — both passive (always-on)
 * stats and triggered (conditional) buff/debuff effects.
 *
 * Used by loadoutAggregator for passive stat aggregation and by columnBuilder
 * to create gear buff subtimeline columns.
 *
 * Replaces the old gearEffects.ts abstract class hierarchy.
 */
import { GearSetEffectType, GearSetType, StatType } from './enums';
import { SubjectType, VerbType, ObjectType, DeterminerType } from './semantics';
import type { Interaction } from './semantics';

const _I = (s: any, v: any, o: any, x?: Partial<Interaction>): Interaction => ({ subjectType: s, verbType: v, objectType: o, ...x } as Interaction);
const _IO = (det: DeterminerType, v: any, o: any, x?: Partial<Interaction>): Interaction => ({ subjectDeterminer: det, subjectType: SubjectType.OPERATOR, verbType: v, objectType: o, ...x } as Interaction);
const THIS = DeterminerType.THIS;
const ENEMY = SubjectType.ENEMY;
const ANY = DeterminerType.ANY;
const PERFORM = VerbType.PERFORM;
const APPLY = VerbType.APPLY;
const RECOVER = VerbType.RECOVER;
const IS = VerbType.IS;

// ── Types ────────────────────────────────────────────────────────────────────

/** Target of a gear set effect. */
export type GearEffectTarget = 'wielder' | 'team' | 'enemy';

/** A single buff/debuff applied by a gear set effect. */
export interface GearEffectBuff {
  /** Stat type affected. */
  stat: StatType | 'PROTECTION' | 'DEF' | 'TREATMENT_EFFICIENCY' | 'SHIELD';
  /** Fixed value (gear set effects don't scale by rank). */
  value: number;
  /** Whether this buff is applied per stack (if stacking). */
  perStack?: boolean;
}

/** A triggered gear set effect. */
export interface GearSetEffect {
  /** Display label (e.g. "Hot Work"). */
  label: string;
  /** GearSetEffectType enum key for this effect. */
  gearSetEffectType: GearSetEffectType;
  /** Trigger condition(s) — any match activates. */
  triggers: Interaction[];
  /** Who receives the buff: wielder, team, or enemy. */
  target: GearEffectTarget;
  /** Duration in seconds. */
  durationSeconds: number;
  /** Max stacks (1 = no stacking, just refreshes). */
  maxStacks: number;
  /** Cooldown in seconds (0 = no cooldown). */
  cooldownSeconds: number;
  /** Buffs/debuffs applied by this effect. */
  buffs: GearEffectBuff[];
  /** Additional notes for display. */
  note?: string;
}

/** All effects for a gear set — passive stats and triggered effects. */
export interface GearSetEffectsEntry {
  /** The gear set's effect type. */
  gearSetType: GearSetType;
  /** Display name for the gear set. */
  label: string;
  /** Always-on stats when 3+ pieces of this set are equipped. */
  passiveStats: Partial<Record<StatType, number>>;
  /** Triggered effects (empty for passive-only sets). */
  effects: GearSetEffect[];
}

// ── Data ─────────────────────────────────────────────────────────────────────

export const GEAR_SET_EFFECTS: GearSetEffectsEntry[] = [
  // ── AIC Heavy ──────────────────────────────────────────────────────────────
  // HP +500. After defeating an enemy, restore 100 HP. Cooldown: 5s.
  {
    gearSetType: GearSetType.AIC_HEAVY,
    label: 'AIC Heavy',
    passiveStats: { [StatType.FLAT_HP]: 500 },
    // TODO: Implement instant HP restore on kill (100 HP, 5s CD)
    effects: [],
  },

  // ── AIC Light ──────────────────────────────────────────────────────────────
  // HP +500. After defeating an enemy, ATK +20 for 5s.
  {
    gearSetType: GearSetType.AIC_LIGHT,
    label: 'AIC Light',
    passiveStats: { [StatType.FLAT_HP]: 500 },
    effects: [{
      label: 'AIC Light',
      gearSetEffectType: GearSetEffectType.AIC_LIGHT,
      triggers: [_IO(THIS, VerbType.DEFEAT, ObjectType.ENEMY)],
      target: 'wielder',
      durationSeconds: 5,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.BASE_ATTACK, value: 20 },
      ],
    }],
  },

  // ── Aburrey's Legacy ───────────────────────────────────────────────────────
  // Skill DMG +24%. On battle/combo/ultimate cast, ATK +5% for 15s (3 unique stacks).
  {
    gearSetType: GearSetType.ABURREY_LEGACY,
    label: "Aburrey's Legacy",
    passiveStats: { [StatType.SKILL_DAMAGE_BONUS]: 0.24 },
    effects: [{
      label: "Aburrey's Legacy",
      gearSetEffectType: GearSetEffectType.ABURREY_LEGACY,
      triggers: [
        _IO(THIS, PERFORM, ObjectType.BATTLE_SKILL),
        _IO(THIS, PERFORM, ObjectType.COMBO_SKILL),
        _IO(THIS, PERFORM, ObjectType.ULTIMATE),
      ],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 3,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, value: 0.05, perStack: true },
      ],
      note: 'Each skill type gives a unique non-self-stacking buff',
    }],
  },

  // ── Lynx ───────────────────────────────────────────────────────────────────
  // After HP treatment, target gains 15% DMG Reduction for 10s.
  {
    gearSetType: GearSetType.LYNX,
    label: 'LYNX',
    passiveStats: { [StatType.TREATMENT_BONUS]: 0.2 },
    effects: [{
      label: 'LYNX',
      gearSetEffectType: GearSetEffectType.LYNX,
      triggers: [_IO(THIS, RECOVER, ObjectType.HP)],
      target: 'team',
      durationSeconds: 10,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.FINAL_DAMAGE_REDUCTION, value: 0.15 },
      ],
      note: '30% if treatment exceeds max HP',
    }],
  },

  // ── Æthertech ──────────────────────────────────────────────────────────────
  // After applying Vulnerability, Physical DMG +8% for 15s (max 4 stacks).
  // At 4 stacks, additional Physical DMG +16% for 10s.
  {
    gearSetType: GearSetType.AETHERTECH,
    label: 'Æthertech',
    passiveStats: { [StatType.ATTACK_BONUS]: 0.08 },
    effects: [
      {
        label: 'Æthertech',
        gearSetEffectType: GearSetEffectType.AETHERTECH,
        triggers: [_IO(THIS, APPLY, ObjectType.STATUS, { objectId: "VULNERABILITY" })],
        target: 'wielder',
        durationSeconds: 15,
        maxStacks: 4,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.PHYSICAL_DAMAGE_BONUS, value: 0.08, perStack: true },
        ],
      },
      {
        label: 'Æthertech (Max)',
        gearSetEffectType: GearSetEffectType.AETHERTECH,
        triggers: [_IO(THIS, APPLY, ObjectType.STATUS, { objectId: "VULNERABILITY" })],
        target: 'wielder',
        durationSeconds: 10,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.PHYSICAL_DAMAGE_BONUS, value: 0.16 },
        ],
        note: 'Activates at 4 stacks of Vulnerability',
      },
    ],
  },

  // ── Pulser Labs ────────────────────────────────────────────────────────────
  // After Electrification → Electric DMG +50% for 10s.
  // After Solidification → Cryo DMG +50% for 10s.
  {
    gearSetType: GearSetType.PULSER_LABS,
    label: 'Pulser Labs',
    passiveStats: { [StatType.ARTS_INTENSITY]: 30 },
    effects: [
      {
        label: 'Pulser Labs (Electric)',
        gearSetEffectType: GearSetEffectType.PULSER_LABS,
        triggers: [_I(ENEMY, IS, ObjectType.ELECTRIFIED)],
        target: 'wielder',
        durationSeconds: 10,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.ELECTRIC_DAMAGE_BONUS, value: 0.50 },
        ],
      },
      {
        label: 'Pulser Labs (Cryo)',
        gearSetEffectType: GearSetEffectType.PULSER_LABS,
        triggers: [_I(ENEMY, IS, ObjectType.SOLIDIFIED)],
        target: 'wielder',
        durationSeconds: 10,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.CRYO_DAMAGE_BONUS, value: 0.50 },
        ],
      },
    ],
  },

  // ── Frontiers ──────────────────────────────────────────────────────────────
  // After SP recovery from skill, team DMG +16% for 15s.
  {
    gearSetType: GearSetType.FRONTIERS,
    label: 'Frontiers',
    passiveStats: { [StatType.COMBO_SKILL_COOLDOWN_REDUCTION]: 0.15 },
    effects: [{
      label: 'Frontiers',
      gearSetEffectType: GearSetEffectType.FRONTIERS,
      triggers: [_IO(THIS, RECOVER, ObjectType.SKILL_POINT)],
      target: 'team',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.SKILL_DAMAGE_BONUS, value: 0.16 },
      ],
      note: 'Team DMG +16%',
    }],
  },

  // ── Hot Work ───────────────────────────────────────────────────────────────
  // After Combustion → Heat DMG +50% for 10s.
  // After Corrosion → Nature DMG +50% for 10s.
  {
    gearSetType: GearSetType.HOT_WORK,
    label: 'Hot Work',
    passiveStats: { [StatType.ARTS_INTENSITY]: 30 },
    effects: [
      {
        label: 'Hot Work (Heat)',
        gearSetEffectType: GearSetEffectType.HOT_WORK,
        triggers: [_I(ENEMY, IS, ObjectType.COMBUSTED)],
        target: 'wielder',
        durationSeconds: 10,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.HEAT_DAMAGE_BONUS, value: 0.50 },
        ],
      },
      {
        label: 'Hot Work (Nature)',
        gearSetEffectType: GearSetEffectType.HOT_WORK,
        triggers: [_I(ENEMY, IS, ObjectType.CORRODED)],
        target: 'wielder',
        durationSeconds: 10,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.NATURE_DAMAGE_BONUS, value: 0.50 },
        ],
      },
    ],
  },

  // ── MI Security ────────────────────────────────────────────────────────────
  // After crit hit, ATK +5% for 5s (max 5 stacks).
  // At max stacks, additional Crit Rate +5%.
  {
    gearSetType: GearSetType.MI_SECURITY,
    label: 'MI Security',
    passiveStats: { [StatType.CRITICAL_RATE]: 0.05 },
    effects: [
      {
        label: 'MI Security',
        gearSetEffectType: GearSetEffectType.MI_SECURITY,
        triggers: [_IO(THIS, PERFORM, ObjectType.CRITICAL_HIT)],
        target: 'wielder',
        durationSeconds: 5,
        maxStacks: 5,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.ATTACK_BONUS, value: 0.05, perStack: true },
        ],
      },
      {
        label: 'MI Security (Max)',
        gearSetEffectType: GearSetEffectType.MI_SECURITY,
        triggers: [_IO(THIS, PERFORM, ObjectType.CRITICAL_HIT)],
        target: 'wielder',
        durationSeconds: 5,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.CRITICAL_RATE, value: 0.05 },
        ],
        note: 'Activates at 5 stacks',
      },
    ],
  },

  // ── Tide Surge ─────────────────────────────────────────────────────────────
  // After applying 2+ stacks of Arts Infliction, Arts DMG +35% for 15s.
  {
    gearSetType: GearSetType.TIDE_SURGE,
    label: 'Tide Surge',
    passiveStats: { [StatType.SKILL_DAMAGE_BONUS]: 0.20 },
    effects: [{
      label: 'Tide Surge',
      gearSetEffectType: GearSetEffectType.TIDE_SURGE,
      triggers: [_IO(THIS, APPLY, ObjectType.INFLICTION, { stacks: 2 })],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ARTS_DAMAGE_BONUS, value: 0.35 },
      ],
    }],
  },

  // ── Eternal Xiranite ───────────────────────────────────────────────────────
  // After applying Amp/Protected/Susceptibility/Weakened, other teammates
  // gain DMG +16% for 15s.
  {
    gearSetType: GearSetType.ETERNAL_XIRANITE,
    label: 'Eternal Xiranite',
    passiveStats: { [StatType.FLAT_HP]: 1000 },
    effects: [{
      label: 'Eternal Xiranite',
      gearSetEffectType: GearSetEffectType.ETERNAL_XIRANITE,
      triggers: [_IO(THIS, APPLY, ObjectType.STATUS, { objectId: "BUFF" })],
      target: 'team',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.SKILL_DAMAGE_BONUS, value: 0.16 },
      ],
      note: 'On applying Amp/Protected/Susceptibility/Weakened',
    }],
  },

  // ── Catastrophe ──────────────────────────────────────────────────────────
  // On battle skill cast, +50 SP. Once per battle.
  {
    gearSetType: GearSetType.CATASTROPHE,
    label: 'Catastrophe',
    passiveStats: { [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.2 },
    effects: [{
      label: 'Catastrophe',
      gearSetEffectType: GearSetEffectType.CATASTROPHE,
      triggers: [_IO(THIS, PERFORM, ObjectType.BATTLE_SKILL)],
      target: 'wielder',
      durationSeconds: 1,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [],
      note: '+50 SP, once per battle',
    }],
  },

  // ── Swordmancer ──────────────────────────────────────────────────────────
  // After applying Physical Status, deal 250% ATK Physical DMG + 10 Stagger. CD: 15s.
  {
    gearSetType: GearSetType.SWORDMANCER,
    label: 'Swordmancer',
    passiveStats: { [StatType.STAGGER_EFFICIENCY_BONUS]: 0.2 },
    effects: [{
      label: 'Swordmancer',
      gearSetEffectType: GearSetEffectType.SWORDMANCER,
      triggers: [_IO(THIS, APPLY, ObjectType.STATUS)],
      target: 'enemy',
      durationSeconds: 1,
      maxStacks: 1,
      cooldownSeconds: 14,
      buffs: [],
      note: '250% ATK Physical DMG + 10 Stagger',
    }],
  },

  // ── Bonekrusha ───────────────────────────────────────────────────────────
  // On combo skill cast, next battle skill DMG +30%. Max 2 stacks.
  // Consumed on next battle skill cast.
  {
    gearSetType: GearSetType.BONEKRUSHA,
    label: 'Bonekrusha',
    passiveStats: { [StatType.ATTACK_BONUS]: 0.15 },
    effects: [{
      label: 'Bonekrusha',
      gearSetEffectType: GearSetEffectType.BONEKRUSHA,
      triggers: [_IO(THIS, PERFORM, ObjectType.COMBO_SKILL)],
      target: 'wielder',
      durationSeconds: 0,
      maxStacks: 2,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.BATTLE_SKILL_DAMAGE_BONUS, value: 0.30, perStack: true },
      ],
      note: 'Consumed on next battle skill cast',
    }],
  },

  // ── Type 50 Yinglung ─────────────────────────────────────────────────────
  // When any operator casts battle skill, next combo skill DMG +20%. Max 3 stacks.
  // Consumed on next combo skill cast.
  {
    gearSetType: GearSetType.TYPE_50_YINGLUNG,
    label: 'Type 50 Yinglung',
    passiveStats: { [StatType.ATTACK_BONUS]: 0.15 },
    effects: [{
      label: 'Type 50 Yinglung',
      gearSetEffectType: GearSetEffectType.TYPE_50_YINGLUNG,
      triggers: [_IO(ANY, PERFORM, ObjectType.BATTLE_SKILL)],
      target: 'wielder',
      durationSeconds: 0,
      maxStacks: 3,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.COMBO_SKILL_DAMAGE_BONUS, value: 0.20, perStack: true },
      ],
      note: 'Consumed on next combo skill cast',
    }],
  },

  // ── Armored MSGR ──────────────────────────────────────────────────────────
  // Strength +50. When HP below 50%, 30% DMG Reduction.
  {
    gearSetType: GearSetType.ARMORED_MSGR,
    label: 'Armored MSGR',
    passiveStats: { [StatType.STRENGTH]: 50 },
    // TODO: Implement conditional DMG Reduction +30% when HP below 50%
    effects: [],
  },

  // ── Roving MSGR ───────────────────────────────────────────────────────────
  // Agility +50. When HP above 80%, Physical DMG +20%.
  {
    gearSetType: GearSetType.ROVING_MSGR,
    label: 'Roving MSGR',
    passiveStats: { [StatType.AGILITY]: 50 },
    // TODO: Implement conditional Physical DMG +20% when HP above 80%
    effects: [],
  },

  // ── Mordvolt Insulation ───────────────────────────────────────────────────
  // Intellect +50. When HP above 80%, Arts DMG +20%.
  {
    gearSetType: GearSetType.MORDVOLT_INSULATION,
    label: 'Mordvolt Insulation',
    passiveStats: { [StatType.INTELLECT]: 50 },
    // TODO: Implement conditional Arts DMG +20% when HP above 80%
    effects: [],
  },

  // ── Mordvolt Resistant ────────────────────────────────────────────────────
  // Will +50. When HP below 50%, Treatment Effect +30%.
  {
    gearSetType: GearSetType.MORDVOLT_RESISTANT,
    label: 'Mordvolt Resistant',
    passiveStats: { [StatType.WILL]: 50 },
    // TODO: Implement conditional Treatment Effect +30% when HP below 50%
    effects: [],
  },
];

// ── Lookup helpers ───────────────────────────────────────────────────────────

/** Look up gear set effects by gear set type. */
export function getGearSetEffects(gearSetType: GearSetType): GearSetEffectsEntry | undefined {
  return GEAR_SET_EFFECTS.find((e) => e.gearSetType === gearSetType);
}
