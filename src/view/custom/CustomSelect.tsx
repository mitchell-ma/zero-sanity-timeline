/**
 * Custom dropdown select — matches loadout-item-selector styling.
 * Uses fixed-position portal so menus escape overflow:hidden containers.
 */
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

// Global close signal — when any CustomSelect opens, all others close
let globalCloseId = 0;
let globalCloseListeners = new Set<(id: number) => void>();

function broadcastOpen(id: number) {
  globalCloseListeners.forEach((fn) => fn(id));
}

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export default function CustomSelect({ value, options, onChange, className, placeholder }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const instanceId = useRef(++globalCloseId);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.max(rect.width, 120);
    // Estimate menu height from option count (bounded by .cs-menu's max-height: 16rem).
    const estH = Math.min(options.length * 28 + 12, 256);
    // Prefer opening below; flip above if the menu would run off the viewport bottom.
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= estH
      ? rect.bottom
      : Math.max(8, rect.top - estH);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPos({ top, left, width });
  }, [open, options.length]);

  // Listen for other dropdowns opening — close this one
  useEffect(() => {
    const listener = (id: number) => {
      if (id !== instanceId.current) setOpen(false);
    };
    globalCloseListeners.add(listener);
    return () => { globalCloseListeners.delete(listener); };
  }, []);

  // Close on outside click, scroll, or blur
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  const handleToggle = () => {
    if (!open) {
      instanceId.current = ++globalCloseId;
      broadcastOpen(instanceId.current);
    }
    setOpen((o) => !o);
  };

  return (
    <div className={`cs-wrap ${className ?? ''}`}>
      <button
        ref={triggerRef}
        className="cs-trigger"
        onClick={handleToggle}
        type="button"
      >
        {current ? current.label : <span className="cs-placeholder">{placeholder}</span>}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="cs-menu"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
        >
          <div className="cs-scroll">
            {options.map((o) => (
              <div
                key={o.value}
                className={`cs-option${o.value === value ? ' cs-option--selected' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
