/**
 * DataCardComponents — shared readonly card components for displaying
 * rich DSL data (clauses, properties, segments, effects) in both
 * the Customizer and the Combat Planner info pane.
 *
 * Extracted from UnifiedCustomizer.tsx for reuse.
 */
import React, { useState, useCallback } from 'react';
import { VerbType, NounType } from '../../dsl/semantics';
import { translateCondition, translateEffectParts, translateNounPhrase } from '../../dsl/semanticsTranslation';
import { formatFlat } from '../../controller/info-pane/loadoutPaneController';
import ClauseEditor from './ClauseEditor';
import type { JsonSkillData } from './OperatorEventEditor';
import type { NormalizedEffectDef } from '../../controller/gameDataStore';
import { t } from '../../locales/locale';

// ── Helpers ────────────────────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function toRoman(n: number) { return ROMAN[n - 1] ?? String(n); }

function resolveLeaf(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as Record<string, unknown>).value;
    if (Array.isArray(inner)) return inner.length > 0 ? (inner[0] as number) : null;
    return resolveLeaf(inner);
  }
  return null;
}

function resolveLeafRange(v: unknown): number[] | null {
  if (typeof v === 'number') return [v];
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as Record<string, unknown>).value;
    if (Array.isArray(inner)) return inner as number[];
    return resolveLeafRange(inner);
  }
  return null;
}

function formatDuration(dur: { value: unknown; unit: string } | undefined): string {
  if (!dur) return '';
  const val = resolveLeaf(dur.value);
  if (val == null) return '';
  const unit = dur.unit === 'FRAME' ? 'f' : 's';
  return `${formatFlat(val)}${unit}`;
}

export function formatWithValue(w: Record<string, unknown>): string {
  if ('verb' in w && w.verb === VerbType.VARY_BY) {
    const vals = w.value as number[];
    if (Array.isArray(vals) && vals.length > 0) {
      const first = typeof vals[0] === 'number' ? vals[0] : 0;
      const last = typeof vals[vals.length - 1] === 'number' ? vals[vals.length - 1] : 0;
      return `${first}\u2013${last} (by ${String(w.object ?? 'level').replace(/_/g, ' ').toLowerCase()})`;
    }
    return String(w.value);
  }
  if ('verb' in w && w.verb === VerbType.IS) return String(w.value);
  if ('value' in w) {
    const inner = w.value;
    if (inner && typeof inner === 'object') return formatWithValue(inner as Record<string, unknown>);
    return String(inner);
  }
  return JSON.stringify(w);
}

export function formatPropertyValue(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val.replace(/_/g, ' ');
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.map(v => formatPropertyValue(v)).join(', ');
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('verb' in obj) return formatWithValue(obj);
    if ('value' in obj && 'unit' in obj) {
      const inner = formatPropertyValue(obj.value);
      return `${inner} ${String(obj.unit).replace(/_/g, ' ').toLowerCase()}`;
    }
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      parts.push(`${k.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}: ${formatPropertyValue(v)}`);
    }
    return parts.join(', ');
  }
  return String(val);
}

// ── Readonly display components ────────────────────────────────────────────

export function ReadonlyField({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="ops-field">
      <span className="ops-field-label">{label}</span>
      <span className="ops-field-value">{String(value)}</span>
    </div>
  );
}

export function ReadonlySection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ops-section">
      <div className="ops-section-rule">
        <span className="ops-section-label">{label}</span>
      </div>
      <div className="ops-section-body">{children}</div>
    </div>
  );
}

// ── VaryTable ──────────────────────────────────────────────────────────────

export function VaryTable({ columnLabels, rows, style }: {
  columnLabels: (string | number)[];
  rows: { label: string; values: (string | number)[] }[];
  style?: React.CSSProperties;
}) {
  return (
    <table className="ops-frame-vary-table" style={style}>
      <thead><tr>{columnLabels.map((l, i) => <th key={i}>{l}</th>)}</tr></thead>
      <tbody>{rows.map((r, ri) => (
        <tr key={ri}>{r.values.map((v, vi) => <td key={vi}>{v}</td>)}</tr>
      ))}</tbody>
    </table>
  );
}

// ── PropertyTree ───────────────────────────────────────────────────────────

