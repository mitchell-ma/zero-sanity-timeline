import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatType, StatOwnerType, STAT_ATTRIBUTION } from '../../consts/enums';
import { Enemy } from '../../consts/viewTypes';
import { EnemyStats, getBuiltInEnemyStats } from '../../controller/appStateController';
import { getModelEnemy, getEnemyLevels } from '../../controller/calculation/enemyRegistry';
import { ENEMY_TIERS } from '../../utils/enemies';
import { StatField, LevelSelect } from './SharedFields';
import { t } from '../../locales/locale';

const statRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  padding: '1px 0', fontSize: 11,
};
const statLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
};
const statValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', textAlign: 'right',
};

/** Resistance fields derived from STAT_ATTRIBUTION — only stats attributed to ALL or ENEMY. */
const ALL_RESISTANCE_ENTRIES: { stat: StatType; labelKey: string }[] = [
  { stat: StatType.PHYSICAL_RESISTANCE, labelKey: 'enemyPane.label.physicalRES' },
  { stat: StatType.HEAT_RESISTANCE,     labelKey: 'enemyPane.label.heatRES' },
  { stat: StatType.ELECTRIC_RESISTANCE, labelKey: 'enemyPane.label.electricRES' },
  { stat: StatType.CRYO_RESISTANCE,     labelKey: 'enemyPane.label.cryoRES' },
  { stat: StatType.NATURE_RESISTANCE,   labelKey: 'enemyPane.label.natureRES' },
];

const ENEMY_RESISTANCE_FIELDS = ALL_RESISTANCE_ENTRIES.filter(
  ({ stat }) => STAT_ATTRIBUTION[stat].includes(StatOwnerType.ENEMY),
) as { stat: StatType; labelKey: string }[];

// ── Enemy Selector ──────────────────────────────────────────────────────────

