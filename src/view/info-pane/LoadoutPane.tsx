import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TimelineEvent, Operator } from '../../consts/viewTypes';
import { StatType, StatOwnerType, InfoLevel } from '../../consts/enums';
import { NounType } from '../../dsl/semantics';
import { OperatorLoadoutState } from '../OperatorLoadoutHeader';
import { getStarredOperators, toggleStarredOperator } from '../../utils/starredOperators';
import {
  getWeaponsByType,
  getGearPiecesByType,
  getGearSet,
  getAllConsumables,
  getAllTacticals,
} from '../../controller/gameDataStore';
import { GearCategory } from '../../consts/enums';
import { LoadoutProperties } from '../InformationPane';
import { StatField } from './SharedFields';
import {
  formatStatValue, formatFlat, formatPct, formatDurationSeconds,
  resolveWeaponBreakdown,
  buildLoadoutBreakdownEntries,
  resolveGearBreakdown,
  resolveGearBonusSummary,
  resolveTactical,
  resolveAggregatedStats,
} from '../../controller/info-pane/loadoutPaneController';
import type { StatSourceEntry } from '../../controller/calculation/loadoutAggregator';
import { TopEntry } from './BreakdownTree';
import { t, tOptional } from '../../locales/locale';
import { LocaleKey } from '../../locales/gameDataLocale';
import {
  getNamedWeaponSkill,
  getWeaponStats, getWeaponIdByName,
  getWeaponEffectDefs,
  getGearPiece, getGearPieceIdByName,
} from '../../controller/gameDataStore';
import { DataCardBody, normalizedDefToData, EffectDefExtraFields, VaryByContext, VaryByLoadout } from '../custom/DataCardComponents';

// ── Stat display labels ─────────────────────────────────────────────────────