function PropertyTree({ label, value }: { label: string; value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, v]) => v != null);
  return (
    <div className="ops-prop-tree">
      <span className="ops-prop-tree-label">{label}</span>
      <div className="ops-prop-tree-children">
        {entries.map(([k, v], i) => {
          const childLabel = k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
          const isLast = i === entries.length - 1;
          const isNested = v && typeof v === 'object' && !Array.isArray(v);
          return (
            <div key={k} className={`ops-vt-branch${isLast ? ' ops-vt-branch--last' : ' ops-vt-branch--mid'}`}>
              {isNested
                ? <PropertyTree label={childLabel} value={v as Record<string, unknown>} />
                : <span className="ops-prop-tree-leaf"><span className="ops-prop-tree-leaf-label">{childLabel}</span> {formatPropertyValue(v)}</span>
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PropertiesView ─────────────────────────────────────────────────────────

const OMIT_PROPERTY_KEYS = new Set([
  'id', 'name', 'description', 'element',
  'toDeterminer', 'targetDeterminer', 'fromDeterminer',
]);

const COMBINED_NOUN_PAIRS: { noun: string; determiner: string; label: string }[] = [
  { noun: 'to', determiner: 'toDeterminer', label: 'Target' },
  { noun: 'target', determiner: 'targetDeterminer', label: 'Target' },
  { noun: 'from', determiner: 'fromDeterminer', label: 'From' },
];

/** Returns true if an object has nested structure too complex for a single line. */
function hasNestedComplexity(obj: Record<string, unknown>): boolean {
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const inner = v as Record<string, unknown>;
      if (inner.verb === VerbType.VARY_BY && Array.isArray(inner.value)) return true;
      if (!Array.isArray(v) && !('verb' in inner)) {
        if (hasNestedComplexity(inner)) return true;
      }
    }
  }
  return false;
}

function PropertiesView({ props }: { props: Record<string, unknown> }) {
  const entries = Object.entries(props).filter(([k]) => !OMIT_PROPERTY_KEYS.has(k));
  if (entries.length === 0) return null;

  const renderedNounKeys = new Set<string>();
  const combinedFields: { key: string; label: string; value: string }[] = [];
  for (const { noun, determiner, label } of COMBINED_NOUN_PAIRS) {
    if (typeof props[noun] === 'string') {
      combinedFields.push({ key: noun, label, value: translateNounPhrase(props[noun] as string, props[determiner] as string | undefined) });
      renderedNounKeys.add(noun);
    }
  }

  return (
    <>
      {combinedFields.map(({ key, label, value }) => (
        <ReadonlyField key={key} label={label} value={value} />
      ))}
      {entries.filter(([k]) => !renderedNounKeys.has(k)).map(([key, val]) => {
        if (val == null) return null;
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
        // VARY_BY tables
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const obj = val as Record<string, unknown>;
          if (obj.verb === VerbType.VARY_BY && Array.isArray(obj.value)) {
            const vals = obj.value as number[];
            return (
              <div key={key} className="ops-frame-effect">
                <div className="ops-frame-effect-sentence"><span className="ops-frame-effect-verb">{label}</span></div>
                <div className="ops-frame-effect-with"><div className="ops-frame-vary">
                  <VaryTable columnLabels={vals.map((_v, vi) => vi + 1)} rows={[{ label: 'value', values: vals }]} />
                </div></div>
              </div>
            );
          }
          // Duration with nested VARY_BY
          if ('value' in obj && typeof obj.value === 'object' && obj.value && (obj.value as Record<string, unknown>).verb === VerbType.VARY_BY) {
            const inner = obj.value as Record<string, unknown>;
            const vals = inner.value as number[];
            if (Array.isArray(vals)) {
              const unit = typeof obj.unit === 'string' ? obj.unit.replace(/_/g, ' ').toLowerCase() : '';
              return (
                <div key={key} className="ops-frame-effect">
                  <div className="ops-frame-effect-sentence"><span className="ops-frame-effect-verb">{label}</span></div>
                  <div className="ops-frame-effect-with"><div className="ops-frame-vary">
                    <VaryTable columnLabels={vals.map((_v, vi) => vi + 1)} rows={[{ label: unit, values: vals }]} />
                  </div></div>
                </div>
              );
            }
          }
        }
        // Nested objects without verb — use flat line if all leaves are scalars, tree otherwise
        if (val && typeof val === 'object' && !Array.isArray(val) && !('verb' in (val as Record<string, unknown>))) {
          if (!hasNestedComplexity(val as Record<string, unknown>)) {
            return <ReadonlyField key={key} label={label} value={formatPropertyValue(val)} />;
          }
          return <PropertyTree key={key} label={label} value={val as Record<string, unknown>} />;
        }
        return <ReadonlyField key={key} label={label} value={formatPropertyValue(val)} />;
      })}
    </>
  );
}

// ── Value node rendering ───────────────────────────────────────────────────

const VARY_AXIS_LABELS: Record<string, (i: number) => string> = {
  POTENTIAL: (i) => `P${i}`,
  TALENT_LEVEL: (i) => `T${i}`,
};

function VaryByLeaf({ node, label }: { node: Record<string, unknown>; label?: string }) {
  const vals = node.value as number[];
  const axis = String(node.object ?? 'LEVEL').replace(/_/g, ' ').toLowerCase();
  const of = node.ofDeterminer ? ` of ${String(node.ofDeterminer).toLowerCase()} ${String(node.of ?? 'OPERATOR').toLowerCase()}` : '';
  const labelFn = VARY_AXIS_LABELS[String(node.object)] ?? ((i: number) => String(i + 1));

  return (
    <div className="ops-vt-vary">
      {label && <span className="ops-frame-prop-label">{label}</span>}
      <span className="ops-vt-vary-desc">vary by {axis}{of}</span>
      <VaryTable
        columnLabels={vals.map((_, i) => labelFn(i))}
        rows={[{ label: '', values: vals }]}
        style={{ marginTop: 2 }}
      />
    </div>
  );
}

function ValueLeaf({ node, label }: { node: Record<string, unknown>; label?: string }) {
  if (node.verb === VerbType.IS && node.object === NounType.STAT) {
    const stat = String(node.objectId ?? node.stat ?? 'STAT').replace(/_/g, ' ');
    const of = node.ofDeterminer ? ` of ${String(node.ofDeterminer).toLowerCase()} operator` : '';
    return <span className="ops-vt-leaf">{label && <span className="ops-prop-tree-leaf-label">{label}</span>} {stat}{of}</span>;
  }
  if (node.verb === VerbType.IS) return <span className="ops-vt-leaf">{String(node.value)}</span>;
  if (node.verb === VerbType.VARY_BY && Array.isArray(node.value)) return <VaryByLeaf node={node} label={label} />;
  if (node.object && node.objectId) {
    const of = node.ofDeterminer ? ` of ${String(node.ofDeterminer).toLowerCase()}` : '';
    return <span className="ops-vt-leaf">{String(node.objectId).replace(/_/g, ' ')} {String(node.object).toLowerCase()} stacks{of}</span>;
  }
  if (node.object) return <span className="ops-vt-leaf">{String(node.object).toLowerCase()} stacks</span>;
  return <span className="ops-vt-leaf">{JSON.stringify(node)}</span>;
}

function ValueNodeTree({ node, depth = 0, label }: { node: Record<string, unknown>; depth?: number; label?: string }) {
  if (!node.operation) return <ValueLeaf node={node} label={label} />;

  const op = String(node.operation);
  const left = node.left as Record<string, unknown>;
  const right = node.right as Record<string, unknown>;

  return (
    <div className="ops-vt-expr">
      <span className="ops-vt-op">{op}</span>
      <div className="ops-vt-children">
        <div className="ops-vt-branch ops-vt-branch--mid">
          <ValueNodeTree node={left} depth={depth + 1} label={label} />
        </div>
        <div className="ops-vt-branch ops-vt-branch--last">
          <ValueNodeTree node={right} depth={depth + 1} label={label} />
        </div>
      </div>
    </div>
  );
}

// ── Clause rendering ───────────────────────────────────────────────────────

function EffectView({ effect: ef }: { effect: Record<string, unknown> }) {
  const nestedEffects = Array.isArray(ef.effects) ? ef.effects as Record<string, unknown>[] : null;
  if (nestedEffects) {
    const constraint = ef.cardinalityConstraint as string | undefined;
    const val = ef.value as string | number | undefined;
    const constraintLabel = [constraint?.replace(/_/g, ' '), val].filter(Boolean).join(' ');
    return (
      <div className="ops-frame-effect">
        <div className="ops-frame-effect-sentence">
          <span className="ops-frame-effect-verb">{String(ef.verb).replace(/_/g, ' ')}</span>
          {constraintLabel && <span className="ops-frame-effect-prep">{constraintLabel}</span>}
        </div>
        <div className="ops-prop-tree-children">
          {nestedEffects.map((nested, ni) => (
            <div key={ni} className={`ops-vt-branch${ni === nestedEffects.length - 1 ? '' : ' ops-vt-branch--mid'}`}>
              <EffectView effect={nested} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { verb, object: objStr, target, fromTarget } = translateEffectParts(ef);
  const withProps = (ef.with ?? {}) as Record<string, unknown>;
  const withEntries = Object.entries(withProps);

  const withRendered: { key: string; label: string; node: Record<string, unknown> }[] = [];
  const scalarWithProps: { key: string; label: string; display: string }[] = [];

  for (const [key, val] of withEntries) {
    let w = val && typeof val === 'object' ? val as Record<string, unknown> : null;
    if (w && w.unit && w.value && typeof w.value === 'object') w = w.value as Record<string, unknown>;
    const localeKey = `dsl.with.${key}`;
    const localized = t(localeKey);
    const label = localized !== localeKey ? localized : key;
    const isComplex = w && (w.operation || (w.verb === VerbType.VARY_BY && Array.isArray(w.value))
      || (w.verb === VerbType.IS && w.object));

    if (isComplex) {
      withRendered.push({ key, label, node: w! });
    } else {
      const display = w ? formatWithValue(w) : String(val);
      scalarWithProps.push({ key, label, display });
    }
  }

  const hasWithChildren = scalarWithProps.length > 0 || withRendered.length > 0;
  const allWithItems: { key: string; type: 'scalar' | 'complex'; label: string; display?: string; node?: Record<string, unknown> }[] = [
    ...scalarWithProps.map(p => ({ key: p.key, type: 'scalar' as const, label: p.label, display: p.display })),
    ...withRendered.map(w => ({ key: w.key, type: 'complex' as const, label: w.label, node: w.node })),
  ];
  allWithItems.sort((a, b) => (a.key === 'mainStat' ? -1 : b.key === 'mainStat' ? 1 : 0));

  return (
    <div className="ops-frame-effect">
      <div className="ops-frame-effect-sentence">
        <span className="ops-frame-effect-verb">{verb}</span>
        {objStr && <span className="ops-frame-effect-obj">{objStr}</span>}
        {target && <span className="ops-frame-effect-prep">{target}</span>}
        {fromTarget && <span className="ops-frame-effect-prep">{fromTarget}</span>}
      </div>
      {hasWithChildren && (
        <div className="ops-prop-tree-children">
          {allWithItems.map((item, wi) => {
            const isLast = wi === allWithItems.length - 1;
            return (
              <div key={item.key} className={`ops-vt-branch${isLast ? '' : ' ops-vt-branch--mid'}`}>
                {item.type === 'scalar' ? (
                  <span className="ops-prop-tree-leaf">
                    <span className="ops-prop-tree-leaf-label">{item.label}</span> {item.display}
                  </span>
                ) : (
                  <ValueNodeTree node={item.node!} label={item.label} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClausePredicateView({ predicate }: { predicate: Record<string, unknown> }) {
  const conditions = (predicate.conditions ?? []) as Record<string, unknown>[];
  const effects = (predicate.effects ?? []) as Record<string, unknown>[];

  if (conditions.length > 0) {
    const allChildren = conditions.length + effects.length;
    let idx = 0;
    return (
      <div className="ops-clause-predicate">
        <span className="ops-prop-tree-label">If</span>
        <div className="ops-prop-tree-children">
          {conditions.map((c, ci) => {
            idx++;
            return (
              <div key={`c-${ci}`} className={`ops-vt-branch${idx === allChildren ? '' : ' ops-vt-branch--mid'}`}>
                <span className="ops-clause-condition-text">{translateCondition(c)}</span>
              </div>
            );
          })}
          {effects.map((ef, ei) => {
            idx++;
            return (
              <div key={`ef-${ei}`} className={`ops-vt-branch${idx === allChildren ? '' : ' ops-vt-branch--mid'}`}>
                <EffectView effect={ef} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="ops-clause-predicate">
      {effects.map((ef, ei) => (
        <EffectView key={ei} effect={ef} />
      ))}
    </div>
  );
}

function FrameClauseView({ clauses }: { clauses: Record<string, unknown>[] }) {
  return (
    <>
      {clauses.map((pred, pi) => (
        <ClausePredicateView key={pi} predicate={pred} />
      ))}
    </>
  );
}

function ClauseTabContent({ label, data }: { label: string; data: unknown[] }) {
  return (
    <div className="ops-prop-tree">
      <span className="ops-prop-tree-label">{label}</span>
      {(data as Record<string, unknown>[]).map((pred, pi) => (
        <ClausePredicateView key={pi} predicate={pred} />
      ))}
    </div>
  );
}

export function ClauseTabs({ clause, onTrigger, onEntry, onExit }: { clause: unknown[]; onTrigger: unknown[]; onEntry: unknown[]; onExit: unknown[] }) {
  const tabs: { key: string; label: string; data: unknown[] }[] = [];
  if (clause.length > 0) tabs.push({ key: 'clause', label: t('dsl.clauseType.clause'), data: clause });
  if (onTrigger.length > 0) tabs.push({ key: 'onTriggerClause', label: t('dsl.clauseType.onTriggerClause'), data: onTrigger });
  if (onEntry.length > 0) tabs.push({ key: 'onEntryClause', label: t('dsl.clauseType.onEntryClause'), data: onEntry });
  if (onExit.length > 0) tabs.push({ key: 'onExitClause', label: t('dsl.clauseType.onExitClause'), data: onExit });
  const [activeTab, setActiveTab] = useState(0);

  if (tabs.length === 0) return null;
  const safeTab = Math.min(activeTab, tabs.length - 1);

  if (tabs.length === 1) {
    return (
      <div className="ops-clause-tabs">
        <ClauseTabContent label={tabs[0].label} data={tabs[0].data} />
      </div>
    );
  }

  return (
    <div className="ops-clause-tabs">
      <div className="ops-skill-tabs">
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            type="button"
            className={`ops-skill-tab${safeTab === i ? ' ops-skill-tab--active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            <span className="ops-skill-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
      <ClauseTabContent label={tabs[safeTab].label} data={tabs[safeTab].data} />
    </div>
  );
}

// ── Frame crit state (threaded from EventPane) ────────────────────────────

export interface FrameCritState {
  getIsCrit: (segIndex: number, frameIndex: number) => boolean | undefined;
  onToggle: (segIndex: number, frameIndex: number, value: boolean) => void;
}

function CritToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="ops-frame-prop" style={{ marginTop: 4 }}>
      <span className="ops-frame-prop-label">Crit</span>
      <label className="crit-toggle" onClick={() => onChange(!checked)}>
        <span className={`crit-toggle-track${checked ? ' crit-toggle-track--on' : ''}`}>
          <span className="crit-toggle-thumb" />
        </span>
      </label>
    </div>
  );
}

// ── Frame & Segment rendering ──────────────────────────────────────────────

function FrameDetail({ frame, label, isCrit, onToggleCrit }: {
  frame: JsonSkillData;
  label?: string;
  isCrit?: boolean;
  onToggleCrit?: (value: boolean) => void;
}) {
  const offset = frame.properties?.offset ?? frame.offset as { value: unknown; unit: string } | undefined;
  const offsetStr = formatDuration(offset);
  const clause = (frame.clause ?? []) as unknown as { conditions?: unknown[]; effects?: Record<string, unknown>[] }[];

  const props: { label: string; value: string }[] = [];
  const frameProps = frame.properties as Record<string, unknown> | undefined;
  if (frameProps) {
    for (const [k, v] of Object.entries(frameProps)) {
      if (k === 'offset' || k === 'name' || k === 'description') continue;
      if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
        props.push({ label: k.replace(/_/g, ' '), value: formatWithValue(v as Record<string, unknown>) });
      } else if (v != null) {
        props.push({ label: k.replace(/_/g, ' '), value: String(v) });
      }
    }
  }

  return (
    <div className="ops-frame-detail ops-frame-detail--accented">
      {label && <div className="ops-frame-accent-label">{label}</div>}
      {offsetStr && (
        <div className="ops-frame-prop">
          <span className="ops-frame-prop-label">Offset</span>
          <span className="ops-frame-prop-value">{offsetStr}</span>
        </div>
      )}
      {props.length > 0 && (
        <div className="ops-frame-props">
          {props.map((p, i) => (
            <div key={i} className="ops-frame-prop">
              <span className="ops-frame-prop-label">{p.label}</span>
              <span className="ops-frame-prop-value">{p.value}</span>
            </div>
          ))}
        </div>
      )}
      {clause.length > 0 ? (
        <div className="ops-frame-effects">
          <FrameClauseView clauses={clause as unknown as Record<string, unknown>[]} />
        </div>
      ) : (
        <div className="ops-frame-empty">No effects</div>
      )}
      {onToggleCrit && (
        <CritToggle checked={!!isCrit} onChange={onToggleCrit} />
      )}
    </div>
  );
}

function sumFrameMultipliers(frames: JsonSkillData[]): number[] | null {
  let totals: number[] | null = null;
  for (const f of frames) {
    const clause = (f.clause ?? []) as unknown as { effects?: Record<string, unknown>[] }[];
    for (const c of clause) {
      for (const ef of c.effects ?? []) {
        const withProps = (ef.with ?? {}) as Record<string, unknown>;
        for (const val of Object.values(withProps)) {
          const w = val && typeof val === 'object' ? val as Record<string, unknown> : null;
          if (w && w.verb === VerbType.VARY_BY && Array.isArray(w.value)) {
            const vals = w.value as number[];
            if (!totals) {
              totals = new Array(vals.length).fill(0);
            }
            for (let i = 0; i < vals.length && i < totals.length; i++) {
              totals[i] += vals[i];
            }
          }
        }
      }
    }
  }
  return totals;
}

export function TabbedSegmentView({ entry, critState }: { entry: { id: string; label: string; data: JsonSkillData }; critState?: FrameCritState }) {
  const segments = entry.data.segments ?? [];
  const topFrames = entry.data.frames ?? [];
  const [activeSegTab, setActiveSegTab] = useState(0);
  const [activeFrameTab, setActiveFrameTab] = useState<number | null>(null);

  const handleSegChange = useCallback((si: number) => {
    setActiveSegTab(si);
    setActiveFrameTab(null);
  }, []);

  if (segments.length === 0 && topFrames.length === 0) return null;

  if (segments.length === 0) {
    const flatFrame = activeFrameTab != null ? activeFrameTab : 0;
    return (
      <div className="ops-seg-view">
        <div className="ops-conjoined-tabs">
          <div
            className="ops-conjoined-row ops-conjoined-row--frame"
            onWheel={(e) => {
              if (e.deltaY === 0) return;
              e.currentTarget.scrollLeft += e.deltaY;
              e.preventDefault();
            }}
          >
            {topFrames.map((_f, fi) => (
              <button
                key={fi}
                type="button"
                className={`ops-conjoined-btn${flatFrame === fi ? ' ops-conjoined-btn--active' : ''}`}
                onClick={() => setActiveFrameTab(fi)}
              >
                {toRoman(fi + 1)}
              </button>
            ))}
          </div>
        </div>
        {topFrames[flatFrame] && (
          <FrameDetail
            frame={topFrames[flatFrame]}
            label={`Frame ${toRoman(flatFrame + 1)}`}
            isCrit={critState?.getIsCrit(0, flatFrame)}
            onToggleCrit={critState ? (v) => critState.onToggle(0, flatFrame, v) : undefined}
          />
        )}
      </div>
    );
  }

  const safeSeg = Math.min(activeSegTab, segments.length - 1);
  const seg = segments[safeSeg];
  const durStr = formatDuration(seg.properties?.duration ?? seg.duration as { value: unknown; unit: string } | undefined);
  const segFrames = (seg.frames ?? []) as JsonSkillData[];
  const segClause = (seg.clause ?? []) as typeof entry.data.clause;
  const viewingFrame = activeFrameTab != null && activeFrameTab < segFrames.length;

  return (
    <div className="ops-seg-view">
      <div className="ops-conjoined-tabs">
        <div className="ops-conjoined-row ops-conjoined-row--seg">
          {segments.map((s, si) => {
            const isActiveSeg = safeSeg === si && !viewingFrame;
            return (
              <button
                key={si}
                type="button"
                className={`ops-conjoined-seg${safeSeg === si ? ' ops-conjoined-seg--current' : ''}${isActiveSeg ? ' ops-conjoined-seg--active' : ''}`}
                onClick={() => handleSegChange(si)}
              >
                {s.properties?.name || `Segment ${si + 1}`}
              </button>
            );
          })}
        </div>
        <div
          className="ops-conjoined-row ops-conjoined-row--frame"
          onWheel={(e) => {
            if (e.deltaY === 0) return;
            e.currentTarget.scrollLeft += e.deltaY;
            e.preventDefault();
          }}
        >
          {segments.map((s, si) => {
            const frames = (s.frames ?? []) as JsonSkillData[];
            return (
              <div key={si} className="ops-conjoined-frame-group">
                {frames.length > 0 ? frames.map((_f, fi) => (
                  <button
                    key={fi}
                    type="button"
                    className={`ops-conjoined-btn${safeSeg === si && activeFrameTab === fi ? ' ops-conjoined-btn--active' : ''}`}
                    onClick={() => { setActiveSegTab(si); setActiveFrameTab(fi); }}
                  >
                    {toRoman(fi + 1)}
                  </button>
                )) : (
                  <span className="ops-conjoined-btn ops-conjoined-btn--empty" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ops-seg-detail">
        {viewingFrame ? (
          <FrameDetail
            frame={segFrames[activeFrameTab!]}
            label={`Frame ${toRoman(activeFrameTab! + 1)}`}
            isCrit={critState?.getIsCrit(safeSeg, activeFrameTab!)}
            onToggleCrit={critState ? (v) => critState.onToggle(safeSeg, activeFrameTab!, v) : undefined}
          />
        ) : (
          <div className="ops-frame-detail ops-frame-detail--accented">
            <div className="ops-frame-accent-label">{seg.properties?.name || `Segment ${safeSeg + 1}`}</div>
            {(() => {
              const segDur = seg.properties?.duration ?? seg.duration as { value: unknown; unit: string } | undefined;
              if (!segDur) return null;
              const range = resolveLeafRange((segDur as { value: unknown }).value);
              const unit = (segDur as { unit: string }).unit === 'FRAME' ? 'f' : 's';
              if (range && range.length > 1 && new Set(range).size > 1) {
                return (
                  <div className="ops-frame-effect">
                    <div className="ops-frame-effect-sentence">
                      <span className="ops-frame-effect-verb">Duration</span>
                    </div>
                    <div className="ops-frame-effect-with"><div className="ops-frame-vary">
                      <VaryTable columnLabels={range.map((_v, vi) => vi + 1)} rows={[{ label: unit, values: range.map(formatFlat) }]} />
                    </div></div>
                  </div>
                );
              }
              return durStr ? (
                <div className="ops-frame-prop">
                  <span className="ops-frame-prop-label">Duration</span>
                  <span className="ops-frame-prop-value">{durStr}</span>
                </div>
              ) : null;
            })()}
            {segFrames.length > 0 && (() => {
              const totals = sumFrameMultipliers(segFrames);
              if (totals) return (
                <div className="ops-frame-effect">
                  <div className="ops-frame-effect-sentence">
                    <span className="ops-frame-effect-verb">Total Multiplier</span>
                  </div>
                  <div className="ops-frame-effect-with"><div className="ops-frame-vary">
                    <VaryTable columnLabels={totals.map((_v, vi) => vi + 1)} rows={[{ label: 'value', values: totals.map(v => Math.round(v * 1000) / 1000) }]} />
                  </div></div>
                </div>
              );
              return null;
            })()}
            {segClause && segClause.length > 0 && (
              <div className="ops-seg-clause">
                <ClauseEditor initialValue={segClause} onChange={() => {}} readOnly />
              </div>
            )}
            {segFrames.map((f, fi) => {
              const fOffset = f.properties?.offset ?? f.offset as { value: unknown; unit: string } | undefined;
              const fOffsetStr = formatDuration(fOffset);
              const fClause = (f.clause ?? []) as unknown as Record<string, unknown>[];
              return (
                <div key={fi} className="ops-seg-inline-frame">
                  <div className="ops-seg-inline-frame-name">Frame {toRoman(fi + 1)}</div>
                  {fOffsetStr && (
                    <div className="ops-frame-prop">
                      <span className="ops-frame-prop-label">Offset</span>
                      <span className="ops-frame-prop-value">{fOffsetStr}</span>
                    </div>
                  )}
                  {fClause.length > 0 && (
                    <div className="ops-prop-tree">
                      <span className="ops-prop-tree-label">{t('dsl.clauseType.clause')}</span>
                      <FrameClauseView clauses={fClause} />
                    </div>
                  )}
                  {critState && (
                    <CritToggle checked={!!critState.getIsCrit(safeSeg, fi)} onChange={(v) => critState.onToggle(safeSeg, fi, v)} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DataCardBody ───────────────────────────────────────────────────────────

export function DataCardBody({ data, extraFields, critState }: {
  data: Record<string, unknown>;
  extraFields?: React.ReactNode;
  critState?: FrameCritState;
}) {
  const props = (data.properties ?? {}) as Record<string, unknown>;
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const clause = (data.clause ?? []) as unknown[];
  const onTrigger = (data.onTriggerClause ?? []) as unknown[];
  const onEntry = (data.onEntryClause ?? []) as unknown[];
  const onExit = (data.onExitClause ?? []) as unknown[];
  const segments = (data.segments ?? []) as unknown[];
  const hasClauses = clause.length > 0 || onTrigger.length > 0 || onEntry.length > 0 || onExit.length > 0;

  const id = props.id as string | undefined;
  const name = (props.name ?? '') as string;
  const element = props.element as string | undefined;
  const desc = props.description as string | undefined;

  const metaEntries = Object.entries(meta).filter(([k]) => k !== 'icon');

  return (
    <div className="ops-skill-form">
      {id && <ReadonlyField label="ID" value={id} />}
      {name && <ReadonlyField label="Name" value={name} />}
      {element && <ReadonlyField label="Element" value={element} />}
      {desc && <ReadonlyField label="Description" value={desc} />}
      <PropertiesView props={props} />
      {metaEntries.length > 0 && metaEntries.map(([key, val]) => {
        if (val == null) return null;
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
        return <ReadonlyField key={key} label={label} value={formatPropertyValue(val)} />;
      })}
      {extraFields}
      {hasClauses && (
        <ClauseTabs clause={clause} onTrigger={onTrigger} onEntry={onEntry} onExit={onExit} />
      )}
      {segments.length > 0 && (
        <TabbedSegmentView entry={{ id: id ?? 'entry', label: name, data: data as JsonSkillData }} critState={critState} />
      )}
    </div>
  );
}

// ── NormalizedEffectDef helpers ─────────────────────────────────────────────

/** Reshape a NormalizedEffectDef into the {properties, clause, …} shape DataCardBody expects. */
export function normalizedDefToData(def: NormalizedEffectDef): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    id: def.id,
    name: def.name ?? def.label,
    ...(def.description ? { description: def.description } : {}),
    ...(def.element ? { element: def.element } : {}),
    target: def.target,
    targetDeterminer: def.targetDeterminer,
    stacks: def.stacks,
    ...(def.properties ?? {}),
    ...(def.cooldownSeconds ? { cooldownSeconds: def.cooldownSeconds } : {}),
    ...(def.eventCategoryType ? { eventCategoryType: def.eventCategoryType } : {}),
    ...(def.usageLimit ? { usageLimit: def.usageLimit } : {}),
    ...(def.statusValue != null ? { statusValue: def.statusValue } : {}),
  };
  return {
    clause: def.clause ?? [],
    onTriggerClause: def.onTriggerClause ?? [],
    ...(def.segments && def.segments.length > 0 ? { segments: def.segments } : {}),
    properties,
    ...(def.originId ? { metadata: { originId: def.originId } } : {}),
  };
}

/** Render NormalizedEffectDef buffs + susceptibility as extra fields for DataCardBody. */
export function EffectDefExtraFields({ def }: { def: NormalizedEffectDef }) {
  return (
    <>
      {def.buffs && def.buffs.length > 0 && def.buffs.map((b, j) => (
        <ReadonlyField key={j} label={b.stat.replace(/_/g, ' ')} value={`${b.valueMin != null ? `${b.valueMin}\u2013${b.valueMax}` : b.value}${b.perStack ? ' /stack' : ''}`} />
      ))}
      {def.susceptibility && Object.entries(def.susceptibility).map(([key, vals]) => (
        <ReadonlyField key={key} label={`Susceptibility: ${key.replace(/_/g, ' ')}`} value={(vals as number[]).join(', ')} />
      ))}
    </>
  );
}
