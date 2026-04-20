/**
 * Skill form section for the Unified Customizer.
 * Renders with the same Card structure + field layout as the readonly
 * DataCardBody viewer (label-left, value-right rows inside a tinted panel).
 * Segments use the same conjoined-tab pattern as `TabbedSegmentView`.
 */
import { useState } from 'react';
import { ElementType, TimeInteractionType, TimeDependency, SegmentType, EventFrameType } from '../../../consts/enums';
import { NounType, ClauseEvaluationType } from '../../../dsl/semantics';
import type { Clause } from '../../../dsl/semantics';
import type { CustomSkill, CustomSkillSegmentDef, CustomSkillFrameDef } from '../../../model/custom/customSkillTypes';
import CollapsibleSection from '../CollapsibleSection';
import IdField from '../IdField';
import ClauseEditorV1 from '../ClauseEditorV1';
import { CardBody, EditableField, HelpTip } from '../DataCardComponents';
import { t } from '../../../locales/locale';

const SKILL_TYPES = [NounType.BASIC_ATTACK, NounType.BATK, NounType.BATTLE, NounType.COMBO, NounType.ULTIMATE, NounType.FINISHER, NounType.DIVE, NounType.ACTION];
const ELEMENT_TYPES = Object.values(ElementType);
const SEGMENT_TYPES = Object.values(SegmentType).filter((t) => t !== SegmentType.STASIS);
const FRAME_TYPES = Object.values(EventFrameType);
const TIME_DEP_TYPES = Object.values(TimeDependency);
const TIME_INTERACTION_TYPES = Object.values(TimeInteractionType);
const CLAUSE_EVAL_TYPES = Object.values(ClauseEvaluationType);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const toRoman = (n: number) => ROMAN[n - 1] ?? String(n);

/** Keys of the four clause buckets that live on segments and frames. */
type ClauseBucket = 'clause' | 'onTriggerClause' | 'onEntryClause' | 'onExitClause';
const CLAUSE_BUCKETS: { key: ClauseBucket; label: string; helpKey: string }[] = [
  { key: 'clause', label: 'Clause', helpKey: 'customizer.help.clause.clause' },
  { key: 'onTriggerClause', label: 'On Trigger', helpKey: 'customizer.help.clause.onTriggerClause' },
  { key: 'onEntryClause', label: 'On Entry', helpKey: 'customizer.help.clause.onEntryClause' },
  { key: 'onExitClause', label: 'On Exit', helpKey: 'customizer.help.clause.onExitClause' },
];

interface Props {
  data: CustomSkill;
  onChange: (data: CustomSkill) => void;
  originalId?: string;
}

