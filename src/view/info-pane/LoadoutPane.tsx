import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TimelineEvent, Operator } from '../../consts/viewTypes';
import { StatType, StatOwnerType, InfoLevel } from '../../consts/enums';
import { fmtN } from '../../utils/timeline';
import { OperatorLoadoutState } from '../OperatorLoadoutHeader';
import { getStarredOperators, toggleStarredOperator } from '../../utils/starredOperators';
import {
  getWeaponsByType,
  getGearPiecesByType,
  getGearSetEffect,
  getAllConsumableEntries,
  getAllTacticalEntries,
} from '../../controller/gameDataStore';
import { GearCategory } from '../../consts/enums';
import { LoadoutProperties } from '../InformationPane';
import { StatField } from './SharedFields';
import {
  formatStatValue,
  resolveWeaponBreakdown,
  resolveGearBreakdown,
  resolveGearBonusSummary,
  resolveTactical,
  resolveAggregatedStats,
} from '../../controller/info-pane/loadoutPaneController';
import type { StatSourceEntry } from '../../controller/calculation/loadoutAggregator';
import { t } from '../../locales/locale';

// ── Stat display labels ─────────────────────────────────────────────────────

/** Locale-key mapping for every StatType. Resolved at call-time via `t()`. */
const STAT_LABEL_KEYS: Record<StatType, string> = {
  [StatType.BASE_HP]: 'stat.BASE_HP',
  [StatType.BASE_DEFENSE]: 'stat.BASE_DEFENSE',
  [StatType.BASE_ATTACK]: 'stat.BASE_ATTACK',
  [StatType.ATTACK_BONUS]: 'stat.ATTACK_BONUS',
  [StatType.STRENGTH]: 'stat.STRENGTH',
  [StatType.STRENGTH_BONUS]: 'stat.STRENGTH_BONUS',
  [StatType.AGILITY]: 'stat.AGILITY',
  [StatType.AGILITY_BONUS]: 'stat.AGILITY_BONUS',
  [StatType.INTELLECT]: 'stat.INTELLECT',
  [StatType.INTELLECT_BONUS]: 'stat.INTELLECT_BONUS',
  [StatType.WILL]: 'stat.WILL',
  [StatType.WILL_BONUS]: 'stat.WILL_BONUS',
  [StatType.CRITICAL_RATE]: 'stat.CRITICAL_RATE',
  [StatType.CRITICAL_DAMAGE]: 'stat.CRITICAL_DAMAGE',
  [StatType.ARTS_INTENSITY]: 'stat.ARTS_INTENSITY',
  [StatType.PHYSICAL_RESISTANCE]: 'stat.PHYSICAL_RESISTANCE',
  [StatType.HEAT_RESISTANCE]: 'stat.HEAT_RESISTANCE',
  [StatType.ELECTRIC_RESISTANCE]: 'stat.ELECTRIC_RESISTANCE',
  [StatType.CRYO_RESISTANCE]: 'stat.CRYO_RESISTANCE',
  [StatType.NATURE_RESISTANCE]: 'stat.NATURE_RESISTANCE',
  [StatType.AETHER_RESISTANCE]: 'stat.AETHER_RESISTANCE',
  [StatType.TREATMENT_BONUS]: 'stat.TREATMENT_BONUS',
  [StatType.TREATMENT_RECEIVED_BONUS]: 'stat.TREATMENT_RECEIVED_BONUS',
  [StatType.COMBO_SKILL_COOLDOWN_REDUCTION]: 'stat.COMBO_SKILL_COOLDOWN_REDUCTION',
  [StatType.ULTIMATE_GAIN_EFFICIENCY]: 'stat.ULTIMATE_GAIN_EFFICIENCY',
  [StatType.STAGGER_EFFICIENCY_BONUS]: 'stat.STAGGER_EFFICIENCY_BONUS',
  [StatType.PHYSICAL_DAMAGE_BONUS]: 'stat.PHYSICAL_DAMAGE_BONUS',
  [StatType.HEAT_DAMAGE_BONUS]: 'stat.HEAT_DAMAGE_BONUS',
  [StatType.ELECTRIC_DAMAGE_BONUS]: 'stat.ELECTRIC_DAMAGE_BONUS',
  [StatType.CRYO_DAMAGE_BONUS]: 'stat.CRYO_DAMAGE_BONUS',
  [StatType.NATURE_DAMAGE_BONUS]: 'stat.NATURE_DAMAGE_BONUS',
  [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 'stat.BASIC_ATTACK_DAMAGE_BONUS',
  [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 'stat.BATTLE_SKILL_DAMAGE_BONUS',
  [StatType.COMBO_SKILL_DAMAGE_BONUS]: 'stat.COMBO_SKILL_DAMAGE_BONUS',
  [StatType.ULTIMATE_DAMAGE_BONUS]: 'stat.ULTIMATE_DAMAGE_BONUS',
  [StatType.STAGGER_DAMAGE_BONUS]: 'stat.STAGGER_DAMAGE_BONUS',
  [StatType.FINAL_DAMAGE_REDUCTION]: 'stat.FINAL_DAMAGE_REDUCTION',
  [StatType.SKILL_DAMAGE_BONUS]: 'stat.SKILL_DAMAGE_BONUS',
  [StatType.ARTS_DAMAGE_BONUS]: 'stat.ARTS_DAMAGE_BONUS',
  [StatType.HP_BONUS]: 'stat.HP_BONUS',
  [StatType.FLAT_HP]: 'stat.FLAT_HP',
  // ── Enemy stats ──────────────────────────────────────────────────────────────
  [StatType.STAGGER_HP]: 'stat.STAGGER_HP',
  [StatType.STAGGER_RECOVERY]: 'stat.STAGGER_RECOVERY',
  [StatType.FINISHER_ATK_MULTIPLIER]: 'stat.FINISHER_ATK_MULTIPLIER',
  [StatType.FINISHER_SP_GAIN]: 'stat.FINISHER_SP_GAIN',
  [StatType.ATTACK_RANGE]: 'stat.ATTACK_RANGE',
  [StatType.WEIGHT]: 'stat.WEIGHT',
};

function getStatLabel(stat: StatType) {
  return t(STAT_LABEL_KEYS[stat]);
}

const DESC_FONT_SIZE = 14;

const statRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  padding: '1px 0', fontSize: 13,
};
const statLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
};
const statValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', textAlign: 'right',
};

