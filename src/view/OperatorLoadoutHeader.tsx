import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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

interface OperatorOption {
  id: string;
  name: string;
  color: string;
  rarity: number;
  splash?: string;
}

interface OperatorLoadoutHeaderProps {
  operatorName: string;
  operatorColor: string;
  operatorWeaponTypes: string[];
  splash?: string;
  state: OperatorLoadoutState;
  onChange: (state: OperatorLoadoutState) => void;
  onEdit: () => void;
  allOperators?: OperatorOption[];
  onSelectOperator?: (operatorId: string | null) => void;
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
export type { OperatorOption };

/* ─── Custom dropdown with icon + name rows ─────────────────────────────── */

function IconDropdown<T>({
  label,
  title: titleProp,
  entries,
  selectedIdx,
  onChange,
}: {
  label: string;
  title?: string;
  entries: RegistryEntry<T>[];
  selectedIdx: number | null;
  onChange: (idx: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [search, setSearch] = useState('');
  const [activeRarities, setActiveRarities] = useState<Set<number>>(new Set());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = selectedIdx !== null ? entries[selectedIdx] : null;

  // Compute available rarities from entries
  const rarities = useMemo(() => {
    const s = new Set<number>();
    entries.forEach((e) => s.add(e.rarity));
    return Array.from(s).sort((a, b) => a - b);
  }, [entries]);

  // Initialize activeRarities when rarities change
  useEffect(() => {
    setActiveRarities(new Set(rarities));
  }, [rarities]);

  // Filter & sort entries
  const filtered = useMemo(() => {
    const lc = search.toLowerCase();
    const items: { entry: RegistryEntry<T>; origIdx: number }[] = [];
    entries.forEach((e, i) => {
      if (lc && !e.name.toLowerCase().includes(lc)) return;
      if (!activeRarities.has(e.rarity)) return;
      items.push({ entry: e, origIdx: i });
    });
    items.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
    return items;
  }, [entries, search, activeRarities]);

  const toggleRarity = useCallback((r: number) => {
    setActiveRarities((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [open]);

  const handleOpen = useCallback(() => {
    if (open) { setOpen(false); return; }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 2, left: rect.left });
    }
    setSearch('');
    setActiveRarities(new Set(rarities));
    setOpen(true);
  }, [open, rarities]);

  const pick = useCallback((idx: number | null) => {
    onChange(idx);
    setOpen(false);
  }, [onChange]);

  return (
    <div className="lo-dropdown">
      <button
        ref={triggerRef}
        className="lo-dropdown-trigger"
        onClick={handleOpen}
        title={selected?.name ?? titleProp ?? label}
      >
        {selected?.icon ? (
          <img className="lo-dropdown-icon" src={selected.icon} alt={selected.name} />
        ) : (
          <span className="lo-dropdown-placeholder">{label}</span>
        )}
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className="lo-dropdown-menu"
          style={{ top: menuPos.top, left: menuPos.left }}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <DropdownFilterBar
            search={search}
            onSearch={setSearch}
            rarities={rarities}
            activeRarities={activeRarities}
            onToggleRarity={toggleRarity}
          />
          <div className="lo-dropdown-scroll">
            <button className="lo-dropdown-option" onClick={() => pick(null)}>
              <span className="lo-dropdown-option-empty" />
              <span className="lo-dropdown-option-name">None</span>
            </button>
            {filtered.map(({ entry, origIdx }) => (
              <button
                key={origIdx}
                className={`lo-dropdown-option${origIdx === selectedIdx ? ' selected' : ''}`}
                onClick={() => pick(origIdx)}
              >
                {entry.icon ? (
                  <img className="lo-dropdown-option-icon" src={entry.icon} alt={entry.name} />
                ) : (
                  <span className="lo-dropdown-option-empty" />
                )}
                <span className="lo-dropdown-option-name">{entry.name}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export default function OperatorLoadoutHeader({
  operatorName,
  operatorColor,
  operatorWeaponTypes,
  splash,
  state,
  onChange,
  onEdit,
  allOperators,
  onSelectOperator,
}: OperatorLoadoutHeaderProps) {
  const [opMenuOpen, setOpMenuOpen] = useState(false);
  const [opMenuPos, setOpMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [opSearch, setOpSearch] = useState('');
  const [opActiveRarities, setOpActiveRarities] = useState<Set<number>>(new Set());
  const splashRef = useRef<HTMLDivElement>(null);
  const opMenuRef = useRef<HTMLDivElement>(null);

  const opRarities = useMemo(() => {
    if (!allOperators) return [];
    const s = new Set<number>();
    allOperators.forEach((op) => s.add(op.rarity));
    return Array.from(s).sort((a, b) => a - b);
  }, [allOperators]);

  const filteredOperators = useMemo(() => {
    if (!allOperators) return [];
    const lc = opSearch.toLowerCase();
    return allOperators
      .filter((op) => {
        if (lc && !op.name.toLowerCase().includes(lc)) return false;
        if (!opActiveRarities.has(op.rarity)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allOperators, opSearch, opActiveRarities]);

  const toggleOpRarity = useCallback((r: number) => {
    setOpActiveRarities((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!opMenuOpen) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      if (
        splashRef.current && !splashRef.current.contains(e.target as Node) &&
        opMenuRef.current && !opMenuRef.current.contains(e.target as Node)
      ) {
        setOpMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [opMenuOpen]);

  const handleSplashClick = useCallback(() => {
    if (!allOperators || !onSelectOperator) return;
    if (opMenuOpen) { setOpMenuOpen(false); return; }
    if (splashRef.current) {
      const rect = splashRef.current.getBoundingClientRect();
      setOpMenuPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpSearch('');
    setOpActiveRarities(new Set(opRarities));
    setOpMenuOpen(true);
  }, [opMenuOpen, allOperators, onSelectOperator, opRarities]);

  const pickOperator = useCallback((id: string | null) => {
    onSelectOperator?.(id);
    setOpMenuOpen(false);
  }, [onSelectOperator]);
  /** Create a handler that maps IconDropdown index ↔ registry name for a given slot. */
  const nameSet = (key: keyof OperatorLoadoutState, entries: RegistryEntry<any>[]) => (idx: number | null) =>
    onChange({ ...state, [key]: idx !== null ? entries[idx]?.name ?? null : null });

  const nameIdx = (key: keyof OperatorLoadoutState, entries: RegistryEntry<any>[]): number | null => {
    const name = state[key];
    if (name === null) return null;
    const idx = entries.findIndex((e) => e.name === name);
    return idx >= 0 ? idx : null;
  };

  // Filter weapons by operator's compatible weapon types
  const compatibleWeapons = WEAPONS.filter(
    (w) => operatorWeaponTypes.includes(w.weaponType),
  );

  const wpnIdx = state.weaponName !== null ? compatibleWeapons.findIndex((w) => w.name === state.weaponName) : -1;
  const filteredSelectedIdx = wpnIdx >= 0 ? wpnIdx : null;

  const handleWeaponChange = useCallback((filteredIdx: number | null) => {
    onChange({ ...state, weaponName: filteredIdx !== null ? compatibleWeapons[filteredIdx]?.name ?? null : null });
  }, [compatibleWeapons, state, onChange]);

  return (
    <div
      className="lo-cell"
      style={{ '--op-color': operatorColor } as React.CSSProperties}
    >
      {/* Splash art (clickable for operator selection) */}
      <div
        ref={splashRef}
        className={`lo-splash${allOperators ? ' lo-splash--clickable' : ''}`}
        onClick={handleSplashClick}
      >
        {splash ? (
          <img className="lo-splash-img" src={splash} alt={operatorName} />
        ) : (
          <div className="lo-splash-fallback" />
        )}
        <div className="lo-splash-fade" />
      </div>

      {/* Operator selection dropdown */}
      {opMenuOpen && opMenuPos && allOperators && createPortal(
        <div
          ref={opMenuRef}
          className="lo-dropdown-menu lo-op-menu"
          style={{ top: opMenuPos.top, left: opMenuPos.left }}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <DropdownFilterBar
            search={opSearch}
            onSearch={setOpSearch}
            rarities={opRarities}
            activeRarities={opActiveRarities}
            onToggleRarity={toggleOpRarity}
          />
          <div className="lo-dropdown-scroll">
            <button className="lo-dropdown-option" onClick={() => pickOperator(null)}>
              <span className="lo-dropdown-option-empty" />
              <span className="lo-dropdown-option-name">None</span>
            </button>
            {filteredOperators.map((op) => (
              <button
                key={op.id}
                className={`lo-dropdown-option${op.name === operatorName ? ' selected' : ''}`}
                onClick={() => pickOperator(op.id)}
              >
                {op.splash ? (
                  <img className="lo-op-menu-splash" src={op.splash} alt={op.name} />
                ) : (
                  <span className="lo-dropdown-option-empty" />
                )}
                <span className="lo-dropdown-option-name" style={{ color: op.color }}>
                  {op.name}
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {/* Edit button (top-right) */}
      <button className="lo-edit-btn" onClick={onEdit} title="Edit stats">
        <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor">
          <path d="M7.5.8 9.2 2.5 3.2 8.5.5 9.5l1-2.7z"/>
        </svg>
      </button>

      {/* Name */}
      <div className="lo-name-row">
        <span className="lo-name">{operatorName}</span>
      </div>

      {/* Equipment icons */}
      <div className="lo-slots">
        <div className="lo-slots-row lo-slots-row--top">
          <IconDropdown label="WPN"  title="Weapon"      entries={compatibleWeapons} selectedIdx={filteredSelectedIdx} onChange={handleWeaponChange} />
          <div className="lo-slots-spacer" />
          <IconDropdown label="CSM"  title="Consumable"  entries={CONSUMABLES}       selectedIdx={nameIdx('consumableName', CONSUMABLES)} onChange={nameSet('consumableName', CONSUMABLES)} />
          <IconDropdown label="TAC"  title="Tactical"    entries={TACTICALS}         selectedIdx={nameIdx('tacticalName', TACTICALS)}     onChange={nameSet('tacticalName', TACTICALS)} />
        </div>
        <div className="lo-slots-row">
          <IconDropdown label="ARM" title="Armor"       entries={ARMORS}  selectedIdx={nameIdx('armorName', ARMORS)}   onChange={nameSet('armorName', ARMORS)} />
          <IconDropdown label="GLV" title="Gloves"      entries={GLOVES}  selectedIdx={nameIdx('glovesName', GLOVES)} onChange={nameSet('glovesName', GLOVES)} />
          <IconDropdown label="K1"  title="Kit 1"       entries={KITS}    selectedIdx={nameIdx('kit1Name', KITS)}     onChange={nameSet('kit1Name', KITS)} />
          <IconDropdown label="K2"  title="Kit 2"       entries={KITS}    selectedIdx={nameIdx('kit2Name', KITS)}     onChange={nameSet('kit2Name', KITS)} />
        </div>
      </div>
    </div>
  );
}
