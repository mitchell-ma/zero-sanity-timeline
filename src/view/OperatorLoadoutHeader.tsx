import React, { useEffect, useRef } from 'react';
import {
  getWeapon,
  getGearPiece,
  getConsumable,
  getTactical,
} from '../controller/gameDataStore';

export interface OperatorLoadoutState {
  weaponId:     string | null;
  armorId:      string | null;
  glovesId:     string | null;
  kit1Id:       string | null;
  kit2Id:       string | null;
  consumableId: string | null;
  tacticalId:   string | null;
}

export const EMPTY_LOADOUT: OperatorLoadoutState = {
  weaponId:     null,
  armorId:      null,
  glovesId:     null,
  kit1Id:       null,
  kit2Id:       null,
  consumableId: null,
  tacticalId:   null,
};

interface OperatorLoadoutHeaderProps {
  operatorName: string;
  operatorColor: string;
  operatorWeaponTypes: string[];
  splash?: string;
  state: OperatorLoadoutState;
  slotId: string;
  onEdit: (slotId: string) => void;
}

/* ─── Shared filter bar for dropdown menus ────────────────────────────── */

function DropdownFilterBar({
  search,
  onSearch,
  rarities,
  activeRarities,
  onToggleRarity,
}: {
  search: string;
  onSearch: (v: string) => void;
  rarities: number[];
  activeRarities: Set<number>;
  onToggleRarity: (r: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="lo-filter-bar" onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="lo-filter-input"
        type="text"
        placeholder="Filter..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {rarities.length > 1 && (
        <div className="lo-filter-rarities">
          {rarities.map((r) => (
            <button
              key={r}
              className={`lo-filter-rarity${activeRarities.has(r) ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onToggleRarity(r); }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DropdownTierBar({
  search,
  onSearch,
  tiers,
  activeTiers,
  onToggleTier,
}: {
  search: string;
  onSearch: (v: string) => void;
  tiers: string[];
  activeTiers: Set<string>;
  onToggleTier: (t: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="lo-filter-bar" onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="lo-filter-input"
        type="text"
        placeholder="Filter..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {tiers.length > 1 && (
        <div className="lo-filter-rarities">
          {tiers.map((t) => (
            <button
              key={t}
              className={`lo-filter-rarity lo-filter-tier${activeTiers.has(t) ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onToggleTier(t); }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { DropdownFilterBar, DropdownTierBar };

/* ─── Static icon display ────────────────────────────────────────────── */

function StaticIcon({ label, icon, name }: { label: string; icon?: string; name?: string }) {
  return (
    <div className="lo-dropdown">
      <div
        className="lo-dropdown-trigger"
        title={name ?? label}
      >
        {icon ? (
          <img className="lo-dropdown-icon" src={icon} alt={name ?? label} />
        ) : (
          <span className="lo-dropdown-placeholder">{label}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Equipment slots container ────────────────────────────────────────── */

interface EquipmentSlotsProps {
  operatorWeaponTypes: string[];
  state: OperatorLoadoutState;
}

export function EquipmentSlots({ operatorWeaponTypes, state }: EquipmentSlotsProps) {
  const wpn = state.weaponId ? getWeapon(state.weaponId) : undefined;
  const csm = state.consumableId ? getConsumable(state.consumableId) : undefined;
  const tac = state.tacticalId ? getTactical(state.tacticalId) : undefined;
  const arm = state.armorId ? getGearPiece(state.armorId) : undefined;
  const glv = state.glovesId ? getGearPiece(state.glovesId) : undefined;
  const k1 = state.kit1Id ? getGearPiece(state.kit1Id) : undefined;
  const k2 = state.kit2Id ? getGearPiece(state.kit2Id) : undefined;

  return (
    <>
      <div className="lo-slots lo-slots-left">
        <StaticIcon label="WPN" icon={wpn?.icon} name={wpn?.name} />
        <div className="lo-slots-spacer" />
        <StaticIcon label="CSM" icon={csm?.icon} name={csm?.name} />
        <StaticIcon label="TAC" icon={tac?.icon} name={tac?.name} />
      </div>
      <div className="lo-slots lo-slots-right">
        <StaticIcon label="ARM" icon={arm?.icon} name={arm?.name} />
        <StaticIcon label="GLV" icon={glv?.icon} name={glv?.name} />
        <StaticIcon label="K1"  icon={k1?.icon} name={k1?.name} />
        <StaticIcon label="K2"  icon={k2?.icon} name={k2?.name} />
      </div>
    </>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export default React.memo(function OperatorLoadoutHeader({
  operatorName,
  operatorColor,
  operatorWeaponTypes,
  splash,
  state,
  slotId,
  onEdit,
}: OperatorLoadoutHeaderProps) {
  return (
    <div
      className="lo-cell lo-splash--clickable"
      style={{ '--op-color': operatorColor } as React.CSSProperties}
      onClick={() => onEdit(slotId)}
    >
      {/* Splash art — background layer */}
      {splash ? (
        <img className="lo-splash-img" src={splash} alt={operatorName} />
      ) : (
        <div className="lo-splash-fallback" />
      )}
      {/* Equipment icons — static display */}
      <EquipmentSlots
        operatorWeaponTypes={operatorWeaponTypes}
        state={state}
      />

      {/* Operator name */}
      <div className="lo-name-row">
        <span className="lo-name">{operatorName}</span>
      </div>
    </div>
  );
});
