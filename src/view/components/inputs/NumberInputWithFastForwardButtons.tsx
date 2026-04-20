import React, { useRef, useEffect, useCallback, useState } from 'react';
import { parseMathInput } from '../../../utils/mathExpr';

/** Initial delay before repeating (ms). */
const REPEAT_DELAY = 200;
/** Interval between repeats (ms). */
const REPEAT_INTERVAL = 300;

const SVG_PROPS = {
  width: 12,
  height: 12,
  viewBox: '0 0 12 12',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const ChevronLeft     = () => <svg {...SVG_PROPS}><path d="M7.5 3L4 6l3.5 3"/></svg>;
const ChevronRight    = () => <svg {...SVG_PROPS}><path d="M4.5 3L8 6l-3.5 3"/></svg>;
const ChevronLeftDbl  = () => <svg {...SVG_PROPS}><path d="M9 3L6 6l3 3"/><path d="M5 3L2 6l3 3"/></svg>;
const ChevronRightDbl = () => <svg {...SVG_PROPS}><path d="M3 3l3 3-3 3"/><path d="M7 3l3 3-3 3"/></svg>;

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
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
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
          <button tabIndex={-1} className="stat-arrow stat-arrow--minmax" disabled={value <= min} onClick={() => onChange(min)}><ChevronLeftDbl /></button>
        )}
        <button
          tabIndex={-1}
          className="stat-arrow"
          disabled={value <= min}
          onClick={() => { if (!didRepeatRef.current) onChange(Math.max(min, +(value - step).toFixed(10))); }}
          onMouseDown={() => startRepeat(-1)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
        ><ChevronLeft /></button>
        <input
          className="edit-input stat-field-input"
          type="text"
          inputMode="decimal"
          value={editing ? editText : value}
          onFocus={(e) => { setEditing(true); setEditText(String(value)); e.target.select(); }}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => {
            const v = Math.max(min, Math.min(max, parseMathInput(editText, value)));
            setEditing(false);
            if (v !== value) onChange(v);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <button
          tabIndex={-1}
          className="stat-arrow"
          disabled={value >= max}
          onClick={() => { if (!didRepeatRef.current) onChange(Math.min(max, +(value + step).toFixed(10))); }}
          onMouseDown={() => startRepeat(1)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
        ><ChevronRight /></button>
        {showMinMax && (
          <button tabIndex={-1} className="stat-arrow stat-arrow--minmax" disabled={value >= max} onClick={() => onChange(max)}><ChevronRightDbl /></button>
        )}
      </div>
    </div>
  );
}
