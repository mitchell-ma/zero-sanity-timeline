import React from 'react';
import { frameToTimeLabelPrecise, fmtN } from '../../utils/timeline';
import type { DamageTableRow } from '../../controller/calculation/damageTableBuilder';
import { buildMultiplierEntries, buildStatusMultiplierEntries, MultiplierEntry } from '../../controller/info-pane/damageBreakdownController';
import { DamageType } from '../../consts/enums';
import type { EventFrameMarker } from '../../consts/viewTypes';
import { t } from '../../locales/locale';

function LeafContent({ entry }: { entry: MultiplierEntry }) {
  return (
    <div className={`dmg-tree-leaf ${entry.cssClass}`}>
      <div className="dmg-tree-left">
        <span className="dmg-tree-label">{entry.label}</span>
        {entry.source && <span className="dmg-tree-source">{entry.source}</span>}
      </div>
      <span className="dmg-tree-value">{entry.formattedValue}</span>
    </div>
  );
}

function ChildNode({ entry, isLast }: { entry: MultiplierEntry; isLast: boolean }) {
  const hasChildren = entry.subEntries && entry.subEntries.length > 0;
  return (
    <div className={`ops-vt-branch${isLast ? '' : ' ops-vt-branch--mid'}`}>
      <LeafContent entry={entry} />
      {hasChildren && (
        <div className="ops-prop-tree-children">
          {entry.subEntries!.map((sub, si) => (
            <ChildNode key={sub.label} entry={sub} isLast={si === entry.subEntries!.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function TopEntry({ entry }: { entry: MultiplierEntry }) {
  const hasChildren = entry.subEntries && entry.subEntries.length > 0;
  return (
    <div className="dmg-tree-entry">
      <div className={`dmg-tree-leaf dmg-tree-leaf--root ${entry.cssClass}`}>
        <div className="dmg-tree-left">
          <span className="dmg-tree-label">{entry.label}</span>
          {entry.source && <span className="dmg-tree-source">{entry.source}</span>}
        </div>
        <span className="dmg-tree-value">{entry.formattedValue}</span>
      </div>
      {hasChildren && (
        <div className="ops-prop-tree-children">
          {entry.subEntries!.map((sub, si) => (
            <ChildNode key={sub.label} entry={sub} isLast={si === entry.subEntries!.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface DamageBreakdownPaneProps {
  row: DamageTableRow;
  frame?: EventFrameMarker;
  onToggleCrit?: (eventUid: string, segIdx: number, frameIdx: number, value: boolean) => void;
}

function DamageBreakdownPane({ row, frame, onToggleCrit }: DamageBreakdownPaneProps) {
  const hasParams = row.params || row.statusParams;
  if (!hasParams) {
    return (
      <>
        <div className="edit-panel-header">
          <div className="edit-panel-skill-name">{row.label}</div>
          <div className="edit-info-text" style={{ marginTop: 8 }}>
            {frameToTimeLabelPrecise(row.absoluteFrame)}
          </div>
        </div>
        <div className="edit-panel-body">
          <div className="edit-panel-section">
            <span className="edit-info-text">{t('damageBreakdown.noData')}</span>
          </div>
        </div>
      </>
    );
  }

  const entries = row.statusParams
    ? buildStatusMultiplierEntries(row.statusParams)
    : buildMultiplierEntries(row.params!, row.foldedFrames);
  const finalDamage = row.damage ?? 0;

  // Split label: "Skill Name > Seg > Tick" → skillName + detail
  const labelParts = row.label.split(' > ');
  const skillName = labelParts[0];
  const detail = labelParts.length > 1 ? labelParts.slice(1).join(' > ') : undefined;

  return (
    <>
      <div className="edit-panel-header" style={{ flexDirection: 'column', gap: '0.125rem' }}>
        <div className="edit-panel-skill-name">{skillName}</div>
        {detail && <div className="edit-info-text">{detail}</div>}
        <div className="edit-info-text">{frameToTimeLabelPrecise(row.absoluteFrame)}</div>
      </div>
      <div className="edit-panel-body">
        <div className="dmg-tree">
          <TopEntry entry={{ label: 'Damage', value: finalDamage, format: 'flat', source: '', formattedValue: Math.round(finalDamage).toLocaleString(), cssClass: '' }} />
          {entries.map((entry) => (
            <TopEntry key={entry.label} entry={entry} />
          ))}
        </div>
        {frame && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Frame</span>
            <div className="edit-info-text">
              {frame.absoluteFrame != null && <div>Time: {frameToTimeLabelPrecise(frame.absoluteFrame)}</div>}
              {frame.damageMultiplier != null && <div>Multiplier: {fmtN(frame.damageMultiplier * 100)}%</div>}
              {frame.skillPointRecovery != null && <div>SP Recovery: {frame.skillPointRecovery}</div>}
              {frame.stagger != null && <div>Stagger: {frame.stagger}</div>}
              {frame.gaugeGain != null && <div>Gauge: {frame.gaugeGain}</div>}
              {frame.teamGaugeGain != null && <div>Team Gauge: {frame.teamGaugeGain}</div>}
            </div>
            {frame.damageType !== DamageType.DAMAGE_OVER_TIME && onToggleCrit && (
              <div className="edit-field">
                <span className="edit-field-label">Critical Hit</span>
                <label className="crit-toggle" onClick={() => onToggleCrit(row.eventUid, row.segmentIndex, row.frameIndex, !frame.isCrit)}>
                  <span className={`crit-toggle-track${frame.isCrit ? ' crit-toggle-track--on' : ''}`}>
                    <span className="crit-toggle-thumb" />
                  </span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default DamageBreakdownPane;
