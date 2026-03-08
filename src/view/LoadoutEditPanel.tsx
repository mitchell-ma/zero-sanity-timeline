import { useEffect, useRef, useState, useCallback } from 'react';
import { Operator } from '../consts/viewTypes';
import { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { WEAPONS, ARMORS, GLOVES, KITS, CONSUMABLES, TACTICALS } from '../utils/loadoutRegistry';

export interface LoadoutStats {
  operatorLevel: number;
  basicAttackLevel: number;
  battleSkillLevel: number;
  comboSkillLevel: number;
  ultimateLevel: number;
  weaponLevel: number;
  weaponSkill1Level: number;
  weaponSkill2Level: number;
  weaponSkill3Level: number;
  gearRank: number;
}

export const DEFAULT_LOADOUT_STATS: LoadoutStats = {
  operatorLevel: 90,
  basicAttackLevel: 1,
  battleSkillLevel: 1,
  comboSkillLevel: 1,
  ultimateLevel: 1,
  weaponLevel: 90,
  weaponSkill1Level: 1,
  weaponSkill2Level: 1,
  weaponSkill3Level: 1,
  gearRank: 1,
};

interface LoadoutEditPanelProps {
  operator: Operator;
  loadout: OperatorLoadoutState;
  stats: LoadoutStats;
  onStatsChange: (stats: LoadoutStats) => void;
  onClose: () => void;
}

function StatField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="le-field">
      <label className="le-field-label">{label}</label>
      <input
        className="le-field-input"
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Math.max(min, Math.min(max, Number(e.target.value) || min));
          onChange(v);
        }}
      />
    </div>
  );
}

export default function LoadoutEditPanel({
  operator,
  loadout,
  stats,
  onStatsChange,
  onClose,
}: LoadoutEditPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  const startClose = useCallback(() => {
    setClosing(true);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const el = panelRef.current;
    if (!el) { onClose(); return; }
    const handleEnd = () => onClose();
    el.addEventListener('animationend', handleEnd);
    return () => el.removeEventListener('animationend', handleEnd);
  }, [closing, onClose]);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        startClose();
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [startClose]);

  const set = (key: keyof LoadoutStats) => (v: number) =>
    onStatsChange({ ...stats, [key]: v });

  const weapon = loadout.weaponIdx !== null ? WEAPONS[loadout.weaponIdx] : null;
  const armor  = loadout.armorIdx  !== null ? ARMORS[loadout.armorIdx]   : null;
  const gloves = loadout.glovesIdx !== null ? GLOVES[loadout.glovesIdx]  : null;
  const kit1   = loadout.kit1Idx   !== null ? KITS[loadout.kit1Idx]      : null;
  const kit2   = loadout.kit2Idx   !== null ? KITS[loadout.kit2Idx]      : null;
  const food   = loadout.consumableIdx !== null ? CONSUMABLES[loadout.consumableIdx] : null;
  const tac    = loadout.tacticalIdx   !== null ? TACTICALS[loadout.tacticalIdx]     : null;

  return (
    <div className={`le-panel${closing ? ' le-panel--closing' : ''}`} ref={panelRef}>
      <div className="le-header">
        <span className="le-title" style={{ color: operator.color }}>
          {operator.name}
        </span>
        <span className="le-subtitle">LOADOUT STATS</span>
        <button className="le-close" onClick={startClose}>x</button>
      </div>

      <div className="le-body">
        {/* Operator section */}
        <div className="le-section">
          <div className="le-section-label">OPERATOR</div>
          <StatField label="Level"         value={stats.operatorLevel}     min={1} max={90} onChange={set('operatorLevel')} />
          <StatField label="Basic Attack"  value={stats.basicAttackLevel}  min={1} max={12} onChange={set('basicAttackLevel')} />
          <StatField label="Battle Skill"  value={stats.battleSkillLevel}  min={1} max={12} onChange={set('battleSkillLevel')} />
          <StatField label="Combo Skill"   value={stats.comboSkillLevel}   min={1} max={12} onChange={set('comboSkillLevel')} />
          <StatField label="Ultimate"      value={stats.ultimateLevel}     min={1} max={12} onChange={set('ultimateLevel')} />
        </div>

        {/* Weapon section */}
        {weapon && (
          <div className="le-section">
            <div className="le-section-label">WEAPON</div>
            <div className="le-item-name">{weapon.name}</div>
            <StatField label="Level"   value={stats.weaponLevel}       min={1} max={90} onChange={set('weaponLevel')} />
            <StatField label="Skill 1" value={stats.weaponSkill1Level} min={1} max={5}  onChange={set('weaponSkill1Level')} />
            <StatField label="Skill 2" value={stats.weaponSkill2Level} min={1} max={5}  onChange={set('weaponSkill2Level')} />
            <StatField label="Skill 3" value={stats.weaponSkill3Level} min={1} max={5}  onChange={set('weaponSkill3Level')} />
          </div>
        )}

        {/* Gear section */}
        {(armor || gloves || kit1 || kit2) && (
          <div className="le-section">
            <div className="le-section-label">GEAR</div>
            {armor  && <div className="le-item-name">{armor.name}</div>}
            {gloves && <div className="le-item-name">{gloves.name}</div>}
            {kit1   && <div className="le-item-name">{kit1.name}</div>}
            {kit2   && <div className="le-item-name">{kit2.name}</div>}
            <StatField label="Rank" value={stats.gearRank} min={1} max={4} onChange={set('gearRank')} />
          </div>
        )}

        {/* Items section */}
        {(food || tac) && (
          <div className="le-section">
            <div className="le-section-label">ITEMS</div>
            {food && <div className="le-item-name">{food.name}</div>}
            {tac  && <div className="le-item-name">{tac.name}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
