/**
 * Standalone clause editor — file-directory tree layout.
 *
 *   CLAUSE
 *   ├── [×] IF ── [+]           (empty: inline +)
 *   │       ├── [×] [condition]
 *   │   AND ├── [×] [condition]
 *   │       ├── [+]
 *   │       └── THEN ── [+]     (empty: inline +)
 *   │           ├── [×] [effect]
 *   │           └── [+]
 *   │   OR
 *   ├── [×] IF ...
 *   └── [+]
 */
import { useState, useCallback, useRef, useLayoutEffect } from 'react';
import { VerbType, CardinalityConstraintType, EFFECT_VERBS, THRESHOLD_MAX, VERB_LABELS, CARDINALITY_LABELS } from '../../dsl/semantics';
import type { Clause, Predicate, Interaction, Effect } from '../../dsl/semantics';
import InteractionBuilder, { defaultInteraction } from './InteractionBuilder';
import EffectBuilder, { defaultEffect } from './EffectBuilder';
import CustomSelect from './CustomSelect';

interface ClauseEditorProps {
  initialValue?: Clause;
  onChange?: (clause: Clause) => void;
  conditionsOnly?: boolean;
  readOnly?: boolean;
}

export default function ClauseEditorV1({ initialValue, onChange, conditionsOnly, readOnly }: ClauseEditorProps) {
  const [clause, setClause] = useState<Clause>(initialValue ?? []);

  const update = useCallback((next: Clause) => {
    setClause(next);
    onChange?.(next);
  }, [onChange]);

  const addPredicate = () => {
    update([...clause, { conditions: [defaultInteraction()], effects: [] }]);
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
    <div className={`ce-tree${readOnly ? ' ce-tree--readonly' : ''}`}>
      <div className="ce-root">
        <span className="ce-root-icon">{'\u25C8'}</span>
        <span className="ce-root-label">CLAUSE</span>
      </div>

      <ul className="ce-ul">
        {clause.map((predicate, pi) => (
          <PredicateNode
            key={pi}
            index={pi}
            predicate={predicate}
            onChange={(p) => updatePredicate(pi, p)}
            onRemove={() => removePredicate(pi)}
            conditionsOnly={conditionsOnly}
          />
        ))}
        {!readOnly && (
          <li className="ce-li ce-li--last ce-li--addrow">
            <button className="ce-line-btn ce-line-btn--add" onClick={addPredicate} title="Add predicate">+</button>
          </li>
        )}
      </ul>
    </div>
  );
}

// ── Predicate ────────────────────────────────────────────────────────────────