/** Locale-key mapping for every StatType. Resolved at call-time via `t()`. */
const STAT_LABEL_KEYS: Record<StatType, string> = {
  [StatType.BASE_HP]: 'stat.BASE_HP',
  [StatType.BASE_DEFENSE]: 'stat.BASE_DEFENSE',
  [StatType.BASE_ATTACK]: 'stat.BASE_ATTACK',
  [StatType.FLAT_ATTACK]: 'stat.FLAT_ATTACK',
  [StatType.ATTACK_BONUS]: 'stat.ATTACK_BONUS',
  [StatType.STRENGTH]: 'stat.STRENGTH',
  [StatType.STRENGTH_BONUS]: 'stat.STRENGTH_BONUS',
  [StatType.AGILITY]: 'stat.AGILITY',
  [StatType.AGILITY_BONUS]: 'stat.AGILITY_BONUS',
  [StatType.INTELLECT]: 'stat.INTELLECT',
  [StatType.INTELLECT_BONUS]: 'stat.INTELLECT_BONUS',
  [StatType.WILL]: 'stat.WILL',
  [StatType.WILL_BONUS]: 'stat.WILL_BONUS',
  [StatType.MAIN_ATTRIBUTE]: 'stat.MAIN_ATTRIBUTE',
  [StatType.SECONDARY_ATTRIBUTE]: 'stat.SECONDARY_ATTRIBUTE',
  [StatType.CRITICAL_RATE]: 'stat.CRITICAL_RATE',
  [StatType.CRITICAL_DAMAGE]: 'stat.CRITICAL_DAMAGE',
  [StatType.ARTS_INTENSITY]: 'stat.ARTS_INTENSITY',
  [StatType.PHYSICAL_RESISTANCE]: 'stat.PHYSICAL_RESISTANCE',
  [StatType.ARTS_RESISTANCE]: 'stat.ARTS_RESISTANCE',
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
  [StatType.FINAL_STRIKE_DAMAGE_BONUS]: 'stat.FINAL_STRIKE_DAMAGE_BONUS',
  [StatType.FINAL_DAMAGE_REDUCTION]: 'stat.FINAL_DAMAGE_REDUCTION',
  [StatType.SKILL_DAMAGE_BONUS]: 'stat.SKILL_DAMAGE_BONUS',
  [StatType.ARTS_DAMAGE_BONUS]: 'stat.ARTS_DAMAGE_BONUS',
  [StatType.HP_BONUS]: 'stat.HP_BONUS',
  [StatType.FLAT_HP]: 'stat.FLAT_HP',
  // ── Damage factor stats ──────────────────────────────────────────────────────
  [StatType.DAMAGE_BONUS]: 'stat.DAMAGE_BONUS',
  [StatType.DAMAGE_TAKEN_BONUS]: 'stat.DAMAGE_TAKEN_BONUS',
  [StatType.PHYSICAL_AMP]: 'stat.PHYSICAL_AMP',
  [StatType.HEAT_AMP]: 'stat.HEAT_AMP',
  [StatType.CRYO_AMP]: 'stat.CRYO_AMP',
  [StatType.NATURE_AMP]: 'stat.NATURE_AMP',
  [StatType.ELECTRIC_AMP]: 'stat.ELECTRIC_AMP',
  [StatType.ARTS_AMP]: 'stat.ARTS_AMP',
  [StatType.HEAT_SUSCEPTIBILITY]: 'stat.HEAT_SUSCEPTIBILITY',
  [StatType.CRYO_SUSCEPTIBILITY]: 'stat.CRYO_SUSCEPTIBILITY',
  [StatType.NATURE_SUSCEPTIBILITY]: 'stat.NATURE_SUSCEPTIBILITY',
  [StatType.ELECTRIC_SUSCEPTIBILITY]: 'stat.ELECTRIC_SUSCEPTIBILITY',
  [StatType.PHYSICAL_SUSCEPTIBILITY]: 'stat.PHYSICAL_SUSCEPTIBILITY',
  [StatType.ARTS_SUSCEPTIBILITY]: 'stat.ARTS_SUSCEPTIBILITY',
  [StatType.PHYSICAL_FRAGILITY]: 'stat.PHYSICAL_FRAGILITY',
  [StatType.HEAT_FRAGILITY]: 'stat.HEAT_FRAGILITY',
  [StatType.CRYO_FRAGILITY]: 'stat.CRYO_FRAGILITY',
  [StatType.NATURE_FRAGILITY]: 'stat.NATURE_FRAGILITY',
  [StatType.ELECTRIC_FRAGILITY]: 'stat.ELECTRIC_FRAGILITY',
  [StatType.ARTS_FRAGILITY]: 'stat.ARTS_FRAGILITY',
  [StatType.PHYSICAL_RESISTANCE_IGNORE]: 'stat.PHYSICAL_RESISTANCE_IGNORE',
  [StatType.HEAT_RESISTANCE_IGNORE]: 'stat.HEAT_RESISTANCE_IGNORE',
  [StatType.CRYO_RESISTANCE_IGNORE]: 'stat.CRYO_RESISTANCE_IGNORE',
  [StatType.NATURE_RESISTANCE_IGNORE]: 'stat.NATURE_RESISTANCE_IGNORE',
  [StatType.ELECTRIC_RESISTANCE_IGNORE]: 'stat.ELECTRIC_RESISTANCE_IGNORE',
  [StatType.ARTS_RESISTANCE_IGNORE]: 'stat.ARTS_RESISTANCE_IGNORE',
  [StatType.PHYSICAL_RESISTANCE_REDUCTION]: 'stat.PHYSICAL_RESISTANCE_REDUCTION',
  [StatType.HEAT_RESISTANCE_REDUCTION]: 'stat.HEAT_RESISTANCE_REDUCTION',
  [StatType.CRYO_RESISTANCE_REDUCTION]: 'stat.CRYO_RESISTANCE_REDUCTION',
  [StatType.NATURE_RESISTANCE_REDUCTION]: 'stat.NATURE_RESISTANCE_REDUCTION',
  [StatType.ELECTRIC_RESISTANCE_REDUCTION]: 'stat.ELECTRIC_RESISTANCE_REDUCTION',
  [StatType.ARTS_RESISTANCE_REDUCTION]: 'stat.ARTS_RESISTANCE_REDUCTION',
  // ── Enemy stats ──────────────────────────────────────────────────────────────
  [StatType.STAGGER_HP]: 'stat.STAGGER_HP',
  [StatType.STAGGER_RECOVERY]: 'stat.STAGGER_RECOVERY',
  [StatType.FINISHER_ATK_MULTIPLIER]: 'stat.FINISHER_ATK_MULTIPLIER',
  [StatType.FINISHER_SP_GAIN]: 'stat.FINISHER_SP_GAIN',
  [StatType.ATTACK_RANGE]: 'stat.ATTACK_RANGE',
  [StatType.WEIGHT]: 'stat.WEIGHT',
  [StatType.WEAKNESS]: 'stat.WEAKNESS',
  [StatType.SHIELD]: 'stat.SHIELD',
  [StatType.SLOW]: 'stat.SLOW',
  [StatType.STAGGER_FRAILTY]: 'stat.STAGGER_FRAILTY',
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
              placeholder={t('loadoutPane.filter.operators')}
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
  id: string;
  name: string;
  icon?: string;
  rarity: number;
}

