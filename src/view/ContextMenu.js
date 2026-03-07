import { useEffect, useRef } from 'react';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  // Clamp position to viewport
  const menuW = 220;
  const menuH = items.length * 36 + 10;
  const clampedX = Math.min(x, window.innerWidth - menuW - 8);
  const clampedY = Math.min(y, window.innerHeight - menuH - 8);

  useEffect(() => {
    const handleDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: clampedX, top: clampedY }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="context-menu-separator" />;
        }
        return (
          <button
            key={i}
            className={`context-menu-item ${item.danger ? 'danger' : ''}`}
            onClick={() => {
              item.action();
              onClose();
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
