/**
 * StatusEvent editor — form-based editor for operator status JSON configs.
 *
 * Sections:
 *   Properties — id, name, type, element, target, duration, stacks
 *   Metadata — originId, description, note
 *   Clauses — clause, onTriggerClause, onEntryClause, onExitClause (tabs)
 *   Segments — collapsible list, each with properties + clause tabs + frames
 */
import { useState } from 'react';
import ClauseEditor from './ClauseEditor';
import { UnitType } from '../../consts/enums';
import { VerbType } from '../../dsl/semantics';
import type { Clause } from '../../dsl/semantics';
import CustomSelect from './CustomSelect';
import { t } from '../../locales/locale';

// ── Types (loose JSON shape — matches raw JSON) ─────────────────────────────

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type StatusJson = Record<string, JsonValue>;

// ── Constants ───────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: '', label: '\u2014' },
  { value: 'TALENT', label: t('eventViewer.type.talent') },
  { value: 'SKILL_STATUS', label: t('eventViewer.type.skillStatus') },
  { value: 'GEAR_STATUS', label: t('eventViewer.type.gearStatus') },
  { value: 'WEAPON_STAT', label: t('eventViewer.type.weaponStatus') },
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

const CLAUSE_TABS = [
  { key: 'clause', label: t('eventViewer.tab.clause') },
  { key: 'onTriggerClause', label: t('eventViewer.tab.onTrigger') },
  { key: 'onEntryClause', label: t('eventViewer.tab.onEntry') },
  { key: 'onExitClause', label: t('eventViewer.tab.onExit') },
] as const;

// ── Props ───────────────────────────────────────────────────────────────────

interface StatusEventEditorProps {
  value: StatusJson;
  onChange: (value: StatusJson) => void;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function StatusEventEditor({ value, onChange }: StatusEventEditorProps) {
  const props = (value.properties ?? {}) as Record<string, JsonValue>;
  const meta = (value.metadata ?? {}) as Record<string, JsonValue>;
  const segments = (value.segments ?? []) as StatusJson[];

  const updateProps = (patch: Record<string, JsonValue>) => {
    onChange({ ...value, properties: { ...props, ...patch } });
  };
  const updateMeta = (patch: Record<string, JsonValue>) => {
    onChange({ ...value, metadata: { ...meta, ...patch } });
  };

  return (
    <div className="se-editor">
      {/* ── Properties ──────────────────────────────────────────────────── */}
      <FormSection label={t('eventViewer.section.properties')}>
        <FormRow label={t('eventViewer.label.id')}>
          <input className="ib-input se-input--wide" type="text" value={(props.id as string) ?? ''} onChange={(e) => updateProps({ id: e.target.value || null })} placeholder={t('eventViewer.placeholder.statusId')} />
        </FormRow>
        <FormRow label={t('eventViewer.label.name')}>
          <input className="ib-input se-input--wide" type="text" value={(props.name as string) ?? ''} onChange={(e) => updateProps({ name: e.target.value || null })} placeholder={t('eventViewer.placeholder.displayName')} />
        </FormRow>
        <FormRow label={t('eventViewer.label.type')}>
          <CustomSelect className="se-select" value={(props.type as string) ?? ''} options={TYPE_OPTIONS} onChange={(v) => updateProps({ type: v || null })} />
        </FormRow>
        <FormRow label={t('eventViewer.label.element')}>
          <CustomSelect className="se-select" value={(props.element as string) ?? ''} options={ELEMENT_OPTIONS} onChange={(v) => updateProps({ element: v || null })} />
        </FormRow>
        <FormRow label={t('eventViewer.label.target')}>
          <CustomSelect className="se-select" value={(props.target as string) ?? ''} options={TARGET_OPTIONS} onChange={(v) => updateProps({ target: v || null })} />
          <CustomSelect className="se-select" value={(props.targetDeterminer as string) ?? ''} options={DETERMINER_OPTIONS} onChange={(v) => updateProps({ targetDeterminer: v || null })} />
        </FormRow>
        <FormRow label={t('eventViewer.label.enhancement')}>
          <EnhancementEditor value={(props.enhancementTypes as string[]) ?? []} onChange={(v) => updateProps({ enhancementTypes: v.length ? v : null })} />
        </FormRow>

        <FormDivider />

        <DurationEditor
          label={t('eventViewer.label.duration')}
          value={(props.duration as Record<string, JsonValue>) ?? null}
          onChange={(v) => updateProps({ duration: v })}
        />
        <StatusLevelEditor
          value={(props.stacks as Record<string, JsonValue>) ?? null}
          onChange={(v) => updateProps({ stacks: v })}
        />
      </FormSection>

      {/* ── Metadata ────────────────────────────────────────────────────── */}
      <FormSection label={t('eventViewer.section.metadata')}>
        <FormRow label={t('eventViewer.label.originId')}>
          <input className="ib-input se-input--wide" type="text" value={(meta.originId as string) ?? ''} onChange={(e) => updateMeta({ originId: e.target.value || null })} placeholder={t('eventViewer.placeholder.originId')} />
        </FormRow>
        <FormRow label={t('eventViewer.label.description')}>
          <input className="ib-input se-input--wide" type="text" value={(meta.description as string) ?? ''} onChange={(e) => updateMeta({ description: e.target.value || null })} />
        </FormRow>
        <FormRow label={t('eventViewer.label.note')}>
          <input className="ib-input se-input--wide" type="text" value={(meta.note as string) ?? ''} onChange={(e) => updateMeta({ note: e.target.value || null })} />
        </FormRow>
      </FormSection>

      {/* ── Clauses ─────────────────────────────────────────────────────── */}
      <ClauseTabSection value={value} onChange={onChange} />

      {/* ── Segments ────────────────────────────────────────────────────── */}
      <SegmentsSection
        segments={segments}
        onChange={(segs) => onChange({ ...value, segments: segs.length ? segs : null })}
      />
    </div>
  );
}

// ── Form primitives ─────────────────────────────────────────────────────────

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="se-section">
      <div className="se-section-header">
        <span className="se-section-label">{label}</span>
      </div>
      <div className="se-section-body">{children}</div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="se-row">
      <span className="se-row-label">{label}</span>
      <div className="se-row-controls">{children}</div>
    </div>
  );
}

