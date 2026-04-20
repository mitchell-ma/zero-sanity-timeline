import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ContextMenuItem, ContextMenuItemOverride, ContextMenuParameterSubmenu } from "../consts/viewTypes";
import { ContextMenuAxisKind, StepperActionIcon } from "../consts/enums";
import { t } from '../locales/locale';

function StepperActionIconGlyph({ icon }: { icon: StepperActionIcon }) {
  switch (icon) {
    case StepperActionIcon.REFRESH:
      return (
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 8a6 6 0 1 1-1.76-4.24" />
          <path d="M14 2v3.5h-3.5" />
        </svg>
      );
  }
}

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
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = useState(0);

  const cancelHoverClose = () => {
    if (hoverCloseTimer.current != null) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };
  const scheduleHoverClose = () => {
    cancelHoverClose();
    hoverCloseTimer.current = setTimeout(() => setOpenSubmenu(null), 260);
  };
  useEffect(() => () => cancelHoverClose(), []);

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
    h + (item.separator ? 9 : item.header ? 28 : item.segmentTabs ? 56 : 36) + (item.inlineButtons && !item.segmentTabs ? 32 : 0) + (item.inlineLabel && item.inlineButtons ? 16 : 0) + (item.stepper?.action?.inline ? 32 : 0),
    10);
  const maxH = Math.min(384, window.innerHeight - 16);
  const effectiveH = Math.min(menuH, maxH);
  const estClampedX = Math.max(8, Math.min(x, window.innerWidth  - menuW - 8));
  const estClampedY = Math.max(8, Math.min(y, window.innerHeight - effectiveH - 8));
  const [measuredPos, setMeasuredPos] = useState<{ left: number; top: number } | null>(null);
  const clampedX = measuredPos?.left ?? estClampedX;
  const clampedY = measuredPos?.top ?? estClampedY;

  // Refine clamping after first paint using actual menu dimensions — the item
  // height estimate above is a best-effort guess, so measure-and-flip keeps
  // the menu fully on-screen for any item composition.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - w - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - h - margin));
    setMeasuredPos({ left, top });
  }, [x, y, items]);

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
    // Any scroll outside the menu (wheel, touch, or programmatic scroll on any
    // scroll container) closes — the menu is pinned in viewport coords and
    // stops pointing at its anchor once the page moves.
    const handleScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && (menuRef.current?.contains(target) || submenuRef.current?.contains(target))) return;
      onClose();
    };
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || submenuRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('touchstart', handleDown);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('wheel', handleWheel, { passive: true });
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('touchstart', handleDown);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('wheel', handleWheel);
      document.removeEventListener('scroll', handleScroll, { capture: true });
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
        onMouseEnter={cancelHoverClose}
      >
        {items.map((item, i) => {
          if (item.separator) {
            return <div key={i} className="context-menu-separator" />;
          }
          if (item.header) {
            return <div key={i} className="context-menu-header">{item.label}</div>;
          }
          if (item.stepper) {
            const stepper = item.stepper;
            const action = stepper.action;
            const inlineAction = action && !action.inline ? action : undefined;
            const rowAction = action && action.inline ? action : undefined;
            return (
              <div key={i} className="context-menu-stepper-group">
                <div className="context-menu-submenu-stepper context-menu-stepper--discrete">
                  <button
                    className="context-menu-stepper-btn"
                    onClick={(e) => { e.stopPropagation(); stepper.onPrev(); forceRender((n) => n + 1); }}
                    title={t('common.previous')}
                    aria-label={t('common.previous')}
                  >{'\u2039'}</button>
                  <div className="context-menu-stepper-value">{stepper.valueLabel}</div>
                  <button
                    className="context-menu-stepper-btn"
                    onClick={(e) => { e.stopPropagation(); stepper.onNext(); forceRender((n) => n + 1); }}
                    title={t('common.next')}
                    aria-label={t('common.next')}
                  >{'\u203a'}</button>
                  {inlineAction && (
                    <button
                      className="context-menu-stepper-action"
                      onClick={(e) => { e.stopPropagation(); inlineAction.onClick(); forceRender((n) => n + 1); }}
                      title={inlineAction.title}
                      aria-label={inlineAction.title}
                    >
                      <StepperActionIconGlyph icon={inlineAction.icon} />
                    </button>
                  )}
                </div>
                {rowAction && (
                  <button
                    className="context-menu-stepper-action-row"
                    onClick={(e) => { e.stopPropagation(); rowAction.onClick(); forceRender((n) => n + 1); }}
                    title={rowAction.title}
                    aria-label={rowAction.label ?? rowAction.title}
                  >
                    <StepperActionIconGlyph icon={rowAction.icon} />
                    <span>{rowAction.label ?? rowAction.title}</span>
                  </button>
                )}
              </div>
            );
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
          // Hovering a non-submenu row while a submenu is open closes it
          // immediately — rows with submenus are handled by their own `›`.
          const rowHoverProps = !submenu && openSubmenu != null
            ? { onMouseEnter: () => { cancelHoverClose(); setOpenSubmenu(null); } }
            : undefined;
          return (
            <div key={i} className={submenu ? 'context-menu-row-with-submenu' : undefined} {...rowHoverProps}>
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
                    onMouseEnter={() => { cancelHoverClose(); setOpenSubmenu(i); }}
                    onMouseLeave={(e) => {
                      const rel = e.relatedTarget as Node | null;
                      // Into the submenu → stay open.
                      if (rel && submenuRef.current?.contains(rel)) { cancelHoverClose(); return; }
                      // Into the same row (the main menu option that owns this
                      // submenu) → stay open; the parent option is conceptually
                      // "highlighted" while its submenu is showing.
                      const ownRow = e.currentTarget.parentElement;
                      if (rel && ownRow?.contains(rel)) { cancelHoverClose(); return; }
                      // Into the scrollbar channel (relatedTarget is the menu
                      // itself) → brief grace so diagonal travel toward the
                      // submenu through the scrollbar gutter still works.
                      if (rel === menuRef.current) { scheduleHoverClose(); return; }
                      // Into any other main-menu element → close immediately.
                      if (rel && menuRef.current?.contains(rel)) { cancelHoverClose(); setOpenSubmenu(null); return; }
                      // Outside the overlay entirely → keep open; user can
                      // close via click-outside, scroll, or Escape.
                      cancelHoverClose();
                    }}
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
          onMouseEnter={cancelHoverClose}
          onMouseLeave={(e) => {
            const rel = e.relatedTarget as Node | null;
            // Back onto the parent option's row (the main menu option that
            // owns this submenu) → stay open; that row is conceptually
            // "highlighted" while its submenu is showing.
            const ownerRow = openSubmenu != null
              ? expandRefs.current[openSubmenu]?.parentElement ?? null
              : null;
            if (rel && ownerRow?.contains(rel)) { cancelHoverClose(); return; }
            // Moving back into the main menu (any other row) → close
            // immediately.
            if (rel && menuRef.current?.contains(rel)) {
              cancelHoverClose();
              setOpenSubmenu(null);
              return;
            }
            // Non-main-menu regions (outside the overlay entirely) → keep
            // the submenu open; user can close via click-outside, scroll, or
            // Escape.
            cancelHoverClose();
          }}
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
