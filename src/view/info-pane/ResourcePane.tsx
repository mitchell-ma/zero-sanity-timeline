import React from 'react';
import { ResourceConfig } from '../../consts/viewTypes';
import { StatField } from './SharedFields';

interface ResourcePaneProps {
  label: string;
  color: string;
  config: ResourceConfig;
  onChange: (config: ResourceConfig) => void;
  onClose: () => void;
}

function ResourcePane({ label, color, config, onChange, onClose }: ResourcePaneProps) {
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
            RESOURCE
          </div>
        </div>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">Parameters</span>
          <StatField
            label="Starting Value"
            value={config.startValue}
            min={0}
            max={config.max}
            onChange={(v) => onChange({ ...config, startValue: v })}
          />
          <StatField
            label="Max Limit"
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
            label="Regen / sec"
            value={config.regenPerSecond}
            min={0}
            max={9999}
            step={0.5}
            onChange={(v) => onChange({ ...config, regenPerSecond: v })}
          />
        </div>
      </div>
    </>
  );
}

export default ResourcePane;