// ── Operator Selector ────────────────────────────────────────────────────────

function OperatorSelector({ operators, currentOperator, onSelect }: {
  operators: Operator[];
  currentOperator: Operator;
  onSelect: (operatorId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeRarities, setActiveRarities] = useState<Set<number>>(new Set());
  const [starred, setStarred] = useState<Set<string>>(() => getStarredOperators());
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const rarities = useMemo(() => {
    const s = new Set<number>();
    operators.forEach((op) => s.add(op.rarity));
    return Array.from(s).sort((a, b) => a - b);
  }, [operators]);

  const filtered = useMemo(() => {
    const lc = search.toLowerCase();
    return operators
      .filter((op) => {
        if (lc && !op.name.toLowerCase().includes(lc)) return false;
        if (!activeRarities.has(op.rarity)) return false;
        return true;
      })
      .sort((a, b) => {
        const aStarred = starred.has(a.id);
        const bStarred = starred.has(b.id);
        if (aStarred !== bStarred) return aStarred ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [operators, search, activeRarities, starred]);

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
    setSearch('');
    setActiveRarities(new Set(rarities));
    setOpen(true);
  }, [open, rarities]);

  const pick = useCallback((id: string | null) => {
    onSelect(id);
    setOpen(false);
  }, [onSelect]);

  const handleToggleStar = useCallback((e: React.MouseEvent, opId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setStarred(toggleStarredOperator(opId));
  }, []);

  return (
    <div ref={triggerRef} className="loadout-op-selector-wrap">
      <div
        className="loadout-op-selector"
        onClick={handleOpen}
      >
        {currentOperator.splash ? (
          <img
            className="loadout-op-selector-splash"
            src={currentOperator.splash}
            alt={currentOperator.name}
          />
        ) : (
          <div className="loadout-op-selector-fallback">
            <span className="loadout-op-selector-name">{currentOperator.name}</span>
          </div>
        )}
        <div className="loadout-op-selector-fade" style={{ background: `linear-gradient(to right, transparent 60%, ${currentOperator.color}40)` }} />
      </div>
      {open && (
        <div
          ref={menuRef}
          className="loadout-op-selector-menu"
        >
          <div className="loadout-op-filter">
            <input
              className="loadout-op-filter-input"
              type="text"
              placeholder="Filter Operators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              autoFocus
            />
            <div className="loadout-op-filter-rarities">
              {rarities.map((r) => (
                <button
                  key={r}
                  className={`loadout-op-filter-rarity${activeRarities.has(r) ? ' active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleRarity(r); }}
                >
                  {r} ★
                </button>
              ))}
            </div>
          </div>
          <div className="loadout-op-selector-scroll">
            {filtered.map((op) => (
              <div
                key={op.id}
                className={`loadout-op-option${op.name === currentOperator.name ? ' loadout-op-option--selected' : ''}`}
                onClick={() => pick(op.id)}
              >
                {op.splash && (
                  <img className="loadout-op-option-splash" src={op.splash} alt={op.name} />
                )}
                <div className="loadout-op-option-overlay">
                  <span
                    className={`lo-star${starred.has(op.id) ? ' lo-star--active' : ''}`}
                    onMouseDown={(e) => handleToggleStar(e, op.id)}
                  >
                    {starred.has(op.id) ? '\u2605' : '\u2606'}
                  </span>
                  <span className="loadout-op-option-name" style={{ color: op.color }}>
                    {op.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Item Selector (weapon/gear/consumable/tactical) ──────────────────────────

interface SelectorEntry {
  name: string;
  icon?: string;
  rarity: number;
}

function ItemSelector({ entries, selectedName, onSelect, placeholder }: {
  entries: readonly SelectorEntry[];
  selectedName: string | null;
  onSelect: (name: string | null) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeRarities, setActiveRarities] = useState<Set<number>>(new Set());
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => selectedName ? entries.find((e) => e.name === selectedName) ?? null : null,
    [entries, selectedName],
  );

  const rarities = useMemo(() => {
    const s = new Set<number>();
    entries.forEach((e) => s.add(e.rarity));
    return Array.from(s).sort((a, b) => a - b);
  }, [entries]);

  const filtered = useMemo(() => {
    const lc = search.toLowerCase();
    return entries
      .filter((e) => {
        if (lc && !e.name.toLowerCase().includes(lc)) return false;
        if (!activeRarities.has(e.rarity)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
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
    setSearch('');
    setActiveRarities(new Set(rarities));
    setOpen(true);
  }, [open, rarities]);

  const pick = useCallback((name: string | null) => {
    onSelect(name);
    setOpen(false);
  }, [onSelect]);

  return (
    <div ref={triggerRef} className="loadout-item-selector-wrap">
      <div className="loadout-item-trigger" onClick={handleOpen}>
        <span className="loadout-item-trigger-name" style={!selected ? { color: 'var(--text-muted)' } : undefined}>{selected?.name ?? 'None'}</span>
        {selected?.icon && (
          <div className="loadout-item-icon-wrap">
            <img className="loadout-item-trigger-icon" src={selected.icon} alt={selected.name} />
          </div>
        )}
      </div>
      {open && (
        <div ref={menuRef} className="loadout-op-selector-menu">
          <div className="loadout-op-filter">
            <input
              className="loadout-op-filter-input"
              type="text"
              placeholder={`Filter ${placeholder}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              autoFocus
            />
            {rarities.length > 1 && (
              <div className="loadout-op-filter-rarities">
                {rarities.map((r) => (
                  <button
                    key={r}
                    className={`loadout-op-filter-rarity${activeRarities.has(r) ? ' active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleRarity(r); }}
                  >
                    {r} ★
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="loadout-op-selector-scroll">
            <div
              className={`loadout-item-option${selectedName === null ? ' loadout-item-option--selected' : ''}`}
              onClick={() => pick(null)}
            >
              <span className="loadout-item-option-name" style={{ color: 'var(--text-muted)' }}>None</span>
            </div>
            {filtered.map((entry) => (
              <div
                key={entry.name}
                className={`loadout-item-option${entry.name === selectedName ? ' loadout-item-option--selected' : ''}`}
                onClick={() => pick(entry.name)}
              >
                <span className="loadout-item-option-name">{entry.name}</span>
                {entry.icon && (
                  <div className="loadout-item-icon-wrap">
                    <img className="loadout-item-option-icon" src={entry.icon} alt={entry.name} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── LoadoutPane ──────────────────────────────────────────────────────────────

interface LoadoutPaneProps {
  operatorId: string;
  slotId: string;
  operator: Operator;
  loadout: OperatorLoadoutState;
  stats: LoadoutProperties;
  onStatsChange: (stats: LoadoutProperties) => void;
  onClose: () => void;
  allProcessedEvents?: readonly TimelineEvent[];
  verbose?: InfoLevel;
  allOperators?: Operator[];
  onSelectOperator?: (operatorId: string | null) => void;
  onLoadoutChange?: (loadout: OperatorLoadoutState) => void;
}

function LoadoutPane({ operatorId, slotId, operator, loadout, stats, onStatsChange, onClose, allProcessedEvents, verbose = InfoLevel.DETAILED, allOperators, onSelectOperator, onLoadoutChange }: LoadoutPaneProps) {
  const setOperator = (key: keyof LoadoutProperties['operator']) => (v: number) =>
    onStatsChange({ ...stats, operator: { ...stats.operator, [key]: v } });
  const setSkill = (key: keyof LoadoutProperties['skills']) => (v: number) =>
    onStatsChange({ ...stats, skills: { ...stats.skills, [key]: v } });
  const setWeapon = (key: keyof LoadoutProperties['weapon']) => (v: number) =>
    onStatsChange({ ...stats, weapon: { ...stats.weapon, [key]: v } });
  const setGear = (ranksKey: keyof LoadoutProperties['gear'], ranks: Record<string, number>) =>
    onStatsChange({ ...stats, gear: { ...stats.gear, [ranksKey]: ranks } });

  const compatibleWeapons = useMemo(
    () => operator.weaponTypes.flatMap((wt) => [...getWeaponsByType(wt)]),
    [operator.weaponTypes],
  );

  const setLoadoutField = useCallback((key: keyof OperatorLoadoutState, value: string | null) => {
    onLoadoutChange?.({ ...loadout, [key]: value });
  }, [loadout, onLoadoutChange]);

  const weaponData = resolveWeaponBreakdown(operatorId, loadout, stats);
  const gearData = resolveGearBreakdown(operatorId, loadout, stats);
  const gearBonus = resolveGearBonusSummary(gearData);
  const { foodName, tactical } = resolveTactical(loadout, stats);

  return (
    <>
      <div className="edit-panel-header">
        <div
          style={{
            width: 4, height: 40, borderRadius: 2, flexShrink: 0,
            background: operator.color,
            boxShadow: `0 0 8px ${operator.color}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          <div className="edit-panel-skill-name">{operator.name}</div>
          <div className="edit-panel-op-name" style={{ color: operator.color }}>
            {operator.role}
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· LOADOUT</span>
          </div>
        </div>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">Operator</span>
          {allOperators && onSelectOperator && (
            <OperatorSelector
              operators={allOperators}
              currentOperator={operator}
              onSelect={onSelectOperator}
            />
          )}
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Operator Level</span>} value={stats.operator.level} min={1} max={90} holdSnaps={[1, 10, 20, 30, 40, 50, 60, 70, 80, 90]} showMinMax onChange={setOperator('level')} />
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Potential</span>} value={stats.operator.potential} min={0} max={5} showMinMax onChange={setOperator('potential')} />
          {verbose >= InfoLevel.DETAILED &&operator.potentialDescriptions && stats.operator.potential > 0 && operator.potentialDescriptions.slice(0, stats.operator.potential).map((desc, i) => (
            <div key={i} style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px' }}>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginRight: 4 }}>P{i + 1}</span>
              {desc}
            </div>
          ))}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Talents</span>
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Attribute Increase</span>} value={stats.operator.attributeIncreaseLevel} min={0} max={operator.maxAttributeIncreaseLevel} showMinMax onChange={setOperator('attributeIncreaseLevel')} />
          {verbose >= InfoLevel.DETAILED &&stats.operator.attributeIncreaseLevel > 0 && (
            <>
              <div style={{ fontSize: DESC_FONT_SIZE, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', padding: '2px 6px 0' }}>{operator.attributeIncreaseName}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, lineHeight: 1.4, padding: '2px 6px 4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{getStatLabel(operator.attributeIncreaseAttribute as StatType)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>+{[0, 10, 15, 15, 20][stats.operator.attributeIncreaseLevel]} <span style={{ color: 'var(--text-muted)' }}>(+{[0, 10, 25, 40, 60][stats.operator.attributeIncreaseLevel]} total)</span></span>
              </div>
            </>
          )}
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Talent 1</span>} value={stats.operator.talentOneLevel} min={0} max={operator.maxTalentOneLevel} showMinMax onChange={setOperator('talentOneLevel')} />
          {verbose >= InfoLevel.DETAILED &&stats.operator.talentOneLevel > 0 && operator.talentDescriptions?.[1]?.length && (
            <>
              <div style={{ fontSize: DESC_FONT_SIZE, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', padding: '2px 6px 0' }}>{operator.talentOneName}</div>
              <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px 4px' }}>
                {operator.talentDescriptions[1][Math.min(stats.operator.talentOneLevel - 1, operator.talentDescriptions[1].length - 1)]}
              </div>
            </>
          )}
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Talent 2</span>} value={stats.operator.talentTwoLevel} min={0} max={operator.maxTalentTwoLevel} showMinMax onChange={setOperator('talentTwoLevel')} />
          {verbose >= InfoLevel.DETAILED &&stats.operator.talentTwoLevel > 0 && operator.talentDescriptions?.[2]?.length && (
            <>
              <div style={{ fontSize: DESC_FONT_SIZE, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', padding: '2px 6px 0' }}>{operator.talentTwoName}</div>
              <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px 4px' }}>
                {operator.talentDescriptions[2][Math.min(stats.operator.talentTwoLevel - 1, operator.talentDescriptions[2].length - 1)]}
              </div>
            </>
          )}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Skills</span>
          {(['basic', 'battle', 'combo', 'ultimate'] as const).map((skillType) => {
            const skill = operator.skills[skillType];
            const levelKey = ({ basic: 'basicAttackLevel', battle: 'battleSkillLevel', combo: 'comboSkillLevel', ultimate: 'ultimateLevel' } as const)[skillType];
            const labelText = ({ basic: 'Basic Attack', battle: 'Battle Skill', combo: 'Combo Skill', ultimate: 'Ultimate Skill' })[skillType];
            return (
              <React.Fragment key={skillType}>
                <StatField
                  label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{labelText}</span>}
                  value={stats.skills[levelKey]}
                  min={1} max={12}
                  holdSnaps={[1, 3, 6, 9, 12]}
                  showMinMax
                  onChange={setSkill(levelKey)}
                />
                {verbose >= InfoLevel.DETAILED &&skill.description && (
                  <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px 4px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{skill.name.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}</div>
                    {skill.description}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Weapon</span>
          {onLoadoutChange && (
            <ItemSelector
              entries={compatibleWeapons}
              selectedName={loadout.weaponId}
              onSelect={(name) => setLoadoutField('weaponId', name)}
              placeholder="Weapon"
            />
          )}
          {weaponData && (
            <>
            <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Weapon Level</span>} value={stats.weapon.level} min={1} max={90} holdSnaps={[1, 10, 20, 30, 40, 50, 60, 70, 80, 90]} showMinMax onChange={setWeapon('level')} />
            {weaponData.skills.map((sk) => (
              <StatField
                key={`skill-${sk.index}`}
                label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Skill {sk.index + 1} ({sk.name})</span>}
                value={[stats.weapon.skill1Level, stats.weapon.skill2Level, stats.weapon.skill3Level][sk.index]}
                min={1} max={9}
                holdSnaps={[1, 3, 6, 9]}
                showMinMax
                onChange={setWeapon((['skill1Level', 'skill2Level', 'skill3Level'] as const)[sk.index])}
              />
            ))}
            <div style={{ ...statRowStyle, marginTop: 4 }}>
              <span style={statLabelStyle}>ATK (Base)</span>
              <span style={statValueStyle}>{fmtN(weaponData.baseAtk)}</span>
            </div>
            {weaponData.statContributions.map((c) => (
              <div key={`stat-${c.skillIndex}`} style={statRowStyle}>
                <span style={statLabelStyle}>Skill {c.skillIndex + 1}: {getStatLabel(c.stat as StatType)}</span>
                <span style={statValueStyle}>{formatStatValue(c.stat, c.value)}</span>
              </div>
            ))}
            {weaponData.passiveStats.map((p) => (
              <div key={`stat-${p.skillIndex}-${p.stat}`} style={statRowStyle}>
                <span style={statLabelStyle}>Skill {p.skillIndex + 1}: {getStatLabel(p.stat as StatType)}</span>
                <span style={statValueStyle}>{formatStatValue(p.stat, p.value)}</span>
              </div>
            ))}
            {weaponData.effects.map((eff, ei) => (
              <React.Fragment key={`eff-${ei}`}>
                <div style={{ ...statRowStyle, marginTop: ei === 0 ? 4 : 8 }}>
                  <span style={statLabelStyle}>Skill 3: {eff.label}</span>
                </div>
                {verbose >= InfoLevel.DETAILED &&eff.description && (
                  <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 2, marginTop: -1 }}>
                    {eff.description}
                  </div>
                )}
                {eff.secondaryAttrBonus && (
                  <div style={statRowStyle}>
                    <span style={statLabelStyle}>Secondary Attr% ({getStatLabel(eff.secondaryAttrBonus.label as StatType)}%)</span>
                    <span style={statValueStyle}>{fmtN(eff.secondaryAttrBonus.value * 100)}%</span>
                  </div>
                )}
                {eff.buffs.map((b, bi) => (
                  <div key={`eff-${ei}-${bi}`} style={statRowStyle}>
                    <span style={statLabelStyle}>{getStatLabel(b.statLabel as StatType)} ({eff.durationSeconds}s)</span>
                    <span style={statValueStyle}>{b.valueStr}{b.perStack ? eff.stackSuffix : ''}</span>
                  </div>
                ))}
                {verbose >= InfoLevel.DETAILED &&eff.metaStr && (
                  <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 2 }}>
                    {eff.metaStr}
                  </div>
                )}
              </React.Fragment>
            ))}
          </>
          )}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Gear</span>
          {gearData?.setActive && gearData.setName && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>
                Set: {gearData.setName}
              </div>
              {verbose >= InfoLevel.DETAILED && gearData.setDescription && (
                <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                  {gearData.setDescription}
                </div>
              )}
            </div>
          )}
          {([
            { gearCategory: GearCategory.ARMOR, loadoutKey: 'armorId' as const, ranksKey: 'armorRanks' as const, label: 'Armor' },
            { gearCategory: GearCategory.GLOVES, loadoutKey: 'glovesId' as const, ranksKey: 'glovesRanks' as const, label: 'Gloves' },
            { gearCategory: GearCategory.KIT, loadoutKey: 'kit1Id' as const, ranksKey: 'kit1Ranks' as const, label: 'Kit 1' },
            { gearCategory: GearCategory.KIT, loadoutKey: 'kit2Id' as const, ranksKey: 'kit2Ranks' as const, label: 'Kit 2' },
          ] as const).map(({ gearCategory, loadoutKey, ranksKey, label }, i) => {
            const piece = gearData?.pieces.find((p) => p.ranksKey === ranksKey);
            const gearEntries: SelectorEntry[] = getGearPiecesByType(gearCategory).map((gp) => ({
              name: gp.name,
              icon: gp.icon,
              rarity: getGearSetEffect(gp.gearSet)?.rarity ?? 5,
            }));
            return (
              <React.Fragment key={ranksKey}>
                {i > 0 && <div style={{ marginTop: 10, borderTop: '1px solid var(--border-dim)', width: '60%', marginLeft: 'auto', marginRight: 'auto' }} />}
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', marginTop: i > 0 ? 4 : 0 }}>{label}</div>
                {onLoadoutChange && (
                  <ItemSelector
                    entries={gearEntries}
                    selectedName={loadout[loadoutKey]}
                    onSelect={(name) => setLoadoutField(loadoutKey, name)}
                    placeholder={label}
                  />
                )}
                {piece && (
                  <>
                    {piece.statKeys.map((statType) => (
                      <StatField
                        key={statType}
                        label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{getStatLabel(statType)}</span>}
                        value={piece.ranks[statType] ?? 4}
                        min={1}
                        max={4}
                        showMinMax
                        onChange={(v) => setGear(ranksKey, { ...piece.ranks, [statType]: v })}
                      />
                    ))}
                    {piece.statKeys.map((statType) => (
                      <div key={`val-${statType}`} style={statRowStyle}>
                        <span style={statLabelStyle}>{getStatLabel(statType)}</span>
                        <span style={statValueStyle}>{formatStatValue(statType, piece.resolvedStats[statType] ?? 0)}</span>
                      </div>
                    ))}
                  </>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {gearBonus && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Gear Bonus</span>
            {gearBonus.totalDefense > 0 && (
              <div style={statRowStyle}>
                <span style={statLabelStyle}>DEF</span>
                <span style={statValueStyle}>{gearBonus.totalDefense.toFixed(0)}</span>
              </div>
            )}
            {gearBonus.stats.map((s) => (
              <div key={s.stat} style={statRowStyle}>
                <span style={statLabelStyle}>{getStatLabel(s.stat as StatType)}</span>
                <span style={statValueStyle}>{formatStatValue(s.stat, s.value)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="edit-panel-section">
          <span className="edit-section-label">Consumable</span>
          {onLoadoutChange && (
            <ItemSelector
              entries={getAllConsumableEntries()}
              selectedName={loadout.consumableId}
              onSelect={(name) => setLoadoutField('consumableId', name)}
              placeholder="Consumable"
            />
          )}
          {foodName && !onLoadoutChange && <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{foodName}</div>}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Tactical</span>
          {onLoadoutChange && (
            <ItemSelector
              entries={getAllTacticalEntries()}
              selectedName={loadout.tacticalId}
              onSelect={(name) => setLoadoutField('tacticalId', name)}
              placeholder="Tactical"
            />
          )}
          {tactical && (
            <>
              {!onLoadoutChange && <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{tactical.name}</div>}
              <StatField
                label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Uses</span>}
                value={tactical.currentMaxUses}
                min={0}
                max={tactical.modelMaxUses}
                showMinMax
                onChange={(v) => onStatsChange({ ...stats, tacticalMaxUses: v })}
              />
            </>
          )}
        </div>

        <AggregatedStatsSection operatorId={operatorId} loadout={loadout} stats={stats} color={operator.color} verbose={verbose} />
      </div>
    </>
  );
}

function AggregatedStatsSection({ operatorId, loadout, stats, color, verbose }: {
  operatorId: string; loadout: OperatorLoadoutState; stats: LoadoutProperties; color: string; verbose: InfoLevel;
}) {
  const data = resolveAggregatedStats(operatorId, loadout, stats, StatOwnerType.OPERATOR);
  if (!data) return null;

  const { agg } = data;
  const hasHpBonus = agg.hpBonus !== 0 || agg.flatHpBonuses !== 0;
  const hasDefSources = agg.statSources[StatType.BASE_DEFENSE] && agg.statSources[StatType.BASE_DEFENSE]!.length > 0;

  const showBreakdowns = verbose >= InfoLevel.DETAILED;

  return (
    <>
      <div className="edit-panel-section">
        <span className="edit-section-label">Main Stats</span>
        {/* ── HP ────────────────────────────────────────────────────────── */}
        <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12 }}>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>HP</span>
          <span style={statValueStyle}>{fmtN(agg.effectiveHp)}</span>
        </div>
        {showBreakdowns && hasHpBonus && (
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Base HP</span>
              <span style={statValueStyle}>{fmtN(agg.operatorBaseHp)}</span>
            </div>
            {agg.hpBonus !== 0 && (
              <div style={statRowStyle}>
                <span style={statLabelStyle}>HP Bonus</span>
                <span style={statValueStyle}>{formatStatValue(StatType.HP_BONUS, agg.hpBonus)} → {fmtN(agg.hpPercentageBonus)}</span>
              </div>
            )}
            {agg.flatHpBonuses !== 0 && (
              <div style={statRowStyle}>
                <span style={statLabelStyle}>Flat HP</span>
                <span style={statValueStyle}>+{fmtN(agg.flatHpBonuses)}</span>
              </div>
            )}
          </div>
        )}
        {/* ── ATK ───────────────────────────────────────────────────────── */}
        <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12, marginTop: 4 }}>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>ATK</span>
          <span style={statValueStyle}>{fmtN(agg.effectiveAttack)}</span>
        </div>
        {showBreakdowns && (
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 13, marginTop: 2 }}>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Base ATK</span>
              <span style={statValueStyle}>{fmtN(agg.baseAttack)}</span>
            </div>
            <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
              <div style={statRowStyle}>
                <span style={statLabelStyle}>Operator</span>
                <span style={statValueStyle}>{fmtN(agg.operatorBaseAttack)}</span>
              </div>
              <div style={statRowStyle}>
                <span style={statLabelStyle}>Weapon</span>
                <span style={statValueStyle}>{fmtN(agg.weaponBaseAttack)}</span>
              </div>
            </div>
            <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 13, marginTop: 2 }}>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>ATK Bonus</span>
              <span style={statValueStyle}>{fmtN(agg.atkPercentageBonus)}</span>
            </div>
            <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
              <div style={statRowStyle}>
                <span style={statLabelStyle}>Percentage Bonus</span>
                <span style={statValueStyle}>{formatStatValue(StatType.ATTACK_BONUS, agg.atkBonus)} → {fmtN(agg.atkPercentageBonus)}</span>
              </div>
            </div>
            <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 13, marginTop: 2 }}>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Attribute Bonus</span>
              <span style={statValueStyle}>{fmtN((agg.displayMainAttributeBonus + agg.displaySecondaryAttributeBonus) * 100)}%</span>
            </div>
            <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
              <div style={statRowStyle}>
                <span style={statLabelStyle}>ATK bonus from {getStatLabel(agg.mainAttributeType)}</span>
                <span style={statValueStyle}>{fmtN(agg.displayMainAttributeBonus * 100)}%</span>
              </div>
              <div style={statRowStyle}>
                <span style={statLabelStyle}>ATK bonus from {getStatLabel(agg.secondaryAttributeType)}</span>
                <span style={statValueStyle}>{fmtN(agg.displaySecondaryAttributeBonus * 100)}%</span>
              </div>
            </div>
          </div>
        )}
        {/* ── DEF ───────────────────────────────────────────────────────── */}
        <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12, marginTop: 4 }}>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Defense</span>
          <span style={{ ...statValueStyle, color: agg.totalDefense === 0 ? 'var(--text-muted)' : undefined }}>{agg.totalDefense > 0 ? agg.totalDefense.toFixed(0) : '—'}</span>
        </div>
        {showBreakdowns && hasDefSources && agg.totalDefense > 0 && (
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            {agg.statSources[StatType.BASE_DEFENSE]!.map((s, i) => (
              <div key={i} style={statRowStyle}>
                <span style={statLabelStyle}>{s.source}</span>
                <span style={statValueStyle}>{s.value.toFixed(0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="edit-panel-section">
        <span className="edit-section-label">Attributes</span>
        {data.attributes.map((a) => (
          <StatWithSources
            key={a.stat}
            stat={a.stat}
            value={a.isZero ? undefined : a.value}
            sources={showBreakdowns ? agg.statSources[a.stat] : undefined}
          />
        ))}
      </div>

      <div className="edit-panel-section">
        <span className="edit-section-label">Other Stats</span>
        {data.otherStats.map((s) => (
          <StatWithSources
            key={s.stat}
            stat={s.stat}
            value={s.isZero ? undefined : s.value}
            displayValue={s.isZero ? undefined : formatStatValue(s.stat, s.value)}
            sources={showBreakdowns ? agg.statSources[s.stat] : undefined}
          />
        ))}
      </div>
    </>
  );
}

// ── Stat with permanent source breakdown (nested | lines like ATK) ───────────

function StatWithSources({ stat, value, displayValue, sources }: {
  stat: StatType;
  value?: number;
  displayValue?: string;
  sources?: StatSourceEntry[];
}) {
  const isZero = value == null;
  const hasSources = sources && sources.length > 0 && !isZero;

  return (
    <>
      <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12, marginTop: 4 }}>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
          {getStatLabel(stat)}
        </span>
        <span style={{ ...statValueStyle, color: isZero ? 'var(--text-muted)' : undefined }}>
          {isZero ? '—' : (displayValue ?? formatStatValue(stat, value!))}
        </span>
      </div>
      {hasSources && (
        <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
          {sources!.map((s, i) => (
            <div key={i} style={statRowStyle}>
              <span style={statLabelStyle}>{s.source}</span>
              <span style={statValueStyle}>{formatStatValue(stat, s.value)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default LoadoutPane;