function EnemySelector({ enemies, currentEnemy, onSelect }: {
  enemies: Enemy[];
  currentEnemy: Enemy;
  onSelect: (enemyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const tiers = useMemo(() => {
    const present = new Set<string>();
    enemies.forEach((en) => present.add(en.tier));
    return ENEMY_TIERS.filter((tier) => present.has(tier));
  }, [enemies]);

  const filtered = useMemo(() => {
    const lc = search.toLowerCase();
    return enemies
      .filter((en) => {
        if (lc && !en.name.toLowerCase().includes(lc)) return false;
        if (!activeTiers.has(en.tier)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enemies, search, activeTiers]);

  const toggleTier = useCallback((tier: string) => {
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier); else next.add(tier);
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
    setActiveTiers(new Set(tiers));
    setOpen(true);
  }, [open, tiers]);

  const pick = useCallback((id: string) => {
    onSelect(id);
    setOpen(false);
  }, [onSelect]);

  return (
    <div ref={triggerRef} className="loadout-op-selector-wrap">
      <div
        className="loadout-op-selector"
        onClick={handleOpen}
      >
        {currentEnemy.sprite ? (
          <img
            className="loadout-op-selector-splash"
            src={currentEnemy.sprite}
            alt={currentEnemy.name}
          />
        ) : (
          <div className="loadout-op-selector-fallback">
            <span className="loadout-op-selector-name">{currentEnemy.name}</span>
          </div>
        )}
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
              placeholder={t('enemyPane.filter.enemies')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              autoFocus
            />
            {tiers.length > 1 && (
              <div className="loadout-op-filter-rarities">
                {tiers.map((tier) => (
                  <button
                    key={tier}
                    className={`loadout-op-filter-rarity${activeTiers.has(tier) ? ' active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleTier(tier); }}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="loadout-op-selector-scroll">
            {filtered.map((en) => (
              <div
                key={en.id}
                className={`loadout-op-option${en.id === currentEnemy.id ? ' loadout-op-option--selected' : ''}`}
                onClick={() => pick(en.id)}
              >
                {en.sprite && (
                  <img className="loadout-op-option-splash" src={en.sprite} alt={en.name} />
                )}
                <div className="loadout-op-option-overlay">
                  <span className="loadout-op-option-name">
                    {en.name}
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

function EnemyPane({ enemy, stats, onStatsChange, onResetStats, onClose, allEnemies, onSwapEnemy }: {
  enemy: Enemy;
  stats: EnemyStats;
  onStatsChange: (stats: EnemyStats) => void;
  onResetStats?: () => void;
  onClose: () => void;
  allEnemies?: Enemy[];
  onSwapEnemy?: (enemyId: string) => void;
}) {
  const levels = getEnemyLevels(enemy.id);
  const model = getModelEnemy(enemy.id, stats.level);
  const setStat = (key: StatType) => (v: number) => onStatsChange({ ...stats, [key]: v });
  const setMeta = <K extends 'staggerStartValue' | 'staggerNodes' | 'staggerNodeRecoverySeconds'>(key: K) =>
    (v: number) => onStatsChange({ ...stats, [key]: v });

  const handleReset = () => {
    if (onResetStats) onResetStats();
    else onStatsChange(getBuiltInEnemyStats(enemy.id, stats.level));
  };

  const handleLevelChange = (v: number) => {
    const newStats = getBuiltInEnemyStats(enemy.id, v);
    onStatsChange(newStats);
  };

  const enemyColor = '#cc3333';
  const labelSpan = (text: string) => <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{text}</span>;

  return (
    <>
      <div className="edit-panel-header">
        <div
          style={{
            width: 4, height: 40, borderRadius: 2, flexShrink: 0,
            background: enemyColor,
            boxShadow: `0 0 8px ${enemyColor}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          <div className="edit-panel-skill-name">{enemy.name}</div>
          <div className="edit-panel-op-name" style={{ color: enemyColor }}>
            {enemy.tier}
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· {t('enemyPane.badge')}</span>
          </div>
        </div>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">{t('enemyPane.section.general')}</span>
          {allEnemies && onSwapEnemy && (
            <EnemySelector
              enemies={allEnemies}
              currentEnemy={enemy}
              onSelect={onSwapEnemy}
            />
          )}
          <LevelSelect label={t('enemyPane.label.level')} value={stats.level} options={levels} onChange={handleLevelChange} />
          <StatField label={labelSpan(t('enemyPane.label.hp'))} value={stats[StatType.BASE_HP]} min={0} max={9999999} step={1} holdStep={1000} showMinMax onChange={setStat(StatType.BASE_HP)} />
          {model && (
            <div style={statRowStyle}>
              <span style={statLabelStyle}>{t('enemyPane.label.atk')}</span>
              <span style={statValueStyle}>{model.stats[StatType.BASE_ATTACK] >= 1_000_000 ? model.stats[StatType.BASE_ATTACK].toLocaleString() : model.stats[StatType.BASE_ATTACK]}</span>
            </div>
          )}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">{t('enemyPane.section.defense')}</span>
          <StatField label={labelSpan(t('enemyPane.label.def'))} value={stats[StatType.BASE_DEFENSE]} min={0} max={9999} step={1} holdStep={10} showMinMax onChange={setStat(StatType.BASE_DEFENSE)} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">{t('enemyPane.section.resistance')}</span>
          {ENEMY_RESISTANCE_FIELDS.map(({ stat, labelKey }) => (
            <StatField key={stat} label={labelSpan(t(labelKey))} value={stats[stat]} min={0} max={10} step={0.1} holdStep={1} showMinMax onChange={setStat(stat)} />
          ))}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">{t('enemyPane.section.stagger')}</span>
          <StatField label={labelSpan(t('enemyPane.label.staggerHP'))} value={stats[StatType.STAGGER_HP]} min={0} max={99999} step={1} holdStep={10} showMinMax onChange={setStat(StatType.STAGGER_HP)} />
          <StatField label={labelSpan(t('enemyPane.label.staggerInitialValue'))} value={stats.staggerStartValue ?? 0} min={0} max={stats[StatType.STAGGER_HP]} step={1} holdStep={10} showMinMax onChange={setMeta('staggerStartValue')} />
          <StatField label={labelSpan(t('enemyPane.label.staggerNodes'))} value={stats.staggerNodes} min={0} max={10} showMinMax onChange={setMeta('staggerNodes')} />
          <StatField label={labelSpan(t('enemyPane.label.staggerBreakDuration'))} value={stats[StatType.STAGGER_RECOVERY]} min={0} max={60} step={0.5} showMinMax onChange={setStat(StatType.STAGGER_RECOVERY)} />
          <StatField label={labelSpan(t('enemyPane.label.staggerNodeRecovery'))} value={stats.staggerNodeRecoverySeconds} min={0} max={60} step={0.5} showMinMax onChange={setMeta('staggerNodeRecoverySeconds')} />
        </div>

        <div style={{ marginTop: 'auto', padding: '0.75rem 0 0' }}>
          <button className="enemy-reset-btn" onClick={handleReset} title={t('enemyPane.btn.resetDefaults')}>
            {t('enemyPane.btn.resetDefaults')}
          </button>
        </div>
      </div>
    </>
  );
}

export default EnemyPane;