function PredicateNode({ index, predicate, onChange, onRemove, conditionsOnly }: {
  index: number;
  predicate: Predicate;
  onChange: (p: Predicate) => void;
  onRemove?: () => void;
  conditionsOnly?: boolean;
}) {
  const condListRef = useRef<HTMLUListElement>(null);
  const [andTop, setAndTop] = useState<number | null>(null);

  // Measure from first condition through the + button to center AND.
  // Uses ResizeObserver so it re-measures after content reflows.
  useLayoutEffect(() => {
    const ul = condListRef.current;
    if (!ul || predicate.conditions.length < 1) { setAndTop(null); return; }

    const measure = () => {
      let h = 0;
      for (const child of Array.from(ul.children)) {
        if ((child as HTMLElement).classList.contains('ce-li--then')) break;
        h += (child as HTMLElement).offsetHeight;
      }
      setAndTop(h / 2);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    return () => ro.disconnect();
  }, [predicate.conditions.length]);

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

  const showEffects = !conditionsOnly;
  const hasConds = (predicate.conditions ?? []).length > 0;
  const hasEffects = (predicate.effects ?? []).length > 0;

  return (
    <li className="ce-li">
      <button className="ce-line-btn ce-line-btn--remove" onClick={onRemove} title="Remove">&times;</button>

      {/* IF — empty: inline with --- [+] */}
      {!hasConds && !showEffects ? (
        <div className="ce-label-row">
          <span className="ce-badge ce-badge--keyword">IF</span>
          {index > 0 && <span className="ce-badge ce-badge--or">OR</span>}
          <span className="ce-label-line" />
          <button className="ce-add" onClick={addCondition} title="Add condition">+</button>
        </div>
      ) : !hasConds && showEffects ? (
        <>
          <div className="ce-label-row">
            <span className="ce-badge ce-badge--keyword">IF</span>
            {index > 0 && <span className="ce-badge ce-badge--or">OR</span>}
            <span className="ce-label-line" />
            <button className="ce-add" onClick={addCondition} title="Add condition">+</button>
          </div>
          {/* THEN directly under IF when no conditions */}
          <ul className="ce-ul">
            <li className="ce-li ce-li--last ce-li--then">
              <ThenBranch
                hasEffects={hasEffects}
                effects={predicate.effects}
                addEffect={addEffect}
                updateEffect={updateEffect}
                removeEffect={removeEffect}
              />
            </li>
          </ul>
        </>
      ) : (
        <>
          <div className="ce-label-row">
            <span className="ce-badge ce-badge--keyword">IF</span>
            {index > 0 && <span className="ce-badge ce-badge--or">OR</span>}
          </div>
          <ul className="ce-ul ce-ul--conditions" ref={condListRef}>
            {predicate.conditions.length > 0 && andTop != null && (
              <span className="ce-trunk-label" style={{ top: andTop }}>AND</span>
            )}
            {predicate.conditions.map((cond, ci) => (
              <li key={ci} className="ce-li ce-li--leaf">
                <button className="ce-line-btn ce-line-btn--remove" onClick={() => removeCondition(ci)} title="Remove">&times;</button>
                <InteractionBuilder
                  value={cond}
                  onChange={(c) => updateCondition(ci, c as Interaction)}
                  compact
                />
              </li>
            ))}
            <li className={`ce-li ce-li--addrow${!showEffects ? ' ce-li--last' : ''}`}>
              <button className="ce-line-btn ce-line-btn--add" onClick={addCondition} title="Add condition">+</button>
            </li>
            {showEffects && (
              <li className="ce-li ce-li--last ce-li--then">
                <ThenBranch
                  hasEffects={hasEffects}
                  effects={predicate.effects}
                  addEffect={addEffect}
                  updateEffect={updateEffect}
                  removeEffect={removeEffect}
                />
              </li>
            )}
          </ul>
        </>
      )}
    </li>
  );
}

// ── Then branch (extracted to avoid duplication) ─────────────────────────────

function ThenBranch({ hasEffects, effects, addEffect, updateEffect, removeEffect }: {
  hasEffects: boolean;
  effects: Effect[];
  addEffect: () => void;
  updateEffect: (i: number, e: Effect) => void;
  removeEffect: (i: number) => void;
}) {
  if (!hasEffects) {
    return (
      <div className="ce-label-row">
        <span className="ce-badge ce-badge--keyword">THEN</span>
        <span className="ce-label-line" />
        <button className="ce-add" onClick={addEffect} title="Add effect">+</button>
      </div>
    );
  }

  return (
    <>
      <div className="ce-label-row">
        <span className="ce-badge ce-badge--keyword">THEN</span>
      </div>
      <ul className="ce-ul">
        {effects.map((eff, ei) => {
          const isCompound = eff.verb === VerbType.ALL || eff.verb === VerbType.ANY;
          if (isCompound) {
            return (
              <li key={ei} className="ce-li">
                <button className="ce-line-btn ce-line-btn--remove" onClick={() => removeEffect(ei)} title="Remove">&times;</button>
                <CompoundEffectBranch
                  effect={eff}
                  onChange={(e) => updateEffect(ei, e)}
                />
              </li>
            );
          }
          return (
            <li key={ei} className="ce-li ce-li--leaf">
              <button className="ce-line-btn ce-line-btn--remove" onClick={() => removeEffect(ei)} title="Remove">&times;</button>
              <EffectBuilder
                value={eff}
                onChange={(e) => updateEffect(ei, e)}
                compact
              />
            </li>
          );
        })}
        <li className="ce-li ce-li--last ce-li--addrow">
          <button className="ce-line-btn ce-line-btn--add" onClick={addEffect} title="Add effect">+</button>
        </li>
      </ul>
    </>
  );
}

// ── Compound effect branch (ALL / ANY) ───────────────────────────────────────
// ALL/ANY always contain predicates[]. Empty conditions = unconditional effects.

function CompoundEffectBranch({ effect, onChange }: {
  effect: Effect;
  onChange: (e: Effect) => void;
}) {
  const predicates = effect.predicates ?? [];

  const addPredicate = () => {
    onChange({
      ...effect,
      predicates: [...predicates, { conditions: [], effects: [] }],
    });
  };

  const updatePredicate = (i: number, p: Predicate) => {
    const next = [...predicates];
    next[i] = p;
    onChange({ ...effect, predicates: next });
  };

  const removePredicate = (i: number) => {
    onChange({ ...effect, predicates: predicates.filter((_, j) => j !== i) });
  };

  return (
    <>
      <div className="ce-label-row">
        <CustomSelect
          className="ib-verb"
          value={effect.verb}
          options={EFFECT_VERBS.map((v) => ({ value: v, label: VERB_LABELS[v] }))}
          onChange={(v) => {
            const newVerb = v as VerbType;
            if (newVerb !== VerbType.ALL && newVerb !== VerbType.ANY) {
              onChange({ verb: newVerb, object: undefined, predicates: undefined, effects: undefined });
            } else {
              onChange({ ...effect, verb: newVerb });
            }
          }}
        />
        {/* FOR cardinality: ALL FOR AT_MOST MAX */}
        <span className="ce-badge ce-badge--keyword">FOR</span>
        <CustomSelect
          className="ib-cardinality"
          value={effect.for?.cardinalityConstraint ?? ''}
          options={[
            { value: '', label: '—' },
            ...Object.values(CardinalityConstraintType).map((c) => ({ value: c, label: CARDINALITY_LABELS[c] })),
          ]}
          onChange={(v) => {
            const cc = (v || undefined) as CardinalityConstraintType | undefined;
            onChange({ ...effect, for: cc ? { cardinalityConstraint: cc, cardinality: effect.for?.cardinality ?? 1 } : undefined });
          }}
        />
        {effect.for && (
          <input
            className="ib-input ib-cardinality-value"
            type={effect.for.cardinality === THRESHOLD_MAX ? 'text' : 'number'}
            min={0}
            value={effect.for.cardinality === THRESHOLD_MAX ? 'MAX' : (effect.for.cardinality ?? '')}
            placeholder="#"
            onChange={(e) => {
              const raw = e.target.value.toUpperCase();
              const val = raw === 'MAX' ? THRESHOLD_MAX : (Number(e.target.value) || 1);
              onChange({ ...effect, for: { ...effect.for!, cardinality: val as number } });
            }}
          />
        )}
      </div>

      <ul className="ce-ul">
        {predicates.map((pred, pi) => (
          <li key={pi} className="ce-li">
            <button className="ce-line-btn ce-line-btn--remove" onClick={() => removePredicate(pi)} title="Remove">&times;</button>
            <CompoundPredicateNode
              index={pi}
              predicate={pred}
              onChange={(p) => updatePredicate(pi, p)}
            />
          </li>
        ))}
        <li className="ce-li ce-li--last ce-li--addrow">
          <button className="ce-line-btn ce-line-btn--add" onClick={addPredicate} title="Add predicate">+</button>
        </li>
      </ul>
    </>
  );
}

// ── Compound predicate node (If/Then inside ALL/ANY) ─────────────────────────

function CompoundPredicateNode({ index, predicate, onChange }: {
  index: number;
  predicate: Predicate;
  onChange: (p: Predicate) => void;
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

  const hasConds = (predicate.conditions ?? []).length > 0;
  const hasEffects = (predicate.effects ?? []).length > 0;

  return (
    <>
      <div className="ce-label-row">
        <span className="ce-label ce-label--dim">Branch {index + 1}</span>
      </div>
      <ul className="ce-ul">
        {/* Conditions */}
        <li className="ce-li">
          {!hasConds ? (
            <div className="ce-label-row">
              <span className="ce-badge ce-badge--keyword">IF</span>
              <span className="ce-label-line" />
              <button className="ce-add" onClick={addCondition} title="Add condition">+</button>
            </div>
          ) : (
            <>
              <div className="ce-label-row">
                <span className="ce-badge ce-badge--keyword">IF</span>
              </div>
              <ul className="ce-ul">
                {predicate.conditions.map((cond, ci) => (
                  <li key={ci} className="ce-li ce-li--leaf">
                    <button className="ce-line-btn ce-line-btn--remove" onClick={() => removeCondition(ci)} title="Remove">&times;</button>
                    <InteractionBuilder
                      value={cond}
                      onChange={(c) => updateCondition(ci, c as Interaction)}
                      compact
                    />
                  </li>
                ))}
                <li className="ce-li ce-li--last ce-li--addrow">
                  <button className="ce-line-btn ce-line-btn--add" onClick={addCondition} title="Add condition">+</button>
                </li>
              </ul>
            </>
          )}
        </li>

        {/* Effects */}
        <li className="ce-li ce-li--last ce-li--then">
          <ThenBranch
            hasEffects={hasEffects}
            effects={predicate.effects}
            addEffect={addEffect}
            updateEffect={updateEffect}
            removeEffect={removeEffect}
          />
        </li>
      </ul>
    </>
  );
}
