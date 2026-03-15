/**
 * Multi-step wizard for creating/editing custom operators.
 */
import { useState, useMemo } from 'react';
import { WeaponType, ElementType, CombatSkillType } from '../../consts/enums';
import { OperatorClassType } from '../../model/enums/operators';
import { ObjectType } from '../../consts/semantics';
import type { CustomOperator, CustomCombatSkillDef, CustomStatusEventDef } from '../../model/custom/customOperatorTypes';
import type { CustomSkill } from '../../model/custom/customSkillTypes';
import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { COMBAT_SKILL_LABELS } from '../../consts/timelineColumnLabels';
import { getCustomSkills } from '../../controller/custom/customSkillController';
import type { SkillType, SkillDef } from '../../consts/viewTypes';
import InteractionBuilder, { defaultInteraction } from './InteractionBuilder';
import ClauseBuilder from './ClauseBuilder';
import IdField from './IdField';
import SegmentFrameEditor from './SegmentFrameEditor';
import StatusEventEditor, { defaultStatusEventDef } from './StatusEventEditor';

const WEAPON_LABELS: Record<WeaponType, string> = {
  [WeaponType.SWORD]: 'Sword', [WeaponType.GREAT_SWORD]: 'Great Sword',
  [WeaponType.POLEARM]: 'Polearm', [WeaponType.HANDCANNON]: 'Handcannon',
  [WeaponType.ARTS_UNIT]: 'Arts Unit',
};

const CLASS_LABELS: Record<OperatorClassType, string> = {
  [OperatorClassType.GUARD]: 'Guard', [OperatorClassType.CASTER]: 'Caster',
  [OperatorClassType.STRIKER]: 'Striker', [OperatorClassType.VANGUARD]: 'Vanguard',
  [OperatorClassType.DEFENDER]: 'Defender', [OperatorClassType.SUPPORTER]: 'Supporter',
};

const ELEMENT_LABELS: Record<ElementType, string> = {
  [ElementType.NONE]: 'None', [ElementType.PHYSICAL]: 'Physical',
  [ElementType.HEAT]: 'Heat', [ElementType.CRYO]: 'Cryo',
  [ElementType.NATURE]: 'Nature', [ElementType.ELECTRIC]: 'Electric',
};

const SKILL_SLOT_LABELS = {
  basicAttack: 'Basic Attack',
  battleSkill: 'Battle Skill',
  comboSkill: 'Combo Skill',
  ultimate: 'Ultimate',
} as const;

interface Props {
  initial: CustomOperator;
  onSave: (operator: CustomOperator) => string[];
  onCancel: () => void;
}

/** A selectable skill option — built-in or custom. */
interface SkillOption {
  id: string;
  label: string;
  operatorName?: string;
  source: 'builtin' | 'custom';
  skillType: CombatSkillType;
  data: CustomCombatSkillDef;
}

function buildSkillOptions(): SkillOption[] {
  const options: SkillOption[] = [];

  const SKILL_TYPE_MAP: Record<SkillType, CombatSkillType> = {
    basic: CombatSkillType.BASIC_ATTACK,
    battle: CombatSkillType.BATTLE_SKILL,
    combo: CombatSkillType.COMBO_SKILL,
    ultimate: CombatSkillType.ULTIMATE,
  };

  // Built-in skills from all operators
  for (const op of ALL_OPERATORS) {
    for (const [key, skill] of Object.entries(op.skills) as [SkillType, SkillDef][]) {
      const combatSkillType = SKILL_TYPE_MAP[key];
      const label = (COMBAT_SKILL_LABELS as any)[skill.name] || skill.name;
      const totalFrames = skill.defaultActivationDuration + skill.defaultActiveDuration;
      options.push({
        id: `builtin:${op.id}:${key}`,
        label,
        operatorName: op.name,
        source: 'builtin',
        skillType: combatSkillType,
        data: {
          name: skill.name,
          combatSkillType,
          element: skill.element as ElementType | undefined,
          durationSeconds: Math.max(totalFrames / 120, 0.1),
          cooldownSeconds: skill.defaultCooldownDuration > 0 ? skill.defaultCooldownDuration / 120 : undefined,
          animationSeconds: skill.animationDuration ? skill.animationDuration / 120 : undefined,
          resourceInteractions: skill.skillPointCost
            ? [{ resourceType: 'SKILL_POINT', verbType: 'EXPEND', value: skill.skillPointCost }]
            : undefined,
        },
      });
    }
  }

  // Custom skills
  for (const cs of getCustomSkills()) {
    options.push({
      id: `custom:${cs.id}`,
      label: cs.name,
      source: 'custom',
      skillType: cs.combatSkillType,
      data: {
        name: cs.name,
        combatSkillType: cs.combatSkillType,
        element: cs.element,
        durationSeconds: cs.durationSeconds,
        cooldownSeconds: cs.cooldownSeconds,
        animationSeconds: cs.animationSeconds,
        resourceInteractions: cs.resourceInteractions,
      },
    });
  }

  return options;
}

