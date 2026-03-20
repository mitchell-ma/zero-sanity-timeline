import React, { useRef, useEffect, useCallback } from 'react';

/** Initial delay before repeating (ms). */
const REPEAT_DELAY = 200;
/** Interval between repeats (ms). */
const REPEAT_INTERVAL = 300;

export default function NumberInputWithFastForwardButtons({ label, value, min, max, step = 1, holdStep, holdSnaps, holdInterval, showMinMax, onChange }: {
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
