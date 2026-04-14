/**
 * EventViewer — multi-page form for viewing/editing any event type.
 *
 * Page 1 (Event): Properties, Metadata, Clauses, "Edit Segments" button
 * Page 2 (Segments): Collapsible segment list, each with Properties/Clauses, "Edit Frames" button
 * Page 3 (Frames): Frame list with Properties + Clause
 *
 * Right side: live timeline preview strip.
 */
import { useState } from 'react';
import ClauseEditor from './ClauseEditor';
import { UnitType } from '../../consts/enums';
import { VerbType } from '../../dsl/semantics';
import type { Clause } from '../../dsl/semantics';
import CustomSelect from './CustomSelect';
import { t } from '../../locales/locale';

// ── Types ───────────────────────────────────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type EventJson = Record<string, JsonValue>;
type EventKind = 'status' | 'skill';

// ── Constants ───────────────────────────────────────────────────────────────

const KIND_OPTIONS = [
  { value: 'status', label: t('eventViewer.kind.status') },
  { value: 'skill', label: t('eventViewer.kind.skill') },
];

const TYPE_OPTIONS = [
  { value: '', label: '\u2014' },
  { value: 'TALENT', label: t('eventViewer.type.talent') },
  { value: 'SKILL_STATUS', label: t('eventViewer.type.skillStatus') },
  { value: 'GEAR_STATUS', label: t('eventViewer.type.gearStatus') },
  { value: 'WEAPON_STATUS', label: t('eventViewer.type.weaponStatus') },
  { value: 'POTENTIAL', label: t('eventViewer.type.potential') },
];

const ELEMENT_OPTIONS = [
  { value: '', label: '\u2014' },
  { value: 'HEAT', label: t('element.HEAT') },
  { value: 'ELECTRIC', label: t('element.ELECTRIC') },
  { value: 'CRYO', label: t('element.CRYO') },
  { value: 'NATURE', label: t('element.NATURE') },
];

const TARGET_OPTIONS = [
  { value: '', label: '\u2014' },
  { value: 'OPERATOR', label: t('eventViewer.target.operator') },
  { value: 'ENEMY', label: t('eventViewer.target.enemy') },
];

const DETERMINER_OPTIONS = [
  { value: '', label: '\u2014' },
  { value: 'THIS', label: t('eventViewer.determiner.this') },
  { value: 'OTHER', label: t('eventViewer.determiner.other') },
  { value: 'ALL', label: t('eventViewer.determiner.all') },
  { value: 'ANY', label: t('eventViewer.determiner.any') },
];

const DURATION_UNIT_OPTIONS = [
  { value: 'SECOND', label: t('eventViewer.duration.seconds') },
  { value: 'FRAME', label: t('eventViewer.duration.frames') },
];

const INTERACTION_OPTIONS = [
  { value: '', label: '\u2014' },
  { value: 'NONE', label: t('eventViewer.interaction.none') },
  { value: 'RESET', label: t('eventViewer.interaction.reset') },
];

const CLAUSE_TABS_STATUS = [
  { key: 'clause', label: t('eventViewer.tab.clause') },
  { key: 'onTriggerClause', label: t('eventViewer.tab.onTrigger') },
  { key: 'onEntryClause', label: t('eventViewer.tab.onEntry') },
  { key: 'onExitClause', label: t('eventViewer.tab.onExit') },
] as const;

const CLAUSE_TABS_SKILL = [
  { key: 'clause', label: t('eventViewer.tab.clause') },
  { key: 'onTriggerClause', label: t('eventViewer.tab.onTrigger') },
] as const;

const DEPENDENCY_OPTIONS: { value: string; label: string }[] = [];

function detectKind(value: EventJson): EventKind {
  const props = value.properties as Record<string, JsonValue> | undefined;
  if (props?.id || props?.type || props?.element || props?.target || props?.stacks) return 'status';
  if (props?.windowFrames || props?.dependencyTypes || props?.description) return 'skill';
  return 'status';
}

// ── Navigation ──────────────────────────────────────────────────────────────

