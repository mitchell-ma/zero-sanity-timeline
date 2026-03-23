/**
 * SegmentFrameEditor — Nested editor for segments containing frames.
 * Each segment has a name, duration, optional stats, and frames with DSL effects.
 */
import { useState } from 'react';
import { ElementType } from '../../consts/enums';
import type { CustomSegmentDef, CustomFrameDef } from '../../model/custom/customOperatorTypes';
import type { Interaction } from '../../dsl/semantics';
import InteractionBuilder, { defaultInteraction } from './InteractionBuilder';

interface SegmentFrameEditorProps {
  segments: CustomSegmentDef[];
  onChange: (segments: CustomSegmentDef[]) => void;
}

export default function SegmentFrameEditor({ segments, onChange }: SegmentFrameEditorProps) {
  const addSegment = () => {
    onChange([...segments, { durationSeconds: 1 }]);
  };

  const updateSegment = (i: number, seg: CustomSegmentDef) => {
    const updated = [...segments];
    updated[i] = seg;
    onChange(updated);
  };

  const removeSegment = (i: number) => {
    onChange(segments.filter((_, j) => j !== i));
  };

  return (
    <div className="segment-frame-editor">
      <div className="wz-subsection-header">
        <span>Segments</span>
        <button className="btn-add-sm" onClick={addSegment} title="Add segment">+</button>
      </div>

      {segments.length === 0 && (
        <div className="clause-empty">No segments — duration-only block</div>
      )}

      {segments.map((seg, si) => (
        <SegmentEditor
          key={si}
          index={si}
          segment={seg}
          onChange={(s) => updateSegment(si, s)}
          onRemove={() => removeSegment(si)}
        />
      ))}
    </div>
  );
}

// ── Segment Editor ──────────────────────────────────────────────────────────

