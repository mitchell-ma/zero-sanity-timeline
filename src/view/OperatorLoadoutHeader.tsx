import { useEffect, useRef, useMemo } from 'react';
import {
  WEAPONS,
  ARMORS,
  GLOVES,
  KITS,
  CONSUMABLES,
  TACTICALS,
  RegistryEntry,
} from '../utils/loadoutRegistry';

export interface OperatorLoadoutState {
  weaponName:     string | null;
  armorName:      string | null;
  glovesName:     string | null;
  kit1Name:       string | null;
  kit2Name:       string | null;
  consumableName: string | null;
  tacticalName:   string | null;
}

export const EMPTY_LOADOUT: OperatorLoadoutState = {
  weaponName:     null,
  armorName:      null,
  glovesName:     null,
  kit1Name:       null,
  kit2Name:       null,
  consumableName: null,
  tacticalName:   null,
};

interface OperatorLoadoutHeaderProps {
  operatorName: string;
  operatorColor: string;
  operatorWeaponTypes: string[];
  splash?: string;
  state: OperatorLoadoutState;
  onEdit: () => void;
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

function StaticIcon({ label, entry }: { label: string; entry: RegistryEntry<unknown> | null }) {
  return (
    <div className="lo-dropdown">
      <div
        className="lo-dropdown-trigger"
        title={entry?.name ?? label}
      >
        {entry?.icon ? (
          <img className="lo-dropdown-icon" src={entry.icon} alt={entry.name} />
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
  const findEntry = (name: string | null, entries: RegistryEntry<unknown>[]): RegistryEntry<unknown> | null => {
    if (name === null) return null;
    return entries.find((e) => e.name === name) ?? null;
  };

  const compatibleWeapons = useMemo(
    () => WEAPONS.filter((w) => operatorWeaponTypes.includes(w.weaponType)),
    [operatorWeaponTypes],
  );

  return (
    <>
      <div className="lo-slots lo-slots-left">
        <StaticIcon label="WPN" entry={findEntry(state.weaponName, compatibleWeapons)} />
        <div className="lo-slots-spacer" />
        <StaticIcon label="CSM" entry={findEntry(state.consumableName, CONSUMABLES)} />
        <StaticIcon label="TAC" entry={findEntry(state.tacticalName, TACTICALS)} />
      </div>
      <div className="lo-slots lo-slots-right">
        <StaticIcon label="ARM" entry={findEntry(state.armorName, ARMORS)} />
        <StaticIcon label="GLV" entry={findEntry(state.glovesName, GLOVES)} />
        <StaticIcon label="K1"  entry={findEntry(state.kit1Name, KITS)} />
        <StaticIcon label="K2"  entry={findEntry(state.kit2Name, KITS)} />
      </div>
    </>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export default function OperatorLoadoutHeader({
  operatorName,
  operatorColor,
  operatorWeaponTypes,
  splash,
  state,
  onEdit,
}: OperatorLoadoutHeaderProps) {
  return (
    <div
      className="lo-cell lo-splash--clickable"
      style={{ '--op-color': operatorColor } as React.CSSProperties}
      onClick={onEdit}
    >
      {/* Splash art — background layer */}
      {splash ? (
        <img className="lo-splash-img" src={splash} alt={operatorName} />
      ) : (
        <div className="lo-splash-fallback" />
      )}
      <div className="lo-splash-fade" />

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
}