function ItemSelector({ entries, selectedId, onSelect, placeholder }: {
  entries: readonly SelectorEntry[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeRarities, setActiveRarities] = useState<Set<number>>(new Set());
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => selectedId ? entries.find((e) => e.id === selectedId) ?? null : null,
    [entries, selectedId],
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

  const pick = useCallback((id: string | null) => {
    onSelect(id);
    setOpen(false);
  }, [onSelect]);

  return (
    <div ref={triggerRef} className="loadout-item-selector-wrap">
      <div className="loadout-item-trigger" onClick={handleOpen}>
        <span className="loadout-item-trigger-name" style={!selected ? { color: 'var(--text-muted)' } : undefined}>{selected?.name ?? t('loadoutPane.none')}</span>
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
              placeholder={t('loadoutPane.filterItem', { item: placeholder })}
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
              className={`loadout-item-option${selectedId === null ? ' loadout-item-option--selected' : ''}`}
              onClick={() => pick(null)}
            >
              <span className="loadout-item-option-name" style={{ color: 'var(--text-muted)' }}>{t('loadoutPane.none')}</span>
            </div>
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className={`loadout-item-option${entry.id === selectedId ? ' loadout-item-option--selected' : ''}`}
                onClick={() => pick(entry.id)}
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

  // Single VARY_BY loadout for every descendant DataCardBody (talent cards,
  // weapon detail cards, gear detail cards). Each card's VARY_BY tables read
  // this through the context and highlight the active level column.
  const varyByLoadout: VaryByLoadout = {
    skillLevel: stats.skills.battleSkillLevel,
    potential: stats.operator.potential,
    talentOneLevel: stats.operator.talentOneLevel,
    talentTwoLevel: stats.operator.talentTwoLevel,
    attributeIncreaseLevel: stats.operator.attributeIncreaseLevel,
  };

  return (
    <VaryByContext.Provider value={varyByLoadout}>
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
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{t('loadoutPane.subtitle.loadout')}</span>
          </div>
        </div>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">{t('dsl.subject.OPERATOR')}</span>
          {allOperators && onSelectOperator && (
            <OperatorSelector
              operators={allOperators}
              currentOperator={operator}
              onSelect={onSelectOperator}
            />
          )}
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{t('loadoutPane.label.operatorLevel')}</span>} value={stats.operator.level} min={1} max={90} holdSnaps={[1, 10, 20, 30, 40, 50, 60, 70, 80, 90]} showMinMax onChange={setOperator('level')} />
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{t('loadoutPane.label.potential')}</span>} value={stats.operator.potential} min={0} max={5} showMinMax onChange={setOperator('potential')} />
          {verbose >= InfoLevel.DETAILED &&operator.potentialDescriptions && stats.operator.potential > 0 && operator.potentialDescriptions.slice(0, stats.operator.potential).map((desc, i) => (
            <div key={i} style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px' }}>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginRight: 4 }}>P{i + 1}</span>
              {desc}
            </div>
          ))}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">{t('loadoutPane.section.talents')}</span>
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{t('loadoutPane.label.attributeIncrease')}</span>} value={stats.operator.attributeIncreaseLevel} min={0} max={operator.maxAttributeIncreaseLevel} showMinMax onChange={setOperator('attributeIncreaseLevel')} />
          {verbose >= InfoLevel.DETAILED &&stats.operator.attributeIncreaseLevel > 0 && (
            <>
              <div style={{ fontSize: DESC_FONT_SIZE, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', padding: '2px 6px 0' }}>{operator.attributeIncreaseName}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, lineHeight: 1.4, padding: '2px 6px 4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{getStatLabel(operator.attributeIncreaseAttribute as StatType)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>+{[0, 10, 15, 15, 20][stats.operator.attributeIncreaseLevel]} <span style={{ color: 'var(--text-muted)' }}>(+{[0, 10, 25, 40, 60][stats.operator.attributeIncreaseLevel]} {t('loadoutPane.label.totalSuffix')})</span></span>
              </div>
            </>
          )}
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{t('loadoutPane.label.talent', { n: 1 })}</span>} value={stats.operator.talentOneLevel} min={0} max={operator.maxTalentOneLevel} showMinMax onChange={setOperator('talentOneLevel')} />
          {verbose >= InfoLevel.DETAILED &&stats.operator.talentOneLevel > 0 && operator.talentDescriptions?.[1]?.length && (
            <>
              <div style={{ fontSize: DESC_FONT_SIZE, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', padding: '2px 6px 0' }}>{operator.talentOneName}</div>
              <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px 4px' }}>
                {operator.talentDescriptions[1][Math.min(stats.operator.talentOneLevel - 1, operator.talentDescriptions[1].length - 1)]}
              </div>
            </>
          )}
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{t('loadoutPane.label.talent', { n: 2 })}</span>} value={stats.operator.talentTwoLevel} min={0} max={operator.maxTalentTwoLevel} showMinMax onChange={setOperator('talentTwoLevel')} />
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
          <span className="edit-section-label">{t('loadoutPane.section.skills')}</span>
          {([NounType.BASIC_ATTACK, NounType.BATTLE, NounType.COMBO, NounType.ULTIMATE] as const).map((skillType) => {
            const skill = operator.skills[skillType];
            const levelKey = ({ [NounType.BASIC_ATTACK]: 'basicAttackLevel', [NounType.BATTLE]: 'battleSkillLevel', [NounType.COMBO]: 'comboSkillLevel', [NounType.ULTIMATE]: 'ultimateLevel' } as const)[skillType];
            const labelText = ({ [NounType.BASIC_ATTACK]: t('loadoutPane.skill.basicAttack'), [NounType.BATTLE]: t('loadoutPane.skill.battleSkill'), [NounType.COMBO]: t('loadoutPane.skill.comboSkill'), [NounType.ULTIMATE]: t('loadoutPane.skill.ultimateSkill') })[skillType];
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
                {verbose >= InfoLevel.DETAILED && skill?.description && (
                  <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px 4px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{
                      // skill.name holds the skill ID (e.g. DOLLY_RUSH); resolve to
                      // the locale-backed display name. Fall back to a prettified
                      // ID only when the locale has no entry (shouldn't happen for
                      // shipped operators).
                      tOptional(`${LocaleKey.operatorSkill(operator.id, skill.name)}.event.name`)
                        ?? skill.name.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
                    }</div>
                    {skill.description}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">{t('loadoutPane.section.weapon')}</span>
          {onLoadoutChange && (
            <ItemSelector
              entries={compatibleWeapons}
              selectedId={loadout.weaponId}
              onSelect={(id) => setLoadoutField('weaponId', id)}
              placeholder={t('loadoutPane.placeholder.weapon')}
            />
          )}
          {weaponData && (
            <>
            <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{t('loadoutPane.label.weaponLevel')}</span>} value={stats.weapon.level} min={1} max={90} holdSnaps={[1, 10, 20, 30, 40, 50, 60, 70, 80, 90]} showMinMax onChange={setWeapon('level')} />
            {weaponData.skills.map((sk) => (
              <StatField
                key={`skill-${sk.index}`}
                label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{t('loadoutPane.skillWithName', { n: sk.index + 1, name: sk.name })}</span>}
                value={[stats.weapon.skill1Level, stats.weapon.skill2Level, stats.weapon.skill3Level][sk.index]}
                min={1} max={9}
                holdSnaps={[1, 3, 6, 9]}
                showMinMax
                onChange={setWeapon((['skill1Level', 'skill2Level', 'skill3Level'] as const)[sk.index])}
              />
            ))}
            <div style={{ ...statRowStyle, marginTop: 4 }}>
              <span style={statLabelStyle}>{t('stat.BASE_ATTACK')}</span>
              <span style={statValueStyle}>{formatFlat(weaponData.baseAtk)}</span>
            </div>
            {weaponData.statContributions.map((c) => (
              <div key={`stat-${c.skillIndex}`} style={statRowStyle}>
                <span style={statLabelStyle}>{t('loadoutPane.skillLabel', { n: c.skillIndex + 1 })}: {getStatLabel(c.stat as StatType)}</span>
                <span style={statValueStyle}>{formatStatValue(c.stat, c.value)}</span>
              </div>
            ))}
            {weaponData.passiveStats.map((p) => (
              <div key={`stat-${p.skillIndex}-${p.stat}`} style={statRowStyle}>
                <span style={statLabelStyle}>{t('loadoutPane.skillLabel', { n: p.skillIndex + 1 })}: {getStatLabel(p.stat as StatType)}</span>
                <span style={statValueStyle}>{formatStatValue(p.stat, p.value)}</span>
              </div>
            ))}
            {weaponData.effects.map((eff, ei) => (
              <React.Fragment key={`eff-${ei}`}>
                <div style={{ ...statRowStyle, marginTop: ei === 0 ? 4 : 8 }}>
                  <span style={statLabelStyle}>{t('loadoutPane.skillLabel', { n: 3 })}: {eff.label}</span>
                </div>
                {verbose >= InfoLevel.DETAILED &&eff.description && (
                  <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 2, marginTop: -1 }}>
                    {eff.description}
                  </div>
                )}
                {eff.secondaryAttrBonus && (
                  <div style={statRowStyle}>
                    <span style={statLabelStyle}>{t('loadoutPane.secondaryAttrPct', { label: getStatLabel(eff.secondaryAttrBonus.label as StatType) })}</span>
                    <span style={statValueStyle}>{formatPct(eff.secondaryAttrBonus.value)}</span>
                  </div>
                )}
                {eff.buffs.map((b, bi) => (
                  <div key={`eff-${ei}-${bi}`} style={statRowStyle}>
                    <span style={statLabelStyle}>{getStatLabel(b.statLabel as StatType)} ({formatDurationSeconds(eff.durationSeconds)})</span>
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
          {verbose >= InfoLevel.DETAILED && loadout.weaponId && (
            <WeaponDetailCards weaponName={loadout.weaponId} />
          )}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">{t('loadoutPane.section.gear')}</span>
          {gearData?.setActive && gearData.setName && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>
                {t('loadoutPane.label.set')}: {gearData.setName}
              </div>
              {verbose >= InfoLevel.DETAILED && gearData.setDescription && (
                <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                  {gearData.setDescription}
                </div>
              )}
            </div>
          )}
          {([
            { gearCategory: GearCategory.ARMOR, loadoutKey: 'armorId' as const, ranksKey: 'armorRanks' as const, label: t('loadoutPane.gear.armor') },
            { gearCategory: GearCategory.GLOVES, loadoutKey: 'glovesId' as const, ranksKey: 'glovesRanks' as const, label: t('loadoutPane.gear.gloves') },
            { gearCategory: GearCategory.KIT, loadoutKey: 'kit1Id' as const, ranksKey: 'kit1Ranks' as const, label: t('loadoutPane.gear.kit1') },
            { gearCategory: GearCategory.KIT, loadoutKey: 'kit2Id' as const, ranksKey: 'kit2Ranks' as const, label: t('loadoutPane.gear.kit2') },
          ] as const).map(({ gearCategory, loadoutKey, ranksKey, label }, i) => {
            const piece = gearData?.pieces.find((p) => p.ranksKey === ranksKey);
            const gearEntries: SelectorEntry[] = getGearPiecesByType(gearCategory).map((gp) => ({
              id: gp.id,
              name: gp.name,
              icon: gp.icon,
              rarity: getGearSet(gp.gearSet)?.rarity ?? 5,
            }));
            return (
              <React.Fragment key={ranksKey}>
                {i > 0 && <div style={{ marginTop: 10, borderTop: '1px solid var(--border-dim)', width: '60%', marginLeft: 'auto', marginRight: 'auto' }} />}
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', marginTop: i > 0 ? 4 : 0 }}>{label}</div>
                {onLoadoutChange && (
                  <ItemSelector
                    entries={gearEntries}
                    selectedId={loadout[loadoutKey]}
                    onSelect={(id) => setLoadoutField(loadoutKey, id)}
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
                    {verbose >= InfoLevel.DETAILED && (
                      <GearPieceDetailCard pieceId={loadout[loadoutKey]} />
                    )}
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
                <span style={statLabelStyle}>{t('stat.BASE_DEFENSE')}</span>
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
          <span className="edit-section-label">{t('loadoutPane.section.consumable')}</span>
          {onLoadoutChange && (
            <ItemSelector
              entries={getAllConsumables()}
              selectedId={loadout.consumableId}
              onSelect={(id) => setLoadoutField('consumableId', id)}
              placeholder={t('loadoutPane.placeholder.consumable')}
            />
          )}
          {foodName && !onLoadoutChange && <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{foodName}</div>}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">{t('loadoutPane.section.tactical')}</span>
          {onLoadoutChange && (
            <ItemSelector
              entries={getAllTacticals()}
              selectedId={loadout.tacticalId}
              onSelect={(id) => setLoadoutField('tacticalId', id)}
              placeholder={t('loadoutPane.placeholder.tactical')}
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
    </VaryByContext.Provider>
  );
}

function AggregatedStatsSection({ operatorId, loadout, stats, color, verbose }: {
  operatorId: string; loadout: OperatorLoadoutState; stats: LoadoutProperties; color: string; verbose: InfoLevel;
}) {
  const data = resolveAggregatedStats(operatorId, loadout, stats, StatOwnerType.OPERATOR);
  if (!data) return null;

  const { agg } = data;
  const showBreakdowns = verbose >= InfoLevel.DETAILED;
  const mainEntries = buildLoadoutBreakdownEntries(agg);

  return (
    <>
      <div className="edit-panel-section">
        <span className="edit-section-label">{t('loadoutPane.section.mainStats')}</span>
        <div className="dmg-tree">
          {mainEntries.map((entry) => (
            <TopEntry key={entry.label} entry={showBreakdowns ? entry : { ...entry, subEntries: undefined }} />
          ))}
        </div>
      </div>

      <div className="edit-panel-section">
        <span className="edit-section-label">{t('loadoutPane.section.attributes')}</span>
        <div className="dmg-tree">
          {data.attributes.map((a) => (
            <StatWithSources
              key={a.stat}
              stat={a.stat}
              value={a.isZero ? undefined : a.value}
              sources={showBreakdowns ? agg.statSources[a.stat] : undefined}
            />
          ))}
        </div>
      </div>

      <div className="edit-panel-section">
        <span className="edit-section-label">{t('loadoutPane.section.otherStats')}</span>
        <div className="dmg-tree">
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
      </div>
    </>
  );
}

// ── Stat with permanent source breakdown (tree structure) ───────────────────

function StatWithSources({ stat, value, displayValue, sources }: {
  stat: StatType;
  value?: number;
  displayValue?: string;
  sources?: StatSourceEntry[];
}) {
  const isZero = value == null;
  const subEntries = !isZero && sources && sources.length > 0
    ? sources
      .filter((s) => Math.abs(s.value) > 0.00001)
      .map((s) => ({
        label: s.source,
        value: s.value,
        format: 'flat' as const,
        source: '',
        formattedValue: formatStatValue(stat, s.value),
        cssClass: '',
      }))
    : undefined;

  const entry = {
    label: getStatLabel(stat),
    value: value ?? 0,
    format: 'flat' as const,
    source: '',
    formattedValue: isZero ? '—' : (displayValue ?? formatStatValue(stat, value!)),
    cssClass: isZero ? 'dmg-breakdown-neutral' : '',
    subEntries,
  };

  return <TopEntry entry={entry} />;
}

// ── Detail card sub-components ──────────────────────────────────────────────

function WeaponDetailCards({ weaponName }: { weaponName: string }) {
  const weaponId = getWeaponIdByName(weaponName);
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setOpenCards(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; });

  const cards: { key: string; label: string; data: Record<string, unknown>; extra?: React.ReactNode }[] = [];

  // Weapon skills
  if (weaponId) {
    const namedSkill = getNamedWeaponSkill(weaponId);
    if (namedSkill) {
      cards.push({ key: `named-${weaponId}`, label: namedSkill.name, data: namedSkill.serialize() as Record<string, unknown> });
    }
  }

  // Weapon effect defs
  const dslDefs = getWeaponEffectDefs(weaponName);
  for (const def of dslDefs) {
    cards.push({ key: `eff-${def.id}`, label: def.label ?? def.name ?? def.id, data: normalizedDefToData(def), extra: <EffectDefExtraFields def={def} /> });
  }

  // Weapon statuses
  if (weaponId) {
    for (const ws of getWeaponStats(weaponId)) {
      cards.push({ key: `ws-${ws.id}`, label: ws.name, data: ws.serialize() as Record<string, unknown> });
    }
  }

  if (cards.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {cards.map((card, i) => {
        const isOpen = openCards.has(i);
        return (
          <div key={card.key} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
            <div className="ops-skill-card-header" onClick={() => toggle(i)}>
              <div className="ops-skill-card-header-content">
                <div className="ops-skill-card-title-row">
                  <span className="ops-skill-card-name">{card.label}</span>
                  <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                </div>
              </div>
            </div>
            {isOpen && <DataCardBody data={card.data} extraFields={card.extra} />}
          </div>
        );
      })}
    </div>
  );
}

function GearPieceDetailCard({ pieceId }: { pieceId: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const piece = pieceId ? getGearPiece(pieceId) ?? getGearPiece(getGearPieceIdByName(pieceId) ?? '') : undefined;
  if (!piece) return null;

  return (
    <div className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`} style={{ marginTop: 4 }}>
      <div className="ops-skill-card-header" onClick={() => setIsOpen(prev => !prev)}>
        <div className="ops-skill-card-header-content">
          <div className="ops-skill-card-title-row">
            <span className="ops-skill-card-name">{t('loadoutPane.skill.details')}</span>
            <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
          </div>
        </div>
      </div>
      {isOpen && <DataCardBody data={piece.serialize() as Record<string, unknown>} />}
    </div>
  );
}

export default LoadoutPane;
