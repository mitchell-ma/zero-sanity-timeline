import { useEffect } from 'react';
import { t } from '../locales/locale';

interface ConfirmModalProps {
  open: boolean;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({ open, message, confirmLabel, onConfirm, onClose }: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn--cancel" onClick={onClose}>{t('confirm.cancel')}</button>
          <button className="confirm-btn confirm-btn--danger" onClick={onConfirm}>{confirmLabel ?? t('confirm.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
