/**
 * Operator Talent form section for the Unified Customizer.
 */
import { ElementType } from '../../../consts/enums';
import type { CustomOperatorTalent } from '../../../model/custom/customOperatorTalentTypes';
import type { CustomStatusEventDef } from '../../../model/custom/customStatusEventTypes';
import CollapsibleSection from '../CollapsibleSection';
import IdField from '../IdField';
import StatusEventFields from './StatusEventFields';

interface Props {
  data: CustomOperatorTalent;
  onChange: (data: CustomOperatorTalent) => void;
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

export default function OperatorTalentSection({ data, onChange, originalId }: Props) {
  const update = (patch: Partial<CustomOperatorTalent>) => onChange({ ...data, ...patch });

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
            <span>Operator ID (optional)</span>
            <input type="text" value={data.operatorId ?? ''} onChange={(e) => update({ operatorId: e.target.value || undefined })} placeholder="Link to an operator" />
          </label>
          <div className="wz-field-row">
            <label className="wz-field">
              <span>Slot</span>
              <input type="number" value={data.slot} min={1} max={3} onChange={(e) => update({ slot: Number(e.target.value) })} />
            </label>
            <label className="wz-field">
              <span>Max Level</span>
              <input type="number" value={data.maxLevel} min={1} onChange={(e) => update({ maxLevel: Number(e.target.value) })} />
            </label>
          </div>
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
