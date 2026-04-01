/**
 * BreakdownTree — shared tree components for rendering MultiplierEntry hierarchies.
 * Used by DamageBreakdownPane and LoadoutPane.
 */
import React from 'react';
import type { MultiplierEntry } from '../../controller/info-pane/damageBreakdownController';

export function LeafContent({ entry }: { entry: MultiplierEntry }) {
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

export function ChildNode({ entry, isLast }: { entry: MultiplierEntry; isLast: boolean }) {
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

export function TopEntry({ entry }: { entry: MultiplierEntry }) {
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
