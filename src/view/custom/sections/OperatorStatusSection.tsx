/**
 * Operator Status form section for the Unified Customizer.
 */
import type { CustomOperatorStatus } from '../../../model/custom/customOperatorStatusTypes';
import CollapsibleSection from '../CollapsibleSection';
import IdField from '../IdField';
import StatusEventFields from './StatusEventFields';
import { t } from '../../../locales/locale';

interface Props {
  data: CustomOperatorStatus;
  onChange: (data: CustomOperatorStatus) => void;
  originalId?: string;
}

export default function OperatorStatusSection({ data, onChange, originalId }: Props) {
  const update = (patch: Partial<CustomOperatorStatus>) => onChange({ ...data, ...patch });

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
            <span>Operator ID (optional)</span>
            <input type="text" value={data.operatorId ?? ''} onChange={(e) => update({ operatorId: e.target.value || undefined })} placeholder={t('customizer.placeholder.linkOperator')} />
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={t('customizer.section.statusEvent')}>
        <div className="wizard-section">
          <StatusEventFields
            event={data.statusEvent}
            onChange={(statusEvent) => update({ statusEvent })}
          />
        </div>
      </CollapsibleSection>
    </>
  );
}
