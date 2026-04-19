/**
 * Clause editor V2 — form-based row layout.
 *
 * A clause is a list of predicates. Each predicate has conditions (IF) and effects (THEN).
 * This editor renders predicates as titled sections with row-based condition/effect builders.
 */
import type { Clause, Predicate, Interaction, Effect } from '../../dsl/semantics';
import InteractionBuilder, { defaultInteraction } from './InteractionBuilder';
import EffectBuilder, { defaultEffect } from './EffectBuilder';
import { t } from '../../locales/locale';

// ── Props ───────────────────────────────────────────────────────────────────

interface ClauseEditorProps {
  initialValue?: Clause;
  onChange?: (clause: Clause) => void;
  conditionsOnly?: boolean;
  readOnly?: boolean;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ClauseEditor({ initialValue, onChange, conditionsOnly, readOnly }: ClauseEditorProps) {
  const clause = initialValue ?? [];

  const update = (next: Clause) => {
    onChange?.(next);
  };

  const addPredicate = () => {
    update([...clause, { conditions: [defaultInteraction()], effects: [defaultEffect()] }]);
  };

  const updatePredicate = (index: number, pred: Predicate) => {
    const next = [...clause];
    next[index] = pred;
    update(next);
  };

  const removePredicate = (index: number) => {
    update(clause.filter((_, i) => i !== index));
  };

  return (
    <div className="cv2">
      {clause.map((predicate, pi) => (
        <PredicateSection
          key={pi}
          index={pi}
          predicate={predicate}
          onChange={(p) => updatePredicate(pi, p)}
          onRemove={() => removePredicate(pi)}
          isLast={pi === clause.length - 1}
          conditionsOnly={conditionsOnly}
          readOnly={readOnly}
        />
      ))}

      {!readOnly && (
        <div className="cv2-add-row">
          <button className="cv2-add-btn" onClick={addPredicate}>+ Add Predicate</button>
        </div>
      )}
    </div>
  );
}

// ── Predicate section ───────────────────────────────────────────────────────

function PredicateSection({ index, predicate, onChange, onRemove, isLast, conditionsOnly, readOnly }: {
  index: number;
  predicate: Predicate;
  onChange: (p: Predicate) => void;
  onRemove: () => void;
  isLast: boolean;
  conditionsOnly?: boolean;
  readOnly?: boolean;
}) {
  // ── Condition CRUD ──────────────────────────────────────────────────────
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

  // ── Effect CRUD ─────────────────────────────────────────────────────────
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
    <>
      {/* IF — Conditions */}
      <div className="cv2-section">
        <div className="cv2-section-header">
          <span className="cv2-section-label">IF</span>
          {!readOnly && <button className="cv2-remove-btn" onClick={onRemove} title={t('customizer.btn.removePredicate')}>&times;</button>}
        </div>
        <div className="cv2-rows">
          {predicate.conditions.map((cond, ci) => (
            <div key={ci} className="cv2-row">
              {ci > 0 && <span className="cv2-row-connector">AND</span>}
              <div className="cv2-row-content">
                <InteractionBuilder
                  value={cond}
                  onChange={(c) => updateCondition(ci, c as Interaction)}
                  onRemove={!readOnly ? () => removeCondition(ci) : undefined}
                  compact
                />
              </div>
            </div>
          ))}
          {predicate.conditions.length === 0 && (
            <div className="cv2-empty">{t('customizer.empty.noConditionsTriggers')}</div>
          )}
          {!readOnly && (
            <button className="cv2-add-btn" onClick={addCondition}>+ Add Condition</button>
          )}
        </div>
      </div>

      {/* THEN — Effects */}
      {!conditionsOnly && (
        <div className="cv2-section">
          <div className="cv2-section-header">
            <span className="cv2-section-label">THEN</span>
          </div>
          <div className="cv2-rows">
            {predicate.effects.map((eff, ei) => (
              <div key={ei} className="cv2-row">
                <div className="cv2-row-content">
                  <EffectBuilder
                    value={eff}
                    onChange={(e) => updateEffect(ei, e)}
                    onRemove={!readOnly ? () => removeEffect(ei) : undefined}
                    compact
                  />
                </div>
              </div>
            ))}
            {predicate.effects.length === 0 && (
              <div className="cv2-empty">No effects</div>
            )}
            {!readOnly && (
              <button className="cv2-add-btn" onClick={addEffect}>+ Add Effect</button>
            )}
          </div>
        </div>
      )}

      {/* OR separator between predicates */}
      {!isLast && <div className="cv2-or-divider"><span>OR</span></div>}
    </>
  );
}
