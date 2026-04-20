/**
 * Single-operator card rendered in the statistics style — splash + badges +
 * bold element-color accent bar, with an optional vertical gear strip on the
 * right. Used by StatisticsOperatorSection (grid of cards) and by the combat
 * planner's loadout header (one per slot cell, sized by the parent).
 */

import React from 'react';
import type { Slot } from '../controller/timeline/columnBuilder';
import type { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { ELEMENT_COLORS, ElementType, GearLayoutType } from '../consts/enums';
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

export interface SlotGear {
  wpn: ReturnType<typeof getWeapon>;
  csm: ReturnType<typeof getConsumable>;
  tac: ReturnType<typeof getTactical>;
  arm: ReturnType<typeof getGearPiece>;
  glv: ReturnType<typeof getGearPiece>;
  k1: ReturnType<typeof getGearPiece>;
  k2: ReturnType<typeof getGearPiece>;
  weaponPotRank: number;
  hasAny: boolean;
}

export function resolveGear(
  lo: OperatorLoadoutState | undefined,
  weaponSkill3Level: number | undefined,
): SlotGear {
  const wpn = lo?.weaponId ? getWeapon(lo.weaponId) : undefined;
  const csm = lo?.consumableId ? getConsumable(lo.consumableId) : undefined;
  const tac = lo?.tacticalId ? getTactical(lo.tacticalId) : undefined;
  const arm = lo?.armorId ? getGearPiece(lo.armorId) : undefined;
  const glv = lo?.glovesId ? getGearPiece(lo.glovesId) : undefined;
  const k1 = lo?.kit1Id ? getGearPiece(lo.kit1Id) : undefined;
  const k2 = lo?.kit2Id ? getGearPiece(lo.kit2Id) : undefined;
  const weaponPotRank = weaponSkillLevelToPotential(weaponSkill3Level ?? 4);
  return {
    wpn, csm, tac, arm, glv, k1, k2, weaponPotRank,
    hasAny: !!(wpn || csm || tac || arm || glv || k1 || k2),
  };
}

export function GearStrip({ gear }: { gear: SlotGear }) {
  const { wpn, csm, tac, arm, glv, k1, k2, weaponPotRank } = gear;
  return (
    <div className="slc-gear-strip">
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
}

function FilledSlot({ icon, name }: { icon: string; name?: string }) {
  return (
    <div className="slc-gear-slot slc-gear-slot--filled" title={name}>
      <div className="slc-gi" style={{ backgroundImage: `url(${icon})` }} />
    </div>
  );
}

function accentFor(element: ElementType): string {
  return ELEMENT_COLORS[element] ?? '#8890a0';
}

interface Props {
  slot: Slot;
  loadout?: OperatorLoadoutState;
  /** Operator potential (0-5). Pre-extracted from LoadoutProperties so React.memo
   *  can skip when unchanged — passing the whole properties object defeats memo
   *  because its identity is rebuilt every combatState update. */
  potential?: number;
  /** Weapon skill-3 level, used to derive the weapon potential badge. */
  weaponSkill3Level?: number;
  /** Where to place the gear strip. BOTTOM suppresses the strip here so the parent can render a shared gear row. */
  gearLayout?: GearLayoutType;
  onSelect?: (slotId: string) => void;
  isEditing?: boolean;
}

export default React.memo(function OperatorStatsCard({
  slot, loadout, potential, weaponSkill3Level, gearLayout = GearLayoutType.RIGHT, onSelect, isEditing = false,
}: Props) {
  const op = slot.operator;
  if (!op) return null;
  const element = op.element as ElementType;
  const operatorClassType = op.operatorClassType as OperatorClassType | undefined;
  const potRank = Math.max(0, Math.min(5, potential ?? 0));
  const accent = accentFor(element);
  const gear = resolveGear(loadout, weaponSkill3Level);
  const clickable = !!onSelect;

  return (
    <div
      className="slc-op-unit"
      style={{ '--accent': accent } as React.CSSProperties}
    >
      <article
        className={`slc-op-card${clickable ? ' slc-op-card--clickable' : ''}${isEditing ? ' slc-op-card--editing' : ''}`}
        onClick={clickable ? () => onSelect!(slot.slotId) : undefined}
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

      {gearLayout === GearLayoutType.RIGHT && gear.hasAny && <GearStrip gear={gear} />}
    </div>
  );
});