type Page = { type: 'event' } | { type: 'segments' } | { type: 'frames'; segmentIndex: number };

// ── Props ───────────────────────────────────────────────────────────────────

interface EventViewerProps {
  value: EventJson;
  onChange: (value: EventJson) => void;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function EventViewer({ value, onChange }: EventViewerProps) {
  const [kind, setKind] = useState<EventKind>(() => detectKind(value));
  const [page, setPage] = useState<Page>({ type: 'event' });

  const props = (value.properties ?? {}) as Record<string, JsonValue>;
  const meta = (value.metadata ?? {}) as Record<string, JsonValue>;
  const segments = (value.segments ?? []) as EventJson[];
  const allClauseTabs = kind === 'skill' ? CLAUSE_TABS_SKILL : CLAUSE_TABS_STATUS;
  // Only show tabs that have content or are always relevant (clause).
  // Gear/weapon statuses that aren't trigger holders won't show empty trigger tabs.
  const clauseTabs = allClauseTabs.filter(tab =>
    tab.key === 'clause' || (Array.isArray(value[tab.key]) && (value[tab.key] as unknown[]).length > 0)
  );

  const updateProps = (patch: Record<string, JsonValue>) => onChange({ ...value, properties: { ...props, ...patch } });
  const updateMeta = (patch: Record<string, JsonValue>) => onChange({ ...value, metadata: { ...meta, ...patch } });

  const updateSegments = (segs: EventJson[]) => onChange({ ...value, segments: segs.length ? segs : null });

  // ── Preview data ────────────────────────────────────────────────────────
  const previewName = (props.name as string) || (props.id as string) || 'Untitled';
  const previewElement = (props.element as string) || undefined;
  const previewDuration = getDurationSeconds((props.duration as Record<string, JsonValue>) ?? null);

  return (
    <div className="ev-layout">
      {/* ── Left: Form ──────────────────────────────────────────────────── */}
      <div className="ev-form">
        {/* Breadcrumb */}
        <div className="ev-breadcrumb">
          <button className={`ev-crumb${page.type === 'event' ? ' ev-crumb--active' : ''}`} onClick={() => setPage({ type: 'event' })}>{t('eventViewer.tab.event')}</button>
          {(page.type === 'segments' || page.type === 'frames') && (
            <>
              <span className="ev-crumb-sep">/</span>
              <button className={`ev-crumb${page.type === 'segments' ? ' ev-crumb--active' : ''}`} onClick={() => setPage({ type: 'segments' })}>{t('eventViewer.tab.segments')}</button>
            </>
          )}
          {page.type === 'frames' && (
            <>
              <span className="ev-crumb-sep">/</span>
              <span className="ev-crumb ev-crumb--active">{t('eventViewer.tab.frames')} — {t('eventViewer.label.seg', { n: String(page.segmentIndex + 1) })}</span>
            </>
          )}
        </div>

        {/* Page content */}
        {page.type === 'event' && (
          <EventPage
            kind={kind} setKind={setKind}
            props={props} updateProps={updateProps}
            meta={meta} updateMeta={updateMeta}
            value={value} onChange={onChange}
            clauseTabs={clauseTabs}
            segmentCount={segments.length}
            onEditSegments={() => setPage({ type: 'segments' })}
          />
        )}
        {page.type === 'segments' && (
          <SegmentsPage
            segments={segments}
            onChange={updateSegments}
            clauseTabs={clauseTabs}
            onEditFrames={(si) => setPage({ type: 'frames', segmentIndex: si })}
          />
        )}
        {page.type === 'frames' && (
          <FramesPage
            segment={segments[page.segmentIndex]}
            onChange={(seg) => {
              const next = [...segments];
              next[page.segmentIndex] = seg;
              updateSegments(next);
            }}
          />
        )}
      </div>

      {/* ── Right: Preview ──────────────────────────────────────────────── */}
      <div className="ev-preview">
        <div className="ev-preview-header">
          <span className="ev-preview-label">{previewName}</span>
          {previewElement && <span className={`ev-preview-element ev-preview-element--${previewElement.toLowerCase()}`}>{previewElement}</span>}
        </div>
        <div className="ev-preview-track">
          {segments.length > 0 ? segments.map((seg, si) => {
            const sp = (seg.properties ?? {}) as Record<string, JsonValue>;
            const dur = getDurationSeconds((sp.duration as Record<string, JsonValue>) ?? null);
            const totalDur = previewDuration || segments.reduce((sum, s) => {
              const d = getDurationSeconds(((s.properties ?? {}) as Record<string, JsonValue>).duration as Record<string, JsonValue> ?? null);
              return sum + (d || 1);
            }, 0);
            const pct = totalDur > 0 ? ((dur || 1) / totalDur) * 100 : 100 / segments.length;
            return (
              <div key={si} className="ev-preview-seg" style={{ flex: `0 0 ${pct}%` }}>
                <div className="ev-preview-seg-bar" />
                <span className="ev-preview-seg-label">{(sp.name as string) || `${si + 1}`}</span>
                {dur != null && <span className="ev-preview-seg-dur">{dur}s</span>}
                {/* Frame markers */}
                {((seg.frames ?? []) as EventJson[]).map((_, fi) => {
                  const frameCount = ((seg.frames ?? []) as EventJson[]).length;
                  const leftPct = frameCount > 1 ? (fi / (frameCount - 1)) * 100 : 50;
                  return <div key={fi} className="ev-preview-frame" style={{ left: `${leftPct}%` }} />;
                })}
              </div>
            );
          }) : (
            <div className="ev-preview-seg" style={{ flex: 1 }}>
              <div className="ev-preview-seg-bar ev-preview-seg-bar--empty" />
              {previewDuration != null && <span className="ev-preview-seg-dur">{previewDuration}s</span>}
            </div>
          )}
        </div>
        {previewDuration != null && (
          <div className="ev-preview-total">{t('eventViewer.label.total', { value: String(previewDuration) })}</div>
        )}
      </div>
    </div>
  );
}

// ── Page 1: Event ───────────────────────────────────────────────────────────

function EventPage({ kind, setKind, props, updateProps, meta, updateMeta, value, onChange, clauseTabs, segmentCount, onEditSegments }: {
  kind: EventKind; setKind: (k: EventKind) => void;
  props: Record<string, JsonValue>; updateProps: (p: Record<string, JsonValue>) => void;
  meta: Record<string, JsonValue>; updateMeta: (p: Record<string, JsonValue>) => void;
  value: EventJson; onChange: (v: EventJson) => void;
  clauseTabs: readonly { key: string; label: string }[];
  segmentCount: number;
  onEditSegments: () => void;
}) {
  const [activeClauseTab, setActiveClauseTab] = useState('clause');

  return (
    <div className="ev">
      <div className="ev-kind-bar">
        {KIND_OPTIONS.map((opt) => (
          <button key={opt.value} className={`ev-kind-btn${kind === opt.value ? ' ev-kind-btn--active' : ''}`} onClick={() => setKind(opt.value as EventKind)}>
            {opt.label}
          </button>
        ))}
      </div>

      <div className="ev-title">{t('eventViewer.section.properties')}</div>
      {kind === 'status' ? (
        <StatusProperties props={props} updateProps={updateProps} />
      ) : (
        <SkillProperties props={props} updateProps={updateProps} />
      )}

      <div className="ev-title">{t('eventViewer.section.metadata')}</div>
      <Row label={t('eventViewer.label.originId')}><input className="ib-input ev-input--wide" type="text" value={(meta.originId as string) ?? ''} onChange={(e) => updateMeta({ originId: e.target.value || null })} placeholder={t('eventViewer.placeholder.originId')} /></Row>
      {kind === 'skill' && (
        <Row label={t('eventViewer.label.dataSources')}><input className="ib-input ev-input--wide" type="text" value={Array.isArray(meta.dataSources) ? (meta.dataSources as string[]).join(', ') : ''} onChange={(e) => { const v = e.target.value.split(',').map(s => s.trim()).filter(Boolean); updateMeta({ dataSources: v.length ? v : null }); }} placeholder="END_AXIS, ENDFIELD_WIKI" /></Row>
      )}
      {kind === 'status' && (
        <>
          <Row label={t('eventViewer.label.description')}><input className="ib-input ev-input--wide" type="text" value={(meta.description as string) ?? ''} onChange={(e) => updateMeta({ description: e.target.value || null })} /></Row>
          <Row label={t('eventViewer.label.note')}><input className="ib-input ev-input--wide" type="text" value={(meta.note as string) ?? ''} onChange={(e) => updateMeta({ note: e.target.value || null })} /></Row>
        </>
      )}

      <div className="ev-title">{t('eventViewer.section.clauses')}</div>
      <ClauseTabs value={value} onChange={onChange} tabs={clauseTabs} activeTab={activeClauseTab} setActiveTab={setActiveClauseTab} />

      <button className="ev-nav-btn" onClick={onEditSegments}>
        {t('eventViewer.tab.segments')}
        <span className="ev-nav-btn-count">{segmentCount}</span>
        <span className="ev-nav-btn-arrow">{'\u203A'}</span>
      </button>
    </div>
  );
}

// ── Page 2: Segments ────────────────────────────────────────────────────────

function SegmentsPage({ segments, onChange, clauseTabs, onEditFrames }: {
  segments: EventJson[];
  onChange: (segs: EventJson[]) => void;
  clauseTabs: readonly { key: string; label: string }[];
  onEditFrames: (segmentIndex: number) => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(segments.length > 0 ? 0 : null);

  const addSegment = () => {
    const next = [...segments, { properties: { name: '', duration: { value: { verb: VerbType.IS, value: 0 }, unit: UnitType.SECOND } }, frames: [] }];
    onChange(next);
    setExpandedIdx(next.length - 1);
  };

  const updateSegment = (i: number, seg: EventJson) => {
    const next = [...segments];
    next[i] = seg;
    onChange(next);
  };

  const removeSegment = (i: number) => {
    const next = segments.filter((_, j) => j !== i);
    onChange(next);
    if (expandedIdx === i) setExpandedIdx(next.length > 0 ? Math.min(i, next.length - 1) : null);
    else if (expandedIdx != null && expandedIdx > i) setExpandedIdx(expandedIdx - 1);
  };

  return (
    <div className="ev">
      <div className="ev-title">{t('eventViewer.tab.segments')}</div>

      {segments.map((seg, si) => {
        const sp = (seg.properties ?? {}) as Record<string, JsonValue>;
        const expanded = expandedIdx === si;
        const frameCount = ((seg.frames ?? []) as EventJson[]).length;

        return (
          <div key={si} className="ev-seg-item">
            <div className="ev-seg-bar" onClick={() => setExpandedIdx(expanded ? null : si)}>
              <span className="ev-seg-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
              <span className="ev-seg-name">{(sp.name as string) || t('eventViewer.segmentLabel', { number: String(si + 1) })}</span>
              <span className="ev-seg-meta">{frameCount} frame{frameCount !== 1 ? 's' : ''}</span>
              <button className="ev-clear" onClick={(e) => { e.stopPropagation(); removeSegment(si); }} title="Remove">&times;</button>
            </div>

            {expanded && (
              <SegmentContent
                segment={seg}
                onChange={(s) => updateSegment(si, s)}
                clauseTabs={clauseTabs}
                onEditFrames={() => onEditFrames(si)}
                frameCount={frameCount}
              />
            )}
          </div>
        );
      })}

      <button className="cv2-add-btn" onClick={addSegment}>{t('eventViewer.btn.addSegment')}</button>
    </div>
  );
}

function SegmentContent({ segment, onChange, clauseTabs, onEditFrames, frameCount }: {
  segment: EventJson;
  onChange: (s: EventJson) => void;
  clauseTabs: readonly { key: string; label: string }[];
  onEditFrames: () => void;
  frameCount: number;
}) {
  const [activeClauseTab, setActiveClauseTab] = useState('clause');
  const sp = (segment.properties ?? {}) as Record<string, JsonValue>;

  const updateProps = (patch: Record<string, JsonValue>) => {
    onChange({ ...segment, properties: { ...sp, ...patch } });
  };

  return (
    <div className="ev-seg-content">
      <div className="ev-subtitle">{t('eventViewer.section.properties')}</div>
      <Row label={t('eventViewer.label.name')}><input className="ib-input ev-input--wide" type="text" value={(sp.name as string) ?? ''} onChange={(e) => updateProps({ name: e.target.value || null })} /></Row>
      <DurationRow label={t('eventViewer.label.duration')} value={(sp.duration as Record<string, JsonValue>) ?? null} onChange={(v) => updateProps({ duration: v })} />

      <div className="ev-subtitle">{t('eventViewer.section.clauses')}</div>
      <ClauseTabs value={segment} onChange={onChange} tabs={clauseTabs} activeTab={activeClauseTab} setActiveTab={setActiveClauseTab} />

      <button className="ev-nav-btn" onClick={onEditFrames}>
        {t('eventViewer.tab.frames')}
        <span className="ev-nav-btn-count">{frameCount}</span>
        <span className="ev-nav-btn-arrow">{'\u203A'}</span>
      </button>
    </div>
  );
}

// ── Page 3: Frames ──────────────────────────────────────────────────────────

function FramesPage({ segment, onChange }: {
  segment: EventJson;
  onChange: (seg: EventJson) => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const frames = ((segment?.frames ?? []) as EventJson[]);

  const addFrame = () => {
    const next = [...frames, { properties: {}, clause: [] }];
    onChange({ ...segment, frames: next });
    setExpandedIdx(next.length - 1);
  };

  const updateFrame = (i: number, frame: EventJson) => {
    const next = [...frames];
    next[i] = frame;
    onChange({ ...segment, frames: next });
  };

  const removeFrame = (i: number) => {
    const next = frames.filter((_, j) => j !== i);
    onChange({ ...segment, frames: next });
    if (expandedIdx === i) setExpandedIdx(next.length > 0 ? Math.min(i, next.length - 1) : null);
    else if (expandedIdx != null && expandedIdx > i) setExpandedIdx(expandedIdx - 1);
  };

  return (
    <div className="ev">
      <div className="ev-title">{t('eventViewer.tab.frames')}</div>

      {frames.map((frame, fi) => {
        const fp = (frame.properties ?? {}) as Record<string, JsonValue>;
        const expanded = expandedIdx === fi;

        return (
          <div key={fi} className="ev-seg-item">
            <div className="ev-seg-bar" onClick={() => setExpandedIdx(expanded ? null : fi)}>
              <span className="ev-seg-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
              <span className="ev-seg-name">{t('eventViewer.frameLabel', { number: String(fi + 1) })}</span>
              {fp.offset != null && <span className="ev-seg-meta">offset: {fp.offset as number}</span>}
              <button className="ev-clear" onClick={(e) => { e.stopPropagation(); removeFrame(fi); }} title="Remove">&times;</button>
            </div>

            {expanded && (
              <FrameContent frame={frame} onChange={(f) => updateFrame(fi, f)} />
            )}
          </div>
        );
      })}

      <button className="cv2-add-btn" onClick={addFrame}>{t('eventViewer.btn.addFrame')}</button>
    </div>
  );
}

function FrameContent({ frame, onChange }: {
  frame: EventJson;
  onChange: (f: EventJson) => void;
}) {
  const fp = (frame.properties ?? {}) as Record<string, JsonValue>;

  return (
    <div className="ev-seg-content">
      <Row label={t('eventViewer.label.offset')}><input className="ib-input ev-input--num" type="number" step="any" value={(fp.offset as number) ?? ''} placeholder="0" onChange={(e) => onChange({ ...frame, properties: { ...fp, offset: Number(e.target.value) || null } })} /></Row>

      <div className="ev-subtitle">{t('eventViewer.label.clause')}</div>
      <ClauseEditor
        initialValue={(frame.clause as unknown as Clause) ?? []}
        onChange={(clause) => onChange({ ...frame, clause: clause.length ? clause as unknown as JsonValue : null })}
      />
    </div>
  );
}

// ── Shared: Clause tabs ─────────────────────────────────────────────────────

function ClauseTabs({ value, onChange, tabs, activeTab, setActiveTab }: {
  value: EventJson;
  onChange: (v: EventJson) => void;
  tabs: readonly { key: string; label: string }[];
  activeTab: string;
  setActiveTab: (t: string) => void;
}) {
  return (
    <>
      <div className="ev-tabs">
        {tabs.map((tab) => {
          const has = Array.isArray(value[tab.key]) && (value[tab.key] as unknown as Clause).length > 0;
          return (
            <button key={tab.key} className={`ev-tab${activeTab === tab.key ? ' ev-tab--active' : ''}${has ? ' ev-tab--dot' : ''}`} onClick={() => setActiveTab(tab.key)}>
              {tab.label}{has && <span className="ev-dot" />}
            </button>
          );
        })}
      </div>
      <ClauseEditor
        initialValue={(value[activeTab] as unknown as Clause) ?? []}
        onChange={(clause) => onChange({ ...value, [activeTab]: clause.length ? clause as unknown as JsonValue : null })}
      />
    </>
  );
}

// ── Property sections ───────────────────────────────────────────────────────

function StatusProperties({ props, updateProps }: {
  props: Record<string, JsonValue>; updateProps: (p: Record<string, JsonValue>) => void;
}) {
  return (
    <>
      <Row label={t('eventViewer.label.id')}><input className="ib-input ev-input--wide" type="text" value={(props.id as string) ?? ''} onChange={(e) => updateProps({ id: e.target.value || null })} placeholder={t('eventViewer.placeholder.statusId')} /></Row>
      <Row label={t('eventViewer.label.name')}><input className="ib-input ev-input--wide" type="text" value={(props.name as string) ?? ''} onChange={(e) => updateProps({ name: e.target.value || null })} placeholder={t('eventViewer.placeholder.displayName')} /></Row>
      <Row label={t('eventViewer.label.type')}><CustomSelect className="ev-select" value={(props.type as string) ?? ''} options={TYPE_OPTIONS} onChange={(v) => updateProps({ type: v || null })} /></Row>
      <Row label={t('eventViewer.label.element')}><CustomSelect className="ev-select" value={(props.element as string) ?? ''} options={ELEMENT_OPTIONS} onChange={(v) => updateProps({ element: v || null })} /></Row>
      <Row label={t('eventViewer.label.target')}>
        <CustomSelect className="ev-select" value={(props.target as string) ?? ''} options={TARGET_OPTIONS} onChange={(v) => updateProps({ target: v || null })} />
        <CustomSelect className="ev-select" value={(props.targetDeterminer as string) ?? ''} options={DETERMINER_OPTIONS} onChange={(v) => updateProps({ targetDeterminer: v || null })} />
      </Row>
      <Row label={t('eventViewer.label.enhancement')}><TagEditor value={(props.enhancementTypes as string[]) ?? []} options={['EMPOWERED', 'ENHANCED']} onChange={(v) => updateProps({ enhancementTypes: v.length ? v : null })} /></Row>
      <div className="ev-hr" />
      <DurationRow label={t('eventViewer.label.duration')} value={(props.duration as Record<string, JsonValue>) ?? null} onChange={(v) => updateProps({ duration: v })} />
      <StatusLevelRows value={(props.stacks as Record<string, JsonValue>) ?? null} onChange={(v) => updateProps({ stacks: v })} />
    </>
  );
}

function SkillProperties({ props, updateProps }: {
  props: Record<string, JsonValue>; updateProps: (p: Record<string, JsonValue>) => void;
}) {
  return (
    <>
      <Row label={t('eventViewer.label.name')}><input className="ib-input ev-input--wide" type="text" value={(props.name as string) ?? ''} onChange={(e) => updateProps({ name: e.target.value || null })} placeholder={t('eventViewer.placeholder.skillName')} /></Row>
      <Row label={t('eventViewer.label.description')}><input className="ib-input ev-input--wide" type="text" value={(props.description as string) ?? ''} onChange={(e) => updateProps({ description: e.target.value || null })} /></Row>
      <DurationRow label={t('eventViewer.label.duration')} value={(props.duration as Record<string, JsonValue>) ?? null} onChange={(v) => updateProps({ duration: v })} />
      <Row label={t('eventViewer.label.window')}><input className="ib-input ev-input--num" type="number" step="any" min={0} value={(props.windowFrames as number) ?? ''} placeholder={t('eventViewer.unit.frames')} onChange={(e) => updateProps({ windowFrames: Number(e.target.value) || null })} /><span className="ev-unit">{t('eventViewer.unit.frames')}</span></Row>
      <Row label={t('eventViewer.label.enhancement')}><TagEditor value={(props.enhancementTypes as string[]) ?? []} options={['EMPOWERED', 'ENHANCED']} onChange={(v) => updateProps({ enhancementTypes: v.length ? v : null })} /></Row>
      <Row label={t('eventViewer.label.dependencies')}><TagEditor value={(props.dependencyTypes as string[]) ?? []} options={DEPENDENCY_OPTIONS.map(o => o.value)} onChange={(v) => updateProps({ dependencyTypes: v.length ? v : null })} /></Row>
    </>
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
        <button className="cv2-add-btn ev-inline-add" onClick={() => onChange({ value: { verb: VerbType.IS, value: 0 }, unit: UnitType.SECOND })}>{t('eventViewer.btn.setDuration')}</button>
      </Row>
    );
  }
  const vn = value.value as Record<string, JsonValue> | number | undefined;
  const numericValue = typeof vn === 'object' && vn !== null ? ((vn.value as number) ?? 0) : ((vn as number) ?? 0);
  return (
    <Row label={label}>
      <input className="ib-input ev-input--num" type="number" step="any" min={0}
        value={numericValue}
        onChange={(e) => { const n = Number(e.target.value) || 0; onChange({ ...value, value: { verb: VerbType.IS, value: n } }); }}
      />
      <CustomSelect className="ev-select" value={(value.unit as string) ?? 'SECOND'} options={DURATION_UNIT_OPTIONS} onChange={(v) => onChange({ ...value, unit: v })} />
      <button className="ev-clear" onClick={() => onChange(null)} title={t('eventViewer.btn.removeDuration')}>&times;</button>
    </Row>
  );
}

function StatusLevelRows({ value, onChange }: {
  value: Record<string, JsonValue> | null;
  onChange: (v: Record<string, JsonValue> | null) => void;
}) {
  if (!value) {
    return (
      <Row label={t('eventViewer.label.stacks')}>
        <button className="cv2-add-btn ev-inline-add" onClick={() => onChange({ limit: { verb: VerbType.IS, value: 1 }, interactionType: 'NONE' })}>{t('eventViewer.btn.setStacks')}</button>
      </Row>
    );
  }
  const limit = (value.limit as Record<string, JsonValue>) ?? {};
  const interaction = (value.interactionType ?? '') as string;
  return (
    <>
      <Row label={t('eventViewer.label.maxStacks')}>
        <input className="ib-input ev-input--num" type="number" min={1}
          value={(limit.value as number) ?? 1}
          onChange={(e) => onChange({ ...value, limit: { verb: VerbType.IS, value: Number(e.target.value) || 1 } })}
        />
      </Row>
      <Row label={t('eventViewer.label.interaction')}>
        <CustomSelect className="ev-select" value={interaction} options={INTERACTION_OPTIONS} onChange={(v) => onChange({ ...value, interactionType: v || null })} />
        <button className="ev-clear" onClick={() => onChange(null)} title={t('eventViewer.btn.removeStatusLevel')}>&times;</button>
      </Row>
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDurationSeconds(dur: Record<string, JsonValue> | null): number | null {
  if (!dur) return null;
  const unit = (dur.unit as string) ?? 'SECOND';
  const vn = dur.value as Record<string, JsonValue> | number | undefined;
  const raw = typeof vn === 'object' && vn !== null ? ((vn.value as number) ?? 0) : ((vn as number) ?? 0);
  return unit === 'FRAME' ? raw / 120 : raw;
}
