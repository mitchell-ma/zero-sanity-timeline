/**
 * Skill form section for the Unified Customizer.
 * Extracted from CustomSkillWizard — same fields, collapsible layout.
 */
import { ElementType, TimeInteractionType } from '../../../consts/enums';
import { NounType } from '../../../dsl/semantics';
import type { CustomSkill } from '../../../model/custom/customSkillTypes';
import CollapsibleSection from '../CollapsibleSection';
import IdField from '../IdField';

const SKILL_TYPES = [NounType.BASIC_ATTACK, NounType.BATK, NounType.BATTLE, NounType.COMBO, NounType.ULTIMATE, NounType.FINISHER, NounType.DIVE, NounType.ACTION];
const ELEMENT_TYPES = Object.values(ElementType);
const TIME_INTERACTION_TYPES = Object.values(TimeInteractionType);

interface Props {
  data: CustomSkill;
  onChange: (data: CustomSkill) => void;
  originalId?: string;
}

export default function SkillSection({ data, onChange, originalId }: Props) {
  const update = (patch: Partial<CustomSkill>) => onChange({ ...data, ...patch });

  const spCost = data.resourceInteractions?.find((r) => r.resourceType === 'SKILL_POINT')?.value ?? 0;

  return (
    <>
      <CollapsibleSection title="Identity & Timing">
        <div className="wizard-section">
          <IdField value={data.id} onChange={(id) => update({ id })} originalId={originalId} />
          <label className="wz-field">
            <span>Name</span>
            <input type="text" value={data.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <div className="wz-field-row">
            <label className="wz-field">
              <span>Skill Type</span>
              <select value={data.combatSkillType} onChange={(e) => update({ combatSkillType: e.target.value as string })}>
                {SKILL_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>Element</span>
              <select value={data.element ?? ''} onChange={(e) => update({ element: e.target.value ? e.target.value as ElementType : undefined })}>
                <option value="">None</option>
                {ELEMENT_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
          </div>
          <label className="wz-field">
            <span>Description</span>
            <textarea value={data.description ?? ''} onChange={(e) => update({ description: e.target.value || undefined })} rows={3} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-med)', borderRadius: '3px', color: 'var(--text-bright)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', padding: '0.375rem 0.5rem', outline: 'none', resize: 'vertical' }} />
          </label>
          <div className="wz-field-row">
            <label className="wz-field">
              <span>Duration (s)</span>
              <input type="number" value={data.durationSeconds} onChange={(e) => update({ durationSeconds: Number(e.target.value) })} />
            </label>
            <label className="wz-field">
              <span>Cooldown (s)</span>
              <input type="number" value={data.cooldownSeconds ?? ''} onChange={(e) => update({ cooldownSeconds: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
            <label className="wz-field">
              <span>Animation (s)</span>
              <input type="number" value={data.animationSeconds ?? ''} onChange={(e) => update({ animationSeconds: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
          </div>
          <div className="wz-field-row">
            <label className="wz-field">
              <span>Time Interaction</span>
              <select value={data.timeInteractionType ?? ''} onChange={(e) => update({ timeInteractionType: e.target.value ? e.target.value as TimeInteractionType : undefined })}>
                <option value="">None</option>
                {TIME_INTERACTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>SP Cost</span>
              <input type="number" value={spCost} onChange={(e) => {
                const val = Number(e.target.value);
                if (val > 0) {
                  update({ resourceInteractions: [{ resourceType: 'SKILL_POINT', verb: 'CONSUME', value: val }] });
                } else {
                  update({ resourceInteractions: undefined });
                }
              }} />
            </label>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Segments">
        <div className="wizard-section">
          {(data.segments ?? []).map((seg, i) => (
            <div key={i} className="wz-subsection">
              <div className="wz-subsection-header">
                <span>Segment {i + 1}{seg.name ? `: ${seg.name}` : ''}</span>
                <button className="btn-add-sm" onClick={() => update({ segments: (data.segments ?? []).filter((_, j) => j !== i) })}>&times;</button>
              </div>
              <div className="wz-field-row">
                <label className="wz-field">
                  <span>Name</span>
                  <input type="text" value={seg.name ?? ''} onChange={(e) => {
                    const segments = [...(data.segments ?? [])];
                    segments[i] = { ...seg, name: e.target.value || undefined };
                    update({ segments });
                  }} />
                </label>
                <label className="wz-field">
                  <span>Duration (s)</span>
                  <input type="number" value={seg.durationSeconds} onChange={(e) => {
                    const segments = [...(data.segments ?? [])];
                    segments[i] = { ...seg, durationSeconds: Number(e.target.value) };
                    update({ segments });
                  }} />
                </label>
              </div>
            </div>
          ))}
          <button className="btn-add-sm" onClick={() => update({ segments: [...(data.segments ?? []), { durationSeconds: 1 }] })} style={{ width: 'fit-content' }}>
            + Add Segment
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Multipliers" defaultOpen={false}>
        <div className="wizard-section">
          {(data.multipliers ?? []).map((mult, i) => (
            <div key={i} className="wz-subsection">
              <div className="wz-subsection-header">
                <span>{mult.label || `Multiplier ${i + 1}`}</span>
                <button className="btn-add-sm" onClick={() => update({ multipliers: (data.multipliers ?? []).filter((_, j) => j !== i) })}>&times;</button>
              </div>
              <label className="wz-field">
                <span>Label</span>
                <input type="text" value={mult.label} onChange={(e) => {
                  const multipliers = [...(data.multipliers ?? [])];
                  multipliers[i] = { ...mult, label: e.target.value };
                  update({ multipliers });
                }} />
              </label>
              <label className="wz-field">
                <span>Values (Lv1–12)</span>
                <div className="wz-field-row" style={{ flexWrap: 'wrap' }}>
                  {Array.from({ length: 12 }, (_, j) => (
                    <input
                      key={j}
                      type="number"
                      value={mult.values[j] ?? 0}
                      onChange={(e) => {
                        const multipliers = [...(data.multipliers ?? [])];
                        const values = [...mult.values];
                        while (values.length < 12) values.push(0);
                        values[j] = Number(e.target.value);
                        multipliers[i] = { ...mult, values };
                        update({ multipliers });
                      }}
                      style={{ width: '4.5rem' }}
                    />
                  ))}
                </div>
              </label>
            </div>
          ))}
          <button className="btn-add-sm" onClick={() => update({ multipliers: [...(data.multipliers ?? []), { label: '', values: Array(12).fill(0) }] })} style={{ width: 'fit-content' }}>
            + Add Multiplier
          </button>
        </div>
      </CollapsibleSection>
    </>
  );
}
