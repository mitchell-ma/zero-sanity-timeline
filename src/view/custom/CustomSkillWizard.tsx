/**
 * Wizard for creating/editing custom skills.
 * Supports DSL clause-based activation conditions, segments with frames, and multipliers.
 */
import { useState } from 'react';
import { CombatSkillType, ElementType, TimeInteractionType } from '../../consts/enums';
import type { Clause, Interaction } from '../../consts/semantics';
import type { CustomSkill } from '../../model/custom/customSkillTypes';
import ClauseBuilder from './ClauseBuilder';
import SegmentFrameEditor from './SegmentFrameEditor';
import IdField from './IdField';

const SKILL_TYPE_LABELS: Record<CombatSkillType, string> = {
  [CombatSkillType.BASIC_ATTACK]: 'Basic Attack',
  [CombatSkillType.BATTLE_SKILL]: 'Battle Skill',
  [CombatSkillType.COMBO_SKILL]: 'Combo Skill',
  [CombatSkillType.ULTIMATE]: 'Ultimate',
};

const ELEMENT_LABELS: Record<ElementType, string> = {
  [ElementType.NONE]: 'None', [ElementType.PHYSICAL]: 'Physical',
  [ElementType.HEAT]: 'Heat', [ElementType.CRYO]: 'Cryo',
  [ElementType.NATURE]: 'Nature', [ElementType.ELECTRIC]: 'Electric',
};

const TIME_INTERACTION_LABELS: Record<TimeInteractionType, string> = {
  [TimeInteractionType.NONE]: 'None',
  [TimeInteractionType.TIME_STOP]: 'Time Stop',
  [TimeInteractionType.TIME_DELAY]: 'Time Delay',
};

interface Props {
  initial: CustomSkill;
  onSave: (skill: CustomSkill) => string[];
  onCancel: () => void;
}

