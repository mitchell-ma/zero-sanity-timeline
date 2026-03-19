/**
 * Operator form section for the Unified Customizer.
 * Extracted from CustomOperatorWizard — same fields, collapsible layout.
 */
import { WeaponType, ElementType } from '../../../consts/enums';
import { OperatorClassType } from '../../../model/enums/operators';
import type { CustomOperator } from '../../../model/custom/customOperatorTypes';
import type { Interaction, Predicate } from '../../../consts/semantics';
import CollapsibleSection from '../CollapsibleSection';
import IdField from '../IdField';
import InteractionBuilder, { defaultInteraction } from '../InteractionBuilder';

const CLASS_TYPES = Object.values(OperatorClassType);
const ELEMENT_TYPES = Object.values(ElementType);
const WEAPON_TYPES = Object.values(WeaponType);

interface Props {
  data: CustomOperator;
  onChange: (data: CustomOperator) => void;
  originalId?: string;
}

function StatsEditor({ stats, onChange, label }: {
  stats: Partial<Record<string, number>>;
  onChange: (stats: Partial<Record<string, number>>) => void;
  label: string;
}) {
  const entries = Object.entries(stats);
  return (
    <div className="wz-subsection">
      <div className="wz-subsection-header">
        <span>{label}</span>
        <button className="btn-add-sm" onClick={() => onChange({ ...stats, '': 0 })}>+</button>
      </div>
      {entries.map(([key, val], i) => (
        <div key={i} className="wz-field-row" style={{ alignItems: 'flex-end' }}>
          <label className="wz-field" style={{ flex: 2 }}>
            {i === 0 && <span>Stat</span>}
            <input type="text" value={key} onChange={(e) => {
              const newStats: Record<string, number> = {};
              for (const [k, v] of Object.entries(stats)) {
                if (k === key) newStats[e.target.value] = v!;
                else newStats[k] = v!;
              }
              onChange(newStats);
            }} />
          </label>
          <label className="wz-field">
            {i === 0 && <span>Value</span>}
            <input type="number" value={val} onChange={(e) => onChange({ ...stats, [key]: Number(e.target.value) })} />
          </label>
          <button className="btn-add-sm" style={{ marginBottom: '0.25rem' }} onClick={() => {
            const newStats = { ...stats };
            delete newStats[key];
            onChange(newStats);
          }}>&times;</button>
        </div>
      ))}
    </div>
  );
}

export default function OperatorSection({ data, onChange, originalId }: Props) {
  const update = (patch: Partial<CustomOperator>) => onChange({ ...data, ...patch });

  const updateTriggerClause = (index: number, condition: Interaction) => {
    const onTriggerClause = [...data.combo.onTriggerClause];
    onTriggerClause[index] = { ...onTriggerClause[index], conditions: [condition] };
    update({ combo: { ...data.combo, onTriggerClause } });
  };

  const addTriggerCondition = () => {
    const newPredicate: Predicate = { conditions: [defaultInteraction()], effects: [] };
    update({ combo: { ...data.combo, onTriggerClause: [...data.combo.onTriggerClause, newPredicate] } });
  };

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
              <span>Class</span>
              <select value={data.operatorClassType} onChange={(e) => update({ operatorClassType: e.target.value as OperatorClassType })}>
                {CLASS_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>Element</span>
              <select value={data.elementType} onChange={(e) => update({ elementType: e.target.value as ElementType })}>
                {ELEMENT_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            <label className="wz-field">
              <span>Weapon Types</span>
              <div className="wz-radio-group">
                {WEAPON_TYPES.map((w) => {
                  const selected = data.weaponTypes.includes(w);
                  return (
                    <label key={w} className={`wz-radio${selected ? ' active' : ''}`}>
                      <input
                        type="checkbox"
                        style={{ display: 'none' }}
                        checked={selected}
                        onChange={() => {
                          const next = selected
                            ? data.weaponTypes.filter((t) => t !== w)
                            : [...data.weaponTypes, w];
                          if (next.length > 0) update({ weaponTypes: next });
                        }}
                      />
                      {w.replace(/_/g, ' ')}
                    </label>
                  );
                })}
              </div>
            </label>
          </div>
          <label className="wz-field">
            <span>Rarity</span>
            <div className="wz-radio-group">
              {([4, 5, 6] as const).map((r) => (
                <label key={r} className={`wz-radio${data.operatorRarity === r ? ' active' : ''}`}>
                  <input type="radio" checked={data.operatorRarity === r} onChange={() => update({ operatorRarity: r })} />
                  {r}&#9733;
                </label>
              ))}
            </div>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Base Stats">
        <div className="wizard-section">
          <StatsEditor label="Lv1 Stats" stats={data.baseStats.lv1} onChange={(s) => update({ baseStats: { ...data.baseStats, lv1: s } })} />
          <StatsEditor label="Lv90 Stats" stats={data.baseStats.lv90} onChange={(s) => update({ baseStats: { ...data.baseStats, lv90: s } })} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Combo Trigger">
        <div className="wizard-section">
          <div className="wz-subsection">
            <div className="wz-subsection-header">
              <span>Trigger Conditions</span>
              <button className="btn-add-sm" onClick={addTriggerCondition}>+</button>
            </div>
            {data.combo.onTriggerClause.map((pred, i) => (
              <div key={i}>
                {pred.conditions.map((cond, ci) => (
                  <InteractionBuilder
                    key={ci}
                    value={cond}
                    onChange={(v) => updateTriggerClause(i, v)}
                    onRemove={() => update({ combo: { ...data.combo, onTriggerClause: data.combo.onTriggerClause.filter((_, j) => j !== i) } })}
                    compact
                  />
                ))}
              </div>
            ))}
          </div>
          <label className="wz-field">
            <span>Description</span>
            <input type="text" value={data.combo.description} onChange={(e) => update({ combo: { ...data.combo, description: e.target.value } })} />
          </label>
          <label className="wz-field">
            <span>Window (frames)</span>
            <input type="number" value={data.combo.windowFrames ?? ''} onChange={(e) => update({ combo: { ...data.combo, windowFrames: e.target.value ? Number(e.target.value) : undefined } })} />
          </label>
        </div>
      </CollapsibleSection>
    </>
  );
}
