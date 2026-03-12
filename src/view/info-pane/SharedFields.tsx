import React, { useState, useEffect, useRef, useCallback } from 'react';
import { framesToSeconds, secondsToFrames } from '../../utils/timeline';
import { TimelineEvent } from '../../consts/viewTypes';

export const LEVEL_BREAKPOINTS = [1, 20, 40, 60, 80, 90];

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
          type="number"
          step="0.1"
          min="0"
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

/** Initial delay before repeating (ms). */
const REPEAT_DELAY = 200;
/** Interval between repeats (ms). */
const REPEAT_INTERVAL = 300;

export function StatField({ label, value, min, max, step = 1, holdStep, holdSnaps, holdInterval, showMinMax, onChange }: {
  label: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Step size when holding the button (defaults to step). */
  holdStep?: number;
  /** Snap points when holding (overrides holdStep). Snaps to next/prev value in list. */
  holdSnaps?: number[];
  /** Interval between repeats in ms (defaults to REPEAT_INTERVAL). */
  holdInterval?: number;
  /** Show min/max snap buttons. */
  showMinMax?: boolean;
  onChange: (v: number) => void;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didRepeatRef = useRef(false);

  const stopRepeat = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startRepeat = useCallback((direction: 1 | -1) => {
    stopRepeat();
    didRepeatRef.current = false;
    timerRef.current = setTimeout(() => {
      didRepeatRef.current = true;
      intervalRef.current = setInterval(() => {
        const cur = valueRef.current;
        let next: number;
        if (holdSnaps) {
          if (direction > 0) {
            next = holdSnaps.find((s) => s > cur) ?? max;
          } else {
            next = [...holdSnaps].reverse().find((s) => s < cur) ?? min;
          }
        } else {
          next = +(cur + direction * (holdStep ?? step)).toFixed(10);
        }
        next = Math.max(min, Math.min(max, next));
        if (next !== cur) onChange(next);
      }, holdInterval ?? REPEAT_INTERVAL);
    }, REPEAT_DELAY);
  }, [min, max, step, holdStep, holdSnaps, holdInterval, onChange, stopRepeat]);

  // Clean up on unmount
  useEffect(() => stopRepeat, [stopRepeat]);

  return (
    <div className="stat-field">
      <span className="edit-field-label">{label}</span>
      <div className="stat-field-controls">
        {showMinMax && (
          <button tabIndex={-1} className="stat-arrow stat-arrow--minmax" disabled={value <= min} onClick={() => onChange(min)}>⏮</button>
        )}
        <button
          tabIndex={-1}
          className="stat-arrow"
          disabled={value <= min}
          onClick={() => { if (!didRepeatRef.current) onChange(Math.max(min, +(value - step).toFixed(10))); }}
          onMouseDown={() => startRepeat(-1)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
        >-</button>
        <input
          className="edit-input stat-field-input"
          type="number"
          step={step}
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = Math.max(min, Math.min(max, Number(e.target.value) || min));
            onChange(v);
          }}
          onBlur={(e) => {
            const v = Math.max(min, Math.min(max, Number(e.target.value) || min));
            if (v !== value) onChange(v);
          }}
        />
        <button
          tabIndex={-1}
          className="stat-arrow"
          disabled={value >= max}
          onClick={() => { if (!didRepeatRef.current) onChange(Math.min(max, +(value + step).toFixed(10))); }}
          onMouseDown={() => startRepeat(1)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
        >+</button>
        {showMinMax && (
          <button tabIndex={-1} className="stat-arrow stat-arrow--minmax" disabled={value >= max} onClick={() => onChange(max)}>⏭</button>
        )}
      </div>
    </div>
  );
}

export function LevelSelect({ label, value, options, onChange }: {
  label: string;
  value: number;
  options: number[];
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
        {options.map((lv) => (
          <option key={lv} value={lv}>{lv}</option>
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
      i === segmentIndex ? { ...s, durationFrames: newDuration } : s,
    );
    const totalDuration = newSegments.reduce((sum, s) => sum + s.durationFrames, 0);
    onUpdate(eventId, {
      segments: newSegments,
      activationDuration: totalDuration,
      nonOverlappableRange: totalDuration,
    });
  };

  return (
    <DurationField label="Duration" value={sec} onChange={setSec} onCommit={commit} />
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
    const parsed = Number(sec);
    const raw = secondsToFrames(isNaN(parsed) ? 0 : parsed);
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
        type="number"
        step="0.01"
        min="0"
        max={framesToSeconds(maxOffset)}
        value={sec}
        onChange={(e) => setSec(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <span className="edit-input-unit">s</span>
    </div>
  );
}
