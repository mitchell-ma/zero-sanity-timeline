/**
 * ClauseBuilder — OR-of-ANDs predicate builder with conditions + effects.
 *
 * A Clause is a list of Predicates, each evaluated independently.
 * A Predicate has AND'd conditions and effects.
 *
 * Layout:
 *   ┌─ Any of these (OR) ────────────────────────┐
 *   │ ┌─ All of these (AND) ─────────────────────┐│
 *   │ │ [Interaction condition]                    ││
 *   │ │ [Interaction condition]         [+ AND]   ││
 *   │ │ ── Then: ──                               ││
 *   │ │ [Effect]                        [+ Effect]││
 *   │ └──────────────────────────────────────────┘│
 *   │                                     [+ OR]  │
 *   └─────────────────────────────────────────────┘
 */
import type { Clause, Predicate, Interaction, Effect } from '../../consts/semantics';
import InteractionBuilder, { defaultInteraction } from './InteractionBuilder';
import EffectBuilder, { defaultEffect } from './EffectBuilder';

interface ClauseBuilderProps {
  value: Clause;
  onChange: (value: Clause) => void;
  /** If true, hide effects section (conditions-only mode for activation gates). */
  conditionsOnly?: boolean;
  label?: string;
}

export default function ClauseBuilder({ value, onChange, conditionsOnly, label }: ClauseBuilderProps) {
  const addPredicate = () => {
    const newPred: Predicate = { conditions: [defaultInteraction()], effects: [] };
    onChange([...value, newPred]);
  };

  const updatePredicate = (index: number, pred: Predicate) => {
    const updated = [...value];
    updated[index] = pred;
    onChange(updated);
  };

  const removePredicate = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="clause-builder">
      <div className="wz-subsection-header">
        <span>{label ?? (conditionsOnly ? 'Activation Conditions' : 'Clause (predicates)')}</span>
        <button className="btn-add-sm" onClick={addPredicate} title="Add predicate (OR)">+</button>
      </div>

      {value.length === 0 && (
        <div className="clause-empty">No conditions — always available</div>
      )}

      {value.map((predicate, pi) => (
        <PredicateEditor
          key={pi}
          index={pi}
          predicate={predicate}
          onChange={(p) => updatePredicate(pi, p)}
          onRemove={value.length > 1 ? () => removePredicate(pi) : undefined}
          conditionsOnly={conditionsOnly}
          showOrLabel={pi > 0}
        />
      ))}
    </div>
  );
}

// ── Predicate Editor ────────────────────────────────────────────────────────

function PredicateEditor({ index, predicate, onChange, onRemove, conditionsOnly, showOrLabel }: {
  index: number;
  predicate: Predicate;
  onChange: (p: Predicate) => void;
  onRemove?: () => void;
  conditionsOnly?: boolean;
  showOrLabel: boolean;
}) {
  const addCondition = () => {
    onChange({ ...predicate, conditions: [...predicate.conditions, defaultInteraction()] });
  };

  const updateCondition = (i: number, c: Interaction) => {
    const conditions = [...predicate.conditions];
    conditions[i] = c;
    onChange({ ...predicate, conditions });
  };

  const removeCondition = (i: number) => {
    onChange({ ...predicate, conditions: predicate.conditions.filter((_, j) => j !== i) });
  };

  const addEffect = () => {
    onChange({ ...predicate, effects: [...predicate.effects, defaultEffect()] });
  };

  const updateEffect = (i: number, e: Effect) => {
    const effects = [...predicate.effects];
    effects[i] = e;
    onChange({ ...predicate, effects });
  };

  const removeEffect = (i: number) => {
    onChange({ ...predicate, effects: predicate.effects.filter((_, j) => j !== i) });
  };

  return (
    <div className="predicate-editor">
      {showOrLabel && <div className="predicate-or-label">OR</div>}
      <div className="predicate-card">
        <div className="predicate-header">
          <span className="predicate-label">When ALL of:</span>
          <div className="predicate-actions">
            <button className="btn-add-sm" onClick={addCondition} title="Add condition (AND)">+</button>
            {onRemove && <button className="ib-remove" onClick={onRemove} title="Remove predicate">×</button>}
          </div>
        </div>

        {predicate.conditions.map((cond, ci) => (
          <InteractionBuilder
            key={ci}
            value={cond}
            onChange={(c) => updateCondition(ci, c as Interaction)}
            onRemove={predicate.conditions.length > 1 ? () => removeCondition(ci) : undefined}
            compact
          />
        ))}

        {!conditionsOnly && (
          <>
            <div className="predicate-divider">
              <span className="predicate-label">Then:</span>
              <button className="btn-add-sm" onClick={addEffect} title="Add effect">+</button>
            </div>

            {predicate.effects.length === 0 && (
              <div className="clause-empty">No effects (trigger-only)</div>
            )}

            {predicate.effects.map((eff, ei) => (
              <EffectBuilder
                key={ei}
                value={eff}
                onChange={(e) => updateEffect(ei, e)}
                onRemove={() => removeEffect(ei)}
                compact
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