export default function SkillSection({ data, onChange, originalId }: Props) {
  const update = (patch: Partial<CustomSkill>) => onChange({ ...data, ...patch });

  return (
    <>
      <CollapsibleSection title={t('customizer.section.properties')}>
        <CardBody>
          {/* Mirrors the skill-JSON `properties` bucket: id, name, description, element, eventCategoryType.
            * Duration & time-interaction live on segments; SP cost lives as a clause effect. No cooldown or
            * animation in the JSON — those fields were removed from this section. */}
          <IdField value={data.id} onChange={(id) => update({ id })} originalId={originalId} fieldClassName="ops-field ops-field--editable" labelClassName="ops-field-label" />
          <EditableField label="Name" help={t('customizer.help.skill.name')}>
            <input type="text" value={data.name} onChange={(e) => update({ name: e.target.value })} />
          </EditableField>
          <EditableField label="Description" help={t('customizer.help.skill.description')}>
            <textarea
              className="ops-textarea"
              value={data.description ?? ''}
              onChange={(e) => update({ description: e.target.value || undefined })}
              rows={2}
            />
          </EditableField>
          <EditableField label="Element" help={t('customizer.help.skill.element')}>
            <select value={data.element ?? ''} onChange={(e) => update({ element: e.target.value ? e.target.value as ElementType : undefined })}>
              <option value="">None</option>
              {ELEMENT_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </EditableField>
          <EditableField label="Event Category Type" help={t('customizer.help.skill.eventCategoryType')}>
            <select value={data.combatSkillType} onChange={(e) => update({ combatSkillType: e.target.value as string })}>
              {SKILL_TYPES.map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
            </select>
          </EditableField>
          <EditableField label="Clause Type" help={t('customizer.help.skill.clauseType')}>
            <select value={data.clauseType ?? ''} onChange={(e) => update({ clauseType: e.target.value ? e.target.value as ClauseEvaluationType : undefined })}>
              <option value="">None</option>
              {CLAUSE_EVAL_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </EditableField>
        </CardBody>
      </CollapsibleSection>

      <CollapsibleSection title={t('customizer.section.clauses')}>
        <CardBody>
          <ClauseTabsEditor
            clauses={{
              clause: data.clause,
              onTriggerClause: data.onTriggerClause,
              onEntryClause: data.onEntryClause,
              onExitClause: data.onExitClause,
            }}
            onChange={(key, next) => update({ [key]: next.length > 0 ? next : undefined })}
          />
        </CardBody>
      </CollapsibleSection>

      <CollapsibleSection title={t('customizer.section.segments')}>
        <SegmentsEditor
          segments={data.segments ?? []}
          onChange={(segments) => update({ segments })}
        />
      </CollapsibleSection>

      <CollapsibleSection title={t('customizer.section.multipliers')} defaultOpen={false}>
        <CardBody>
          {(data.multipliers ?? []).map((mult, i) => (
            <div key={i} className="ops-subcard">
              <div className="ops-subcard-header">
                <span className="ops-subcard-title">{mult.label || `Multiplier ${i + 1}`}</span>
                <button className="ops-btn-micro ops-btn-micro--dim" onClick={() => update({ multipliers: (data.multipliers ?? []).filter((_, j) => j !== i) })} title={t('customizer.btn.removeMultiplier')}>&times;</button>
              </div>
              <EditableField label="Label">
                <input type="text" value={mult.label} onChange={(e) => {
                  const multipliers = [...(data.multipliers ?? [])];
                  multipliers[i] = { ...mult, label: e.target.value };
                  update({ multipliers });
                }} />
              </EditableField>
              <EditableField label="Values">
                <div className="ops-mult-grid">
                  {Array.from({ length: 12 }, (_, j) => (
                    <div key={j} className="ops-mult-cell">
                      <span className="ops-mult-lv">{j + 1}</span>
                      <input
                        type="number"
                        value={mult.values[j] ?? 0}
                        onChange={(e) => {
                          const multipliers = [...(data.multipliers ?? [])];
                          const values = [...mult.values];
                          while (values.length < 12) values.push(0);
                          values[j] = Number(e.target.value);
                          multipliers[i] = { ...mult, values };
                          update({ multipliers });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </EditableField>
            </div>
          ))}
          <button className="ops-btn-add" onClick={() => update({ multipliers: [...(data.multipliers ?? []), { label: '', values: Array(12).fill(0) }] })}>
            + Add Multiplier
          </button>
        </CardBody>
      </CollapsibleSection>
    </>
  );
}

// ── Segments editor ────────────────────────────────────────────────────────
// Mirrors the readonly TabbedSegmentView's conjoined-tabs structure: a row
// of segment tabs stacked above a row of per-segment frame-numeral buttons.
// The editor adds trailing [+] affordances — one at the end of the segment
// row, one inside each segment's frame group — to add new records without
// ever leaving the tab strip.
function SegmentsEditor({ segments, onChange }: {
  segments: CustomSkillSegmentDef[];
  onChange: (segments: CustomSkillSegmentDef[]) => void;
}) {
  const [activeSeg, setActiveSeg] = useState(0);
  const [activeFrame, setActiveFrame] = useState<number | null>(null);
  const safeSeg = segments.length === 0 ? -1 : Math.min(activeSeg, segments.length - 1);
  const seg = safeSeg >= 0 ? segments[safeSeg] : null;
  const frames = seg?.frames ?? [];
  const viewingFrame = activeFrame != null && seg != null && activeFrame < frames.length;

  const updateSegment = (i: number, patch: Partial<CustomSkillSegmentDef>) => {
    const next = [...segments];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const updateFrame = (si: number, fi: number, patch: Partial<CustomSkillFrameDef>) => {
    const next = [...segments];
    const fr = [...(next[si].frames ?? [])];
    fr[fi] = { ...fr[fi], ...patch };
    next[si] = { ...next[si], frames: fr };
    onChange(next);
  };
  const addSegment = () => {
    onChange([...segments, { durationSeconds: 1, frames: [] }]);
    setActiveSeg(segments.length);
    setActiveFrame(null);
  };
  const removeSegment = (i: number) => {
    const next = segments.filter((_, j) => j !== i);
    onChange(next);
    setActiveSeg(Math.max(0, i - 1));
    setActiveFrame(null);
  };
  const addFrame = (si: number) => {
    const next = [...segments];
    const fr = [...(next[si].frames ?? []), { offsetSeconds: 0 }];
    next[si] = { ...next[si], frames: fr };
    onChange(next);
    setActiveSeg(si);
    setActiveFrame(fr.length - 1);
  };
  const removeFrame = (si: number, fi: number) => {
    const next = [...segments];
    const fr = (next[si].frames ?? []).filter((_, j) => j !== fi);
    next[si] = { ...next[si], frames: fr };
    onChange(next);
    setActiveFrame(null);
  };

  return (
    <div className="ops-seg-view ops-seg-view--editable">
      <div className="ops-conjoined-tabs">
        <div className="ops-conjoined-row ops-conjoined-row--seg">
          {segments.map((s, si) => {
            const isCurrent = safeSeg === si;
            const isAccented = isCurrent && !viewingFrame;
            return (
              <div key={si} className="ops-conjoined-seg-wrap">
                <button
                  type="button"
                  className={`ops-conjoined-seg${isCurrent ? ' ops-conjoined-seg--current' : ''}${isAccented ? ' ops-conjoined-seg--active' : ''}`}
                  onClick={() => { setActiveSeg(si); setActiveFrame(null); }}
                  title={s.name || `Segment ${si + 1}`}
                >
                  <span className="ops-conjoined-seg-label">{s.name || `Segment ${si + 1}`}</span>
                </button>
                <button
                  type="button"
                  className="ops-conjoined-close"
                  onClick={(e) => { e.stopPropagation(); removeSegment(si); }}
                  title={t('customizer.btn.removeSegment')}
                  aria-label={`Remove ${s.name || `Segment ${si + 1}`}`}
                >&times;</button>
              </div>
            );
          })}
          <button
            type="button"
            className="ops-conjoined-add"
            onClick={addSegment}
            title={t('customizer.btn.addSegment')}
          >+</button>
        </div>
        <div className="ops-conjoined-row ops-conjoined-row--frame">
          {segments.map((s, si) => {
            const fr = s.frames ?? [];
            return (
              <div key={si} className="ops-conjoined-frame-group">
                {fr.map((_f, fi) => {
                  const isActive = safeSeg === si && activeFrame === fi;
                  return (
                    <span key={fi} className="ops-conjoined-frame-wrap">
                      <button
                        type="button"
                        className={`ops-conjoined-btn${isActive ? ' ops-conjoined-btn--active' : ''}`}
                        onClick={() => { setActiveSeg(si); setActiveFrame(fi); }}
                      >
                        {toRoman(fi + 1)}
                      </button>
                      <button
                        type="button"
                        className="ops-conjoined-close ops-conjoined-close--frame"
                        onClick={(e) => { e.stopPropagation(); removeFrame(si, fi); }}
                        title={t('customizer.btn.removeFrame')}
                        aria-label={`Remove frame ${toRoman(fi + 1)}`}
                      >&times;</button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  className="ops-conjoined-btn ops-conjoined-btn--add"
                  onClick={() => addFrame(si)}
                  title={t('customizer.btn.addFrame')}
                >+</button>
              </div>
            );
          })}
          {/* Empty placeholder aligned under the segment [+] column. */}
          <div className="ops-conjoined-frame-group ops-conjoined-frame-group--placeholder" aria-hidden="true" />
        </div>
      </div>

      {seg && (
        <CardBody>
          {viewingFrame ? (
            <FrameDetailEditor
              frame={frames[activeFrame!]}
              label={`Frame ${toRoman(activeFrame! + 1)}`}
              onChange={(patch) => updateFrame(safeSeg, activeFrame!, patch)}
            />
          ) : (
            <SegmentDetailEditor
              index={safeSeg}
              segment={seg}
              onChange={(patch) => updateSegment(safeSeg, patch)}
            />
          )}
        </CardBody>
      )}
      {!seg && (
        <div className="ops-seg-empty">No segments yet. Click + to add one.</div>
      )}
    </div>
  );
}

function SegmentDetailEditor({ index, segment, onChange }: {
  index: number;
  segment: CustomSkillSegmentDef;
  onChange: (patch: Partial<CustomSkillSegmentDef>) => void;
}) {
  return (
    <>
      <div className="ops-detail-header">
        <span className="ops-detail-title">{segment.name || `Segment ${index + 1}`}</span>
      </div>
      <EditableField label="Name" help={t('customizer.help.segment.name')}>
        <input type="text" value={segment.name ?? ''} onChange={(e) => onChange({ name: e.target.value || undefined })} />
      </EditableField>
      <EditableField label="Duration (s)" help={t('customizer.help.segment.duration')}>
        <input type="number" step="0.01" value={segment.durationSeconds} onChange={(e) => onChange({ durationSeconds: Number(e.target.value) })} />
      </EditableField>
      <EditableField label="Element" help={t('customizer.help.skill.element')}>
        <select value={segment.element ?? ''} onChange={(e) => onChange({ element: e.target.value ? e.target.value as ElementType : undefined })}>
          <option value="">None</option>
          {ELEMENT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </EditableField>
      <EditableField label="Segment Types" help={t('customizer.help.segment.types')}>
        <MultiPillSelect
          options={SEGMENT_TYPES}
          selected={segment.segmentTypes ?? []}
          onChange={(next) => onChange({ segmentTypes: next.length > 0 ? next : undefined })}
        />
      </EditableField>
      <EditableField label="Time Dependency" help={t('customizer.help.segment.timeDependency')}>
        <select value={segment.timeDependency ?? ''} onChange={(e) => onChange({ timeDependency: e.target.value ? e.target.value as TimeDependency : undefined })}>
          <option value="">None</option>
          {TIME_DEP_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </EditableField>
      <EditableField label="Time Interaction" help={t('customizer.help.segment.timeInteractionType')}>
        <select value={segment.timeInteractionType ?? ''} onChange={(e) => onChange({ timeInteractionType: e.target.value ? e.target.value as TimeInteractionType : undefined })}>
          <option value="">None</option>
          {TIME_INTERACTION_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </EditableField>
      <EditableField label="Clause Type" help={t('customizer.help.skill.clauseType')}>
        <select value={segment.clauseType ?? ''} onChange={(e) => onChange({ clauseType: e.target.value ? e.target.value as ClauseEvaluationType : undefined })}>
          <option value="">None</option>
          {CLAUSE_EVAL_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </EditableField>
      <ClauseTabsEditor
        clauses={{
          clause: segment.clause,
          onTriggerClause: segment.onTriggerClause,
          onEntryClause: segment.onEntryClause,
          onExitClause: segment.onExitClause,
        }}
        onChange={(key, next) => onChange({ [key]: next.length > 0 ? next : undefined })}
      />
    </>
  );
}

function FrameDetailEditor({ frame, label, onChange }: {
  frame: CustomSkillFrameDef;
  label: string;
  onChange: (patch: Partial<CustomSkillFrameDef>) => void;
}) {
  return (
    <>
      <div className="ops-detail-header">
        <span className="ops-detail-title">{label}{frame.name ? ` \u00B7 ${frame.name}` : ''}</span>
      </div>
      <EditableField label="Name" help={t('customizer.help.frame.name')}>
        <input type="text" value={frame.name ?? ''} onChange={(e) => onChange({ name: e.target.value || undefined })} />
      </EditableField>
      <EditableField label="Offset (s)" help={t('customizer.help.frame.offset')}>
        <input type="number" step="0.01" value={frame.offsetSeconds} onChange={(e) => onChange({ offsetSeconds: Number(e.target.value) })} />
      </EditableField>
      <EditableField label="Element" help={t('customizer.help.skill.element')}>
        <select value={frame.element ?? ''} onChange={(e) => onChange({ element: e.target.value ? e.target.value as ElementType : undefined })}>
          <option value="">None</option>
          {ELEMENT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </EditableField>
      <EditableField label="Frame Types" help={t('customizer.help.frame.types')}>
        <MultiPillSelect
          options={FRAME_TYPES}
          selected={frame.frameTypes ?? []}
          onChange={(next) => onChange({ frameTypes: next.length > 0 ? next : undefined })}
        />
      </EditableField>
      <EditableField label="Clause Type" help={t('customizer.help.skill.clauseType')}>
        <select value={frame.clauseType ?? ''} onChange={(e) => onChange({ clauseType: e.target.value ? e.target.value as ClauseEvaluationType : undefined })}>
          <option value="">None</option>
          {CLAUSE_EVAL_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </EditableField>
      <ClauseTabsEditor
        clauses={{
          clause: frame.clause,
          onTriggerClause: frame.onTriggerClause,
          onEntryClause: frame.onEntryClause,
          onExitClause: frame.onExitClause,
        }}
        onChange={(key, next) => onChange({ [key]: next.length > 0 ? next : undefined })}
      />
    </>
  );
}

// ── Clause bucket tabs ─────────────────────────────────────────────────────
// A tab strip with one tab per clause bucket (clause / onTrigger / onEntry /
// onExit). Tabs show a count badge when that bucket has predicates. Each tab
// body renders the shared `ClauseEditorV1` against the bucket's clause array.
function ClauseTabsEditor<K extends ClauseBucket>({ clauses, onChange }: {
  clauses: Record<K, Clause | undefined>;
  onChange: (key: K, next: Clause) => void;
}) {
  const [active, setActive] = useState<K>(CLAUSE_BUCKETS[0].key as K);
  const current = clauses[active] ?? [];

  return (
    <div className="ops-clause-tabs-editor">
      <div className="ops-clause-tab-strip">
        {CLAUSE_BUCKETS.map((b) => {
          const count = (clauses[b.key as K] ?? []).length;
          const isActive = active === (b.key as K);
          return (
            <button
              key={b.key}
              type="button"
              className={`ops-clause-tab${isActive ? ' ops-clause-tab--active' : ''}`}
              onClick={() => setActive(b.key as K)}
            >
              <span className="ops-clause-tab-label">{b.label}</span>
              {count > 0 && <span className="ops-clause-tab-count">{count}</span>}
              <HelpTip text={t(b.helpKey)} />
            </button>
          );
        })}
      </div>
      <div className="ops-clause-tab-body">
        <ClauseEditorV1
          key={String(active)}
          initialValue={current}
          onChange={(next) => onChange(active, next)}
        />
      </div>
    </div>
  );
}

// ── Multi-select pill group (array enums like segmentTypes, frameTypes) ────
function MultiPillSelect<T extends string>({ options, selected, onChange }: {
  options: T[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  const toggle = (v: T) => {
    const has = selected.includes(v);
    onChange(has ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  return (
    <div className="ops-pill-group ops-pill-group--compact">
      {options.map((v) => {
        const isOn = selected.includes(v);
        return (
          <button
            key={v}
            type="button"
            className={`ops-pill${isOn ? ' ops-pill--active' : ''}`}
            onClick={() => toggle(v)}
          >
            {v.replace(/_/g, ' ')}
          </button>
        );
      })}
    </div>
  );
}
