import { useEffect, useMemo, useState, useCallback } from 'react';
import { t } from '../locales/locale';
import { ViewVariableType, MAX_LOADOUT_VIEW_PERMUTATIONS } from '../consts/enums';
import type { ViewSelections } from '../utils/loadoutStorage';
import { countViewPermutations, type ViewSlotContext } from '../utils/viewPermutations';

const POTENTIAL_VALUES = [0, 1, 2, 3, 4, 5] as const;
const WEAPON_SKILL3_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

interface CreateViewsModalProps {
  open: boolean;
  /** Per-slot context for the source loadout. */
  slots: ViewSlotContext[];
  /** Pre-existing selections when editing an already-permuted loadout. */
  initialSelections?: ViewSelections;
  /** Whether the source loadout already has views (controls replace warning). */
  hasExistingViews: boolean;
  onConfirm: (selections: ViewSelections) => void;
  onClose: () => void;
}

/** Seed selections from each slot's currently pinned values. */
function defaultSelectionsFromSlots(slots: ViewSlotContext[]): ViewSelections {
  const out: ViewSelections = {};
  for (const slot of slots) {
    if (!slot.operatorName) continue;
    const slotSel: Partial<Record<ViewVariableType, number[]>> = {
      [ViewVariableType.OPERATOR_POTENTIAL]: [slot.currentPotential],
    };
    if (slot.hasWeaponSkill3) {
      slotSel[ViewVariableType.WEAPON_SKILL_3_LEVEL] = [slot.currentSkill3Level];
    }
    out[slot.slotId] = slotSel;
  }
  return out;
}

export default function CreateViewsModal({
  open,
  slots,
  initialSelections,
  hasExistingViews,
  onConfirm,
  onClose,
}: CreateViewsModalProps) {
  const [selections, setSelections] = useState<ViewSelections>({});

  useEffect(() => {
    if (!open) return;
    setSelections(initialSelections ? deepClone(initialSelections) : defaultSelectionsFromSlots(slots));
  }, [open, initialSelections, slots]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggleValue = useCallback((slotId: string, variable: ViewVariableType, value: number) => {
    setSelections((prev) => {
      const slot = prev[slotId] ?? {};
      const list = slot[variable] ?? [];
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value].sort((a, b) => a - b);
      const nextSlot: Partial<Record<ViewVariableType, number[]>> = { ...slot, [variable]: next };
      if (next.length === 0) delete nextSlot[variable];
      const nextSelections = { ...prev, [slotId]: nextSlot };
      if (Object.keys(nextSlot).length === 0) delete nextSelections[slotId];
      return nextSelections;
    });
  }, []);

  const count = useMemo(() => countViewPermutations(selections, slots), [selections, slots]);
  const exceeded = count > MAX_LOADOUT_VIEW_PERMUTATIONS;
  // count === 0 means no axes selected at all; count === 1 collapses to the
  // parent loadout itself — we treat that as a deliberate "clear views" action
  // so the same modal handles deletion without a separate UI surface.
  const willClear = count === 1 && hasExistingViews;
  const canConfirm = count >= 1 && !exceeded;

  if (!open) return null;

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="views-modal" onClick={(e) => e.stopPropagation()}>
        <div className="devlog-header">
          <span className="devlog-title">{t('views.modal.title')}</span>
          <button className="devlog-close" onClick={onClose} aria-label={t('common.close')}>{'\u00D7'}</button>
        </div>

        <div className="views-modal-subtitle">{t('views.modal.subtitle')}</div>

        <div className="views-modal-grid">
          <div className="views-modal-col-head views-modal-col-head--slot" />
          <div className="views-modal-col-head">{t('views.modal.colOperator')}</div>
          <div className="views-modal-col-head">{t('views.modal.colWeaponSkill3')}</div>

          {slots.map((slot, idx) => {
            const slotSel = selections[slot.slotId] ?? {};
            const potSel = slotSel[ViewVariableType.OPERATOR_POTENTIAL] ?? [];
            const rankSel = slotSel[ViewVariableType.WEAPON_SKILL_3_LEVEL] ?? [];

            return (
              <div key={slot.slotId} className="views-modal-row" style={{ gridRow: idx + 2 }}>
                <div className="views-modal-slot-cell">
                  <span className="views-modal-slot-index">{`0${idx + 1}`.slice(-2)}</span>
                  <span className="views-modal-slot-name">
                    {slot.operatorName || t('views.modal.emptySlot')}
                  </span>
                </div>

                <div className="views-modal-pickline">
                  {POTENTIAL_VALUES.map((v) => {
                    const isCurrent = v === slot.currentPotential;
                    const isSelected = potSel.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        className={`views-pip ${isSelected ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''}`}
                        onClick={() => toggleValue(slot.slotId, ViewVariableType.OPERATOR_POTENTIAL, v)}
                        title={isCurrent ? 'Current loadout value' : undefined}
                      >
                        <span className="views-pip-axis">P</span>
                        <span className="views-pip-value">{v}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="views-modal-pickline">
                  {slot.hasWeaponSkill3 ? (
                    WEAPON_SKILL3_VALUES.map((v) => {
                      const isCurrent = v === slot.currentSkill3Level;
                      const isSelected = rankSel.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          className={`views-pip ${isSelected ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''}`}
                          onClick={() => toggleValue(slot.slotId, ViewVariableType.WEAPON_SKILL_3_LEVEL, v)}
                          title={isCurrent ? 'Current loadout value' : undefined}
                        >
                          <span className="views-pip-axis">R</span>
                          <span className="views-pip-value">{v}</span>
                        </button>
                      );
                    })
                  ) : (
                    <span className="views-modal-empty">{t('views.modal.noWeaponSkill3')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="views-modal-footer">
          <div className="views-modal-status">
            <div className={`views-modal-count ${exceeded ? 'is-error' : ''}`}>
              <span className="views-modal-count-label">PERMUTATIONS</span>
              <span className="views-modal-count-value">{count}</span>
              {exceeded && (
                <span className="views-modal-count-cap">/ MAX {MAX_LOADOUT_VIEW_PERMUTATIONS}</span>
              )}
            </div>
            {hasExistingViews && (
              <div className="views-modal-replace-warning">{t('views.modal.replaceWarning')}</div>
            )}
          </div>
          <div className="views-modal-actions">
            <button className="confirm-btn confirm-btn--cancel" onClick={onClose}>
              {t('views.modal.cancel')}
            </button>
            <button
              className={`confirm-btn ${willClear ? 'confirm-btn--danger' : 'confirm-btn--primary'}`}
              disabled={!canConfirm}
              onClick={() => canConfirm && onConfirm(selections)}
              title={willClear ? t('views.modal.confirmClearTooltip') : undefined}
            >
              {willClear
                ? t('views.modal.confirmClear')
                : count > 1
                  ? t('views.modal.confirmGenerate', { count })
                  : t('views.modal.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function deepClone(s: ViewSelections): ViewSelections {
  const out: ViewSelections = {};
  for (const [slotId, slot] of Object.entries(s)) {
    out[slotId] = {};
    for (const [variable, values] of Object.entries(slot)) {
      if (values) out[slotId][variable as ViewVariableType] = [...values];
    }
  }
  return out;
}
