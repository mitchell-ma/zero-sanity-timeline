import { useEffect, useRef } from 'react';
import { ContextMenuItem } from "../consts/viewTypes";

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const menuW = 220;
  const menuH = items.reduce((h, item) =>
    h + (item.separator ? 9 : item.header ? 28 : 36) + (item.inlineButtons ? 32 : 0),
    10);
  const maxH = Math.min(384, window.innerHeight - 16);
  const effectiveH = Math.min(menuH, maxH);
  const clampedX = Math.min(x, window.innerWidth  - menuW - 8);
  const clampedY = Math.min(y, window.innerHeight - effectiveH - 8);

  useEffect(() => {
    const handleDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('touchstart', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('touchstart', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: clampedX, top: clampedY }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="context-menu-separator" />;
        }
        if (item.header) {
          return <div key={i} className="context-menu-header">{item.label}</div>;
        }
        return (
          <div key={i}>
            <button
              className={`context-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}${item.checked != null ? ' context-menu-item--toggle' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.action?.();
                if (!item.keepOpen) onClose();
              }}
            >
              {item.checked != null && (
                <span className="context-menu-check">{item.checked ? '\u2713' : ''}</span>
              )}
              {item.label}
              {item.disabledReason && (
                <span className="context-menu-reason">{item.disabledReason}</span>
              )}
            </button>
            {item.inlineButtons && (
              <div className="context-menu-inline-row">
                {item.inlineButtons.map((btn, j) => (
                  <button
                    key={j}
                    className={`context-menu-inline-btn${btn.disabled ? ' disabled' : ''}`}
                    disabled={btn.disabled}
                    title={btn.disabledReason}
                    onClick={() => {
                      if (btn.disabled) return;
                      btn.action?.();
                      onClose();
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