function SegmentEditor({ index, segment, onChange, onRemove }: {
  index: number;
  segment: CustomSegmentDef;
  onChange: (s: CustomSegmentDef) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const update = (patch: Partial<CustomSegmentDef>) => onChange({ ...segment, ...patch });

  const addFrame = () => {
    const frames = [...(segment.frames ?? []), { offsetSeconds: 0 }];
    update({ frames });
  };

  const updateFrame = (i: number, f: CustomFrameDef) => {
    const frames = [...(segment.frames ?? [])];
    frames[i] = f;
    update({ frames });
  };

  const removeFrame = (i: number) => {
    const frames = (segment.frames ?? []).filter((_, j) => j !== i);
    update({ frames: frames.length > 0 ? frames : undefined });
  };

  return (
    <div className="segment-card">
      <div className="segment-header" onClick={() => setExpanded(!expanded)}>
        <span className="segment-title">
          Segment {index + 1}{segment.name ? `: ${segment.name}` : ''}
        </span>
        <div className="predicate-actions">
          <button className="ib-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
          <span className="collapse-toggle">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {expanded && (
        <div className="segment-body">
          <div className="wz-field-row">
            <label className="wz-field" style={{ flex: 2 }}>
              <span>Name (optional)</span>
              <input
                type="text"
                value={segment.name ?? ''}
                onChange={(e) => update({ name: e.target.value || undefined })}
                placeholder="e.g. EXPLOSION"
              />
            </label>
            <label className="wz-field">
              <span>Duration (s)</span>
              <input
                type="number"
                min={0}
                step="any"
                value={segment.durationSeconds}
                onChange={(e) => update({ durationSeconds: Number(e.target.value) })}
              />
            </label>
          </div>

          {/* Segment Stats */}
          <div className="wz-subsection">
            <div className="wz-subsection-header">
              <span>Segment Stats</span>
              <button className="btn-add-sm" onClick={() => update({
                stats: [...(segment.stats ?? []), { statType: '', value: [0] }],
              })}>+</button>
            </div>
            {(segment.stats ?? []).map((stat, i) => (
              <div key={i} className="buff-row">
                <input
                  className="ib-input ib-object-id"
                  type="text"
                  value={stat.statType}
                  placeholder="Stat"
                  onChange={(e) => {
                    const stats = [...(segment.stats ?? [])];
                    stats[i] = { ...stat, statType: e.target.value };
                    update({ stats });
                  }}
                />
                <div className="multiplier-table">
                  {stat.value.map((v, vi) => (
                    <input
                      key={vi}
                      className="mt-input"
                      type="number"
                      step="any"
                      value={v}
                      onChange={(e) => {
                        const stats = [...(segment.stats ?? [])];
                        const values = [...stat.value];
                        values[vi] = Number(e.target.value);
                        stats[i] = { ...stat, value: values };
                        update({ stats });
                      }}
                    />
                  ))}
                </div>
                <button className="ib-remove" onClick={() => {
                  const stats = (segment.stats ?? []).filter((_, j) => j !== i);
                  update({ stats: stats.length > 0 ? stats : undefined });
                }}>×</button>
              </div>
            ))}
          </div>

          {/* Frames */}
          <div className="wz-subsection">
            <div className="wz-subsection-header">
              <span>Frames</span>
              <button className="btn-add-sm" onClick={addFrame} title="Add frame">+</button>
            </div>

            {(segment.frames ?? []).length === 0 && (
              <div className="clause-empty">No frames</div>
            )}

            {(segment.frames ?? []).map((frame, fi) => (
              <FrameEditor
                key={fi}
                index={fi}
                frame={frame}
                onChange={(f) => updateFrame(fi, f)}
                onRemove={() => removeFrame(fi)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Frame Editor ────────────────────────────────────────────────────────────

const ELEMENT_LABELS: Record<ElementType, string> = {
  [ElementType.NONE]: 'None', [ElementType.PHYSICAL]: 'Physical',
  [ElementType.HEAT]: 'Heat', [ElementType.CRYO]: 'Cryo',
  [ElementType.NATURE]: 'Nature', [ElementType.ELECTRIC]: 'Electric',
  [ElementType.ARTS]: 'Arts',
};

function FrameEditor({ index, frame, onChange, onRemove }: {
  index: number;
  frame: CustomFrameDef;
  onChange: (f: CustomFrameDef) => void;
  onRemove: () => void;
}) {
  const update = (patch: Partial<CustomFrameDef>) => onChange({ ...frame, ...patch });

  return (
    <div className="frame-card">
      <div className="frame-header">
        <span className="ib-label">Frame {index + 1}</span>
        <label className="wz-field" style={{ flex: 0 }}>
          <input
            className="ib-input"
            type="number"
            step="any"
            min={0}
            value={frame.offsetSeconds}
            onChange={(e) => update({ offsetSeconds: Number(e.target.value) })}
            title="Offset (seconds)"
          />
        </label>
        <span className="ib-label">s offset</span>
        <button className="ib-remove" onClick={onRemove} style={{ marginLeft: 'auto' }}>×</button>
      </div>

      {/* Damage */}
      <label className="ib-checkbox" style={{ padding: '0.15rem 0' }}>
        <input
          type="checkbox"
          checked={!!frame.damage}
          onChange={(e) => update({
            damage: e.target.checked
              ? { elementType: ElementType.PHYSICAL, multiplier: [0], damageType: 'PHYSICAL' }
              : undefined,
          })}
        />
        Has damage
      </label>

      {frame.damage && (
        <div className="wz-field-row">
          <label className="wz-field">
            <span>Element</span>
            <select value={frame.damage.elementType} onChange={(e) => update({
              damage: { ...frame.damage!, elementType: e.target.value as ElementType },
            })}>
              {Object.values(ElementType).map((el) => <option key={el} value={el}>{ELEMENT_LABELS[el]}</option>)}
            </select>
          </label>
          <label className="wz-field">
            <span>Type</span>
            <select value={frame.damage.damageType} onChange={(e) => update({
              damage: { ...frame.damage!, damageType: e.target.value },
            })}>
              <option value="PHYSICAL">Physical</option>
              <option value="ARTS">Arts</option>
            </select>
          </label>
          <label className="wz-field">
            <span>Multiplier</span>
            <input
              type="number"
              step="any"
              value={frame.damage.multiplier[0] ?? 0}
              onChange={(e) => update({
                damage: { ...frame.damage!, multiplier: [Number(e.target.value)] },
              })}
            />
          </label>
        </div>
      )}

      {/* Status Interactions */}
      <div className="frame-interactions">
        <div className="wz-subsection-header">
          <span>Status Interactions</span>
          <button className="btn-add-sm" onClick={() => update({
            statusInteractions: [...(frame.statusInteractions ?? []), defaultInteraction()],
          })}>+</button>
        </div>
        {(frame.statusInteractions ?? []).map((si, i) => (
          <InteractionBuilder
            key={i}
            value={si}
            onChange={(s) => {
              const statusInteractions = [...(frame.statusInteractions ?? [])];
              statusInteractions[i] = s as Interaction;
              update({ statusInteractions });
            }}
            onRemove={() => update({
              statusInteractions: (frame.statusInteractions ?? []).filter((_, j) => j !== i),
            })}
            compact
          />
        ))}
      </div>
    </div>
  );
}
