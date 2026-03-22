import React from 'react';
import { StatType, StatOwnerType, STAT_ATTRIBUTION } from '../../consts/enums';
import { Enemy } from '../../consts/viewTypes';
import { EnemyStats, getDefaultEnemyStats } from '../../controller/appStateController';
import { getModelEnemy, getEnemyLevels } from '../../controller/calculation/enemyRegistry';
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

function EnemyPane({ enemy, stats, onStatsChange, onClose }: {
  enemy: Enemy;
  stats: EnemyStats;
  onStatsChange: (stats: EnemyStats) => void;
  onClose: () => void;
}) {
  const levels = getEnemyLevels(enemy.id);
  const model = getModelEnemy(enemy.id, stats.level);
  const setStat = (key: StatType) => (v: number) => onStatsChange({ ...stats, [key]: v });
  const setMeta = <K extends 'staggerStartValue' | 'staggerNodes' | 'staggerNodeRecoverySeconds'>(key: K) =>
    (v: number) => onStatsChange({ ...stats, [key]: v });

  const handleReset = () => {
    onStatsChange(getDefaultEnemyStats(enemy.id, stats.level));
  };

  const handleLevelChange = (v: number) => {
    const newStats = getDefaultEnemyStats(enemy.id, v);
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
