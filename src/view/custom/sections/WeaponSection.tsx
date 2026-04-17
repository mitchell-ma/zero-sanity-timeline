/**
 * Weapon form section for the Unified Customizer.
 * Identity stays collapsible; Skills and Statuses are in a tab container.
 */
import { useState } from 'react';
import { WeaponType, ElementType, CustomWeaponSkillKind } from '../../../consts/enums';
import type { CustomWeapon, CustomWeaponSkillDef } from '../../../model/custom/customWeaponTypes';
import { maxSkillsForRarity } from '../../../model/custom/customWeaponTypes';
import type { CustomStatusEventDef } from '../../../model/custom/customStatusEventTypes';
import CollapsibleSection from '../CollapsibleSection';
import IdField from '../IdField';
import type { Interaction } from '../../../dsl/semantics';
import InteractionBuilder, { defaultInteraction } from '../InteractionBuilder';
import StatusEventFields from './StatusEventFields';

const WEAPON_TYPES = Object.values(WeaponType);
const RARITIES = [3, 4, 5, 6] as const;

/** Tab identifiers for the weapon section's two-tab container. */
enum WeaponTab {
  SKILLS = 'SKILLS',
  STATUSES = 'STATUSES',
}

interface Props {
  data: CustomWeapon;
  onChange: (data: CustomWeapon) => void;
  originalId?: string;
}

function defaultStatusEvent(): CustomStatusEventDef {
  return {
    name: '',
    target: 'wielder',
    element: ElementType.PHYSICAL,
    isNamedEvent: false,
    durationValues: [10],
    durationUnit: 'seconds',
    stack: { interactionType: 'REPLACE', max: 1, instances: 1 },
    clause: [],
    onTriggerClause: [],
    stats: [],
  };
}

function StatBoostEditor({ skill, onChange }: { skill: CustomWeaponSkillDef; onChange: (s: CustomWeaponSkillDef) => void }) {
  const values = skill.statBoost?.values ?? [];
  return (
    <div className="wizard-section" style={{ gap: '0.5rem' }}>
      <label className="wz-field">
        <span>Stat</span>
        <input type="text" value={skill.statBoost?.stat ?? ''} onChange={(e) => onChange({ ...skill, statBoost: { stat: e.target.value, values: values } })} />
      </label>
      <label className="wz-field">
        <span>Values (Lv1–9)</span>
        <div className="wz-field-row" style={{ flexWrap: 'wrap' }}>
          {Array.from({ length: 9 }, (_, i) => (
            <input
              key={i}
              type="number"
              value={values[i] ?? 0}
              onChange={(e) => {
                const v = [...values];
                while (v.length < 9) v.push(0);
                v[i] = Number(e.target.value);
                onChange({ ...skill, statBoost: { stat: skill.statBoost?.stat ?? '', values: v } });
              }}
              style={{ width: '4.5rem' }}
            />
          ))}
        </div>
      </label>
    </div>
  );
}