function FormDivider() {
  return <div className="se-divider" />;
}

// ── Enhancement types ───────────────────────────────────────────────────────

function EnhancementEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (type: string) => {
    if (value.includes(type)) onChange(value.filter((t) => t !== type));
    else onChange([...value, type]);
  };
  return (
    <div className="se-enhancement-row">
      {['EMPOWERED', 'ENHANCED'].map((t) => (
        <label key={t} className="se-check">
          <input type="checkbox" checked={value.includes(t)} onChange={() => toggle(t)} />
          <span>{t.charAt(0) + t.slice(1).toLowerCase()}</span>
        </label>
      ))}
    </div>
  );
}

// ── Duration editor ─────────────────────────────────────────────────────────

function DurationEditor({ label, value, onChange }: {
  label: string;
  value: Record<string, JsonValue> | null;
  onChange: (v: Record<string, JsonValue> | null) => void;
}) {
  if (!value) {
    return (
      <FormRow label={label}>
        <button className="cv2-add-btn se-inline-add" onClick={() => onChange({ value: { verb: VerbType.IS, value: 0 }, unit: UnitType.SECOND })}>{t('eventViewer.btn.setDuration')}</button>
      </FormRow>
    );
  }

  const vn = value.value as Record<string, JsonValue> | number | undefined;
  const numericValue = typeof vn === 'object' && vn !== null ? ((vn.value as number) ?? 0) : ((vn as number) ?? 0);

  return (
    <FormRow label={label}>
      <input
        className="ib-input se-input--num"
        type="number"
        step="any"
        min={0}
        value={numericValue}
        onChange={(e) => {
          const num = Number(e.target.value) || 0;
          onChange({ ...value, value: { verb: VerbType.IS, value: num } });
        }}
      />
      <CustomSelect
        className="se-select"
        value={(value.unit as string) ?? 'SECOND'}
        options={DURATION_UNIT_OPTIONS}
        onChange={(v) => onChange({ ...value, unit: v })}
      />
      <button className="se-clear-btn" onClick={() => onChange(null)} title={t('eventViewer.btn.removeDuration')}>&times;</button>
    </FormRow>
  );
}

