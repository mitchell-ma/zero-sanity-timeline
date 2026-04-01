import React from 'react';
import { ResourceConfig } from '../../consts/viewTypes';
import { StatField } from './SharedFields';
import { t } from '../../locales/locale';
import { formatFlat } from '../../controller/info-pane/loadoutPaneController';

interface ResourcePaneProps {
  label: string;
  color: string;
  config: ResourceConfig;
  onChange: (config: ResourceConfig) => void;
  onClose: () => void;
  /** Total resource wasted due to overflow. */
  wasted?: number;
}

function ResourcePane({ label, color, config, onChange, onClose, wasted }: ResourcePaneProps) {
  return (
    <>
      <div className="edit-panel-header">
        <div
          style={{
            width: 4, height: 40, borderRadius: 2, flexShrink: 0,
            background: color,
            boxShadow: `0 0 8px ${color}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          <div className="edit-panel-skill-name">{label}</div>
          <div className="edit-panel-op-name" style={{ color }}>
            {t('resourcePane.badge')}
          </div>
        </div>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">{t('resourcePane.section.parameters')}</span>
          <StatField
            label={t('resourcePane.label.startingValue')}
            value={config.startValue}
            min={0}
            max={config.max}
            onChange={(v) => onChange({ ...config, startValue: v })}
          />
          <StatField
            label={t('resourcePane.label.maxLimit')}
            value={config.max}
            min={1}
            max={99999}
            onChange={(v) => onChange({
              ...config,
              max: v,
              startValue: Math.min(config.startValue, v),
            })}
          />
          <StatField
            label={t('resourcePane.label.regenPerSecond')}
            value={config.regenPerSecond}
            min={0}
            max={9999}
            step={0.5}
            onChange={(v) => onChange({ ...config, regenPerSecond: v })}
          />
        </div>

        {wasted != null && wasted > 0 && (
          <div className="edit-panel-section">
            <span className="edit-section-label">{t('resourcePane.section.summary')}</span>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '2px 6px', fontSize: 13,
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>{t('resourcePane.label.wasted')}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#cc6644' }}>
                {formatFlat(wasted)}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default ResourcePane;
