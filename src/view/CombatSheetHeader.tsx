import React from 'react';
import type { Slot } from '../controller/timeline/columnBuilder';
import type { DamageStatistics, DamageTableColumn } from '../controller/calculation/damageTableBuilder';
import type { LoadoutProperties } from './InformationPane';
import type { OperatorLoadoutState } from './OperatorLoadoutHeader';
import {
  CritMode,
  GearLayoutType,
} from '../consts/enums';
import StatisticsOperatorSection from './StatisticsOperatorSection';
import CombatHeaderStats from './CombatHeaderStats';

interface CombatSheetHeaderProps {
  slots: Slot[];
  loadouts?: Record<string, OperatorLoadoutState>;
  loadoutProperties: Record<string, LoadoutProperties>;
  statistics: DamageStatistics;
  tableColumns: DamageTableColumn[];
  onEditLoadout?: (slotId: string) => void;
  editingSlotId?: string;
  critMode?: CritMode;
  onCritModeChange?: (mode: CritMode) => void;
  /** When true, renders operator cards to the left of the stats table. Used
   *  when the planner is collapsed so the sheet shows loadouts inline. */
  showOperators?: boolean;
}

const NOOP = () => {};

export default React.memo(function CombatSheetHeader({
  slots, loadouts, loadoutProperties, statistics, tableColumns,
  onEditLoadout, editingSlotId,
  critMode = CritMode.NEVER, onCritModeChange,
  showOperators = false,
}: CombatSheetHeaderProps) {
  return (
    <section className={`csh${showOperators ? ' csh--with-operators' : ''}`}>
      {showOperators && loadouts && (
        <StatisticsOperatorSection
          slots={slots}
          loadouts={loadouts}
          loadoutProperties={loadoutProperties}
          gearLayout={GearLayoutType.RIGHT}
          onSelectSlot={onEditLoadout}
          editingSlotId={editingSlotId}
        />
      )}

      <CombatHeaderStats
        slots={slots}
        statistics={statistics}
        tableColumns={tableColumns}
        critMode={critMode}
        onSetCritMode={onCritModeChange ?? NOOP}
      />
    </section>
  );
});
