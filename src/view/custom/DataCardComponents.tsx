/**
 * DataCardComponents — shared readonly card components for displaying
 * rich DSL data (clauses, properties, segments, effects) in both
 * the Customizer and the Combat Planner info pane.
 *
 * Extracted from UnifiedCustomizer.tsx for reuse.
 */
import React, { useState, useCallback, createContext, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { VerbType, NounType } from '../../dsl/semantics';
import { splitConditionText, translateEffectParts, translateNounPhrase, translateDslToken } from '../../dsl/semanticsTranslation';
import { PERMANENT_DURATION, UnitType } from '../../consts/enums';
import { formatFlat } from '../../controller/info-pane/loadoutPaneController';
import type { JsonSkillData } from './OperatorEventEditor';
import type { NormalizedEffectDef } from '../../controller/gameDataStore';
import { t } from '../../locales/locale';

// ── Vary-by active index resolution ────────────────────────────────────────

/**
 * Runtime loadout dimensions used to highlight the active column in a VARY_BY
 * table. Provided via VaryByContext by callers that know the operator's live
 * loadout (EventPane, OperatorLoadoutEditor). Readers call
 * `resolveActiveIndex(dimension)` to convert a VARY_BY dimension (SKILL_LEVEL,
 * TALENT_LEVEL, POTENTIAL, ATTRIBUTE_INCREASE_LEVEL) into a 0-based array
 * index, mirroring `getVariableArrayIndex` in `valueResolver.ts`.
 */
export interface VaryByLoadout {
  skillLevel?: number;
  potential?: number;
  talentOneLevel?: number;
  talentTwoLevel?: number;
  attributeIncreaseLevel?: number;
  /** Active weapon-skill rank (1–9) for `VARY_BY RANK of WEAPON of THIS
   *  OPERATOR`. Resolved by the caller from the loadout's weapon slot the
   *  current card belongs to (skill1/2/3Level). */
  weaponSkillRank?: number;
  /**
   * Which talent slot TALENT_LEVEL dimensions should resolve against for this
   * card. Set by EventPane when the event's id matches the operator's T2 id;
   * defaults to 'one' (matches the engine's resolveTalentLevel fallback).
   */
  talentSlot?: 'one' | 'two';
  /**
   * Pre-resolved 0-based indices for supplied parameters (e.g. ENEMY_HIT).
   * Computed from the event's parameterValues minus each param's lowerRange
   * so VARY_BY tables can highlight the user-selected column directly.
   */
  parameterIndices?: Record<string, number>;
}

/** Resolve a VARY_BY dimension → active 0-based array index, or undefined if not mappable. */
function resolveActiveIndex(loadout: VaryByLoadout | undefined, dimension: string | undefined, talentSlot?: 'one' | 'two'): number | undefined {
  if (!loadout || !dimension) return undefined;
  switch (dimension) {
    case NounType.SKILL_LEVEL: return loadout.skillLevel != null ? loadout.skillLevel - 1 : undefined;
    case NounType.RANK: return loadout.weaponSkillRank != null ? loadout.weaponSkillRank - 1 : undefined;
    case NounType.POTENTIAL:   return loadout.potential;
    case NounType.TALENT_LEVEL: {
      const slot = talentSlot ?? loadout.talentSlot ?? 'one';
      return slot === 'two' ? loadout.talentTwoLevel : loadout.talentOneLevel;
    }
    case NounType.ATTRIBUTE_INCREASE_LEVEL: return loadout.attributeIncreaseLevel;
    default: return loadout.parameterIndices?.[dimension];
  }
}

export const VaryByContext = createContext<VaryByLoadout | undefined>(undefined);

// ── Edit state (for inline info-pane editing) ──────────────────────────────

/**
 * Opaque edit state passed from EventPane down through every leaf renderer.
 * When present, numeric leaves render as inline editable inputs with an
 * override + reset affordance. When undefined, the card is fully readonly.
 */
export interface EditState {
  getOverride: (path: string) => number | undefined;
  isOverridden: (path: string) => boolean;
  setOverride: (path: string, value: number) => void;
  clearOverride: (path: string) => void;
}

/**
 * Inline editable numeric leaf. Readonly when `editState` is undefined.
 *
 * Visual states (see hot-wire CSS block in App.css):
 *  - resting:     plain monospace numeral
 *  - hover:       dim-yellow underline hint
 *  - editing:     inline number input with accent underbar
 *  - overridden:  accent-colored, dotted underline, reset tab on the right
 *  - discharging: 180ms flash on reset
 */
export function EditableValue({
  value,
  path,
  editState,
  className,
  format,
}: {
  value: number;
  path?: string;
  editState?: EditState;
  className?: string;
  format?: (v: number) => string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const fmt = format ?? formatFlat;

  if (!editState || !path || !Number.isFinite(value)) {
    return <span className={className}>{fmt(value)}</span>;
  }

  const overridden = editState.isOverridden(path);
  const display = overridden ? (editState.getOverride(path) ?? value) : value;

  if (draft !== null) {
    const commit = () => {
      const parsed = Number(draft);
      if (Number.isFinite(parsed)) {
        if (parsed === value) {
          editState.clearOverride(path);
        } else {
          editState.setOverride(path, parsed);
        }
      }
      setDraft(null);
    };
    const abs = Math.abs(value);
    const step = abs > 0 && abs < 1 ? 0.01 : abs < 10 ? 0.1 : 1;
    return (
      <input
        className="ops-value-input"
        type="number"
        step={step}
        value={draft}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          else if (e.key === 'Escape') { setDraft(null); }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    editState.clearOverride(path);
    setPulsing(true);
    setTimeout(() => setPulsing(false), 200);
  };

  const spanClass = [
    className,
    'ops-value-editable',
    overridden && 'ops-value-overridden',
    pulsing && 'ops-value-discharging',
  ].filter(Boolean).join(' ');

  return (
    <>
      <span
        className={spanClass}
        onClick={(e) => { e.stopPropagation(); setDraft(String(display)); }}
        title={t('customizer.field.editable')}
      >
        {fmt(display)}
      </span>
      {overridden && (
        <button
          type="button"
          className="ops-reset-tab"
          onClick={handleReset}
          title={t('customizer.btn.reset')}
          aria-label={t('customizer.btn.resetAria')}
        >
          {'\u27F2'}
        </button>
      )}
    </>
  );
}

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
  if (val >= PERMANENT_DURATION) return 'Infinite';
  const unit = dur.unit === UnitType.FRAME ? 'f' : 's';
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
      // `{value, unit}` is the duration/time container shape. If the resolved
      // scalar is PERMANENT_DURATION, show "Infinite" instead of "99999 second".
      const leaf = resolveLeaf(obj.value);
      if (typeof leaf === 'number' && leaf >= PERMANENT_DURATION) return 'Infinite';
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

export function ReadonlySection({ label, children, trailing }: { label: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="ops-section">
      <div className="ops-section-rule">
        <span className="ops-section-label">{label}</span>
        {trailing && <span className="ops-section-trailing">{trailing}</span>}
      </div>
      <div className="ops-section-body">{children}</div>
    </div>
  );
}

/**
 * Card body wrapper. Gives children the subtle-tinted panel + row-layout
 * field treatment used by DataCardBody's readonly cards. Pair with
 * `EditableField` for labeled inputs.
 */
export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className ? `ops-skill-form ${className}` : 'ops-skill-form'}>{children}</div>;
}

/**
 * Editable field: same structural shape as `ReadonlyField` (label left,
 * value-slot right), but the value slot accepts arbitrary editable content
 * (input, select, button group, etc.). Intended to be placed inside `CardBody`
 * so the row-layout + label-column rules apply uniformly.
 *
 * Pass `help` to surface a small `?` next to the label that reveals the
 * help text on hover/focus — use it liberally; authored content is full of
 * domain jargon that means nothing to a new author otherwise.
 */
export function EditableField({ label, htmlFor, help, children }: { label: string; htmlFor?: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="ops-field ops-field--editable">
      {htmlFor
        ? <label className="ops-field-label" htmlFor={htmlFor}>{label}{help && <HelpTip text={help} />}</label>
        : <span className="ops-field-label">{label}{help && <HelpTip text={help} />}</span>}
      <div className="ops-field-value ops-field-value--editable">{children}</div>
    </div>
  );
}

/**
 * Tiny `?` badge with an instant hover bubble positioned directly above the
 * glyph. The bubble is portaled to `document.body` so it escapes any ancestor
 * stacking context or overflow:hidden boundary — it always paints above
 * adjacent cards/panels. Keyboard-accessible via tab/focus; screen-reader
 * accessible via aria-label.
 */
export function HelpTip({ text }: { text: string }) {
  const glyphRef = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = useCallback(() => {
    const el = glyphRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left + r.width / 2, top: r.top - 6 });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  return (
    <>
      <span
        ref={glyphRef}
        className="ops-help-tip"
        tabIndex={0}
        role="note"
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <span className="ops-help-tip-glyph" aria-hidden="true">?</span>
      </span>
      {pos && createPortal(
        <span
          className="ops-help-tip-bubble"
          role="tooltip"
          style={{ left: pos.left, top: pos.top }}
        >
          {text}
        </span>,
        document.body,
      )}
    </>
  );
}

// ── VaryTable ──────────────────────────────────────────────────────────────

export function VaryTable({ columnLabels, rows, style, editState, basePath, activeIndex }: {
  columnLabels: (string | number)[];
  rows: { label: string; values: (string | number)[] }[];
  style?: React.CSSProperties;
  /** When provided together with basePath, each numeric cell becomes editable. */
  editState?: EditState;
  /** Path to the parent VARY_BY value array (e.g. "properties.duration.value"). Cells append `[i]`. */
  basePath?: string;
  /** Column index that corresponds to the live loadout's active level (highlighted). */
  activeIndex?: number;
}) {
  const activeCls = (i: number) => activeIndex != null && i === activeIndex ? ' ops-cell--active' : '';
  return (
    <table className="ops-frame-vary-table" style={style}>
      <thead><tr>{columnLabels.map((l, i) => <th key={i} className={activeCls(i).trim() || undefined}>{l}</th>)}</tr></thead>
      <tbody>{rows.map((r, ri) => (
        <tr key={ri}>{r.values.map((v, vi) => {
          if (editState && basePath && typeof v === 'number') {
            const cellPath = `${basePath}[${vi}]`;
            const overridden = editState.isOverridden(cellPath);
            const cls = `ops-cell--editable${overridden ? ' ops-cell--overridden' : ''}${activeCls(vi)}`;
            return (
              <td key={vi} className={cls}>
                <EditableValue value={v} path={cellPath} editState={editState} />
              </td>
            );
          }
          return <td key={vi} className={activeCls(vi).trim() || undefined}>{v}</td>;
        })}</tr>
      ))}</tbody>
    </table>
  );
}

// ── PropertyTree ───────────────────────────────────────────────────────────

/** True when the object is a DSL ValueNode leaf (VARY_BY array or IS literal/stat/status). */
function isValueNode(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return obj.verb === VerbType.VARY_BY || obj.verb === VerbType.IS || typeof obj.operation === 'string';
}

function PropertyTree({ label, value }: { label: string; value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, v]) => v != null);
  return (
    <div className="ops-prop-tree">
      <span className="ops-prop-tree-label">{label}</span>
      <div className="ops-prop-tree-children">
        {entries.map(([k, v], i) => {
          const childLabel = k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
          const isLast = i === entries.length - 1;
          const isObj = v && typeof v === 'object' && !Array.isArray(v);
          const cls = `ops-vt-branch${isLast ? ' ops-vt-branch--last' : ' ops-vt-branch--mid'}`;

          // ValueNode → delegate to ValueNodeTree (handles IS/VARY_BY leaves
          // AND compound ADD/MULT expressions with full tree rendering). Flat
          // JSON.stringify fallback for complex operations is what caused the
          // raw `{"operation":"ADD",...}` blob in STACKS.LIMIT.
          if (isValueNode(v)) {
            return (
              <div key={k} className={cls}>
                <ValueNodeTree node={v as Record<string, unknown>} label={childLabel} />
              </div>
            );
          }

          return (
            <div key={k} className={cls}>
              {isObj
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
  'id', 'name', 'description', 'descriptionParams', 'element',
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
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      // Any DSL ValueNode (VARY_BY, IS, compound operation) in a child slot
      // demands tree rendering — keeps STACKS / DURATION / etc. consistent
      // across operators regardless of whether their limit is a literal or
      // a compound expression.
      if (isValueNode(v)) return true;
      // {value, unit} wrapper (duration/quantity) — recurse into the value;
      // the wrapper itself is handled by formatPropertyValue.
      if ('value' in inner && 'unit' in inner) {
        if (inner.value && typeof inner.value === 'object' && isValueNode(inner.value)) return true;
        continue;
      }
      if (hasNestedComplexity(inner)) return true;
    }
  }
  return false;
}

type SuppliedParamDef = { id: string; name: string; lowerRange: number; upperRange: number; default: number };

/**
 * Render suppliedParameters as a branching tree — matching the PropertyTree
 * styling used for other nested property shapes (duration, stacks, compound
 * ValueNodes). Top level is the "Supplied Parameters" label, each axis (e.g.
 * VARY_BY) is a mid-level branch, and each param def hangs below with its
 * range + default as leaf rows.
 */
function SuppliedParametersTree({ axes }: { axes: Record<string, unknown> }) {
  const axisEntries = Object.entries(axes).filter(([, defs]) => Array.isArray(defs) && (defs as unknown[]).length > 0);
  if (axisEntries.length === 0) return null;

  return (
    <div className="ops-prop-tree">
      <span className="ops-prop-tree-label">Supplied Parameters</span>
      <div className="ops-prop-tree-children">
        {axisEntries.map(([axis, rawDefs], ai) => {
          const defs = rawDefs as SuppliedParamDef[];
          const axisLabel = axis.replace(/_/g, ' ').toLowerCase();
          const isLastAxis = ai === axisEntries.length - 1;
          const axisCls = `ops-vt-branch${isLastAxis ? ' ops-vt-branch--last' : ' ops-vt-branch--mid'}`;
          return (
            <div key={axis} className={axisCls}>
              <div className="ops-prop-tree">
                <span className="ops-prop-tree-label">{axisLabel}</span>
                <div className="ops-prop-tree-children">
                  {defs.map((def, di) => {
                    const isLastParam = di === defs.length - 1;
                    const paramCls = `ops-vt-branch${isLastParam ? ' ops-vt-branch--last' : ' ops-vt-branch--mid'}`;
                    const name = def.name || def.id;
                    return (
                      <div key={def.id ?? name} className={paramCls}>
                        <div className="ops-prop-tree">
                          <span className="ops-prop-tree-label">{name}</span>
                          <div className="ops-prop-tree-children">
                            <div className="ops-vt-branch ops-vt-branch--mid">
                              <span className="ops-prop-tree-leaf">
                                <span className="ops-prop-tree-leaf-label">Range</span> {`${def.lowerRange}\u2013${def.upperRange}`}
                              </span>
                            </div>
                            <div className="ops-vt-branch ops-vt-branch--last">
                              <span className="ops-prop-tree-leaf">
                                <span className="ops-prop-tree-leaf-label">Default</span> {def.default}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PropertiesView({ props, editState, basePath }: {
  props: Record<string, unknown>;
  editState?: EditState;
  basePath?: string;
}) {
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

  const pathFor = (key: string) => (basePath ? `${basePath}.${key}` : key);

  return (
    <>
      {combinedFields.map(({ key, label, value }) => (
        <ReadonlyField key={key} label={label} value={value} />
      ))}
      {entries.filter(([k]) => !renderedNounKeys.has(k)).map(([key, val]) => {
        if (val == null) return null;
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
        const keyPath = pathFor(key);
        // suppliedParameters — unique shape (`{ VARY_BY: [ParamDef, …] }`) that
        // the generic `formatPropertyValue` fallback collapses into an unreadable
        // comma-joined blob. Render each declared parameter as a branching tree
        // matching the styling used for other nested property shapes.
        if (key === 'suppliedParameters' && val && typeof val === 'object') {
          return <SuppliedParametersTree key={key} axes={val as Record<string, unknown>} />;
        }
        // VARY_BY tables — delegate to VaryByLeaf so the active loadout
        // column is highlighted via VaryByContext.
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const obj = val as Record<string, unknown>;
          // Compound operation at the top level (ADD/MULT/SUB of nested
          // ValueNodes, e.g. `stacks.limit = ADD(3, MULT(POTENTIAL, STATUS))`).
          // Route through ValueNodeTree inside the standard effect wrapper so
          // the card styling matches every other effect/property row.
          if (typeof obj.operation === 'string') {
            return (
              <div key={key} className="ops-frame-effect">
                <div className="ops-frame-effect-sentence"><span className="ops-frame-effect-verb">{label}</span></div>
                <div className="ops-frame-effect-with">
                  <ValueNodeTree node={obj} />
                </div>
              </div>
            );
          }
          if (obj.verb === VerbType.VARY_BY && Array.isArray(obj.value)) {
            return (
              <div key={key} className="ops-frame-effect">
                <div className="ops-frame-effect-sentence"><span className="ops-frame-effect-verb">{label}</span></div>
                <div className="ops-frame-effect-with"><div className="ops-frame-vary">
                  <VaryByLeaf node={obj} editState={editState} basePath={`${keyPath}.value`} />
                </div></div>
              </div>
            );
          }
          // Duration/quantity wrapper (shape: { value: <ValueNode>, unit }).
          // Render tree-style for any ValueNode inside — VARY_BY gets a table,
          // compound operations (ADD/MULT) get a recursive tree, simple IS
          // stays flat via the existing scalar branches below.
          if ('value' in obj && 'unit' in obj && obj.value && typeof obj.value === 'object') {
            const inner = obj.value as Record<string, unknown>;
            if (isValueNode(inner) && inner.verb !== VerbType.IS) {
              const unit = typeof obj.unit === 'string' ? obj.unit.replace(/_/g, ' ').toLowerCase() : '';
              return (
                <div key={key} className="ops-frame-effect">
                  <div className="ops-frame-effect-sentence">
                    <span className="ops-frame-effect-verb">{label}</span>
                    {unit && <span className="ops-frame-effect-obj" style={{ color: 'var(--text-muted)' }}>({unit})</span>}
                  </div>
                  <div className="ops-frame-effect-with">
                    {inner.verb === VerbType.VARY_BY && Array.isArray(inner.value) ? (
                      <div className="ops-frame-vary">
                        <VaryByLeaf node={inner} editState={editState} basePath={`${keyPath}.value.value`} />
                      </div>
                    ) : (
                      <ValueNodeTree node={inner} />
                    )}
                  </div>
                </div>
              );
            }
          }
          // Scalar {verb:IS, value:N} — editable leaf
          if (obj.verb === VerbType.IS && typeof obj.value === 'number') {
            if (editState) {
              return (
                <div key={key} className="ops-field">
                  <span className="ops-field-label">{label}</span>
                  <span className="ops-field-value">
                    <EditableValue value={obj.value} path={`${keyPath}.value`} editState={editState} />
                  </span>
                </div>
              );
            }
            return <ReadonlyField key={key} label={label} value={formatFlat(obj.value)} />;
          }
          // Duration with scalar {verb:IS, value:N} inside .value
          if ('value' in obj && obj.value && typeof obj.value === 'object') {
            const inner = obj.value as Record<string, unknown>;
            if (inner.verb === VerbType.IS && typeof inner.value === 'number') {
              const unit = typeof obj.unit === 'string' ? obj.unit.replace(/_/g, ' ').toLowerCase() : '';
              if (editState) {
                return (
                  <div key={key} className="ops-field">
                    <span className="ops-field-label">{label}</span>
                    <span className="ops-field-value">
                      <EditableValue value={inner.value} path={`${keyPath}.value.value`} editState={editState} />
                      {unit && <span style={{ marginLeft: 4, color: 'var(--text-muted)' }}>{unit}</span>}
                    </span>
                  </div>
                );
              }
            }
          }
        }
        // Top-level scalar number property (e.g. cooldownSeconds: 5)
        if (typeof val === 'number' && editState) {
          return (
            <div key={key} className="ops-field">
              <span className="ops-field-label">{label}</span>
              <span className="ops-field-value">
                <EditableValue value={val} path={keyPath} editState={editState} />
              </span>
            </div>
          );
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
  STATUS: (i) => String(i),
};

function VaryByLeaf({ node, label, editState, basePath, talentSlot }: {
  node: Record<string, unknown>;
  label?: string;
  editState?: EditState;
  basePath?: string;
  /** Which talent slot this card belongs to; drives TALENT_LEVEL active-index resolution. */
  talentSlot?: 'one' | 'two';
}) {
  const vals = node.value as number[];
  const axisParts: string[] = [];
  if (node.objectQualifier) axisParts.push(String(node.objectQualifier).replace(/_/g, ' ').toLowerCase());
  axisParts.push(String(node.object ?? 'LEVEL').replace(/_/g, ' ').toLowerCase());
  if (node.objectId) axisParts.push(String(node.objectId).replace(/_/g, ' ').toLowerCase());
  const axis = axisParts.join(' ');
  const of = node.of ? formatOfChain(node.of as Record<string, unknown>) : '';
  const labelFn = VARY_AXIS_LABELS[String(node.object)] ?? ((i: number) => String(i + 1));

  const loadout = useContext(VaryByContext);
  const rawIndex = resolveActiveIndex(loadout, node.object as string | undefined, talentSlot);
  const activeIndex = rawIndex != null
    ? Math.max(0, Math.min(rawIndex, vals.length - 1))
    : undefined;

  return (
    <div className="ops-vt-vary">
      {label && <span className="ops-frame-prop-label">{label}</span>}
      <span className="ops-vt-vary-desc">vary by {axis}{of}</span>
      <VaryTable
        columnLabels={vals.map((_, i) => labelFn(i))}
        rows={[{ label: '', values: vals }]}
        style={{ marginTop: 2 }}
        editState={editState}
        basePath={basePath}
        activeIndex={activeIndex}
      />
    </div>
  );
}

/**
 * Render a single clause condition line. When the threshold is a VARY_BY ValueNode,
 * the numeric range is replaced with a full table (matching how effect VARY_BYs render).
 */
function ConditionLine({ condition }: { condition: Record<string, unknown> }) {
  const { prefix, thresholdNode, threshold } = splitConditionText(condition);
  const isVaryByThreshold = thresholdNode
    && thresholdNode.verb === VerbType.VARY_BY
    && Array.isArray(thresholdNode.value);
  if (isVaryByThreshold) {
    return (
      <div className="ops-clause-condition-text">
        <span>{prefix}</span>
        <VaryByLeaf node={thresholdNode!} />
      </div>
    );
  }
  return (
    <span className="ops-clause-condition-text">
      {threshold ? `${prefix} ${threshold}` : prefix}
    </span>
  );
}

/**
 * Recursively format an of-clause possessor chain into a human-readable string.
 * Walks nested `of.of` chains so the full ownership path renders, e.g.:
 *   `{ object: "STATUS", objectId: "INFLICTION", objectQualifier: "CRYO",
 *      of: { object: "ENEMY", determiner: "THIS" } }`
 *   → " of cryo infliction of this enemy"
 */
function formatOfChain(of: Record<string, unknown>): string {
  const parts: string[] = [];
  if (of.determiner) parts.push(translateDslToken(String(of.determiner)).toLowerCase());
  if (of.objectQualifier) parts.push(translateDslToken(String(of.objectQualifier)));
  if (of.objectId) parts.push(translateDslToken(String(of.objectId)));
  if (of.object) parts.push(translateDslToken(String(of.object)));
  const phrase = parts.length > 0 ? ` of ${parts.join(' ')}` : '';
  // Recurse into nested of-clause (e.g. "of CRYO INFLICTION → of THIS ENEMY")
  const nested = of.of as Record<string, unknown> | undefined;
  const nestedPhrase = nested ? formatOfChain(nested) : '';
  return phrase + nestedPhrase;
}

function ValueLeaf({ node, label }: { node: Record<string, unknown>; label?: string }) {
  if (node.verb === VerbType.IS && node.subject && node.subjectDeterminer && node.objectDeterminer) {
    // Identity comparison: "<subjDet> <subject> is <objDet> <object>"
    const subj = `${String(node.subjectDeterminer).toLowerCase()} ${String(node.subject).toLowerCase()}`;
    const obj = `${String(node.objectDeterminer).toLowerCase()} ${String(node.object ?? 'OPERATOR').toLowerCase()}`;
    return <span className="ops-vt-leaf">{label && <span className="ops-prop-tree-leaf-label">{label}</span>} {subj} is {obj}</span>;
  }
  if (node.verb === VerbType.IS && node.object === NounType.STAT) {
    const stat = String(node.objectId ?? node.stat ?? 'STAT').replace(/_/g, ' ');
    const statOfClause = node.of as { determiner?: string; object?: string } | undefined;
    const of = statOfClause?.determiner ? ` of ${statOfClause.determiner.toLowerCase()} operator` : '';
    return <span className="ops-vt-leaf">{label && <span className="ops-prop-tree-leaf-label">{label}</span>} {stat}{of}</span>;
  }
  if (node.verb === VerbType.IS && !node.object) return <span className="ops-vt-leaf">{label && <span className="ops-prop-tree-leaf-label">{label}</span>} {String(node.value)}</span>;
  if (node.verb === VerbType.VARY_BY && Array.isArray(node.value)) return <VaryByLeaf node={node} label={label} />;
  if (node.object && node.of) {
    // Render the full `of` possessor chain including qualifier and nested of-clause,
    // e.g. `stacks of CRYO INFLICTION of this ENEMY`.
    const ofLabel = formatOfChain(node.of as Record<string, unknown>);
    const qual = node.objectQualifier ? `${translateDslToken(String(node.objectQualifier))} ` : '';
    const id = node.objectId ? `${translateDslToken(String(node.objectId))} ` : '';
    return <span className="ops-vt-leaf">{label && <span className="ops-prop-tree-leaf-label">{label}</span>} {qual}{id}{translateDslToken(String(node.object))}{ofLabel}</span>;
  }
  if (node.object) {
    const qual = node.objectQualifier ? `${translateDslToken(String(node.objectQualifier))} ` : '';
    const id = node.objectId ? `${translateDslToken(String(node.objectId))} ` : '';
    return <span className="ops-vt-leaf">{qual}{id}{translateDslToken(String(node.object))} stacks</span>;
  }
  return <span className="ops-vt-leaf">{JSON.stringify(node)}</span>;
}

function ValueNodeTree({ node, depth = 0, label }: { node: Record<string, unknown>; depth?: number; label?: string }) {
  // Leaf: render inline with the label prefix (e.g. `VALUE vary by skill level`).
  if (!node.operation) return <ValueLeaf node={node} label={label} />;

  const op = String(node.operation);
  const left = node.left as Record<string, unknown>;
  const right = node.right as Record<string, unknown>;

  // Compound: render the operation tree. Recurse WITHOUT `label` so the label
  // isn't duplicated on every leaf of the subtree.
  const tree = (
    <div className="ops-vt-expr">
      <span className="ops-vt-op">{op}</span>
      <div className="ops-vt-children">
        <div className="ops-vt-branch ops-vt-branch--mid">
          <ValueNodeTree node={left} depth={depth + 1} />
        </div>
        <div className="ops-vt-branch ops-vt-branch--last">
          <ValueNodeTree node={right} depth={depth + 1} />
        </div>
      </div>
    </div>
  );

  // When called with a label on a compound node (e.g. `with.value = ADD(..,..)`),
  // show the label once as a parent wrapper and nest the whole operation tree
  // underneath. Without this, the label would be dropped entirely (bad) or
  // threaded to every leaf (worse — what the old recursion did).
  if (label) {
    return (
      <div className="ops-vt-labeled">
        <span className="ops-prop-tree-leaf-label">{label}</span>
        <div className="ops-prop-tree-children">
          <div className="ops-vt-branch ops-vt-branch--last">
            {tree}
          </div>
        </div>
      </div>
    );
  }
  return tree;
}

// ── Clause rendering ───────────────────────────────────────────────────────

function EffectView({ effect: ef, editState, basePath }: {
  effect: Record<string, unknown>;
  editState?: EditState;
  basePath?: string;
}) {
  const nestedEffects = Array.isArray(ef.effects) ? ef.effects as Record<string, unknown>[] : null;
  const nestedPredicates = Array.isArray(ef.predicates) ? ef.predicates as Record<string, unknown>[] : null;
  const nestedElseEffects = Array.isArray(ef.elseEffects) ? ef.elseEffects as Record<string, unknown>[] : null;

  // Collapse ALL/ANY with a single predicate and no flat effects into plain IF.
  // "ALL with one branch" = just a conditional, the compound header adds no meaning.
  const isCollapsibleCompound = nestedPredicates && nestedPredicates.length === 1
    && !nestedEffects && !nestedElseEffects
    && (String(ef.verb) === VerbType.ALL || String(ef.verb) === VerbType.ANY);
  if (isCollapsibleCompound) {
    return (
      <ClausePredicateView
        predicate={nestedPredicates[0]}
        editState={editState}
        basePath={basePath ? `${basePath}.predicates[0]` : undefined}
      />
    );
  }

  if (nestedEffects || nestedPredicates) {
    const constraint = ef.cardinalityConstraint as string | undefined;
    const val = ef.value as string | number | undefined;
    const constraintLabel = [constraint?.replace(/_/g, ' '), val].filter(Boolean).join(' ');
    // For CHANCE, render the probability from with.value
    const isChance = String(ef.verb) === VerbType.CHANCE;
    const chanceWith = isChance ? (ef.with as Record<string, unknown> | undefined)?.value as Record<string, unknown> | undefined : undefined;
    return (
      <div className="ops-frame-effect">
        <div className="ops-frame-effect-sentence">
          <span className="ops-frame-effect-verb">{String(ef.verb).replace(/_/g, ' ')}</span>
          {constraintLabel && <span className="ops-frame-effect-prep">{constraintLabel}</span>}
        </div>
        {/* All children in ONE tree container so branch lines connect */}
        <div className="ops-prop-tree-children">
          {/* CHANCE probability display */}
          {chanceWith && (
            <div className="ops-vt-branch ops-vt-branch--mid">
              <ValueNodeTree node={chanceWith} label="probability" />
            </div>
          )}
          {/* Predicated branches (CHANCE/ALL/ANY with conditions + effects) */}
          {nestedPredicates && nestedPredicates.flatMap((pred, pi) => {
            const conditions = ((pred as Record<string, unknown>).conditions ?? []) as unknown[];
            const effects = ((pred as Record<string, unknown>).effects ?? []) as Record<string, unknown>[];
            const isLastPred = !nestedEffects && pi === nestedPredicates.length - 1;

            // Unconditional predicates: flatten effects into the parent container
            // so they render at the same level as conditional predicates (siblings
            // of CHANCE, not nested one level deeper).
            if (conditions.length === 0) {
              return effects.map((ef, ei) => {
                const isLast = isLastPred && ei === effects.length - 1;
                return (
                  <div key={`p-${pi}-e-${ei}`} className={`ops-vt-branch${isLast ? '' : ' ops-vt-branch--mid'}`}>
                    <EffectView
                      effect={ef}
                      editState={editState}
                      basePath={basePath ? `${basePath}.predicates[${pi}].effects[${ei}]` : undefined}
                    />
                  </div>
                );
              });
            }

            // Conditional predicates: render as IF block via ClausePredicateView
            return [(
              <div key={`p-${pi}`} className={`ops-vt-branch${isLastPred ? '' : ' ops-vt-branch--mid'}`}>
                <ClausePredicateView
                  predicate={pred}
                  editState={editState}
                  basePath={basePath ? `${basePath}.predicates[${pi}]` : undefined}
                />
              </div>
            )];
          })}
          {/* Flat effects (hit branch for CHANCE, unconditional for ALL/ANY) */}
          {nestedEffects && nestedEffects.map((nested, ni) => {
            const isLast = ni === nestedEffects.length - 1;
            return (
              <div key={ni} className={`ops-vt-branch${isLast ? '' : ' ops-vt-branch--mid'}`}>
                <EffectView
                  effect={nested}
                  editState={editState}
                  basePath={basePath ? `${basePath}.effects[${ni}]` : undefined}
                />
              </div>
            );
          })}
        </div>
        {/* CHANCE else branch */}
        {nestedElseEffects && nestedElseEffects.length > 0 && (
          <>
            <div className="ops-frame-effect-sentence" style={{ marginTop: 2 }}>
              <span className="ops-frame-effect-verb">ELSE</span>
            </div>
            <div className="ops-prop-tree-children">
              {nestedElseEffects.map((nested, ni) => (
                <div key={`else-${ni}`} className={`ops-vt-branch${ni === nestedElseEffects.length - 1 ? '' : ' ops-vt-branch--mid'}`}>
                  <EffectView
                    effect={nested}
                    editState={editState}
                    basePath={basePath ? `${basePath}.elseEffects[${ni}]` : undefined}
                  />
                </div>
              ))}
            </div>
          </>
        )}
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
            // Resolve the underlying raw value for this `with` key so we can
            // determine whether it is an editable numeric leaf. We need to
            // mirror the unwrapping that happens above: `{unit, value}` →
            // inner is the `value`; otherwise raw `with[key]`.
            const rawWith = (ef.with as Record<string, unknown> | undefined)?.[item.key];
            const unwrapped = (rawWith && typeof rawWith === 'object' && 'unit' in (rawWith as Record<string, unknown>) && 'value' in (rawWith as Record<string, unknown>))
              ? (rawWith as Record<string, unknown>).value
              : rawWith;
            const isScalarIs =
              unwrapped && typeof unwrapped === 'object'
              && (unwrapped as Record<string, unknown>).verb === VerbType.IS
              && typeof (unwrapped as Record<string, unknown>).value === 'number';

            // Build edit path: basePath points to the effect, then descend
            // through .with.<key>. If the outer value had {unit,value}, we
            // descend into .value first before hitting the IS node.
            let editPath: string | undefined;
            if (editState && basePath && isScalarIs) {
              const hasUnitWrapper = rawWith !== unwrapped;
              editPath = hasUnitWrapper
                ? `${basePath}.with.${item.key}.value.value`
                : `${basePath}.with.${item.key}.value`;
            }

            // Build VARY_BY cell path for complex nodes
            let varyBasePath: string | undefined;
            if (editState && basePath && item.type === 'complex'
                && item.node
                && item.node.verb === VerbType.VARY_BY
                && Array.isArray(item.node.value)) {
              const hasUnitWrapper = rawWith !== unwrapped;
              varyBasePath = hasUnitWrapper
                ? `${basePath}.with.${item.key}.value.value`
                : `${basePath}.with.${item.key}.value`;
            }

            return (
              <div key={item.key} className={`ops-vt-branch${isLast ? '' : ' ops-vt-branch--mid'}`}>
                {item.type === 'scalar' ? (
                  editPath && isScalarIs ? (
                    <span className="ops-prop-tree-leaf">
                      <span className="ops-prop-tree-leaf-label">{item.label}</span>{' '}
                      <EditableValue
                        value={(unwrapped as Record<string, unknown>).value as number}
                        path={editPath}
                        editState={editState}
                      />
                    </span>
                  ) : (
                    <span className="ops-prop-tree-leaf">
                      <span className="ops-prop-tree-leaf-label">{item.label}</span> {item.display}
                    </span>
                  )
                ) : (
                  varyBasePath ? (
                    <VaryByLeaf node={item.node!} label={item.label} editState={editState} basePath={varyBasePath} />
                  ) : (
                    <ValueNodeTree node={item.node!} label={item.label} />
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClausePredicateView({ predicate, editState, basePath }: {
  predicate: Record<string, unknown>;
  editState?: EditState;
  basePath?: string;
}) {
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
                <ConditionLine condition={c} />
              </div>
            );
          })}
          {effects.map((ef, ei) => {
            idx++;
            return (
              <div key={`ef-${ei}`} className={`ops-vt-branch${idx === allChildren ? '' : ' ops-vt-branch--mid'}`}>
                <EffectView
                  effect={ef}
                  editState={editState}
                  basePath={basePath ? `${basePath}.effects[${ei}]` : undefined}
                />
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
        <EffectView
          key={ei}
          effect={ef}
          editState={editState}
          basePath={basePath ? `${basePath}.effects[${ei}]` : undefined}
        />
      ))}
    </div>
  );
}

function FrameClauseView({ clauses, editState, basePath }: {
  clauses: Record<string, unknown>[];
  editState?: EditState;
  basePath?: string;
}) {
  return (
    <>
      {clauses.map((pred, pi) => (
        <ClausePredicateView
          key={pi}
          predicate={pred}
          editState={editState}
          basePath={basePath ? `${basePath}[${pi}]` : undefined}
        />
      ))}
    </>
  );
}

function ClauseTabContent({ label, data, editState, basePath }: {
  label: string;
  data: unknown[];
  editState?: EditState;
  basePath?: string;
}) {
  return (
    <div className="ops-prop-tree">
      <span className="ops-prop-tree-label">{label}</span>
      {(data as Record<string, unknown>[]).map((pred, pi) => (
        <ClausePredicateView
          key={pi}
          predicate={pred}
          editState={editState}
          basePath={basePath ? `${basePath}[${pi}]` : undefined}
        />
      ))}
    </div>
  );
}

export function ClauseTabs({ clause, onTrigger, onEntry, onExit, editState, basePath }: {
  clause: unknown[];
  onTrigger: unknown[];
  onEntry: unknown[];
  onExit: unknown[];
  editState?: EditState;
  /** Path to the parent (e.g. "" for event root, "segments[i]" for segment). */
  basePath?: string;
}) {
  const tabs: { key: string; label: string; data: unknown[] }[] = [];
  if (clause.length > 0) tabs.push({ key: 'clause', label: t('dsl.clauseType.clause'), data: clause });
  if (onTrigger.length > 0) tabs.push({ key: 'onTriggerClause', label: t('dsl.clauseType.onTriggerClause'), data: onTrigger });
  if (onEntry.length > 0) tabs.push({ key: 'onEntryClause', label: t('dsl.clauseType.onEntryClause'), data: onEntry });
  if (onExit.length > 0) tabs.push({ key: 'onExitClause', label: t('dsl.clauseType.onExitClause'), data: onExit });
  const [activeTab, setActiveTab] = useState(0);

  if (tabs.length === 0) return null;
  const safeTab = Math.min(activeTab, tabs.length - 1);

  const buildPath = (tabKey: string) => {
    if (!basePath) return tabKey;
    return basePath.length > 0 ? `${basePath}.${tabKey}` : tabKey;
  };

  if (tabs.length === 1) {
    return (
      <div className="ops-clause-tabs">
        <ClauseTabContent
          label={tabs[0].label}
          data={tabs[0].data}
          editState={editState}
          basePath={buildPath(tabs[0].key)}
        />
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
      <ClauseTabContent
        label={tabs[safeTab].label}
        data={tabs[safeTab].data}
        editState={editState}
        basePath={buildPath(tabs[safeTab].key)}
      />
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

function FrameDetail({ frame, label, isCrit, onToggleCrit, editState, basePath }: {
  frame: JsonSkillData;
  label?: string;
  isCrit?: boolean;
  onToggleCrit?: (value: boolean) => void;
  editState?: EditState;
  basePath?: string;
}) {
  const offset = frame.properties?.offset ?? frame.offset as { value: unknown; unit: string } | undefined;
  const offsetStr = formatDuration(offset);
  const clause = (frame.clause ?? []) as unknown as { conditions?: unknown[]; effects?: Record<string, unknown>[] }[];

  interface FrameProp { key: string; label: string; display: string; editPath?: string; numericValue?: number }
  const props: FrameProp[] = [];
  const frameProps = frame.properties as Record<string, unknown> | undefined;
  if (frameProps) {
    for (const [k, v] of Object.entries(frameProps)) {
      if (k === 'offset' || k === 'name' || k === 'description') continue;
      if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
        // Attempt to locate a numeric leaf for inline editing.
        const obj = v as Record<string, unknown>;
        if (obj.verb === VerbType.IS && typeof obj.value === 'number' && basePath) {
          props.push({
            key: k,
            label: k.replace(/_/g, ' '),
            display: formatWithValue(obj),
            editPath: `${basePath}.properties.${k}.value`,
            numericValue: obj.value,
          });
        } else {
          props.push({ key: k, label: k.replace(/_/g, ' '), display: formatWithValue(obj) });
        }
      } else if (v != null) {
        if (typeof v === 'number' && basePath) {
          props.push({
            key: k,
            label: k.replace(/_/g, ' '),
            display: String(v),
            editPath: `${basePath}.properties.${k}`,
            numericValue: v,
          });
        } else {
          props.push({ key: k, label: k.replace(/_/g, ' '), display: String(v) });
        }
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
          {props.map((p) => (
            <div key={p.key} className="ops-frame-prop">
              <span className="ops-frame-prop-label">{p.label}</span>
              <span className="ops-frame-prop-value">
                {editState && p.editPath && p.numericValue != null ? (
                  <EditableValue value={p.numericValue} path={p.editPath} editState={editState} />
                ) : (
                  p.display
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {clause.length > 0 ? (
        <div className="ops-frame-effects">
          <FrameClauseView
            clauses={clause as unknown as Record<string, unknown>[]}
            editState={editState}
            basePath={basePath ? `${basePath}.clause` : undefined}
          />
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
        // Only DEAL DAMAGE effects contribute to the skill card's total multiplier.
        // Other verbs (APPLY stacks, DEAL STAGGER, etc.) must not pollute the sum.
        if (ef.verb !== VerbType.DEAL || ef.object !== NounType.DAMAGE) continue;
        const withProps = (ef.with ?? {}) as Record<string, unknown>;
        const valProp = withProps.value;
        const w = valProp && typeof valProp === 'object' ? valProp as Record<string, unknown> : null;
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
  return totals;
}

export function TabbedSegmentView({ entry, critState, editState }: {
  entry: { id: string; label: string; data: JsonSkillData };
  critState?: FrameCritState;
  editState?: EditState;
}) {
  const segments = entry.data.segments ?? [];
  const topFrames = entry.data.frames ?? [];
  const [activeSegTab, setActiveSegTab] = useState(0);
  const [activeFrameTab, setActiveFrameTab] = useState<number | null>(null);
  const varyByLoadout = useContext(VaryByContext);

  const handleSegChange = useCallback((si: number) => {
    setActiveSegTab(si);
    setActiveFrameTab(null);
  }, []);

  // React's synthetic onWheel is registered passive, so preventDefault() inside
  // it is a no-op — the outer info pane keeps scrolling vertically. Attach a
  // non-passive native listener to intercept the wheel and redirect vertical
  // deltas into horizontal scroll on the tabs row itself.
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  if (segments.length === 0 && topFrames.length === 0) return null;

  if (segments.length === 0) {
    const flatFrame = activeFrameTab != null ? activeFrameTab : 0;
    return (
      <div className="ops-seg-view">
        <div className="ops-conjoined-tabs" ref={tabsRef}>
          <div className="ops-conjoined-row ops-conjoined-row--frame">
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
            editState={editState}
            basePath={`frames[${flatFrame}]`}
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
      <div className="ops-conjoined-tabs" ref={tabsRef}>
        <div className="ops-conjoined-row ops-conjoined-row--seg">
          {segments.map((s, si) => {
            const isActiveSeg = safeSeg === si && !viewingFrame;
            return (
              <button
                key={si}
                type="button"
                className={`ops-conjoined-seg${safeSeg === si ? ' ops-conjoined-seg--current' : ''}${isActiveSeg ? ' ops-conjoined-seg--active' : ''}`}
                onClick={() => handleSegChange(si)}
                title={s.properties?.name || `Segment ${si + 1}`}
              >
                <span className="ops-conjoined-seg-label">{s.properties?.name || `Segment ${si + 1}`}</span>
              </button>
            );
          })}
        </div>
        <div className="ops-conjoined-row ops-conjoined-row--frame">
          {segments.map((s, si) => {
            const frames = (s.frames ?? []) as JsonSkillData[];
            const isEmpty = frames.length === 0;
            return (
              <div
                key={si}
                className={`ops-conjoined-frame-group${isEmpty ? ' ops-conjoined-frame-group--empty' : ''}`}
              >
                {frames.map((_f, fi) => (
                  <button
                    key={fi}
                    type="button"
                    className={`ops-conjoined-btn${safeSeg === si && activeFrameTab === fi ? ' ops-conjoined-btn--active' : ''}`}
                    onClick={() => { setActiveSegTab(si); setActiveFrameTab(fi); }}
                  >
                    {toRoman(fi + 1)}
                  </button>
                ))}
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
            editState={editState}
            basePath={`segments[${safeSeg}].frames[${activeFrameTab}]`}
          />
        ) : (
          <div className="ops-frame-detail ops-frame-detail--accented">
            <div className="ops-frame-accent-label">{seg.properties?.name || `Segment ${safeSeg + 1}`}</div>
            {(() => {
              const segDur = seg.properties?.duration ?? seg.duration as { value: unknown; unit: string } | undefined;
              if (!segDur) return null;
              const range = resolveLeafRange((segDur as { value: unknown }).value);
              const unit = (segDur as { unit: string }).unit === UnitType.FRAME ? 'f' : 's';
              if (range && range.length > 1 && new Set(range).size > 1) {
                // VARY_BY duration — editable cells. Resolve the path to the inner values[] array.
                const durObj = segDur as Record<string, unknown>;
                const durValue = durObj.value as Record<string, unknown> | undefined;
                const hasNestedVary = durValue && durValue.verb === VerbType.VARY_BY;
                const varyBasePath = hasNestedVary
                  ? `segments[${safeSeg}].properties.duration.value.value`
                  : `segments[${safeSeg}].properties.duration.value`;
                return (
                  <div className="ops-frame-effect">
                    <div className="ops-frame-effect-sentence">
                      <span className="ops-frame-effect-verb">Duration</span>
                    </div>
                    <div className="ops-frame-effect-with"><div className="ops-frame-vary">
                      <VaryTable
                        columnLabels={range.map((_v, vi) => vi + 1)}
                        rows={[{ label: unit, values: range }]}
                        editState={editState}
                        basePath={varyBasePath}
                      />
                    </div></div>
                  </div>
                );
              }
              // Scalar duration — editable leaf. PERMANENT_DURATION (99999) renders
              // as the text label "Infinite" instead of an editable field.
              const scalarVal = range && range.length > 0 ? range[0] : null;
              if (scalarVal != null && scalarVal >= PERMANENT_DURATION) {
                return (
                  <div className="ops-frame-prop">
                    <span className="ops-frame-prop-label">Duration</span>
                    <span className="ops-frame-prop-value">Infinite</span>
                  </div>
                );
              }
              if (scalarVal != null && editState) {
                const durObj = segDur as Record<string, unknown>;
                const durValue = durObj.value;
                const hasIsWrapper = durValue && typeof durValue === 'object'
                  && (durValue as Record<string, unknown>).verb === VerbType.IS;
                const scalarPath = hasIsWrapper
                  ? `segments[${safeSeg}].properties.duration.value.value`
                  : `segments[${safeSeg}].properties.duration.value`;
                return (
                  <div className="ops-frame-prop">
                    <span className="ops-frame-prop-label">Duration</span>
                    <span className="ops-frame-prop-value">
                      <EditableValue value={scalarVal} path={scalarPath} editState={editState} />
                      <span style={{ marginLeft: 4, color: 'var(--text-muted)' }}>{unit}</span>
                    </span>
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
              if (totals) {
                const rawIdx = resolveActiveIndex(varyByLoadout, NounType.SKILL_LEVEL);
                const totalActiveIdx = rawIdx != null ? Math.max(0, Math.min(rawIdx, totals.length - 1)) : undefined;
                return (
                  <div className="ops-frame-effect">
                    <div className="ops-frame-effect-sentence">
                      <span className="ops-frame-effect-verb">Total Multiplier</span>
                    </div>
                    <div className="ops-frame-effect-with"><div className="ops-frame-vary">
                      <VaryTable columnLabels={totals.map((_v, vi) => vi + 1)} rows={[{ label: 'value', values: totals.map(v => Math.round(v * 1000) / 1000) }]} activeIndex={totalActiveIdx} />
                    </div></div>
                  </div>
                );
              }
              return null;
            })()}
            <ClauseTabs
              clause={segClause as unknown[]}
              onTrigger={(seg.onTriggerClause ?? []) as unknown[]}
              onEntry={(seg.onEntryClause ?? []) as unknown[]}
              onExit={(seg.onExitClause ?? []) as unknown[]}
              editState={editState}
              basePath={`segments[${safeSeg}]`}
            />
            {segFrames.map((f, fi) => {
              const fOffset = f.properties?.offset ?? f.offset as { value: unknown; unit: string } | undefined;
              const fOffsetStr = formatDuration(fOffset);
              const fClause = (f.clause ?? []) as unknown as Record<string, unknown>[];
              const framePath = `segments[${safeSeg}].frames[${fi}]`;
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
                      <FrameClauseView
                        clauses={fClause}
                        editState={editState}
                        basePath={`${framePath}.clause`}
                      />
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

export function DataCardBody({ data, extraFields, critState, editState, varyByLoadout }: {
  data: Record<string, unknown>;
  extraFields?: React.ReactNode;
  critState?: FrameCritState;
  /**
   * Optional edit state — when provided, numeric leaves become inline-editable.
   * Paths are rooted at the serialized data object (e.g. "properties.duration.value",
   * "segments[0].frames[1].clause[0].effects[0].with.multiplier.value[2]").
   */
  editState?: EditState;
  /**
   * Optional live loadout — when provided, every VARY_BY table inside this card
   * highlights the column matching the operator's current skill/potential/talent
   * level. Single entry point for active-column highlighting across every
   * caller (event info pane, customizer, loadout pane).
   */
  varyByLoadout?: VaryByLoadout;
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

  const body = (
    <div className="ops-skill-form">
      {id && <ReadonlyField label="ID" value={id} />}
      {name && <ReadonlyField label="Name" value={name} />}
      {element && <ReadonlyField label="Element" value={element} />}
      {desc && <ReadonlyField label="Description" value={desc} />}
      {/*
        Top-level properties and clauses live on the cached JSON, not on the
        TimelineEvent itself — the DataCardBody data for a status or skill
        comes from `getAnyStatusSerialized()` / `getOperatorSkill().serialize()`.
        `jsonOverrides` are walked against the TimelineEvent, whose shape only
        matches the `segments[*]` subtree. So top-level editing is intentionally
        disabled here; only segment-rooted paths are threaded through.
      */}
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
        <TabbedSegmentView
          entry={{ id: id ?? 'entry', label: name, data: data as JsonSkillData }}
          critState={critState}
          editState={editState}
        />
      )}
    </div>
  );

  // Every card unconditionally publishes a VaryByContext. Dimensions missing
  // from the loadout render without highlight, but the provider is always
  // there — no gating on the presentation layer.
  return <VaryByContext.Provider value={varyByLoadout ?? {}}>{body}</VaryByContext.Provider>;
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
