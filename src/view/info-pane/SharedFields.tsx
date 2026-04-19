import React, { useState, useEffect } from 'react';
import { framesToSeconds, secondsToFrames } from '../../utils/timeline';
import { evaluateMathExpr } from '../../utils/mathExpr';
import { TimelineEvent, computeSegmentsSpan } from '../../consts/viewTypes';
import { t } from '../../locales/locale';
import NumberInputWithFastForwardButtons from '../components/inputs/NumberInputWithFastForwardButtons';

export const LEVEL_BREAKPOINTS = [1, 20, 40, 60, 80, 90];

/** @deprecated Use NumberInputWithFastForwardButtons directly. */
export const StatField = NumberInputWithFastForwardButtons;

// ── Shared field components ─────────────────────────────────────────────────

export function DurationField({ label, value, onChange, onCommit }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="edit-field">
      <span className="edit-field-label">{label}</span>
      <div className="edit-field-row">
        <input
          className="edit-input"
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <span className="edit-input-unit">s</span>
      </div>
    </div>
  );
}


export function LevelSelect({ label, value, options, optionLabels, onChange }: {
  label: React.ReactNode;
  value: number;
  options: number[];
  /** Optional display labels for each option (same length as options). */
  optionLabels?: string[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="stat-field">
      <span className="edit-field-label">{label}</span>
      <select
        className="edit-input stat-level-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((lv, i) => (
          <option key={lv} value={lv}>{optionLabels?.[i] ?? lv}</option>
        ))}
      </select>
    </div>
  );
}

export function SegmentDurationField({ eventId, segmentIndex, durationFrames, onUpdate, segments }: {
  eventId: string;
  segmentIndex: number;
  durationFrames: number;
  onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
  segments: TimelineEvent['segments'];
}) {
  const [sec, setSec] = useState(framesToSeconds(durationFrames));

  useEffect(() => {
    setSec(framesToSeconds(durationFrames));
  }, [durationFrames]);

  const commit = () => {
    if (!segments) return;
    const parsed = Number(sec);
    const newDuration = secondsToFrames(isNaN(parsed) ? 0 : parsed);
    if (newDuration === durationFrames) return;
    const newSegments = segments.map((s, i) =>
      i === segmentIndex ? { ...s, properties: { ...s.properties, duration: newDuration } } : s,
    );
    const totalDuration = computeSegmentsSpan(newSegments);
    onUpdate(eventId, {
      segments: newSegments,
      nonOverlappableRange: totalDuration,
    });
  };

  return (
    <DurationField label={t('dsl.property.duration')} value={sec} onChange={setSec} onCommit={commit} />
  );
}

export function FrameOffsetField({ eventId, segmentIndex, frameIndex, offsetFrame, maxOffset, onUpdate, segments }: {
  eventId: string;
  segmentIndex: number;
  frameIndex: number;
  offsetFrame: number;
  maxOffset: number;
  onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
  segments: TimelineEvent['segments'];
}) {
  const [sec, setSec] = useState(framesToSeconds(offsetFrame));

  useEffect(() => {
    setSec(framesToSeconds(offsetFrame));
  }, [offsetFrame]);

  const commit = () => {
    if (!segments) return;
    const seg = segments[segmentIndex];
    const frames = seg?.frames;
    if (!frames) return;
    const parsed = evaluateMathExpr(sec);
    const raw = secondsToFrames(isFinite(parsed) ? parsed : 0);
    const lo = frameIndex > 0 ? frames[frameIndex - 1].offsetFrame : 0;
    const hi = frameIndex < frames.length - 1 ? frames[frameIndex + 1].offsetFrame : maxOffset;
    const newOffset = Math.max(lo, Math.min(hi, raw));
    setSec(framesToSeconds(newOffset));
    if (newOffset === offsetFrame) return;
    const newSegments = segments.map((s, si) => {
      if (si !== segmentIndex || !s.frames) return s;
      const newFrames = s.frames.map((f, fi) =>
        fi === frameIndex ? { ...f, offsetFrame: newOffset } : f,
      );
      return { ...s, frames: newFrames };
    });
    onUpdate(eventId, { segments: newSegments });
  };

  return (
    <div className="edit-field-row">
      <input
        className="edit-input"
        type="text"
        inputMode="decimal"
        value={sec}
        onChange={(e) => setSec(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <span className="edit-input-unit">s</span>
    </div>
  );
}
