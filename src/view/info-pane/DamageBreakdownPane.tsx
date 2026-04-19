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
          <TopEntry entry={{ label: t('damageBreakdown.root.damage'), value: finalDamage, format: 'flat', source: '', formattedValue: Math.round(finalDamage).toLocaleString(), cssClass: '' }} />
          {entries.map((entry) => (
            <TopEntry key={entry.label} entry={entry} />
          ))}
        </div>
        {frame && (() => {
          // Folded row (SEGMENT / EVENT fold mode): sum the DEAL DAMAGE multiplier
          // and per-frame resource gains across all underlying frames so the
          // breakdown reflects the rolled-up total, not just the first frame.
          // Detected via `row.foldedFrames` populated by foldRows in CombatSheet.
          const folded = row.foldedFrames;
          const isFolded = folded != null && folded.length > 0;
          // Distinguish segment vs event by whether all folded rows share one segment.
          const singleSegment = isFolded
            && folded!.every((r) => r.segmentIndex === folded![0].segmentIndex);
          const sectionLabel = !isFolded ? t('sheet.fold.frame') : singleSegment ? t('sheet.fold.segment') : t('sheet.fold.event');
          const formatMul = (m: number) =>
            nf === NumberFormatType.DECIMAL ? m.toFixed(dp) : `${(m * 100).toFixed(dp)}%`;
          const singleMul = (() => {
            const dmg = findDealDamageInClauses(frame.clause);
            return dmg?.values?.length === 1 ? dmg.values[0] : undefined;
          })();
          const summedMul = isFolded
            ? folded!.reduce((s, r) => (r.multiplier != null ? s + r.multiplier : s), 0)
            : undefined;
          const mul = summedMul ?? singleMul;
          const singleSp = findSkillPointRecoveryInClauses(frame.clause);
          const singleStag = findStaggerInClauses(frame.clause);
          const singleGauge = findUltimateEnergyGainInClauses(frame.clause);
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">{sectionLabel}</span>
              <div className="edit-info-text">
                {frame.absoluteFrame != null && <div>{t('damageBreakdown.label.time')}: {frameToTimeLabelPrecise(frame.absoluteFrame)}</div>}
                {mul != null && <div>{t('damageBreakdown.header.multiplier')}: {formatMul(mul)}</div>}
                {!isFolded && singleSp != null && <div>{t('damageBreakdown.label.spRecovery')}: {singleSp}</div>}
                {!isFolded && singleStag != null && <div>{t('dsl.property.stagger')}: {singleStag}</div>}
                {!isFolded && singleGauge != null && <div>{t('damageBreakdown.label.gauge')}: {singleGauge}</div>}
              </div>
              {!isFolded && frame.damageType !== DamageType.DAMAGE_OVER_TIME && onToggleCrit && (
                <div className="edit-field">
                  <span className="edit-field-label">{t('damageBreakdown.label.criticalHit')}</span>
                  <label className="crit-toggle" onClick={() => onToggleCrit(row.eventUid, row.segmentIndex, row.frameIndex, !frame.isCrit)}>
                    <span className={`crit-toggle-track${frame.isCrit ? ' crit-toggle-track--on' : ''}`}>
                      <span className="crit-toggle-thumb" />
                    </span>
                  </label>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </>
  );
}

export default DamageBreakdownPane;