// ── Status level editor ─────────────────────────────────────────────────────

function StatusLevelEditor({ value, onChange }: {
  value: Record<string, JsonValue> | null;
  onChange: (v: Record<string, JsonValue> | null) => void;
}) {
  if (!value) {
    return (
      <FormRow label={t('eventViewer.label.stacks')}>
        <button className="cv2-add-btn se-inline-add" onClick={() => onChange({ limit: { verb: VerbType.IS, value: 1 }, interactionType: 'NONE' })}>{t('eventViewer.btn.setStacks')}</button>
      </FormRow>
    );
  }

  const limit = (value.limit as Record<string, JsonValue>) ?? {};
  const interaction = (value.interactionType ?? '') as string;

  return (
    <>
      <FormRow label={t('eventViewer.label.maxStacks')}>
        <input
          className="ib-input se-input--num"
          type="number"
          min={1}
          value={(limit.value as number) ?? 1}
          onChange={(e) => onChange({ ...value, limit: { verb: VerbType.IS, value: Number(e.target.value) || 1 } })}
        />
      </FormRow>
      <FormRow label={t('eventViewer.label.interaction')}>
        <CustomSelect
          className="se-select"
          value={interaction}
          options={INTERACTION_OPTIONS}
          onChange={(v) => onChange({ ...value, interactionType: v || null })}
        />
        <button className="se-clear-btn" onClick={() => onChange(null)} title={t('eventViewer.btn.removeStatusLevel')}>&times;</button>
      </FormRow>
    </>
  );
}

// ── Clause tab section ──────────────────────────────────────────────────────

