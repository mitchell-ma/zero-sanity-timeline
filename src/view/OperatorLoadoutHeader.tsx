import { useState, useEffect, useRef, useCallback } from 'react';
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
  weaponIdx:     number | null;
  armorIdx:      number | null;
  glovesIdx:     number | null;
  kit1Idx:       number | null;
  kit2Idx:       number | null;
  consumableIdx: number | null;
  tacticalIdx:   number | null;
}

export const EMPTY_LOADOUT: OperatorLoadoutState = {
  weaponIdx:     null,
  armorIdx:      null,
  glovesIdx:     null,
  kit1Idx:       null,
  kit2Idx:       null,
  consumableIdx: null,
  tacticalIdx:   null,
};

interface OperatorOption {
  id: string;
  name: string;
  color: string;
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

/* ─── Custom dropdown with icon + name rows ─────────────────────────────── */

function IconDropdown<T>({
  label,
  entries,
  selectedIdx,
  onChange,
}: {
  label: string;
  entries: RegistryEntry<T>[];
  selectedIdx: number | null;
  onChange: (idx: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = selectedIdx !== null ? entries[selectedIdx] : null;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const handleOpen = useCallback(() => {
    if (open) { setOpen(false); return; }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpen(true);
  }, [open]);

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
        title={selected?.name ?? label}
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
          <button className="lo-dropdown-option" onClick={() => pick(null)}>
            <span className="lo-dropdown-option-empty" />
            <span className="lo-dropdown-option-name">None</span>
          </button>
          {entries.map((entry, i) => (
            <button
              key={i}
              className={`lo-dropdown-option${i === selectedIdx ? ' selected' : ''}`}
              onClick={() => pick(i)}
            >
              {entry.icon ? (
                <img className="lo-dropdown-option-icon" src={entry.icon} alt={entry.name} />
              ) : (
                <span className="lo-dropdown-option-empty" />
              )}
              <span className="lo-dropdown-option-name">{entry.name}</span>
            </button>
          ))}
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
  const splashRef = useRef<HTMLDivElement>(null);
  const opMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!opMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (
        splashRef.current && !splashRef.current.contains(e.target as Node) &&
        opMenuRef.current && !opMenuRef.current.contains(e.target as Node)
      ) {
        setOpMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [opMenuOpen]);

  const handleSplashClick = useCallback(() => {
    if (!allOperators || !onSelectOperator) return;
    if (opMenuOpen) { setOpMenuOpen(false); return; }
    if (splashRef.current) {
      const rect = splashRef.current.getBoundingClientRect();
      setOpMenuPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpMenuOpen(true);
  }, [opMenuOpen, allOperators, onSelectOperator]);

  const pickOperator = useCallback((id: string | null) => {
    onSelectOperator?.(id);
    setOpMenuOpen(false);
  }, [onSelectOperator]);
  const set = (key: keyof OperatorLoadoutState) => (idx: number | null) =>
    onChange({ ...state, [key]: idx });

  // Filter weapons by operator's compatible weapon types
  const compatibleWeapons = WEAPONS.filter(
    (w) => operatorWeaponTypes.includes(w.weaponType),
  );

  // Map weaponIdx between filtered list and full WEAPONS array
  const filteredSelectedIdx = state.weaponIdx !== null
    ? compatibleWeapons.indexOf(WEAPONS[state.weaponIdx])
    : null;

  const handleWeaponChange = useCallback((filteredIdx: number | null) => {
    if (filteredIdx === null) {
      onChange({ ...state, weaponIdx: null });
    } else {
      const weapon = compatibleWeapons[filteredIdx];
      const globalIdx = WEAPONS.indexOf(weapon);
      onChange({ ...state, weaponIdx: globalIdx });
    }
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
          <button className="lo-dropdown-option" onClick={() => pickOperator(null)}>
            <span className="lo-dropdown-option-empty" />
            <span className="lo-dropdown-option-name">None</span>
          </button>
          {allOperators.map((op) => (
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
        <div className="lo-slots-row">
          <IconDropdown label="WPN" entries={compatibleWeapons} selectedIdx={filteredSelectedIdx} onChange={handleWeaponChange} />
          <IconDropdown label="ARM" entries={ARMORS}            selectedIdx={state.armorIdx}      onChange={set('armorIdx')} />
          <IconDropdown label="GLV" entries={GLOVES}            selectedIdx={state.glovesIdx}     onChange={set('glovesIdx')} />
          <IconDropdown label="K1"  entries={KITS}              selectedIdx={state.kit1Idx}       onChange={set('kit1Idx')} />
          <IconDropdown label="K2"  entries={KITS}              selectedIdx={state.kit2Idx}       onChange={set('kit2Idx')} />
        </div>
        <div className="lo-slots-row">
          <IconDropdown label="FOOD" entries={CONSUMABLES} selectedIdx={state.consumableIdx} onChange={set('consumableIdx')} />
          <IconDropdown label="TAC"  entries={TACTICALS}   selectedIdx={state.tacticalIdx}   onChange={set('tacticalIdx')} />
        </div>
      </div>
    </div>
  );
}
