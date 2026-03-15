/**
 * Multi-step wizard for creating/editing custom weapons.
 */
import { useState } from 'react';
import { WeaponType, ElementType } from '../../consts/enums';
import type { CustomWeapon, CustomWeaponSkillDef, CustomWeaponBuff, CustomWeaponNamedEffect } from '../../model/custom/customWeaponTypes';
import { maxSkillsForRarity } from '../../model/custom/customWeaponTypes';
import { ObjectType, SubjectType, VerbType } from '../../consts/semantics';
import type { Interaction } from '../../consts/semantics';
import InteractionBuilder, { defaultInteraction } from './InteractionBuilder';
import IdField from './IdField';

const WEAPON_TYPE_LABELS: Record<WeaponType, string> = {
  [WeaponType.SWORD]: 'Sword',
  [WeaponType.GREAT_SWORD]: 'Great Sword',
  [WeaponType.POLEARM]: 'Polearm',
  [WeaponType.HANDCANNON]: 'Handcannon',
  [WeaponType.ARTS_UNIT]: 'Arts Unit',
};

interface Props {
  initial: CustomWeapon;
  onSave: (weapon: CustomWeapon) => string[];
  onCancel: () => void;
}

export default function CustomWeaponWizard({ initial, onSave, onCancel }: Props) {
  const [weapon, setWeapon] = useState<CustomWeapon>(() => JSON.parse(JSON.stringify(initial)));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const update = (patch: Partial<CustomWeapon>) => setWeapon((w) => ({ ...w, ...patch }));
  const maxSkills = maxSkillsForRarity(weapon.weaponRarity);

  const handleSave = () => {
    const errs = onSave(weapon);
    if (errs.length > 0) setErrors(errs);
  };

  // Adjust skill count when rarity changes
  const handleRarityChange = (rarity: 3 | 4 | 5 | 6) => {
    const max = maxSkillsForRarity(rarity);
    const skills = [...weapon.skills];
    while (skills.length < max) {
      skills.push({ type: 'STAT_BOOST', label: `Skill ${skills.length + 1}`, statBoost: { stat: 'ATTACK_BONUS', values: Array(9).fill(0) } });
    }
    update({ weaponRarity: rarity, skills: skills.slice(0, max) });
  };

  return (
    <div className="custom-wizard">
      <div className="wizard-header">
        <h3>{initial.name ? `Edit: ${initial.name}` : 'New Custom Weapon'}</h3>
        <div className="wizard-steps">
          <button className={`wizard-step${step === 0 ? ' active' : ''}`} onClick={() => setStep(0)}>Identity</button>
          <button className={`wizard-step${step === 1 ? ' active' : ''}`} onClick={() => setStep(1)}>Skills ({weapon.skills.length})</button>
        </div>
      </div>

      <div className="wizard-body">
        {step === 0 && (
          <div className="wizard-section">
            <IdField
              value={weapon.id}
              onChange={(id) => update({ id })}
              originalId={initial.id}
            />
            <label className="wz-field">
              <span>Name</span>
              <input type="text" value={weapon.name} onChange={(e) => update({ name: e.target.value })} placeholder="Weapon name" />
            </label>
            <label className="wz-field">
              <span>Type</span>
              <select value={weapon.weaponType} onChange={(e) => update({ weaponType: e.target.value as WeaponType })}>
                {Object.values(WeaponType).map((t) => <option key={t} value={t}>{WEAPON_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>Rarity</span>
              <div className="wz-radio-group">
                {([3, 4, 5, 6] as const).map((r) => (
                  <label key={r} className={`wz-radio${weapon.weaponRarity === r ? ' active' : ''}`}>
                    <input type="radio" checked={weapon.weaponRarity === r} onChange={() => handleRarityChange(r)} />
                    {r}★
                  </label>
                ))}
              </div>
            </label>
            <div className="wz-field-row">
              <label className="wz-field">
                <span>Base ATK (Lv1)</span>
                <input type="number" min={1} value={weapon.baseAtk.lv1} onChange={(e) => update({ baseAtk: { ...weapon.baseAtk, lv1: Number(e.target.value) } })} />
              </label>
              <label className="wz-field">
                <span>Base ATK (Lv90)</span>
                <input type="number" min={1} value={weapon.baseAtk.lv90} onChange={(e) => update({ baseAtk: { ...weapon.baseAtk, lv90: Number(e.target.value) } })} />
              </label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-section">
            {weapon.skills.map((skill, i) => (
              <SkillEditor
                key={i}
                index={i}
                skill={skill}
                onChange={(s) => {
                  const skills = [...weapon.skills];
                  skills[i] = s;
                  update({ skills });
                }}
              />
            ))}
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
          {step < 1 ? (
            <button className="btn-next" onClick={() => setStep(step + 1)}>Next</button>
          ) : (
            <button className="btn-save" onClick={handleSave}>Save</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Skill Editor ────────────────────────────────────────────────────────────

function SkillEditor({ index, skill, onChange }: { index: number; skill: CustomWeaponSkillDef; onChange: (s: CustomWeaponSkillDef) => void }) {
  const update = (patch: Partial<CustomWeaponSkillDef>) => onChange({ ...skill, ...patch });

  return (
    <div className="skill-editor">
      <div className="skill-editor-header">
        <span className="skill-index">Skill {index + 1}</span>
        <div className="wz-radio-group">
          <label className={`wz-radio${skill.type === 'STAT_BOOST' ? ' active' : ''}`}>
            <input type="radio" checked={skill.type === 'STAT_BOOST'} onChange={() => update({
              type: 'STAT_BOOST',
              statBoost: skill.statBoost ?? { stat: 'ATTACK_BONUS', values: Array(9).fill(0) },
            })} />
            Stat Boost
          </label>
          <label className={`wz-radio${skill.type === 'NAMED' ? ' active' : ''}`}>
            <input type="radio" checked={skill.type === 'NAMED'} onChange={() => update({
              type: 'NAMED',
              namedEffect: skill.namedEffect ?? defaultNamedEffect(),
            })} />
            Named Effect
          </label>
        </div>
      </div>

      <label className="wz-field">
        <span>Label</span>
        <input type="text" value={skill.label} onChange={(e) => update({ label: e.target.value })} />
      </label>

      {skill.type === 'STAT_BOOST' && skill.statBoost && (
        <StatBoostEditor
          statBoost={skill.statBoost}
          onChange={(sb) => update({ statBoost: sb })}
        />
      )}

      {skill.type === 'NAMED' && skill.namedEffect && (
        <NamedEffectEditor
          effect={skill.namedEffect}
          onChange={(ne) => update({ namedEffect: ne })}
        />
      )}
    </div>
  );
}

// ── Stat Boost Editor ───────────────────────────────────────────────────────

function StatBoostEditor({ statBoost, onChange }: { statBoost: { stat: string; values: number[] }; onChange: (sb: { stat: string; values: number[] }) => void }) {
  return (
    <div className="stat-boost-editor">
      <label className="wz-field">
        <span>Stat</span>
        <input type="text" value={statBoost.stat} onChange={(e) => onChange({ ...statBoost, stat: e.target.value })} placeholder="e.g. ATTACK_BONUS" />
      </label>
      <div className="multiplier-table">
        <span className="mt-label">Lv1–9:</span>
        {statBoost.values.map((v, i) => (
          <input
            key={i}
            className="mt-input"
            type="number"
            step="any"
            value={v}
            onChange={(e) => {
              const values = [...statBoost.values];
              values[i] = Number(e.target.value);
              onChange({ ...statBoost, values });
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Named Effect Editor ─────────────────────────────────────────────────────

function defaultNamedEffect(): CustomWeaponNamedEffect {
  return {
    name: '',
    triggers: [defaultInteraction()],
    target: ObjectType.THIS_OPERATOR,
    durationSeconds: 15,
    maxStacks: 1,
    buffs: [],
  };
}

function NamedEffectEditor({ effect, onChange }: { effect: CustomWeaponNamedEffect; onChange: (ne: CustomWeaponNamedEffect) => void }) {
  const update = (patch: Partial<CustomWeaponNamedEffect>) => onChange({ ...effect, ...patch });

  return (
    <div className="named-effect-editor">
      <label className="wz-field">
        <span>Effect Name</span>
        <input type="text" value={effect.name} onChange={(e) => update({ name: e.target.value })} />
      </label>

      <label className="wz-field">
        <span>Target</span>
        <select value={effect.target} onChange={(e) => update({ target: e.target.value })}>
          <option value={ObjectType.THIS_OPERATOR}>This Operator</option>
          <option value={ObjectType.ALL_OPERATORS}>All Operators</option>
          <option value={ObjectType.OTHER_OPERATORS}>Other Operators</option>
          <option value={ObjectType.ENEMY}>Enemy</option>
        </select>
      </label>

      <div className="wz-field-row">
        <label className="wz-field">
          <span>Duration (s)</span>
          <input type="number" min={0} step="any" value={effect.durationSeconds} onChange={(e) => update({ durationSeconds: Number(e.target.value) })} />
        </label>
        <label className="wz-field">
          <span>Max Stacks</span>
          <input type="number" min={1} value={effect.maxStacks} onChange={(e) => update({ maxStacks: Number(e.target.value) })} />
        </label>
        <label className="wz-field">
          <span>Cooldown (s)</span>
          <input type="number" min={0} step="any" value={effect.cooldownSeconds ?? 0} onChange={(e) => update({ cooldownSeconds: Number(e.target.value) || undefined })} />
        </label>
      </div>

      {/* Triggers */}
      <div className="wz-subsection">
        <div className="wz-subsection-header">
          <span>Triggers (any match activates)</span>
          <button className="btn-add-sm" onClick={() => update({ triggers: [...effect.triggers, defaultInteraction()] })}>+</button>
        </div>
        {effect.triggers.map((trigger, i) => (
          <InteractionBuilder
            key={i}
            value={trigger}
            onChange={(t) => {
              const triggers = [...effect.triggers];
              triggers[i] = t;
              update({ triggers });
            }}
            onRemove={effect.triggers.length > 1 ? () => update({ triggers: effect.triggers.filter((_, j) => j !== i) }) : undefined}
            compact
          />
        ))}
      </div>

      {/* Buffs */}
      <div className="wz-subsection">
        <div className="wz-subsection-header">
          <span>Buffs</span>
          <button className="btn-add-sm" onClick={() => update({ buffs: [...effect.buffs, { stat: 'ATTACK_BONUS', valueMin: 0, valueMax: 0, perStack: false }] })}>+</button>
        </div>
        {effect.buffs.map((buff, i) => (
          <div key={i} className="buff-row">
            <input className="ib-input" type="text" value={buff.stat} placeholder="Stat" onChange={(e) => {
              const buffs = [...effect.buffs];
              buffs[i] = { ...buff, stat: e.target.value };
              update({ buffs });
            }} />
            <input className="ib-input" type="number" step="any" value={buff.valueMin} title="Lv1 value" onChange={(e) => {
              const buffs = [...effect.buffs];
              buffs[i] = { ...buff, valueMin: Number(e.target.value) };
              update({ buffs });
            }} />
            <span className="ib-label">→</span>
            <input className="ib-input" type="number" step="any" value={buff.valueMax} title="Lv9 value" onChange={(e) => {
              const buffs = [...effect.buffs];
              buffs[i] = { ...buff, valueMax: Number(e.target.value) };
              update({ buffs });
            }} />
            <label className="ib-checkbox">
              <input type="checkbox" checked={buff.perStack} onChange={(e) => {
                const buffs = [...effect.buffs];
                buffs[i] = { ...buff, perStack: e.target.checked };
                update({ buffs });
              }} />
              /stack
            </label>
            <button className="ib-remove" onClick={() => update({ buffs: effect.buffs.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
