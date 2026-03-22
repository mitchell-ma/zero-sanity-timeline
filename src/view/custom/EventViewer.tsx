/**
 * EventViewer — flat form for viewing/editing any event type.
 *
 * Completely flat layout — no nested cards or sections.
 * Hierarchy communicated through title sizes and contrast only.
 */
import { useState } from 'react';
import ClauseEditor from './ClauseEditor';
import type { Clause } from '../../consts/semantics';
import CustomSelect from './CustomSelect';

// ── Types ───────────────────────────────────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type EventJson = Record<string, JsonValue>;
type EventKind = 'status' | 'skill';

// ── Constants ───────────────────────────────────────────────────────────────

const KIND_OPTIONS = [
  { value: 'status', label: 'Status Event' },
  { value: 'skill', label: 'Skill Event' },
];

const TYPE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'TALENT', label: 'Talent' },
  { value: 'TALENT_STATUS', label: 'Talent Status' },
  { value: 'GEAR_STATUS', label: 'Gear Status' },
  { value: 'WEAPON_STATUS', label: 'Weapon Status' },
];

const ELEMENT_OPTIONS = [
  { value: '', label: '—' },
  { value: 'HEAT', label: 'Heat' },
  { value: 'ELECTRIC', label: 'Electric' },
  { value: 'CRYO', label: 'Cryo' },
  { value: 'NATURE', label: 'Nature' },
];

const TARGET_OPTIONS = [
  { value: '', label: '—' },
  { value: 'OPERATOR', label: 'Operator' },
  { value: 'ENEMY', label: 'Enemy' },
];

const DETERMINER_OPTIONS = [
  { value: '', label: '—' },
  { value: 'THIS', label: 'This' },
  { value: 'OTHER', label: 'Other' },
  { value: 'ALL', label: 'All' },
  { value: 'ANY', label: 'Any' },
];

const DURATION_UNIT_OPTIONS = [
  { value: 'SECOND', label: 'Seconds' },
  { value: 'FRAME', label: 'Frames' },
];

const INTERACTION_OPTIONS = [
  { value: '', label: '—' },
  { value: 'NONE', label: 'None' },
  { value: 'RESET', label: 'Reset' },
];

const CLAUSE_TABS_STATUS = [
  { key: 'clause', label: 'Clause' },
  { key: 'onTriggerClause', label: 'On Trigger' },
  { key: 'onEntryClause', label: 'On Entry' },
  { key: 'onExitClause', label: 'On Exit' },
] as const;

const CLAUSE_TABS_SKILL = [
  { key: 'clause', label: 'Clause' },
  { key: 'onTriggerClause', label: 'On Trigger' },
] as const;

const DEPENDENCY_OPTIONS = [
  { value: 'PREVIOUS_FRAME', label: 'Previous Frame' },
];

function detectKind(value: EventJson): EventKind {
  const props = value.properties as Record<string, JsonValue> | undefined;
  if (props?.id || props?.type || props?.element || props?.target || props?.statusLevel) return 'status';
  if (props?.windowFrames || props?.dependencyTypes || props?.description) return 'skill';
  return 'status';
}

// ── Props ───────────────────────────────────────────────────────────────────