function SkillEditor({ skill, index, onChange, onRemove }: {
  skill: CustomWeaponSkillDef;
  index: number;
  onChange: (s: CustomWeaponSkillDef) => void;
  onRemove: () => void;
}) {
  return (
    <div className="wz-subsection">
      <div className="wz-subsection-header">
        <span>Skill {index + 1}</span>
        <button className="btn-add-sm" onClick={onRemove} title="Remove skill">&times;</button>
      </div>
      <label className="wz-field">
        <span>Label</span>
        <input type="text" value={skill.label} onChange={(e) => onChange({ ...skill, label: e.target.value })} />
      </label>
      <div className="wz-radio-group">
        <label className={`wz-radio${skill.type === CustomWeaponSkillKind.STAT_BOOST ? ' active' : ''}`}>
          <input type="radio" checked={skill.type === CustomWeaponSkillKind.STAT_BOOST} onChange={() => onChange({ ...skill, type: CustomWeaponSkillKind.STAT_BOOST })} />
          Stat Boost
        </label>
        <label className={`wz-radio${skill.type === CustomWeaponSkillKind.NAMED ? ' active' : ''}`}>
          <input type="radio" checked={skill.type === CustomWeaponSkillKind.NAMED} onChange={() => onChange({ ...skill, type: CustomWeaponSkillKind.NAMED })} />
          Named Effect
        </label>
      </div>
      {skill.type === CustomWeaponSkillKind.STAT_BOOST && <StatBoostEditor skill={skill} onChange={onChange} />}
      {skill.type === CustomWeaponSkillKind.NAMED && skill.namedEffect && (
        <div className="wizard-section" style={{ gap: '0.5rem' }}>
          <label className="wz-field">
            <span>Effect Name</span>
            <input type="text" value={skill.namedEffect.name} onChange={(e) => onChange({ ...skill, namedEffect: { ...skill.namedEffect!, name: e.target.value } })} />
          </label>
          <div className="wz-field-row">
            <label className="wz-field">
              <span>Duration (s)</span>
              <input type="number" value={skill.namedEffect.durationSeconds} onChange={(e) => onChange({ ...skill, namedEffect: { ...skill.namedEffect!, durationSeconds: Number(e.target.value) } })} />
            </label>
            <label className="wz-field">
              <span>Max Stacks</span>
              <input type="number" value={skill.namedEffect.maxStacks} onChange={(e) => onChange({ ...skill, namedEffect: { ...skill.namedEffect!, maxStacks: Number(e.target.value) } })} />
            </label>
            <label className="wz-field">
              <span>Cooldown (s)</span>
              <input type="number" value={skill.namedEffect.cooldownSeconds ?? ''} onChange={(e) => onChange({ ...skill, namedEffect: { ...skill.namedEffect!, cooldownSeconds: e.target.value ? Number(e.target.value) : undefined } })} />
            </label>
          </div>
          <div className="wz-subsection">
            <div className="wz-subsection-header">
              <span>Triggers</span>
              <button className="btn-add-sm" onClick={() => onChange({ ...skill, namedEffect: { ...skill.namedEffect!, triggers: [...skill.namedEffect!.triggers, defaultInteraction()] } })}>+</button>
            </div>
            {skill.namedEffect.triggers.map((trigger, ti) => (
              <InteractionBuilder
                key={ti}
                value={trigger}
                onChange={(v) => {
                  const triggers = [...skill.namedEffect!.triggers];
                  triggers[ti] = v as Interaction;
                  onChange({ ...skill, namedEffect: { ...skill.namedEffect!, triggers } });
                }}
                onRemove={() => {
                  const triggers = skill.namedEffect!.triggers.filter((_, i) => i !== ti);
                  onChange({ ...skill, namedEffect: { ...skill.namedEffect!, triggers } });
                }}
                compact
              />
            ))}
          </div>
          <div className="wz-subsection">
            <div className="wz-subsection-header">
              <span>Buffs</span>
              <button className="btn-add-sm" onClick={() => onChange({ ...skill, namedEffect: { ...skill.namedEffect!, buffs: [...skill.namedEffect!.buffs, { stat: '', valueMin: 0, valueMax: 0, perStack: false }] } })}>+</button>
            </div>
            {skill.namedEffect.buffs.map((buff, bi) => (
              <div key={bi} className="wz-field-row" style={{ alignItems: 'flex-end' }}>
                <label className="wz-field" style={{ flex: 2 }}>
                  <span>Stat</span>
                  <input type="text" value={buff.stat} onChange={(e) => {
                    const buffs = [...skill.namedEffect!.buffs];
                    buffs[bi] = { ...buff, stat: e.target.value };
                    onChange({ ...skill, namedEffect: { ...skill.namedEffect!, buffs } });
                  }} />
                </label>
                <label className="wz-field">
                  <span>Lv1</span>
                  <input type="number" value={buff.valueMin} onChange={(e) => {
                    const buffs = [...skill.namedEffect!.buffs];
                    buffs[bi] = { ...buff, valueMin: Number(e.target.value) };
                    onChange({ ...skill, namedEffect: { ...skill.namedEffect!, buffs } });
                  }} />
                </label>
                <label className="wz-field">
                  <span>Lv9</span>
                  <input type="number" value={buff.valueMax} onChange={(e) => {
                    const buffs = [...skill.namedEffect!.buffs];
                    buffs[bi] = { ...buff, valueMax: Number(e.target.value) };
                    onChange({ ...skill, namedEffect: { ...skill.namedEffect!, buffs } });
                  }} />
                </label>
                <label className={`wz-radio${buff.perStack ? ' active' : ''}`} style={{ marginBottom: '0.25rem' }}>
                  <input type="checkbox" style={{ display: 'none' }} checked={buff.perStack} onChange={() => {
                    const buffs = [...skill.namedEffect!.buffs];
                    buffs[bi] = { ...buff, perStack: !buff.perStack };
                    onChange({ ...skill, namedEffect: { ...skill.namedEffect!, buffs } });
                  }} />
                  /stack
                </label>
                <button className="btn-add-sm" style={{ marginBottom: '0.25rem' }} onClick={() => {
                  const buffs = skill.namedEffect!.buffs.filter((_, i) => i !== bi);
                  onChange({ ...skill, namedEffect: { ...skill.namedEffect!, buffs } });
                }}>&times;</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WeaponSection({ data, onChange, originalId }: Props) {
  const [activeTab, setActiveTab] = useState<WeaponTab>(WeaponTab.SKILLS);
  const update = (patch: Partial<CustomWeapon>) => onChange({ ...data, ...patch });
  const maxSkills = maxSkillsForRarity(data.weaponRarity);
  const statusEvents = data.statusEvents ?? [];

  return (
    <>
      <CollapsibleSection title="Identity">
        <div className="wizard-section">
          <IdField value={data.id} onChange={(id) => update({ id })} originalId={originalId} />
          <label className="wz-field">
            <span>Name</span>
            <input type="text" value={data.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <div className="wz-field-row">
            <label className="wz-field">
              <span>Weapon Type</span>
              <select value={data.weaponType} onChange={(e) => update({ weaponType: e.target.value as WeaponType })}>
                {WEAPON_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>Rarity</span>
              <div className="wz-radio-group">
                {RARITIES.map((r) => (
                  <label key={r} className={`wz-radio${data.weaponRarity === r ? ' active' : ''}`}>
                    <input type="radio" checked={data.weaponRarity === r} onChange={() => update({ weaponRarity: r })} />
                    {r}&#9733;
                  </label>
                ))}
              </div>
            </label>
          </div>
          <div className="wz-field-row">
            <label className="wz-field">
              <span>Base ATK (Lv1)</span>
              <input type="number" value={data.baseAtk.lv1} onChange={(e) => update({ baseAtk: { ...data.baseAtk, lv1: Number(e.target.value) } })} />
            </label>
            <label className="wz-field">
              <span>Base ATK (Lv90)</span>
              <input type="number" value={data.baseAtk.lv90} onChange={(e) => update({ baseAtk: { ...data.baseAtk, lv90: Number(e.target.value) } })} />
            </label>
          </div>
        </div>
      </CollapsibleSection>

      {/* ─── Tab container: Skills | Statuses ────────────────────── */}
      <div className="ops-skill-tabs" style={{ marginTop: '0.5rem' }}>
        <button
          type="button"
          className={`ops-skill-tab${activeTab === WeaponTab.SKILLS ? ' ops-skill-tab--active' : ''}`}
          onClick={() => setActiveTab(WeaponTab.SKILLS)}
        >
          <span className="ops-skill-tab-label">
            Skills
            {data.skills.length > 0 && <span className="ops-skill-tab-count">{data.skills.length}</span>}
          </span>
        </button>
        <button
          type="button"
          className={`ops-skill-tab${activeTab === WeaponTab.STATUSES ? ' ops-skill-tab--active' : ''}`}
          onClick={() => setActiveTab(WeaponTab.STATUSES)}
        >
          <span className="ops-skill-tab-label">
            Statuses
            {statusEvents.length > 0 && <span className="ops-skill-tab-count">{statusEvents.length}</span>}
          </span>
        </button>
      </div>

      {/* ─── Skills tab ──────────────────────────────────────────── */}
      {activeTab === WeaponTab.SKILLS && (
        <div className="wizard-section">
          {data.skills.map((skill, i) => (
            <SkillEditor
              key={i}
              skill={skill}
              index={i}
              onChange={(s) => {
                const skills = [...data.skills];
                skills[i] = s;
                update({ skills });
              }}
              onRemove={() => update({ skills: data.skills.filter((_, j) => j !== i) })}
            />
          ))}
          {data.skills.length < maxSkills && (
            <button className="btn-add-sm" onClick={() => update({ skills: [...data.skills, { type: CustomWeaponSkillKind.STAT_BOOST, label: `Skill ${data.skills.length + 1}`, statBoost: { stat: 'ATTACK_BONUS', values: Array(9).fill(0) } }] })}>
              + Add Skill
            </button>
          )}
        </div>
      )}

      {/* ─── Statuses tab ────────────────────────────────────────── */}
      {activeTab === WeaponTab.STATUSES && (
        <div className="wizard-section">
          {statusEvents.length === 0 && (
            <div className="ops-empty" style={{ padding: '0.75rem 0' }}>No status events. Add statuses this weapon produces.</div>
          )}
          {statusEvents.map((se, i) => (
            <StatusEventFields
              key={i}
              event={se}
              label={se.name || `Status ${i + 1}`}
              onChange={(e) => {
                const next = [...statusEvents];
                next[i] = e;
                update({ statusEvents: next });
              }}
              onRemove={() => update({ statusEvents: statusEvents.filter((_, j) => j !== i) })}
            />
          ))}
          <button className="btn-add-sm" onClick={() => update({ statusEvents: [...statusEvents, defaultStatusEvent()] })} style={{ width: 'fit-content' }}>
            + Add Status
          </button>
        </div>
      )}
    </>
  );
}
