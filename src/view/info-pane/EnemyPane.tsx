import React, { useState, useCallback } from 'react';
import { EnemyStatType } from '../../consts/enums';
import { Enemy } from '../../consts/viewTypes';
import { EnemyStats, getDefaultEnemyStats } from '../../controller/appStateController';
import { getModelEnemy, getEnemyLevels } from '../../controller/calculation/enemyRegistry';
import { StatField, LevelSelect } from './SharedFields';

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

const ENEMY_RESISTANCE_FIELDS: { key: keyof EnemyStats; label: string }[] = [
  { key: 'physicalResistance', label: 'Physical RES' },
  { key: 'heatResistance',     label: 'Heat RES' },
  { key: 'electricResistance', label: 'Electric RES' },
  { key: 'cryoResistance',     label: 'Cryo RES' },
  { key: 'natureResistance',   label: 'Nature RES' },
];

function EnemyPane({ enemy, stats, onStatsChange, onClose }: {
  enemy: Enemy;
  stats: EnemyStats;
  onStatsChange: (stats: EnemyStats) => void;
  onClose: () => void;
}) {
  const levels = getEnemyLevels(enemy.id);
  const model = getModelEnemy(enemy.id, stats.level);
  const set = (key: keyof EnemyStats) => (v: number) => onStatsChange({ ...stats, [key]: v });

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
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· ENEMY</span>
          </div>
        </div>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">General</span>
          <LevelSelect label="Level" value={stats.level} options={levels} onChange={handleLevelChange} />
          <StatField label={labelSpan('HP')} value={stats.hp} min={0} max={9999999} step={1} holdStep={1000} showMinMax onChange={set('hp')} />
          {model && (
            <div style={statRowStyle}>
              <span style={statLabelStyle}>ATK</span>
              <span style={statValueStyle}>{model.stats[EnemyStatType.ATK].toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Defense</span>
          <StatField label={labelSpan('DEF')} value={stats.def} min={0} max={9999} step={1} holdStep={10} showMinMax onChange={set('def')} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Resistance</span>
          {ENEMY_RESISTANCE_FIELDS.map(({ key, label }) => (
            <StatField key={key} label={labelSpan(label)} value={stats[key] as number} min={0} max={10} step={0.1} holdStep={1} showMinMax onChange={set(key)} />
          ))}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Stagger</span>
          <StatField label={labelSpan('Stagger HP')} value={stats.staggerHp} min={0} max={99999} step={1} holdStep={10} showMinMax onChange={set('staggerHp')} />
          <StatField label={labelSpan('Initial Value')} value={stats.staggerStartValue ?? 0} min={0} max={stats.staggerHp} step={1} holdStep={10} showMinMax onChange={set('staggerStartValue')} />
          <StatField label={labelSpan('Nodes')} value={stats.staggerNodes} min={0} max={10} showMinMax onChange={set('staggerNodes')} />
          <StatField label={labelSpan('Break Duration (s)')} value={stats.staggerBreakDurationSeconds} min={0} max={60} step={0.5} showMinMax onChange={set('staggerBreakDurationSeconds')} />
          <StatField label={labelSpan('Node Recovery (s)')} value={stats.staggerNodeRecoverySeconds} min={0} max={60} step={0.5} showMinMax onChange={set('staggerNodeRecoverySeconds')} />
        </div>

        <div style={{ marginTop: 'auto', padding: '0.75rem 0 0' }}>
          <button className="enemy-reset-btn" onClick={handleReset} title="Reset to defaults">
            Reset to Defaults
          </button>
        </div>
      </div>
    </>
  );
}

export default EnemyPane;
