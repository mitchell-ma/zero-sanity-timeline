/**
 * Gear Effect form section for the Unified Customizer.
 */
import { ElementType } from '../../../consts/enums';
import type { CustomGearEffect } from '../../../model/custom/customGearEffectTypes';
import type { CustomStatusEventDef } from '../../../model/custom/customStatusEventTypes';
import CollapsibleSection from '../CollapsibleSection';
import IdField from '../IdField';
import StatusEventFields from './StatusEventFields';

interface Props {
  data: CustomGearEffect;
  onChange: (data: CustomGearEffect) => void;
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

function PassiveStatsEditor({ stats, onChange }: {
  stats: Partial<Record<string, number>>;
  onChange: (stats: Partial<Record<string, number>>) => void;
}) {
  const entries = Object.entries(stats);
  return (
    <div className="wz-subsection">
      <div className="wz-subsection-header">
        <span>Passive Stats</span>
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

export default function GearEffectSection({ data, onChange, originalId }: Props) {
  const update = (patch: Partial<CustomGearEffect>) => onChange({ ...data, ...patch });

  return (
    <>
      <CollapsibleSection title="Identity">
        <div className="wizard-section">
          <IdField value={data.id} onChange={(id) => update({ id })} originalId={originalId} />
          <label className="wz-field">
            <span>Name</span>
            <input type="text" value={data.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label className="wz-field">
            <span>Gear Set ID (optional)</span>
            <input type="text" value={data.gearSetId ?? ''} onChange={(e) => update({ gearSetId: e.target.value || undefined })} placeholder="Link to a gear set" />
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Passive Stats">
        <div className="wizard-section">
          <PassiveStatsEditor stats={data.passiveStats ?? {}} onChange={(s) => update({ passiveStats: s })} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Status Events">
        <div className="wizard-section">
          {data.statusEvents.map((se, i) => (
            <StatusEventFields
              key={i}
              event={se}
              label={`Status Event ${i + 1}`}
              onChange={(e) => {
                const statusEvents = [...data.statusEvents];
                statusEvents[i] = e;
                update({ statusEvents });
              }}
              onRemove={data.statusEvents.length > 1 ? () => update({ statusEvents: data.statusEvents.filter((_, j) => j !== i) }) : undefined}
            />
          ))}
          <button className="btn-add-sm" onClick={() => update({ statusEvents: [...data.statusEvents, defaultStatusEvent()] })} style={{ width: 'fit-content' }}>
            + Add Status Event
          </button>
        </div>
      </CollapsibleSection>
    </>
  );
}
