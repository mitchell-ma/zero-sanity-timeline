/**
 * Gear Set form section for the Unified Customizer.
 * Extracted from CustomGearWizard — same fields, collapsible layout.
 */
import { GearCategory } from '../../../consts/enums';
import type { CustomGearSet, CustomGearPiece, CustomGearEffect as CustomGearEffectDef } from '../../../model/custom/customGearTypes';
import CollapsibleSection from '../CollapsibleSection';
import IdField from '../IdField';
import type { Interaction } from '../../../dsl/semantics';
import InteractionBuilder, { defaultInteraction } from '../InteractionBuilder';
import { t } from '../../../locales/locale';

const GEAR_CATEGORIES = Object.values(GearCategory);

interface Props {
  data: CustomGearSet;
  onChange: (data: CustomGearSet) => void;
  originalId?: string;
}

function PassiveStatsEditor({ stats, onChange, label }: {
  stats: Partial<Record<string, number>>;
  onChange: (stats: Partial<Record<string, number>>) => void;
  label?: string;
}) {
  const entries = Object.entries(stats);
  return (
    <div className="wz-subsection">
      <div className="wz-subsection-header">
        <span>{label ?? 'Passive Stats'}</span>
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

function PieceEditor({ piece, index, onChange }: {
  piece: CustomGearPiece;
  index: number;
  onChange: (p: CustomGearPiece) => void;
}) {
  return (
    <div className="wz-subsection">
      <div className="wz-subsection-header"><span>{piece.gearCategory || `Piece ${index + 1}`}</span></div>
      <div className="wz-field-row">
        <label className="wz-field">
          <span>Name</span>
          <input type="text" value={piece.name} onChange={(e) => onChange({ ...piece, name: e.target.value })} />
        </label>
        <label className="wz-field">
          <span>Category</span>
          <select value={piece.gearCategory} onChange={(e) => onChange({ ...piece, gearCategory: e.target.value as GearCategory })}>
            {GEAR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="wz-field">
          <span>Defense</span>
          <input type="number" value={piece.defense} onChange={(e) => onChange({ ...piece, defense: Number(e.target.value) })} />
        </label>
      </div>
      {[1, 2, 3, 4].map((rank) => (
        <PassiveStatsEditor
          key={rank}
          label={`Rank ${rank} Stats`}
          stats={piece.statsByRank[rank] ?? {}}
          onChange={(s) => onChange({ ...piece, statsByRank: { ...piece.statsByRank, [rank]: s } })}
        />
      ))}
    </div>
  );
}

function GearEffectEditor({ effect, onChange, onRemove }: {
  effect: CustomGearEffectDef;
  onChange: (e: CustomGearEffectDef) => void;
  onRemove: () => void;
}) {
  return (
    <div className="wz-subsection">
      <div className="wz-subsection-header">
        <span>{effect.label || 'Effect'}</span>
        <button className="btn-add-sm" onClick={onRemove}>&times;</button>
      </div>
      <label className="wz-field">
        <span>Label</span>
        <input type="text" value={effect.label} onChange={(e) => onChange({ ...effect, label: e.target.value })} />
      </label>
      <div className="wz-field-row">
        <label className="wz-field">
          <span>Duration (s)</span>
          <input type="number" value={effect.durationSeconds} onChange={(e) => onChange({ ...effect, durationSeconds: Number(e.target.value) })} />
        </label>
        <label className="wz-field">
          <span>Max Stacks</span>
          <input type="number" value={effect.maxStacks} onChange={(e) => onChange({ ...effect, maxStacks: Number(e.target.value) })} />
        </label>
        <label className="wz-field">
          <span>Cooldown (s)</span>
          <input type="number" value={effect.cooldownSeconds ?? ''} onChange={(e) => onChange({ ...effect, cooldownSeconds: e.target.value ? Number(e.target.value) : undefined })} />
        </label>
      </div>
      <div className="wz-subsection">
        <div className="wz-subsection-header">
          <span>Triggers</span>
          <button className="btn-add-sm" onClick={() => onChange({ ...effect, triggers: [...effect.triggers, defaultInteraction()] })}>+</button>
        </div>
        {effect.triggers.map((trigger, ti) => (
          <InteractionBuilder
            key={ti}
            value={trigger}
            onChange={(v) => {
              const triggers = [...effect.triggers];
              triggers[ti] = v as Interaction;
              onChange({ ...effect, triggers });
            }}
            onRemove={() => onChange({ ...effect, triggers: effect.triggers.filter((_, i) => i !== ti) })}
            compact
          />
        ))}
      </div>
      <div className="wz-subsection">
        <div className="wz-subsection-header">
          <span>Buffs</span>
          <button className="btn-add-sm" onClick={() => onChange({ ...effect, buffs: [...effect.buffs, { stat: '', value: 0, perStack: false }] })}>+</button>
        </div>
        {effect.buffs.map((buff, bi) => (
          <div key={bi} className="wz-field-row" style={{ alignItems: 'flex-end' }}>
            <label className="wz-field" style={{ flex: 2 }}>
              <span>Stat</span>
              <input type="text" value={buff.stat} onChange={(e) => {
                const buffs = [...effect.buffs];
                buffs[bi] = { ...buff, stat: e.target.value };
                onChange({ ...effect, buffs });
              }} />
            </label>
            <label className="wz-field">
              <span>Value</span>
              <input type="number" value={buff.value} onChange={(e) => {
                const buffs = [...effect.buffs];
                buffs[bi] = { ...buff, value: Number(e.target.value) };
                onChange({ ...effect, buffs });
              }} />
            </label>
            <label className={`wz-radio${buff.perStack ? ' active' : ''}`} style={{ marginBottom: '0.25rem' }}>
              <input type="checkbox" style={{ display: 'none' }} checked={buff.perStack} onChange={() => {
                const buffs = [...effect.buffs];
                buffs[bi] = { ...buff, perStack: !buff.perStack };
                onChange({ ...effect, buffs });
              }} />
              /stack
            </label>
            <button className="btn-add-sm" style={{ marginBottom: '0.25rem' }} onClick={() => onChange({ ...effect, buffs: effect.buffs.filter((_, i) => i !== bi) })}>&times;</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GearSetSection({ data, onChange, originalId }: Props) {
  const update = (patch: Partial<CustomGearSet>) => onChange({ ...data, ...patch });

  const toggleSetEffect = () => {
    if (data.setEffect) {
      update({ setEffect: undefined });
    } else {
      update({ setEffect: { passiveStats: {}, effects: [] } });
    }
  };

  return (
    <>
      <CollapsibleSection title={t('customizer.section.identity')}>
        <div className="wizard-section">
          <IdField value={data.id} onChange={(id) => update({ id })} originalId={originalId} />
          <label className="wz-field">
            <span>Set Name</span>
            <input type="text" value={data.setName} onChange={(e) => update({ setName: e.target.value })} />
          </label>
          <label className="wz-field">
            <span>Rarity</span>
            <div className="wz-radio-group">
              {([4, 5, 6] as const).map((r) => (
                <label key={r} className={`wz-radio${data.rarity === r ? ' active' : ''}`}>
                  <input type="radio" checked={data.rarity === r} onChange={() => update({ rarity: r })} />
                  {r}&#9733;
                </label>
              ))}
            </div>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={t('customizer.section.pieces')}>
        <div className="wizard-section">
          {data.pieces.map((piece, i) => (
            <PieceEditor
              key={i}
              piece={piece}
              index={i}
              onChange={(p) => {
                const pieces = [...data.pieces];
                pieces[i] = p;
                update({ pieces });
              }}
            />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={t('customizer.section.setEffect')}>
        <div className="wizard-section">
          <label className={`wz-radio${data.setEffect ? ' active' : ''}`} style={{ width: 'fit-content' }}>
            <input type="checkbox" style={{ display: 'none' }} checked={!!data.setEffect} onChange={toggleSetEffect} />
            Enable Set Effect
          </label>
          {data.setEffect && (
            <>
              <PassiveStatsEditor
                label="3-Piece Passive Stats"
                stats={data.setEffect.passiveStats ?? {}}
                onChange={(s) => update({ setEffect: { ...data.setEffect!, passiveStats: s } })}
              />
              <div className="wz-subsection">
                <div className="wz-subsection-header">
                  <span>Triggered Effects</span>
                  <button className="btn-add-sm" onClick={() => update({ setEffect: { ...data.setEffect!, effects: [...(data.setEffect!.effects ?? []), { label: '', triggers: [], target: 'wielder', durationSeconds: 10, maxStacks: 1, buffs: [] }] } })}>+</button>
                </div>
                {(data.setEffect.effects ?? []).map((eff, i) => (
                  <GearEffectEditor
                    key={i}
                    effect={eff}
                    onChange={(e) => {
                      const effects = [...(data.setEffect!.effects ?? [])];
                      effects[i] = e;
                      update({ setEffect: { ...data.setEffect!, effects } });
                    }}
                    onRemove={() => update({ setEffect: { ...data.setEffect!, effects: (data.setEffect!.effects ?? []).filter((_, j) => j !== i) } })}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>
    </>
  );
}
