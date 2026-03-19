/**
 * Shared status event form fields used by weapon effects, gear effects,
 * operator statuses, and operator talents sections.
 */
import { ElementType } from '../../../consts/enums';
import type { CustomStatusEventDef } from '../../../model/custom/customStatusEventTypes';
import ClauseEditor from '../ClauseEditor';

const ELEMENT_TYPES = Object.values(ElementType);
const TARGETS = ['wielder', 'team', 'enemy'] as const;
const INTERACTION_TYPES = ['REPLACE', 'STACK', 'REFRESH', 'EXTEND'] as const;

interface Props {
  event: CustomStatusEventDef;
  onChange: (event: CustomStatusEventDef) => void;
  onRemove?: () => void;
  label?: string;
}

export default function StatusEventFields({ event, onChange, onRemove, label }: Props) {
  return (
    <div className="wz-subsection">
      <div className="wz-subsection-header">
        <span>{label ?? (event.name || 'Status Event')}</span>
        {onRemove && <button className="btn-add-sm" onClick={onRemove}>&times;</button>}
      </div>
      <div className="wz-field-row">
        <label className="wz-field" style={{ flex: 2 }}>
          <span>Name</span>
          <input type="text" value={event.name} onChange={(e) => onChange({ ...event, name: e.target.value })} />
        </label>
        <label className="wz-field">
          <span>Target</span>
          <select value={event.target} onChange={(e) => onChange({ ...event, target: e.target.value })}>
            {TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="wz-field">
          <span>Element</span>
          <select value={event.element} onChange={(e) => onChange({ ...event, element: e.target.value as ElementType })}>
            {ELEMENT_TYPES.map((el) => <option key={el} value={el}>{el}</option>)}
          </select>
        </label>
      </div>
      <div className="wz-field-row">
        <label className={`wz-radio${event.isNamedEvent ? ' active' : ''}`} style={{ width: 'fit-content' }}>
          <input type="checkbox" style={{ display: 'none' }} checked={event.isNamedEvent} onChange={() => onChange({ ...event, isNamedEvent: !event.isNamedEvent })} />
          Named Event
        </label>
        <label className="wz-field">
          <span>Duration Unit</span>
          <select value={event.durationUnit} onChange={(e) => onChange({ ...event, durationUnit: e.target.value })}>
            <option value="seconds">Seconds</option>
            <option value="frames">Frames</option>
          </select>
        </label>
      </div>
      <label className="wz-field">
        <span>Duration Values</span>
        <div className="wz-field-row" style={{ flexWrap: 'wrap' }}>
          {event.durationValues.map((v, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <input
                type="number"
                value={v}
                onChange={(e) => {
                  const durationValues = [...event.durationValues];
                  durationValues[i] = Number(e.target.value);
                  onChange({ ...event, durationValues });
                }}
                style={{ width: '5rem' }}
              />
              {event.durationValues.length > 1 && (
                <button className="btn-add-sm" onClick={() => onChange({ ...event, durationValues: event.durationValues.filter((_, j) => j !== i) })}>&times;</button>
              )}
            </div>
          ))}
          <button className="btn-add-sm" onClick={() => onChange({ ...event, durationValues: [...event.durationValues, event.durationValues[event.durationValues.length - 1] ?? 10] })}>+</button>
        </div>
      </label>
      <div className="wz-field-row">
        <label className="wz-field">
          <span>Stack Type</span>
          <select value={event.stack.interactionType} onChange={(e) => onChange({ ...event, stack: { ...event.stack, interactionType: e.target.value } })}>
            {INTERACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="wz-field">
          <span>Max Stacks</span>
          <input type="number" value={Array.isArray(event.stack.max) ? event.stack.max[0] : event.stack.max} onChange={(e) => onChange({ ...event, stack: { ...event.stack, max: Number(e.target.value) } })} />
        </label>
        <label className="wz-field">
          <span>Instances</span>
          <input type="number" value={event.stack.instances} onChange={(e) => onChange({ ...event, stack: { ...event.stack, instances: Number(e.target.value) } })} />
        </label>
      </div>
      <div className="wz-subsection">
        <div className="wz-subsection-header">
          <span>Stats</span>
          <button className="btn-add-sm" onClick={() => onChange({ ...event, stats: [...event.stats, { statType: '', value: [0] }] })}>+</button>
        </div>
        {event.stats.map((stat, i) => (
          <div key={i} className="wz-field-row" style={{ alignItems: 'flex-end' }}>
            <label className="wz-field" style={{ flex: 2 }}>
              {i === 0 && <span>Stat</span>}
              <input type="text" value={stat.statType} onChange={(e) => {
                const stats = [...event.stats];
                stats[i] = { ...stat, statType: e.target.value };
                onChange({ ...event, stats });
              }} />
            </label>
            <label className="wz-field">
              {i === 0 && <span>Value</span>}
              <input type="number" value={stat.value[0] ?? 0} onChange={(e) => {
                const stats = [...event.stats];
                stats[i] = { ...stat, value: [Number(e.target.value)] };
                onChange({ ...event, stats });
              }} />
            </label>
            <button className="btn-add-sm" style={{ marginBottom: '0.25rem' }} onClick={() => onChange({ ...event, stats: event.stats.filter((_, j) => j !== i) })}>&times;</button>
          </div>
        ))}
      </div>
      <div className="wz-subsection">
        <div className="wz-subsection-header"><span>Clause</span></div>
        <ClauseEditor initialValue={event.clause ?? []} onChange={(clause) => onChange({ ...event, clause })} />
      </div>
      <div className="wz-subsection">
        <div className="wz-subsection-header"><span>Trigger Clause</span></div>
        <ClauseEditor initialValue={event.onTriggerClause} onChange={(onTriggerClause) => onChange({ ...event, onTriggerClause })} />
      </div>
    </div>
  );
}
