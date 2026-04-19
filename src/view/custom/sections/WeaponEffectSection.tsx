/**
 * Weapon Effect form section for the Unified Customizer.
 */
import { ElementType } from '../../../consts/enums';
import type { CustomWeaponEffect } from '../../../model/custom/customWeaponEffectTypes';
import type { CustomStatusEventDef } from '../../../model/custom/customStatusEventTypes';
import CollapsibleSection from '../CollapsibleSection';
import IdField from '../IdField';
import StatusEventFields from './StatusEventFields';
import { t } from '../../../locales/locale';

interface Props {
  data: CustomWeaponEffect;
  onChange: (data: CustomWeaponEffect) => void;
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

export default function WeaponEffectSection({ data, onChange, originalId }: Props) {
  const update = (patch: Partial<CustomWeaponEffect>) => onChange({ ...data, ...patch });

  return (
    <>
      <CollapsibleSection title={t('customizer.section.identity')}>
        <div className="wizard-section">
          <IdField value={data.id} onChange={(id) => update({ id })} originalId={originalId} />
          <label className="wz-field">
            <span>Name</span>
            <input type="text" value={data.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label className="wz-field">
            <span>Weapon ID (optional)</span>
            <input type="text" value={data.weaponId ?? ''} onChange={(e) => update({ weaponId: e.target.value || undefined })} placeholder={t('customizer.placeholder.linkWeapon')} />
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={t('customizer.section.statusEvents')}>
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
