import React from 'react';
import { frameToTimeLabelPrecise } from '../../utils/timeline';
import type { DamageTableRow } from '../../controller/calculation/damageTableBuilder';
import { buildMultiplierEntries, buildStatusMultiplierEntries } from '../../controller/info-pane/damageBreakdownController';
import { DamageType, NumberFormatType } from '../../consts/enums';
import { findUltimateEnergyGainInClauses, findSkillPointRecoveryInClauses, findStaggerInClauses, findDealDamageInClauses } from '../../controller/timeline/clauseQueries';
import { loadSettings } from '../../consts/settings';
import type { EventFrameMarker } from '../../consts/viewTypes';
import { t } from '../../locales/locale';
import { TopEntry } from './BreakdownTree';

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

  const { decimalPlaces: dp, numberFormat: nf } = loadSettings();
  const entries = row.statusParams
    ? buildStatusMultiplierEntries(row.statusParams, dp, nf)
    : buildMultiplierEntries(row.params!, row.foldedFrames, dp, nf);
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
              {(() => {
                const dmg = findDealDamageInClauses(frame.clauses);
                const mul = dmg?.multipliers?.length === 1 ? dmg.multipliers[0] : undefined;
                return mul != null
                  ? <div>Multiplier: {nf === NumberFormatType.DECIMAL ? mul.toFixed(dp) : `${(mul * 100).toFixed(dp)}%`}</div>
                  : null;
              })()}
              {(() => {
                const sp = findSkillPointRecoveryInClauses(frame.clauses);
                return sp != null ? <div>SP Recovery: {sp}</div> : null;
              })()}
              {(() => {
                const stag = findStaggerInClauses(frame.clauses);
                return stag != null ? <div>Stagger: {stag}</div> : null;
              })()}
              {(() => {
                const gauge = findUltimateEnergyGainInClauses(frame.clauses);
                return gauge != null ? <div>Gauge: {gauge}</div> : null;
              })()}
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
