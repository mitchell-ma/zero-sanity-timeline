/**
 * StatusEventEditor — Full form for creating/editing a CustomStatusEventDef.
 * Uses the SVO DSL grammar for triggers, clauses, and stat modifiers.
 */
import { useState } from 'react';
import { ElementType, StackInteractionType, DurationUnit } from '../../consts/enums';
import { ObjectType } from '../../consts/semantics';
import type { CustomStatusEventDef, CustomSegmentDef } from '../../model/custom/customOperatorTypes';
import ClauseBuilder from './ClauseBuilder';
import SegmentFrameEditor from './SegmentFrameEditor';

const ELEMENT_LABELS: Record<ElementType, string> = {
  [ElementType.NONE]: 'None', [ElementType.PHYSICAL]: 'Physical',
  [ElementType.HEAT]: 'Heat', [ElementType.CRYO]: 'Cryo',
  [ElementType.NATURE]: 'Nature', [ElementType.ELECTRIC]: 'Electric',
};

const STACK_INTERACTION_LABELS: Record<StackInteractionType, string> = {
  [StackInteractionType.NONE]: 'None — stacks ignored at max',
  [StackInteractionType.REFRESH]: 'Refresh — reset and reapply',
  [StackInteractionType.EXTEND]: 'Extend — match newest duration',
  [StackInteractionType.MERGE]: 'Merge — newer subsumes older',
  [StackInteractionType.APPLY]: 'Apply — add new instance',
  [StackInteractionType.CONSUME]: 'Consume — remove on use',
};

const TARGET_OPTIONS = [
  { value: ObjectType.THIS_OPERATOR, label: 'This Operator (self-buff)' },
  { value: ObjectType.ENEMY, label: 'Enemy (debuff)' },
  { value: ObjectType.ALL_OPERATORS, label: 'All Operators (team buff)' },
  { value: ObjectType.OTHER_OPERATOR, label: 'Other Operator' },
  { value: ObjectType.OTHER_OPERATORS, label: 'Other Operators' },
];

interface StatusEventEditorProps {
  value: CustomStatusEventDef;
  onChange: (value: CustomStatusEventDef) => void;
  onRemove?: () => void;
}