function ClauseTabSection({ value, onChange }: { value: StatusJson; onChange: (v: StatusJson) => void }) {
  const [activeTab, setActiveTab] = useState<string>('clause');

  return (
    <div className="se-section">
      <div className="se-section-header">
        <span className="se-section-label">{t('eventViewer.section.clauses')}</span>
      </div>
      <div className="se-tabs">
        {CLAUSE_TABS.map((tab) => {
          const hasContent = Array.isArray(value[tab.key]) && (value[tab.key] as unknown as Clause).length > 0;
          return (
            <button
              key={tab.key}
              className={`se-tab${activeTab === tab.key ? ' se-tab--active' : ''}${hasContent ? ' se-tab--has-content' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {hasContent && <span className="se-tab-dot" />}
            </button>
          );
        })}
      </div>
      <div className="se-section-body">
        <ClauseEditor
          initialValue={(value[activeTab] as unknown as Clause) ?? []}
          onChange={(clause) => onChange({ ...value, [activeTab]: clause.length ? clause as unknown as JsonValue : null })}
        />
      </div>
    </div>
  );
}

// ── Segments section ────────────────────────────────────────────────────────

function SegmentsSection({ segments, onChange }: {
  segments: StatusJson[];
  onChange: (segments: StatusJson[]) => void;
}) {
  const addSegment = () => {
    onChange([...segments, { properties: { name: '', duration: { value: { verb: VerbType.IS, value: 0 }, unit: UnitType.SECOND } }, frames: [] }]);
  };

  const updateSegment = (i: number, seg: StatusJson) => {
    const next = [...segments];
    next[i] = seg;
    onChange(next);
  };

  const removeSegment = (i: number) => {
    onChange(segments.filter((_, j) => j !== i));
  };

  return (
    <div className="se-section">
      <div className="se-section-header">
        <span className="se-section-label">{t('eventViewer.tab.segments')}</span>
        <span className="se-section-count">{segments.length}</span>
      </div>
      <div className="se-section-body">
        {segments.map((seg, si) => (
          <SegmentCard
            key={si}
            index={si}
            segment={seg}
            onChange={(s) => updateSegment(si, s)}
            onRemove={() => removeSegment(si)}
          />
        ))}
        <button className="cv2-add-btn" onClick={addSegment}>{t('eventViewer.btn.addSegment')}</button>
      </div>
    </div>
  );
}

// ── Segment card ────────────────────────────────────────────────────────────

function SegmentCard({ index, segment, onChange, onRemove }: {
  index: number;
  segment: StatusJson;
  onChange: (s: StatusJson) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const props = (segment.properties ?? {}) as Record<string, JsonValue>;
  const frames = (segment.frames ?? []) as StatusJson[];

  const updateProps = (patch: Record<string, JsonValue>) => {
    onChange({ ...segment, properties: { ...props, ...patch } });
  };

  return (
    <div className="se-segment-card">
      <div className="se-segment-header" onClick={() => setExpanded(!expanded)}>
        <span className="se-segment-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
        <span className="se-segment-title">{t('eventViewer.segmentLabel', { number: String(index + 1) })}{props.name ? ` \u2014 ${props.name}` : ''}</span>
        <button className="cv2-remove-btn" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove segment">&times;</button>
      </div>

      {expanded && (
        <div className="se-segment-body">
          <FormRow label={t('eventViewer.label.name')}>
            <input className="ib-input se-input--wide" type="text" value={(props.name as string) ?? ''} onChange={(e) => updateProps({ name: e.target.value || null })} />
          </FormRow>
          <DurationEditor
            label={t('eventViewer.label.duration')}
            value={(props.duration as Record<string, JsonValue>) ?? null}
            onChange={(v) => updateProps({ duration: v })}
          />

          {/* Segment clauses */}
          <ClauseTabSection value={segment} onChange={onChange} />

          {/* Frames */}
          <FramesSection
            frames={frames}
            onChange={(f) => onChange({ ...segment, frames: f })}
          />
        </div>
      )}
    </div>
  );
}

// ── Frames section ──────────────────────────────────────────────────────────

function FramesSection({ frames, onChange }: {
  frames: StatusJson[];
  onChange: (frames: StatusJson[]) => void;
}) {
  const addFrame = () => {
    onChange([...frames, { properties: {}, clause: [] }]);
  };

  const updateFrame = (i: number, frame: StatusJson) => {
    const next = [...frames];
    next[i] = frame;
    onChange(next);
  };

  const removeFrame = (i: number) => {
    onChange(frames.filter((_, j) => j !== i));
  };

  return (
    <div className="se-frames">
      <div className="se-section-header">
        <span className="se-section-label se-section-label--sub">{t('eventViewer.tab.frames')}</span>
        <span className="se-section-count">{frames.length}</span>
      </div>
      {frames.map((frame, fi) => (
        <FrameCard
          key={fi}
          index={fi}
          frame={frame}
          onChange={(f) => updateFrame(fi, f)}
          onRemove={() => removeFrame(fi)}
        />
      ))}
      <button className="cv2-add-btn" onClick={addFrame}>{t('eventViewer.btn.addFrame')}</button>
    </div>
  );
}

// ── Frame card ──────────────────────────────────────────────────────────────

function FrameCard({ index, frame, onChange, onRemove }: {
  index: number;
  frame: StatusJson;
  onChange: (f: StatusJson) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const props = (frame.properties ?? {}) as Record<string, JsonValue>;
  const meta = (frame.metadata ?? {}) as Record<string, JsonValue>;

  const updateProps = (patch: Record<string, JsonValue>) => {
    onChange({ ...frame, properties: { ...props, ...patch } });
  };

  return (
    <div className="se-frame-card">
      <div className="se-frame-header" onClick={() => setExpanded(!expanded)}>
        <span className="se-segment-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
        <span className="se-frame-title">{t('eventViewer.frameLabel', { number: String(index + 1) })}</span>
        {meta.eventComponentType && <span className="se-frame-tag">{meta.eventComponentType as string}</span>}
        <button className="cv2-remove-btn" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove frame">&times;</button>
      </div>

      {expanded && (
        <div className="se-frame-body">
          <FormRow label={t('eventViewer.label.offset')}>
            <input className="ib-input se-input--num" type="number" step="any" value={(props.offset as number) ?? ''} placeholder="0" onChange={(e) => updateProps({ offset: Number(e.target.value) || null })} />
          </FormRow>

          <div className="se-section-header">
            <span className="se-section-label se-section-label--sub">{t('eventViewer.label.clause')}</span>
          </div>
          <ClauseEditor
            initialValue={(frame.clause as unknown as Clause) ?? []}
            onChange={(clause) => onChange({ ...frame, clause: clause.length ? clause as unknown as JsonValue : null })}
          />
        </div>
      )}
    </div>
  );
}