export default function CustomSkillWizard({ initial, onSave, onCancel }: Props) {
  const [skill, setSkill] = useState<CustomSkill>(() => JSON.parse(JSON.stringify(initial)));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const update = (patch: Partial<CustomSkill>) => setSkill((s) => ({ ...s, ...patch }));

  const handleSave = () => {
    const errs = onSave(skill);
    if (errs.length > 0) setErrors(errs);
  };

  const spCost = skill.resourceInteractions?.find((r) => r.resourceType === 'SKILL_POINT' && r.verb === 'CONSUME')?.value ?? 0;

  const totalSteps = 3;

  return (
    <div className="custom-wizard">
      <div className="wizard-header">
        <h3>{initial.name ? `Edit: ${initial.name}` : 'New Custom Skill'}</h3>
        <div className="wizard-steps">
          <button className={`wizard-step${step === 0 ? ' active' : ''}`} onClick={() => setStep(0)}>Identity</button>
          <button className={`wizard-step${step === 1 ? ' active' : ''}`} onClick={() => setStep(1)}>Conditions</button>
          <button className={`wizard-step${step === 2 ? ' active' : ''}`} onClick={() => setStep(2)}>Segments</button>
        </div>
      </div>

      <div className="wizard-body">
        {/* Step 0: Identity & Timing */}
        {step === 0 && (
          <div className="wizard-section">
            <IdField
              value={skill.id}
              onChange={(id) => update({ id })}
              originalId={initial.id}
            />
            <label className="wz-field">
              <span>Skill Name</span>
              <input type="text" value={skill.name} onChange={(e) => update({ name: e.target.value })} placeholder="Skill name" />
            </label>
            <label className="wz-field">
              <span>Skill Type</span>
              <select value={skill.combatSkillType} onChange={(e) => update({ combatSkillType: e.target.value as CombatSkillType })}>
                {Object.values(CombatSkillType).map((t) => <option key={t} value={t}>{SKILL_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>Element</span>
              <select value={skill.element ?? ElementType.NONE} onChange={(e) => {
                const val = e.target.value as ElementType;
                update({ element: val === ElementType.NONE ? undefined : val });
              }}>
                {Object.values(ElementType).map((el) => <option key={el} value={el}>{ELEMENT_LABELS[el]}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>Description</span>
              <textarea
                value={skill.description ?? ''}
                onChange={(e) => update({ description: e.target.value || undefined })}
                rows={3}
                placeholder="Skill description..."
              />
            </label>

            <div className="wz-field-row">
              <label className="wz-field">
                <span>Duration (s)</span>
                <input type="number" min={0} step="any" value={skill.durationSeconds} onChange={(e) => update({ durationSeconds: Number(e.target.value) })} />
              </label>
              <label className="wz-field">
                <span>Cooldown (s)</span>
                <input type="number" min={0} step="any" value={skill.cooldownSeconds ?? 0} onChange={(e) => update({ cooldownSeconds: Number(e.target.value) || undefined })} />
              </label>
              <label className="wz-field">
                <span>Animation (s)</span>
                <input type="number" min={0} step="any" value={skill.animationSeconds ?? 0} onChange={(e) => update({ animationSeconds: Number(e.target.value) || undefined })} />
              </label>
            </div>

            <label className="wz-field">
              <span>Time Interaction</span>
              <select
                value={skill.timeInteractionType ?? TimeInteractionType.NONE}
                onChange={(e) => {
                  const val = e.target.value as TimeInteractionType;
                  update({ timeInteractionType: val === TimeInteractionType.NONE ? undefined : val });
                }}
              >
                {Object.values(TimeInteractionType).map((t) => (
                  <option key={t} value={t}>{TIME_INTERACTION_LABELS[t]}</option>
                ))}
              </select>
            </label>

            <label className="wz-field">
              <span>SP Cost</span>
              <input type="number" min={0} value={spCost} onChange={(e) => {
                const value = Number(e.target.value);
                const ri = (skill.resourceInteractions ?? []).filter((r) => !(r.resourceType === 'SKILL_POINT' && r.verb === 'CONSUME'));
                if (value > 0) ri.push({ resourceType: 'SKILL_POINT', verb: 'CONSUME', value });
                update({ resourceInteractions: ri.length > 0 ? ri : undefined });
              }} />
            </label>
          </div>
        )}

        {/* Step 1: Activation Conditions */}
        {step === 1 && (
          <div className="wizard-section">
            <div className="wizard-section-intro">
              Define when this skill variant is available. Uses the SVO grammar —
              e.g. "This Operator's Ultimate IS ACTIVE" for an enhanced skill during ultimate.
              Leave empty for always-available skills.
            </div>

            <div className="wz-subsection">
              <ClauseBuilder
                value={activationConditionsToClause(skill.activationConditions)}
                onChange={(clause) => update({
                  activationConditions: clauseToActivationConditions(clause),
                })}
                conditionsOnly
                label="Activation Conditions (when this skill is available)"
              />
            </div>
          </div>
        )}

        {/* Step 2: Segments & Multipliers */}
        {step === 2 && (
          <div className="wizard-section">
            <div className="wz-subsection">
              <SegmentFrameEditor
                segments={(skill.segments ?? []) as unknown as import('../../model/custom/customOperatorTypes').CustomSegmentDef[]}
                onChange={(segments) => update({ segments: segments.length > 0 ? segments as unknown as CustomSkill['segments'] : undefined })}
              />
            </div>

            {/* Multipliers */}
            <div className="wz-subsection">
              <div className="wz-subsection-header">
                <span>Skill Multipliers (level 1-12)</span>
                <button className="btn-add-sm" onClick={() => update({
                  multipliers: [...(skill.multipliers ?? []), { label: '', values: Array(12).fill(0) }],
                })}>+</button>
              </div>

              {(skill.multipliers ?? []).length === 0 && (
                <div className="clause-empty">No multipliers — skill has no scaling</div>
              )}

              {(skill.multipliers ?? []).map((mult, i) => (
                <div key={i} className="multiplier-entry">
                  <div className="buff-row">
                    <input
                      className="ib-input ib-object-id"
                      type="text"
                      value={mult.label}
                      placeholder="e.g. Base Explosion"
                      onChange={(e) => {
                        const multipliers = [...(skill.multipliers ?? [])];
                        multipliers[i] = { ...mult, label: e.target.value };
                        update({ multipliers });
                      }}
                    />
                    <button className="ib-remove" onClick={() => update({
                      multipliers: (skill.multipliers ?? []).filter((_, j) => j !== i),
                    })}>×</button>
                  </div>
                  <div className="multiplier-table">
                    {mult.values.map((v, vi) => (
                      <input
                        key={vi}
                        className="mt-input"
                        type="number"
                        step="any"
                        value={v}
                        title={`Lv${vi + 1}`}
                        onChange={(e) => {
                          const multipliers = [...(skill.multipliers ?? [])];
                          const values = [...mult.values];
                          values[vi] = Number(e.target.value);
                          multipliers[i] = { ...mult, values };
                          update({ multipliers });
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
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

// ── Helpers to convert between Interaction[][] (old) and Clause (new) ────────

function activationConditionsToClause(conditions?: Interaction[][]): Clause {
  if (!conditions || conditions.length === 0) return [];
  return conditions.map((group) => ({ conditions: group, effects: [] }));
}

function clauseToActivationConditions(clause: Clause): Interaction[][] | undefined {
  if (clause.length === 0) return undefined;
  return clause.map((pred) => pred.conditions);
}
