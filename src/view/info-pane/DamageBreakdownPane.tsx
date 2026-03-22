import React from 'react';
import { frameToTimeLabelPrecise } from '../../utils/timeline';
import type { DamageTableRow } from '../../controller/calculation/damageTableBuilder';
import { buildMultiplierEntries, buildStatusMultiplierEntries, MultiplierEntry } from '../../controller/info-pane/damageBreakdownController';
import { t } from '../../locales/locale';

function SubEntryRows({ entries }: { entries: MultiplierEntry[] }) {
  return (
    <>
      {entries.map((sub) => (
        <div
          key={sub.label}
          className={`dmg-breakdown-row dmg-breakdown-sub ${sub.cssClass}`}
        >
          <div className="dmg-breakdown-label">{sub.label}</div>
          <div className="dmg-breakdown-value">{sub.formattedValue}</div>
          <div className="dmg-breakdown-source">{sub.source}</div>
        </div>
      ))}
    </>
  );
}

function DamageBreakdownPane({ row }: { row: DamageTableRow }) {
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
    : buildMultiplierEntries(row.params!);
  const finalDamage = row.damage ?? 0;

  return (
    <>
      <div className="edit-panel-header">
        <div className="edit-panel-skill-name">{row.label}</div>
        <div className="edit-info-text" style={{ marginTop: 4 }}>
          {frameToTimeLabelPrecise(row.absoluteFrame)}
        </div>
        <div className="dmg-breakdown-total">
          {t('damageBreakdown.total', { value: finalDamage.toFixed(1) })}
        </div>
      </div>
      <div className="edit-panel-body">
        <div className="dmg-breakdown-formula">
          <div className="dmg-breakdown-header">
            <span>{t('damageBreakdown.header.multiplier')}</span>
            <span>{t('damageBreakdown.header.value')}</span>
          </div>
          {entries.map((entry) => (
            <React.Fragment key={entry.label}>
              <div
                className={`dmg-breakdown-row ${entry.cssClass}`}
              >
                <div className="dmg-breakdown-label">{entry.label}</div>
                <div className="dmg-breakdown-value">{entry.formattedValue}</div>
                <div className="dmg-breakdown-source">{entry.source}</div>
              </div>
              {entry.subEntries && entry.subEntries.length > 0 && (
                <SubEntryRows entries={entry.subEntries} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

export default DamageBreakdownPane;
