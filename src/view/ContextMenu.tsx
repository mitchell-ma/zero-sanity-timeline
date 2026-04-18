import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ContextMenuItem, ContextMenuItemOverride, ContextMenuParameterSubmenu } from "../consts/viewTypes";
import { ContextMenuAxisKind } from "../consts/enums";

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

function defaultSelection(submenu: ContextMenuParameterSubmenu): Record<string, number> {
  const out: Record<string, number> = {};
  for (const axis of submenu) {
    const def = axis.options.find((o) => o.isDefault) ?? axis.options[0];
    out[axis.paramId] = def?.value ?? axis.min ?? 1;
  }
  return out;
}

/** Split a raw paramId→value selection map into an action override, routing
 *  parameter values onto event.parameterValues and stacks/statusLevel onto
 *  their dedicated fields. */
function buildOverride(
  submenu: ContextMenuParameterSubmenu,
  selection: Record<string, number>,
): ContextMenuItemOverride | undefined {
  const out: ContextMenuItemOverride = {};
  for (const axis of submenu) {
    const v = selection[axis.paramId];
    if (v == null) continue;
    if (axis.kind === ContextMenuAxisKind.STACKS) out.stacks = v;
    else if (axis.kind === ContextMenuAxisKind.STATUS_LEVEL) out.statusLevel = v;
    else (out.parameterValues ??= {})[axis.paramId] = v;
  }
  return out.parameterValues || out.stacks != null || out.statusLevel != null ? out : undefined;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const expandRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [, forceRender] = useState(0);

  // Track submenu selection per item index — map of paramId → value.
  const [selections, setSelections] = useState<Record<number, Record<string, number>>>(() => {
    const init: Record<number, Record<string, number>> = {};
    items.forEach((item, i) => {
      if (item.parameterSubmenu) init[i] = defaultSelection(item.parameterSubmenu);
    });
    return init;
  });
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ left: number; top: number } | null>(null);
  const [submenuFlipped, setSubmenuFlipped] = useState(false);

  const menuW = 220;
  const menuH = items.reduce((h, item) =>
    h + (item.separator ? 9 : item.header ? 28 : item.segmentTabs ? 56 : 36) + (item.inlineButtons && !item.segmentTabs ? 32 : 0) + (item.inlineLabel && item.inlineButtons ? 16 : 0),
    10);
  const maxH = Math.min(384, window.innerHeight - 16);
  const effectiveH = Math.min(menuH, maxH);
  const clampedX = Math.min(x, window.innerWidth  - menuW - 8);
  const clampedY = Math.min(y, window.innerHeight - effectiveH - 8);

  useEffect(() => {
    const handleDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const insideMenu = menuRef.current?.contains(target);
      const insideSubmenu = submenuRef.current?.contains(target);
      if (!insideMenu && !insideSubmenu) onClose();
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

  // When the submenu opens, measure the expand button and position the submenu
  // as position: fixed so it escapes the parent menu's overflow clipping. The
  // submenu is flush against the main menu (overlapping its border by 1px) so
  // the two read as one continuous surface.
  useLayoutEffect(() => {
    if (openSubmenu == null) { setSubmenuPos(null); return; }
    const btn = expandRefs.current[openSubmenu];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const submenuEl = submenuRef.current;
    const submenuW = submenuEl?.offsetWidth ?? 180;
    const submenuH = submenuEl?.offsetHeight ?? 80;
    // Prefer right of the arrow (flush — submenu's left/right border is removed
    // on the touching side so the parent menu's border reads as the seam).
    let left = rect.right;
    let flipped = false;
    if (left + submenuW > window.innerWidth - 4) {
      const menuRect = menuRef.current?.getBoundingClientRect();
      left = (menuRect?.left ?? rect.left) - submenuW;
      flipped = true;
    }
    setSubmenuFlipped(flipped);
    let top = rect.top;
    if (top + submenuH > window.innerHeight - 4) {
      top = Math.max(4, window.innerHeight - submenuH - 4);
    }
    setSubmenuPos({ left, top });
  }, [openSubmenu]);

  const activeSubmenu = openSubmenu != null ? items[openSubmenu]?.parameterSubmenu : undefined;
  const activeSelection = openSubmenu != null ? selections[openSubmenu] : undefined;

  return (
    <>
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
          const checked = typeof item.checked === 'function' ? item.checked() : item.checked;
          if (item.segmentTabs && item.inlineButtons) {
            return (
              <div key={i} className="context-menu-seg-card">
                <button
                  className={`context-menu-seg-card-label${item.disabled ? ' disabled' : ''}`}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    item.action?.();
                    onClose();
                  }}
                >
                  {item.label}
                </button>
                <div className="context-menu-seg-row">
                  {item.inlineButtons.map((btn, j) => (
                    <button
                      key={j}
                      className={`context-menu-seg-btn${btn.disabled ? ' disabled' : ''}`}
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
              </div>
            );
          }
          const submenu = item.parameterSubmenu;
          const isSubmenuOpen = openSubmenu === i;
          return (
            <div key={i} className={submenu ? 'context-menu-row-with-submenu' : undefined}>
              <div className={submenu ? 'context-menu-row' : undefined}>
                <button
                  className={`context-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}${item.checked != null ? ' context-menu-item--toggle' : ''}`}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    const sel = submenu ? selections[i] : undefined;
                    const override = submenu && sel ? buildOverride(submenu, sel) : undefined;
                    item.action?.(override);
                    if (item.keepOpen) forceRender((n) => n + 1);
                    else onClose();
                  }}
                >
                  {item.checked != null && (
                    <span className="context-menu-check">{checked ? '\u2713' : ''}</span>
                  )}
                  {item.label}
                  {item.disabledReason && (
                    <span className="context-menu-reason">{item.disabledReason}</span>
                  )}
                </button>
                {submenu && !item.disabled && (
                  <button
                    ref={(el) => { expandRefs.current[i] = el; }}
                    className={`context-menu-expand${isSubmenuOpen ? ' open' : ''}`}
                    title={submenu.map((a) => a.paramName).join(' / ')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSubmenu(isSubmenuOpen ? null : i);
                    }}
                  >
                    {isSubmenuOpen ? '\u2039' : '\u203a'}
                  </button>
                )}
              </div>
              {item.inlineLabel && item.inlineButtons && (
                <div className="context-menu-inline-label">{item.inlineLabel}</div>
              )}
              {item.inlineButtons && !submenu && (
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
      {activeSubmenu && activeSelection && submenuPos && (
        <div
          ref={submenuRef}
          className={`context-menu-submenu${submenuFlipped ? ' flipped' : ''}`}
          style={{ left: submenuPos.left, top: submenuPos.top }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {activeSubmenu.map((axis) => {
            const setAxisValue = (raw: number) => {
              if (openSubmenu == null) return;
              const lo = axis.min ?? 1;
              const hi = axis.max ?? raw;
              const clamped = Math.max(lo, Math.min(hi, raw));
              setSelections((prev) => ({
                ...prev,
                [openSubmenu]: { ...(prev[openSubmenu] ?? {}), [axis.paramId]: clamped },
              }));
            };
            const current = activeSelection[axis.paramId] ?? axis.min ?? 1;
            return (
              <div key={axis.paramId} className="context-menu-submenu-axis">
                <div className="context-menu-submenu-label">{axis.paramName}</div>
                {axis.useStepper ? (
                  <div className="context-menu-submenu-stepper">
                    <button
                      className="context-menu-stepper-btn"
                      onClick={(e) => { e.stopPropagation(); setAxisValue(axis.min ?? 1); }}
                      title="Min"
                    >{'\u00ab'}</button>
                    <button
                      className="context-menu-stepper-btn"
                      onClick={(e) => { e.stopPropagation(); setAxisValue(current - 1); }}
                      title="\u22121"
                    >{'\u2039'}</button>
                    <input
                      type="number"
                      className="context-menu-stepper-input"
                      value={current}
                      min={axis.min}
                      max={axis.max}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) setAxisValue(Math.round(n));
                      }}
                    />
                    <button
                      className="context-menu-stepper-btn"
                      onClick={(e) => { e.stopPropagation(); setAxisValue(current + 1); }}
                      title="+1"
                    >{'\u203a'}</button>
                    <button
                      className="context-menu-stepper-btn"
                      onClick={(e) => { e.stopPropagation(); setAxisValue(axis.max ?? current); }}
                      title="Max"
                    >{'\u00bb'}</button>
                  </div>
                ) : (
                  <div className="context-menu-submenu-row">
                    {axis.options.map((opt) => {
                      const isSelected = current === opt.value;
                      return (
                        <button
                          key={opt.value}
                          className={`context-menu-submenu-option${isSelected ? ' selected' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setAxisValue(opt.value); }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
