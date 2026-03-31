import React from 'react';
import { frameToTimeLabelPrecise } from '../../utils/timeline';
import type { DamageTableRow } from '../../controller/calculation/damageTableBuilder';
import { buildMultiplierEntries, buildStatusMultiplierEntries, MultiplierEntry } from '../../controller/info-pane/damageBreakdownController';
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
      </div>
    </>
  );
}

export default DamageBreakdownPane;
