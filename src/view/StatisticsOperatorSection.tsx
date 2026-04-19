/**
 * Left pane of the statistics source card — operator splash/badges + gear.
 * Mirrors the team-block of the header mockup.
 */

import React from 'react';
import type { Slot } from '../controller/timeline/columnBuilder';
import type { OperatorLoadoutState } from './OperatorLoadoutHeader';
import type { LoadoutProperties } from './InformationPane';
import { ELEMENT_COLORS, ElementType } from '../consts/enums';
import { OperatorClassType } from '../model/enums/operators';
import {
  ELEMENT_ICONS,
  CLASS_ICONS,
  POTENTIAL_ICONS,
  weaponSkillLevelToPotential,
} from '../utils/metaIcons';
import {
  getWeapon,
  getGearPiece,
  getConsumable,
  getTactical,
} from '../controller/gameDataStore';

interface Props {
  slots: Slot[];
  loadouts: Record<string, OperatorLoadoutState>;
  loadoutProperties: Record<string, LoadoutProperties>;
}

function accentFor(element: ElementType): string {
  return ELEMENT_COLORS[element] ?? '#8890a0';
}

export default React.memo(function StatisticsOperatorSection({
  slots, loadouts, loadoutProperties,
}: Props) {
  const occupiedSlots = slots.filter((s) => s.operator);

  return (
    <div className="slc-team">
      <div className="slc-cards-row">
        {occupiedSlots.map((slot) => {
          const op = slot.operator!;
          const props = loadoutProperties[slot.slotId];
          const element = op.element as ElementType;
          const operatorClassType = op.operatorClassType as OperatorClassType | undefined;
          const potRank = Math.max(0, Math.min(5, props?.operator.potential ?? 0));
          const accent = accentFor(element);

          return (
            <article
              key={slot.slotId}
              className="slc-op-card"
              style={{ '--accent': accent } as React.CSSProperties}
            >
              {op.splash && (
                <div
                  className="slc-op-splash"
                  style={{ backgroundImage: `url(${op.splash})` }}
                />
              )}
              <div className="slc-op-badges">
                <div
                  className="slc-op-badge slc-op-badge--pot"
                  data-pot={potRank}
                  title={`P${potRank}`}
                >
                  <img src={POTENTIAL_ICONS[potRank]} alt={`P${potRank}`} />
                </div>
                {operatorClassType && CLASS_ICONS[operatorClassType] && (
                  <div className="slc-op-badge slc-op-badge--cls" title={operatorClassType}>
                    <img src={CLASS_ICONS[operatorClassType]} alt={operatorClassType} />
                  </div>
                )}
                {element === ElementType.ARTS ? (
                  <div
                    className="slc-op-badge slc-op-badge--ele slc-op-badge--ele-arts"
                    title="Arts"
                  >ARTS</div>
                ) : ELEMENT_ICONS[element] ? (
                  <div className="slc-op-badge slc-op-badge--ele" title={element}>
                    <img src={ELEMENT_ICONS[element]!} alt={element} />
                  </div>
                ) : null}
              </div>
              <span className="slc-op-accent" />
            </article>
          );
        })}
      </div>

      {/* Single strip per operator — WPN · POT · CSM · TAC · ARM · GLV · K1 · K2.
          Empty items are omitted; the strip itself is hidden when nothing is
          equipped. Filled cells flex to share the available width equally. */}
      <div className="slc-gear-row">
        {occupiedSlots.map((slot) => {
          const op = slot.operator!;
          const lo = loadouts[slot.slotId];
          const props = loadoutProperties[slot.slotId];
          const element = op.element as ElementType;
          const accent = accentFor(element);
          const wpn = lo?.weaponId ? getWeapon(lo.weaponId) : undefined;
          const csm = lo?.consumableId ? getConsumable(lo.consumableId) : undefined;
          const tac = lo?.tacticalId ? getTactical(lo.tacticalId) : undefined;
          const arm = lo?.armorId ? getGearPiece(lo.armorId) : undefined;
          const glv = lo?.glovesId ? getGearPiece(lo.glovesId) : undefined;
          const k1 = lo?.kit1Id ? getGearPiece(lo.kit1Id) : undefined;
          const k2 = lo?.kit2Id ? getGearPiece(lo.kit2Id) : undefined;
          const weaponPotRank = weaponSkillLevelToPotential(props?.weapon.skill3Level ?? 4);
          const hasAny = !!(wpn || csm || tac || arm || glv || k1 || k2);
          if (!hasAny) {
            return <div key={slot.slotId} className="slc-gear-row-spacer" />;
          }
          return (
            <div
              key={slot.slotId}
              className="slc-gear-strip"
              style={{ '--accent': accent } as React.CSSProperties}
            >
              {wpn?.icon && (
                <div
                  className="slc-gear-slot slc-gear-slot--filled slc-gear-slot--weapon"
                  title={wpn.name}
                  data-pot={weaponPotRank}
                >
                  <div className="slc-gi" style={{ backgroundImage: `url(${wpn.icon})` }} />
                  <img
                    className="slc-weapon-pot-badge"
                    src={POTENTIAL_ICONS[weaponPotRank]}
                    alt={`P${weaponPotRank}`}
                    title={`Weapon P${weaponPotRank}`}
                  />
                </div>
              )}
              {csm?.icon && <FilledSlot icon={csm.icon} name={csm.name} />}
              {tac?.icon && <FilledSlot icon={tac.icon} name={tac.name} />}
              {arm?.icon && <FilledSlot icon={arm.icon} name={arm.name} />}
              {glv?.icon && <FilledSlot icon={glv.icon} name={glv.name} />}
              {k1?.icon  && <FilledSlot icon={k1.icon}  name={k1.name}  />}
              {k2?.icon  && <FilledSlot icon={k2.icon}  name={k2.name}  />}
            </div>
          );
        })}
      </div>
    </div>
  );
});

function FilledSlot({ icon, name }: { icon: string; name?: string }) {
  return (
    <div className="slc-gear-slot slc-gear-slot--filled" title={name}>
      <div className="slc-gi" style={{ backgroundImage: `url(${icon})` }} />
    </div>
  );
}
