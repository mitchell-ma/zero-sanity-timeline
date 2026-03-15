/**
 * Multi-step wizard for creating/editing custom gear sets.
 */
import { useState } from 'react';
import { GearCategory } from '../../consts/enums';
import { ObjectType } from '../../consts/semantics';
import type { CustomGearSet, CustomGearPiece, CustomGearEffect, CustomGearBuff } from '../../model/custom/customGearTypes';
import InteractionBuilder, { defaultInteraction } from './InteractionBuilder';
import IdField from './IdField';

interface Props {
  initial: CustomGearSet;
  onSave: (gearSet: CustomGearSet) => string[];
  onCancel: () => void;
}

export default function CustomGearWizard({ initial, onSave, onCancel }: Props) {
  const [gearSet, setGearSet] = useState<CustomGearSet>(() => JSON.parse(JSON.stringify(initial)));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const update = (patch: Partial<CustomGearSet>) => setGearSet((g) => ({ ...g, ...patch }));

  const handleSave = () => {
    const errs = onSave(gearSet);
    if (errs.length > 0) setErrors(errs);
  };

  return (
    <div className="custom-wizard">
      <div className="wizard-header">
        <h3>{initial.setName ? `Edit: ${initial.setName}` : 'New Custom Gear Set'}</h3>
        <div className="wizard-steps">
          <button className={`wizard-step${step === 0 ? ' active' : ''}`} onClick={() => setStep(0)}>Identity</button>
          <button className={`wizard-step${step === 1 ? ' active' : ''}`} onClick={() => setStep(1)}>Pieces</button>
          <button className={`wizard-step${step === 2 ? ' active' : ''}`} onClick={() => setStep(2)}>Set Effect</button>
        </div>
      </div>

      <div className="wizard-body">
        {step === 0 && (
          <div className="wizard-section">
            <IdField
              value={gearSet.id}
              onChange={(id) => update({ id })}
              originalId={initial.id}
            />
            <label className="wz-field">
              <span>Set Name</span>
              <input type="text" value={gearSet.setName} onChange={(e) => update({ setName: e.target.value })} placeholder="Gear set name" />
            </label>
            <label className="wz-field">
              <span>Rarity</span>
              <div className="wz-radio-group">
                {([4, 5, 6] as const).map((r) => (
                  <label key={r} className={`wz-radio${gearSet.rarity === r ? ' active' : ''}`}>
                    <input type="radio" checked={gearSet.rarity === r} onChange={() => update({ rarity: r })} />
                    {r}★
                  </label>
                ))}
              </div>
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-section">
            {gearSet.pieces.map((piece, i) => (
              <PieceEditor
                key={i}
                piece={piece}
                onChange={(p) => {
                  const pieces = [...gearSet.pieces];
                  pieces[i] = p;
                  update({ pieces });
                }}
              />
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="wizard-section">
            <label className="ib-checkbox" style={{ marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                checked={!!gearSet.setEffect}
                onChange={(e) => update({ setEffect: e.target.checked ? { passiveStats: {}, effects: [] } : undefined })}
              />
              This set has a set effect
            </label>

            {gearSet.setEffect && (
              <>
                <div className="wz-subsection">
                  <div className="wz-subsection-header"><span>Passive Stats (3-piece)</span></div>
                  <PassiveStatsEditor
                    stats={(gearSet.setEffect.passiveStats ?? {}) as Record<string, number>}
                    onChange={(passiveStats) => update({ setEffect: { ...gearSet.setEffect!, passiveStats } })}
                  />
                </div>

                <div className="wz-subsection">
                  <div className="wz-subsection-header">
                    <span>Triggered Effects</span>
                    <button className="btn-add-sm" onClick={() => update({
                      setEffect: {
                        ...gearSet.setEffect!,
                        effects: [...(gearSet.setEffect!.effects ?? []), defaultGearEffect()],
                      },
                    })}>+</button>
                  </div>
                  {(gearSet.setEffect.effects ?? []).map((effect, i) => (
                    <GearEffectEditor
                      key={i}
                      effect={effect}
                      onChange={(e) => {
                        const effects = [...(gearSet.setEffect!.effects ?? [])];
                        effects[i] = e;
                        update({ setEffect: { ...gearSet.setEffect!, effects } });
                      }}
                      onRemove={() => {
                        const effects = (gearSet.setEffect!.effects ?? []).filter((_, j) => j !== i);
                        update({ setEffect: { ...gearSet.setEffect!, effects } });
                      }}
                    />
                  ))}
                </div>
              </>
            )}
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
          {step < 2 ? (
            <button className="btn-next" onClick={() => setStep(step + 1)}>Next</button>
          ) : (
            <button className="btn-save" onClick={handleSave}>Save</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Piece Editor ────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<GearCategory, string> = {
  [GearCategory.ARMOR]: 'Armor',
  [GearCategory.GLOVES]: 'Gloves',
  [GearCategory.KIT]: 'Kit',
};

function PieceEditor({ piece, onChange }: { piece: CustomGearPiece; onChange: (p: CustomGearPiece) => void }) {
  return (
    <div className="skill-editor">
      <div className="skill-editor-header">
        <span className="skill-index">{CATEGORY_LABELS[piece.gearCategory]}</span>
      </div>
      <label className="wz-field">
        <span>Name</span>
        <input type="text" value={piece.name} onChange={(e) => onChange({ ...piece, name: e.target.value })} />
      </label>
      <label className="wz-field">
        <span>Defense</span>
        <input type="number" min={0} value={piece.defense} onChange={(e) => onChange({ ...piece, defense: Number(e.target.value) })} />
      </label>
      <div className="wz-subsection">
        <div className="wz-subsection-header"><span>Stats by Rank</span></div>
        {[1, 2, 3, 4].map((rank) => (
          <PassiveStatsEditor
            key={rank}
            label={`Rank ${rank}`}
            stats={(piece.statsByRank[rank] ?? {}) as Record<string, number>}
            onChange={(stats) => onChange({
              ...piece,
              statsByRank: { ...piece.statsByRank, [rank]: stats },
            })}
          />
        ))}
      </div>
    </div>
  );
}

// ── Passive Stats Editor ────────────────────────────────────────────────────

function PassiveStatsEditor({ stats, onChange, label }: {
  stats: Record<string, number>;
  onChange: (stats: Record<string, number>) => void;
  label?: string;
}) {
  const entries = Object.entries(stats);
  return (
    <div className="stat-boost-editor">
      {label && <span className="mt-label">{label}</span>}
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

// ── Gear Effect Editor ──────────────────────────────────────────────────────

function defaultGearEffect(): CustomGearEffect {
  return {
    label: '',
    triggers: [defaultInteraction()],
    target: ObjectType.THIS_OPERATOR,
    durationSeconds: 15,
    maxStacks: 1,
    buffs: [],
  };
}

function GearEffectEditor({ effect, onChange, onRemove }: {
  effect: CustomGearEffect;
  onChange: (e: CustomGearEffect) => void;
  onRemove: () => void;
}) {
  const update = (patch: Partial<CustomGearEffect>) => onChange({ ...effect, ...patch });

  return (
    <div className="skill-editor">
      <div className="skill-editor-header">
        <label className="wz-field" style={{ flex: 1 }}>
          <input type="text" value={effect.label} onChange={(e) => update({ label: e.target.value })} placeholder="Effect label" />
        </label>
        <button className="ib-remove" onClick={onRemove}>×</button>
      </div>

      <label className="wz-field">
        <span>Target</span>
        <select value={effect.target} onChange={(e) => update({ target: e.target.value })}>
          <option value={ObjectType.THIS_OPERATOR}>This Operator</option>
          <option value={ObjectType.ALL_OPERATORS}>All Operators</option>
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

      <div className="wz-subsection">
        <div className="wz-subsection-header">
          <span>Triggers</span>
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

      <div className="wz-subsection">
        <div className="wz-subsection-header">
          <span>Buffs</span>
          <button className="btn-add-sm" onClick={() => update({ buffs: [...effect.buffs, { stat: 'ATTACK_BONUS', value: 0, perStack: false }] })}>+</button>
        </div>
        {effect.buffs.map((buff, i) => (
          <div key={i} className="buff-row">
            <input className="ib-input ib-object-id" type="text" value={buff.stat} placeholder="Stat" onChange={(e) => {
              const buffs = [...effect.buffs];
              buffs[i] = { ...buff, stat: e.target.value };
              update({ buffs });
            }} />
            <input className="ib-input" type="number" step="any" value={buff.value} onChange={(e) => {
              const buffs = [...effect.buffs];
              buffs[i] = { ...buff, value: Number(e.target.value) };
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