export default function StatusEventEditor({ value, onChange, onRemove }: StatusEventEditorProps) {
  const [expanded, setExpanded] = useState(true);

  const update = (patch: Partial<CustomStatusEventDef>) => onChange({ ...value, ...patch });

  const maxStacks = typeof value.stack.max === 'number' ? value.stack.max : Math.max(...(value.stack.max as number[]));

  // Adjust duration array length to match max stacks
  const adjustDurationArray = (newMax: number) => {
    const current = value.durationValues;
    const adjusted = Array.from({ length: newMax }, (_, i) => current[i] ?? current[current.length - 1] ?? 15);
    update({ durationValues: adjusted });
  };

  return (
    <div className="status-event-editor">
      <div className="status-event-header" onClick={() => setExpanded(!expanded)}>
        <span className="status-event-name">{value.name || '(unnamed status)'}</span>
        <div className="status-event-actions">
          {onRemove && <button className="ib-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>}
          <span className="collapse-toggle">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {expanded && (
        <div className="status-event-body">
          {/* Identity */}
          <div className="wz-field-row">
            <label className="wz-field" style={{ flex: 2 }}>
              <span>Status Name</span>
              <input
                type="text"
                value={value.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="e.g. MELTING_FLAME"
              />
            </label>
            <label className="wz-field">
              <span>Element</span>
              <select value={value.element} onChange={(e) => update({ element: e.target.value as ElementType })}>
                {Object.values(ElementType).map((el) => <option key={el} value={el}>{ELEMENT_LABELS[el]}</option>)}
              </select>
            </label>
          </div>

          <div className="wz-field-row">
            <label className="wz-field" style={{ flex: 2 }}>
              <span>Target</span>
              <select value={value.target} onChange={(e) => update({ target: e.target.value })}>
                {TARGET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="ib-checkbox" style={{ alignSelf: 'flex-end', padding: '0.3rem 0' }}>
              <input
                type="checkbox"
                checked={value.isNamedEvent}
                onChange={(e) => update({ isNamedEvent: e.target.checked })}
              />
              Shows on timeline
            </label>
          </div>

          {/* Stack Config */}
          <div className="wz-subsection">
            <div className="wz-subsection-header"><span>Stacking</span></div>

            <label className="wz-field">
              <span>Stack Behavior</span>
              <select
                value={value.stack.interactionType}
                onChange={(e) => update({ stack: { ...value.stack, interactionType: e.target.value } })}
              >
                {Object.values(StackInteractionType).map((t) => (
                  <option key={t} value={t}>{STACK_INTERACTION_LABELS[t]}</option>
                ))}
              </select>
            </label>

            <div className="wz-field-row">
              <label className="wz-field">
                <span>Max Stacks</span>
                <input
                  type="number"
                  min={1}
                  value={maxStacks}
                  onChange={(e) => {
                    const newMax = Math.max(1, Number(e.target.value));
                    update({ stack: { ...value.stack, max: newMax } });
                    adjustDurationArray(newMax);
                  }}
                />
              </label>
              <label className="wz-field">
                <span>Instances</span>
                <input
                  type="number"
                  min={1}
                  value={value.stack.instances}
                  onChange={(e) => update({ stack: { ...value.stack, instances: Math.max(1, Number(e.target.value)) } })}
                />
              </label>
            </div>
          </div>

          {/* Duration */}
          <div className="wz-subsection">
            <div className="wz-subsection-header">
              <span>Duration ({value.durationUnit === DurationUnit.FRAME ? 'frames' : 'seconds'}) — per stack</span>
              <select
                className="ib-select"
                value={value.durationUnit}
                onChange={(e) => update({ durationUnit: e.target.value })}
                style={{ marginLeft: 'auto' }}
              >
                <option value={DurationUnit.SECOND}>Seconds</option>
                <option value={DurationUnit.FRAME}>Frames</option>
              </select>
            </div>
            <div className="multiplier-table">
              {value.durationValues.map((d, i) => (
                <div key={i} className="duration-cell">
                  <span className="mt-label">{i + 1}</span>
                  <input
                    className="mt-input"
                    type="number"
                    step="any"
                    value={d}
                    onChange={(e) => {
                      const durationValues = [...value.durationValues];
                      durationValues[i] = Number(e.target.value);
                      update({ durationValues });
                    }}
                  />
                </div>
              ))}
            </div>
            <span className="ib-label">Use -1 for permanent (never expires)</span>
          </div>

          {/* Trigger Clause */}
          <div className="wz-subsection">
            <ClauseBuilder
              value={value.triggerClause}
              onChange={(triggerClause) => update({ triggerClause })}
              conditionsOnly
              label="Trigger — when this status is created"
            />
          </div>

          {/* Clause — reactions/threshold effects */}
          <div className="wz-subsection">
            <ClauseBuilder
              value={value.clause ?? []}
              onChange={(clause) => update({ clause })}
              label="Reactions — what happens during this status"
            />
          </div>

          {/* Stats */}
          <div className="wz-subsection">
            <div className="wz-subsection-header">
              <span>Stat Modifiers (per stack)</span>
              <button className="btn-add-sm" onClick={() => update({
                stats: [...value.stats, { statType: '', value: Array(maxStacks).fill(0) }],
              })}>+</button>
            </div>
            {value.stats.map((stat, i) => (
              <div key={i} className="stat-modifier-row">
                <input
                  className="ib-input ib-object-id"
                  type="text"
                  value={stat.statType}
                  placeholder="e.g. ATTACK_BONUS"
                  onChange={(e) => {
                    const stats = [...value.stats];
                    stats[i] = { ...stat, statType: e.target.value };
                    update({ stats });
                  }}
                />
                <div className="multiplier-table">
                  {stat.value.map((v, vi) => (
                    <input
                      key={vi}
                      className="mt-input"
                      type="number"
                      step="any"
                      value={v}
                      onChange={(e) => {
                        const stats = [...value.stats];
                        const values = [...stat.value];
                        values[vi] = Number(e.target.value);
                        stats[i] = { ...stat, value: values };
                        update({ stats });
                      }}
                    />
                  ))}
                </div>
                <button className="ib-remove" onClick={() => update({ stats: value.stats.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
          </div>

          {/* Segments */}
          <div className="wz-subsection">
            <SegmentFrameEditor
              segments={value.segments ?? []}
              onChange={(segments) => update({ segments: segments.length > 0 ? segments : undefined })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Create a default empty StatusEventDef. */
export function defaultStatusEventDef(): CustomStatusEventDef {
  return {
    name: '',
    target: ObjectType.THIS_OPERATOR,
    element: ElementType.NONE,
    isNamedEvent: true,
    durationValues: [15],
    durationUnit: DurationUnit.SECOND,
    stack: {
      interactionType: StackInteractionType.NONE,
      max: 1,
      instances: 1,
      reactions: [],
    },
    reactions: [],
    triggerClause: [],
    clause: [],
    stats: [],
  };
}