interface EventViewerProps {
  value: EventJson;
  onChange: (value: EventJson) => void;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function EventViewer({ value, onChange }: EventViewerProps) {
  const [kind, setKind] = useState<EventKind>(() => detectKind(value));
  const [activeSegment, setActiveSegment] = useState(0);
  const [activeFrame, setActiveFrame] = useState(0);
  const [activeClauseTab, setActiveClauseTab] = useState('clause');
  const [activeSegClauseTab, setActiveSegClauseTab] = useState('clause');

  const props = (value.properties ?? {}) as Record<string, JsonValue>;
  const meta = (value.metadata ?? {}) as Record<string, JsonValue>;
  const segments = (value.segments ?? []) as EventJson[];
  const seg = segments[activeSegment];
  const segProps = seg ? (seg.properties ?? {}) as Record<string, JsonValue> : null;
  const frames = seg ? ((seg.frames ?? []) as EventJson[]) : [];
  const frame = frames[activeFrame];
  const frameProps = frame ? (frame.properties ?? {}) as Record<string, JsonValue> : null;

  const clauseTabs = kind === 'skill' ? CLAUSE_TABS_SKILL : CLAUSE_TABS_STATUS;

  const updateProps = (patch: Record<string, JsonValue>) => onChange({ ...value, properties: { ...props, ...patch } });
  const updateMeta = (patch: Record<string, JsonValue>) => onChange({ ...value, metadata: { ...meta, ...patch } });

  const updateSegment = (s: EventJson) => {
    const next = [...segments];
    next[activeSegment] = s;
    onChange({ ...value, segments: next });
  };
  const addSegment = () => {
    const next = [...segments, { properties: { name: '', duration: { value: 0, unit: 'SECOND' } }, frames: [] }];
    onChange({ ...value, segments: next });
    setActiveSegment(next.length - 1);
    setActiveFrame(0);
  };
  const removeSegment = () => {
    const next = segments.filter((_, j) => j !== activeSegment);
    onChange({ ...value, segments: next.length ? next : null });
    setActiveSegment(Math.min(activeSegment, Math.max(0, next.length - 1)));
    setActiveFrame(0);
  };

  const updateFrame = (f: EventJson) => {
    const newFrames = [...frames];
    newFrames[activeFrame] = f;
    updateSegment({ ...seg!, frames: newFrames });
  };
  const addFrame = () => {
    const newFrames = [...frames, { properties: {}, clause: [] }];
    updateSegment({ ...seg!, frames: newFrames });
    setActiveFrame(newFrames.length - 1);
  };
  const removeFrame = () => {
    const newFrames = frames.filter((_, j) => j !== activeFrame);
    updateSegment({ ...seg!, frames: newFrames });
    setActiveFrame(Math.min(activeFrame, Math.max(0, newFrames.length - 1)));
  };

  return (
    <div className="ev">
      {/* ── Kind toggle ─────────────────────────────────────────────────── */}
      <div className="ev-kind-bar">
        {KIND_OPTIONS.map((opt) => (
          <button key={opt.value} className={`ev-kind-btn${kind === opt.value ? ' ev-kind-btn--active' : ''}`} onClick={() => setKind(opt.value as EventKind)}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* ════════════════ PROPERTIES ════════════════ */}
      <div className="ev-title">Properties</div>

      {kind === 'status' && (
        <>
          <Row label="ID"><input className="ib-input ev-input--wide" type="text" value={(props.id as string) ?? ''} onChange={(e) => updateProps({ id: e.target.value || null })} placeholder="STATUS_ID" /></Row>
          <Row label="Name"><input className="ib-input ev-input--wide" type="text" value={(props.name as string) ?? ''} onChange={(e) => updateProps({ name: e.target.value || null })} placeholder="Display Name" /></Row>
          <Row label="Type"><CustomSelect className="ev-select" value={(props.type as string) ?? ''} options={TYPE_OPTIONS} onChange={(v) => updateProps({ type: v || null })} /></Row>
          <Row label="Element"><CustomSelect className="ev-select" value={(props.element as string) ?? ''} options={ELEMENT_OPTIONS} onChange={(v) => updateProps({ element: v || null })} /></Row>
          <Row label="Target">
            <CustomSelect className="ev-select" value={(props.target as string) ?? ''} options={TARGET_OPTIONS} onChange={(v) => updateProps({ target: v || null })} />
            <CustomSelect className="ev-select" value={(props.targetDeterminer as string) ?? ''} options={DETERMINER_OPTIONS} onChange={(v) => updateProps({ targetDeterminer: v || null })} />
          </Row>
          <Row label="Enhancement"><TagEditor value={(props.enhancementTypes as string[]) ?? []} options={['EMPOWERED', 'ENHANCED']} onChange={(v) => updateProps({ enhancementTypes: v.length ? v : null })} /></Row>
          <div className="ev-hr" />
          <DurationRow label="Duration" value={(props.duration as Record<string, JsonValue>) ?? null} onChange={(v) => updateProps({ duration: v })} />
          <StatusLevelRows value={(props.statusLevel as Record<string, JsonValue>) ?? null} onChange={(v) => updateProps({ statusLevel: v })} />
        </>
      )}

      {kind === 'skill' && (
        <>
          <Row label="Name"><input className="ib-input ev-input--wide" type="text" value={(props.name as string) ?? ''} onChange={(e) => updateProps({ name: e.target.value || null })} placeholder="Skill Name" /></Row>
          <Row label="Description"><input className="ib-input ev-input--wide" type="text" value={(props.description as string) ?? ''} onChange={(e) => updateProps({ description: e.target.value || null })} placeholder="Optional" /></Row>
          <DurationRow label="Duration" value={(props.duration as Record<string, JsonValue>) ?? null} onChange={(v) => updateProps({ duration: v })} />
          <Row label="Window"><input className="ib-input ev-input--num" type="number" step="any" min={0} value={(props.windowFrames as number) ?? ''} placeholder="frames" onChange={(e) => updateProps({ windowFrames: Number(e.target.value) || null })} /><span className="ev-unit">frames</span></Row>
          <Row label="Enhancement"><TagEditor value={(props.enhancementTypes as string[]) ?? []} options={['EMPOWERED', 'ENHANCED']} onChange={(v) => updateProps({ enhancementTypes: v.length ? v : null })} /></Row>
          <Row label="Dependencies"><TagEditor value={(props.dependencyTypes as string[]) ?? []} options={DEPENDENCY_OPTIONS.map(o => o.value)} onChange={(v) => updateProps({ dependencyTypes: v.length ? v : null })} /></Row>
        </>
      )}

      {/* ════════════════ METADATA ════════════════ */}
      <div className="ev-title">Metadata</div>
      <Row label="Origin ID"><input className="ib-input ev-input--wide" type="text" value={(meta.originId as string) ?? ''} onChange={(e) => updateMeta({ originId: e.target.value || null })} placeholder="e.g. laevatain" /></Row>
      {kind === 'skill' && (
        <Row label="Data Sources"><input className="ib-input ev-input--wide" type="text" value={Array.isArray(meta.dataSources) ? (meta.dataSources as string[]).join(', ') : ''} onChange={(e) => { const v = e.target.value.split(',').map(s => s.trim()).filter(Boolean); updateMeta({ dataSources: v.length ? v : null }); }} placeholder="END_AXIS, ENDFIELD_WIKI" /></Row>
      )}
      {kind === 'status' && (
        <>
          <Row label="Description"><input className="ib-input ev-input--wide" type="text" value={(meta.description as string) ?? ''} onChange={(e) => updateMeta({ description: e.target.value || null })} placeholder="Optional" /></Row>
          <Row label="Note"><input className="ib-input ev-input--wide" type="text" value={(meta.note as string) ?? ''} onChange={(e) => updateMeta({ note: e.target.value || null })} placeholder="Optional" /></Row>
        </>
      )}

      {/* ════════════════ CLAUSES ════════════════ */}
      <div className="ev-title">Clauses</div>
      <div className="ev-tabs">
        {clauseTabs.map((tab) => {
          const has = Array.isArray(value[tab.key]) && (value[tab.key] as unknown as Clause).length > 0;
          return (
            <button key={tab.key} className={`ev-tab${activeClauseTab === tab.key ? ' ev-tab--active' : ''}${has ? ' ev-tab--dot' : ''}`} onClick={() => setActiveClauseTab(tab.key)}>
              {tab.label}{has && <span className="ev-dot" />}
            </button>
          );
        })}
      </div>
      <ClauseEditor
        initialValue={(value[activeClauseTab] as unknown as Clause) ?? []}
        onChange={(clause) => onChange({ ...value, [activeClauseTab]: clause.length ? clause as unknown as JsonValue : null })}
      />

      {/* ════════════════ SEGMENTS ════════════════ */}
      <div className="ev-title">Segments</div>

      <div className="ev-tabs">
        {segments.map((s, i) => {
          const sp = (s.properties ?? {}) as Record<string, JsonValue>;
          return (
            <button key={i} className={`ev-tab${activeSegment === i ? ' ev-tab--active' : ''}`} onClick={() => { setActiveSegment(i); setActiveFrame(0); }}>
              {(sp.name as string) || `${i + 1}`}
            </button>
          );
        })}
        <button className="cv2-add-btn ev-tab-add" onClick={addSegment}>+ Add Segment</button>
      </div>

      {seg && segProps && (
        <>
          <div className="ev-subtitle">Properties</div>
          <Row label="Name"><input className="ib-input ev-input--wide" type="text" value={(segProps.name as string) ?? ''} onChange={(e) => updateSegment({ ...seg, properties: { ...segProps, name: e.target.value || null } })} /></Row>
          <DurationRow label="Duration" value={(segProps.duration as Record<string, JsonValue>) ?? null} onChange={(v) => updateSegment({ ...seg, properties: { ...segProps, duration: v } })} />

          <div className="ev-subtitle">Clauses</div>
          <div className="ev-tabs">
            {clauseTabs.map((tab) => {
              const has = Array.isArray(seg[tab.key]) && (seg[tab.key] as unknown as Clause).length > 0;
              return (
                <button key={tab.key} className={`ev-tab${activeSegClauseTab === tab.key ? ' ev-tab--active' : ''}${has ? ' ev-tab--dot' : ''}`} onClick={() => setActiveSegClauseTab(tab.key)}>
                  {tab.label}{has && <span className="ev-dot" />}
                </button>
              );
            })}
          </div>
          <ClauseEditor
            initialValue={(seg[activeSegClauseTab] as unknown as Clause) ?? []}
            onChange={(clause) => updateSegment({ ...seg, [activeSegClauseTab]: clause.length ? clause as unknown as JsonValue : null })}
          />

          {/* ──── Frames ──── */}
          <div className="ev-subtitle">Frames</div>

          <div className="ev-tabs ev-tabs--compact">
            {frames.map((_, i) => (
              <button key={i} className={`ev-tab${activeFrame === i ? ' ev-tab--active' : ''}`} onClick={() => setActiveFrame(i)}>{i + 1}</button>
            ))}
            <button className="cv2-add-btn ev-tab-add" onClick={addFrame}>+ Add Frame</button>
          </div>

          {frame && frameProps && (
            <>
              <Row label="Offset"><input className="ib-input ev-input--num" type="number" step="any" value={(frameProps.offset as number) ?? ''} placeholder="0" onChange={(e) => updateFrame({ ...frame, properties: { ...frameProps, offset: Number(e.target.value) || null } })} /></Row>
              <ClauseEditor
                initialValue={(frame.clause as unknown as Clause) ?? []}
                onChange={(clause) => updateFrame({ ...frame, clause: clause.length ? clause as unknown as JsonValue : null })}
              />
              <button className="cv2-add-btn ev-remove-btn" onClick={removeFrame}>Remove Frame</button>
            </>
          )}

          <div className="ev-hr" />
          <button className="cv2-add-btn ev-remove-btn" onClick={removeSegment}>Remove Segment</button>
        </>
      )}
    </div>
  );
}

// ── Primitives ──────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ev-row">
      <span className="ev-row-label">{label}</span>
      <div className="ev-row-controls">{children}</div>
    </div>
  );
}

function TagEditor({ value, options, onChange }: { value: string[]; options: string[]; onChange: (v: string[]) => void }) {
  const toggle = (tag: string) => {
    if (value.includes(tag)) onChange(value.filter((t) => t !== tag));
    else onChange([...value, tag]);
  };
  return (
    <div className="ev-tags">
      {options.map((t) => (
        <label key={t} className="ev-check">
          <input type="checkbox" checked={value.includes(t)} onChange={() => toggle(t)} />
          <span>{t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ')}</span>
        </label>
      ))}
    </div>
  );
}

function DurationRow({ label, value, onChange }: {
  label: string;
  value: Record<string, JsonValue> | null;
  onChange: (v: Record<string, JsonValue> | null) => void;
}) {
  if (!value) {
    return (
      <Row label={label}>
        <button className="cv2-add-btn ev-inline-add" onClick={() => onChange({ value: 0, unit: 'SECOND' })}>+ Set Duration</button>
      </Row>
    );
  }
  const hasVerb = 'verb' in value;
  return (
    <Row label={label}>
      <input className="ib-input ev-input--num" type="number" step="any" min={0}
        value={hasVerb ? ((value.values as number[])?.[0] ?? 0) : ((value.value as number) ?? 0)}
        onChange={(e) => { const n = Number(e.target.value) || 0; if (hasVerb) onChange({ ...value, values: [n] }); else onChange({ ...value, value: n }); }}
      />
      <CustomSelect className="ev-select" value={(value.unit as string) ?? 'SECOND'} options={DURATION_UNIT_OPTIONS} onChange={(v) => onChange({ ...value, unit: v })} />
      <button className="ev-clear" onClick={() => onChange(null)} title="Remove">&times;</button>
    </Row>
  );
}

function StatusLevelRows({ value, onChange }: {
  value: Record<string, JsonValue> | null;
  onChange: (v: Record<string, JsonValue> | null) => void;
}) {
  if (!value) {
    return (
      <Row label="Status Level">
        <button className="cv2-add-btn ev-inline-add" onClick={() => onChange({ limit: { verb: 'IS', value: 1 }, statusLevelInteractionType: 'NONE' })}>+ Set Status Level</button>
      </Row>
    );
  }
  const limit = (value.limit as Record<string, JsonValue>) ?? {};
  const interaction = (value.statusLevelInteractionType ?? value.interactionType ?? '') as string;
  return (
    <>
      <Row label="Max Stacks">
        <input className="ib-input ev-input--num" type="number" min={1}
          value={(limit.value as number) ?? (limit.values as number[])?.[0] ?? 1}
          onChange={(e) => onChange({ ...value, limit: { verb: 'IS', value: Number(e.target.value) || 1 } })}
        />
      </Row>
      <Row label="Interaction">
        <CustomSelect className="ev-select" value={interaction} options={INTERACTION_OPTIONS} onChange={(v) => onChange({ ...value, statusLevelInteractionType: v || null })} />
        <button className="ev-clear" onClick={() => onChange(null)} title="Remove">&times;</button>
      </Row>
    </>
  );
}
