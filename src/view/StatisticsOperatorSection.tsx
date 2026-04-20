/**
 * Left pane of the statistics source card — operator splash/badges + gear.
 * Mirrors the team-block of the header mockup.
 *
 * Gear strip placement is controlled by `gearLayout`:
 *  - RIGHT: strip sits flush against the card on the right (intra-loadout view)
 *  - BOTTOM: strip sits as a horizontal row below all cards (inter-loadout view)
 *
 * The single-operator tile lives in `OperatorStatsCard` so the same visual
 * treatment can be reused by the planner's loadout header.
 */

import React from 'react';
import type { Slot } from '../controller/timeline/columnBuilder';
import type { OperatorLoadoutState } from './OperatorLoadoutHeader';
import type { LoadoutProperties } from './InformationPane';
import { ELEMENT_COLORS, ElementType, GearLayoutType } from '../consts/enums';
import OperatorStatsCard, { GearStrip, resolveGear } from './OperatorStatsCard';

interface Props {
  slots: Slot[];
  loadouts: Record<string, OperatorLoadoutState>;
  loadoutProperties: Record<string, LoadoutProperties>;
  gearLayout?: GearLayoutType;
  /** When set, operator cards are clickable — used by combat-sheet header for loadout editing. */
  onSelectSlot?: (slotId: string) => void;
  /** Slot currently being edited; gets an "active" visual state. */
  editingSlotId?: string;
}

function accentFor(element: ElementType): string {
  return ELEMENT_COLORS[element] ?? '#8890a0';
}

export default React.memo(function StatisticsOperatorSection({
  slots, loadouts, loadoutProperties, gearLayout = GearLayoutType.RIGHT, onSelectSlot, editingSlotId,
}: Props) {
  const occupiedSlots = slots.filter((s) => s.operator);

  return (
    <div className={`slc-team slc-team--${gearLayout}`}>
      <div className="slc-cards-row">
        {occupiedSlots.map((slot) => {
          const props = loadoutProperties[slot.slotId];
          return (
            <OperatorStatsCard
              key={slot.slotId}
              slot={slot}
              loadout={loadouts[slot.slotId]}
              potential={props?.operator.potential}
              weaponSkill3Level={props?.weapon.skill3Level}
              gearLayout={gearLayout}
              onSelect={onSelectSlot}
              isEditing={editingSlotId === slot.slotId}
            />
          );
        })}
      </div>

      {gearLayout === GearLayoutType.BOTTOM && (
        <div className="slc-gear-row">
          {occupiedSlots.map((slot) => {
            const op = slot.operator!;
            const accent = accentFor(op.element as ElementType);
            const gear = resolveGear(loadouts[slot.slotId], loadoutProperties[slot.slotId]?.weapon.skill3Level);
            if (!gear.hasAny) {
              return <div key={slot.slotId} className="slc-gear-row-spacer" />;
            }
            return (
              <div key={slot.slotId} style={{ '--accent': accent } as React.CSSProperties}>
                <GearStrip gear={gear} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