export default function CustomOperatorWizard({ initial, onSave, onCancel }: Props) {
  const [operator, setOperator] = useState<CustomOperator>(() => JSON.parse(JSON.stringify(initial)));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const skillOptions = useMemo(() => buildSkillOptions(), []);

  const update = (patch: Partial<CustomOperator>) => setOperator((o) => ({ ...o, ...patch }));

  const handleSave = () => {
    const errs = onSave(operator);
    if (errs.length > 0) setErrors(errs);
  };

  const totalSteps = 5;

  return (
    <div className="custom-wizard">
      <div className="wizard-header">
        <h3>{initial.name ? `Edit: ${initial.name}` : 'New Custom Operator'}</h3>
        <div className="wizard-steps">
          <button className={`wizard-step${step === 0 ? ' active' : ''}`} onClick={() => setStep(0)}>Identity</button>
          <button className={`wizard-step${step === 1 ? ' active' : ''}`} onClick={() => setStep(1)}>Stats</button>
          <button className={`wizard-step${step === 2 ? ' active' : ''}`} onClick={() => setStep(2)}>Skills</button>
          <button className={`wizard-step${step === 3 ? ' active' : ''}`} onClick={() => setStep(3)}>Combo</button>
          <button className={`wizard-step${step === 4 ? ' active' : ''}`} onClick={() => setStep(4)}>
            Statuses{operator.statusEvents?.length ? ` (${operator.statusEvents.length})` : ''}
          </button>
        </div>
      </div>

      <div className="wizard-body">
        {step === 0 && (
          <div className="wizard-section">
            <IdField
              value={operator.id}
              onChange={(id) => update({ id })}
              originalId={initial.id}
            />
            <label className="wz-field">
              <span>Name</span>
              <input type="text" value={operator.name} onChange={(e) => update({ name: e.target.value })} placeholder="Operator name" />
            </label>
            <label className="wz-field">
              <span>Class</span>
              <select value={operator.operatorClassType} onChange={(e) => update({ operatorClassType: e.target.value as OperatorClassType })}>
                {Object.values(OperatorClassType).map((c) => <option key={c} value={c}>{CLASS_LABELS[c]}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>Element</span>
              <select value={operator.elementType} onChange={(e) => update({ elementType: e.target.value as ElementType })}>
                {Object.values(ElementType).map((el) => <option key={el} value={el}>{ELEMENT_LABELS[el]}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>Weapon Type</span>
              <select value={operator.weaponType} onChange={(e) => update({ weaponType: e.target.value as WeaponType })}>
                {Object.values(WeaponType).map((w) => <option key={w} value={w}>{WEAPON_LABELS[w]}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>Rarity</span>
              <div className="wz-radio-group">
                {([4, 5, 6] as const).map((r) => (
                  <label key={r} className={`wz-radio${operator.operatorRarity === r ? ' active' : ''}`}>
                    <input type="radio" checked={operator.operatorRarity === r} onChange={() => update({ operatorRarity: r })} />
                    {r}★
                  </label>
                ))}
              </div>
            </label>
            <label className="wz-field">
              <span>Display Color</span>
              <input type="color" value={operator.displayColor} onChange={(e) => update({ displayColor: e.target.value })} />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-section">
            <div className="wz-subsection">
              <div className="wz-subsection-header"><span>Lv1 Stats</span></div>
              <StatsEditor
                stats={operator.baseStats.lv1 as Record<string, number>}
                onChange={(lv1) => update({ baseStats: { ...operator.baseStats, lv1 } })}
              />
            </div>
            <div className="wz-subsection">
              <div className="wz-subsection-header"><span>Lv90 Stats</span></div>
              <StatsEditor
                stats={operator.baseStats.lv90 as Record<string, number>}
                onChange={(lv90) => update({ baseStats: { ...operator.baseStats, lv90 } })}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-section">
            {(Object.keys(SKILL_SLOT_LABELS) as (keyof typeof SKILL_SLOT_LABELS)[]).map((key) => (
              <SkillSlotEditor
                key={key}
                label={SKILL_SLOT_LABELS[key]}
                slotKey={key}
                skill={operator.skills[key]}
                skillOptions={skillOptions}
                onChange={(s) => update({ skills: { ...operator.skills, [key]: s } })}
              />
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="wizard-section">
            <div className="wz-subsection">
              <div className="wz-subsection-header">
                <span>Combo Trigger Conditions (any match)</span>
                <button className="btn-add-sm" onClick={() => update({
                  combo: { ...operator.combo, requires: [...operator.combo.requires, defaultInteraction()] },
                })}>+</button>
              </div>
              {operator.combo.requires.map((trigger, i) => (
                <InteractionBuilder
                  key={i}
                  value={trigger}
                  onChange={(t) => {
                    const requires = [...operator.combo.requires];
                    requires[i] = t;
                    update({ combo: { ...operator.combo, requires } });
                  }}
                  onRemove={operator.combo.requires.length > 1 ? () => update({
                    combo: { ...operator.combo, requires: operator.combo.requires.filter((_, j) => j !== i) },
                  }) : undefined}
                  compact
                />
              ))}
            </div>
            <label className="wz-field">
              <span>Combo Description</span>
              <input type="text" value={operator.combo.description} onChange={(e) => update({
                combo: { ...operator.combo, description: e.target.value },
              })} placeholder="e.g. Available when enemy is Combusted" />
            </label>
            <label className="wz-field">
              <span>Window (frames)</span>
              <input type="number" min={1} value={operator.combo.windowFrames ?? 720} onChange={(e) => update({
                combo: { ...operator.combo, windowFrames: Number(e.target.value) },
              })} />
            </label>
          </div>
        )}

        {step === 4 && (
          <div className="wizard-section">
            <div className="wizard-section-intro">
              Define operator-specific statuses — self-buffs, debuffs, reactions, and threshold effects.
              Each status uses the SVO grammar for triggers and effects.
            </div>

            {(operator.statusEvents ?? []).map((se, i) => (
              <StatusEventEditor
                key={i}
                value={se}
                onChange={(updated) => {
                  const statusEvents = [...(operator.statusEvents ?? [])];
                  statusEvents[i] = updated;
                  update({ statusEvents });
                }}
                onRemove={() => update({
                  statusEvents: (operator.statusEvents ?? []).filter((_, j) => j !== i),
                })}
              />
            ))}

            <button className="btn-create" onClick={() => update({
              statusEvents: [...(operator.statusEvents ?? []), defaultStatusEventDef()],
            })}>
              + New Status Event
            </button>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="wizard-errors">
          {errors.map((e, i) => <div key={i} className="wizard-error">{e}</div>)}
        </div>
      )}

      <div className="wizard-footer">
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
        <div className="wizard-footer-right">
          {step > 0 && <button className="btn-back" onClick={() => setStep(step - 1)}>Back</button>}
          {step < totalSteps - 1 ? (
            <button className="btn-next" onClick={() => setStep(step + 1)}>Next</button>
          ) : (
            <button className="btn-save" onClick={handleSave}>Save</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stats Editor ────────────────────────────────────────────────────────────

function StatsEditor({ stats, onChange }: { stats: Record<string, number>; onChange: (s: Record<string, number>) => void }) {
  const entries = Object.entries(stats);
  return (
    <div className="stat-boost-editor">
      {entries.map(([key, value], i) => (
        <div key={i} className="buff-row">
          <input className="ib-input ib-object-id" type="text" value={key} onChange={(e) => {
            const newStats = { ...stats };
            delete newStats[key];
            newStats[e.target.value] = value;
            onChange(newStats);
          }} />
          <input className="ib-input" type="number" step="any" value={value} onChange={(e) => {
            onChange({ ...stats, [key]: Number(e.target.value) });
          }} />
          <button className="ib-remove" onClick={() => {
            const newStats = { ...stats };
            delete newStats[key];
            onChange(newStats);
          }}>×</button>
        </div>
      ))}
      <button className="btn-add-sm" onClick={() => onChange({ ...stats, '': 0 })}>+</button>
    </div>
  );
}

// ── Skill Slot Editor ───────────────────────────────────────────────────────

const COMBAT_SKILL_TYPE_FOR_SLOT: Record<string, CombatSkillType> = {
  basicAttack: CombatSkillType.BASIC_ATTACK,
  battleSkill: CombatSkillType.BATTLE_SKILL,
  comboSkill: CombatSkillType.COMBO_SKILL,
  ultimate: CombatSkillType.ULTIMATE,
};

function SkillSlotEditor({ label, slotKey, skill, skillOptions, onChange }: {
  label: string;
  slotKey: string;
  skill: CustomCombatSkillDef;
  skillOptions: SkillOption[];
  onChange: (s: CustomCombatSkillDef) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const expectedType = COMBAT_SKILL_TYPE_FOR_SLOT[slotKey];

  // Find currently selected option
  const currentOptionId = skillOptions.find(
    (o) => o.data.name === skill.name && o.skillType === skill.combatSkillType
  )?.id ?? '';

  // Filter options: show all skills of same type + all custom skills
  const filteredOptions = skillOptions.filter(
    (o) => o.skillType === expectedType || o.source === 'custom'
  );

  const handleSelect = (optionId: string) => {
    const opt = skillOptions.find((o) => o.id === optionId);
    if (opt) {
      onChange({ ...opt.data, combatSkillType: expectedType });
    }
  };

  return (
    <div className="skill-editor">
      <div className="skill-editor-header">
        <span className="skill-index">{label}</span>
        <button
          className="btn-sm"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Hide Details' : 'Details'}
        </button>
      </div>
      <label className="wz-field">
        <span>Skill</span>
        <select value={currentOptionId} onChange={(e) => handleSelect(e.target.value)}>
          <option value="">-- Select a skill --</option>
          {filteredOptions
            .slice()
            .sort((a, b) => {
              const aPrefix = a.operatorName ?? 'CUSTOM';
              const bPrefix = b.operatorName ?? 'CUSTOM';
              return aPrefix.localeCompare(bPrefix) || a.label.localeCompare(b.label);
            })
            .map((o) => (
            <option key={o.id} value={o.id}>
              {o.operatorName ?? 'CUSTOM'} - {o.label}
            </option>
          ))}
        </select>
      </label>

      {showDetails && (
        <div className="skill-details">
          <div className="wz-field-row">
            <label className="wz-field">
              <span>Duration (s)</span>
              <input type="number" min={0} step="any" value={skill.durationSeconds}
                onChange={(e) => onChange({ ...skill, durationSeconds: Number(e.target.value) })} />
            </label>
            <label className="wz-field">
              <span>Cooldown (s)</span>
              <input type="number" min={0} step="any" value={skill.cooldownSeconds ?? 0}
                onChange={(e) => onChange({ ...skill, cooldownSeconds: Number(e.target.value) || undefined })} />
            </label>
          </div>

          {/* Activation Clause */}
          <div className="wz-subsection">
            <ClauseBuilder
              value={skill.clause ?? []}
              onChange={(clause) => onChange({ ...skill, clause: clause.length > 0 ? clause : undefined })}
              conditionsOnly
              label="Activation Conditions (when this variant is available)"
            />
          </div>

          {/* Segments & Frames */}
          <div className="wz-subsection">
            <SegmentFrameEditor
              segments={skill.segments ?? []}
              onChange={(segments) => onChange({ ...skill, segments: segments.length > 0 ? segments : undefined })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
