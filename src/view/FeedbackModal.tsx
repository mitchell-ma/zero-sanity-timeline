import { useCallback, useEffect, useState } from 'react';
import { t } from '../locales/locale';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

const MAX_MESSAGE_LENGTH = 5000;
const MAX_CONTACT_LENGTH = 200;

enum SubmitState {
  IDLE = 'IDLE',
  SENDING = 'SENDING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState<SubmitState>(SubmitState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMessage('');
      setContact('');
      setState(SubmitState.IDLE);
      setErrorMessage(null);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setState(SubmitState.SENDING);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, contact: contact.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorMessage(typeof data.error === 'string' ? data.error : t('feedback.error.generic'));
        setState(SubmitState.ERROR);
        return;
      }
      setState(SubmitState.SUCCESS);
    } catch {
      setErrorMessage(t('feedback.error.network'));
      setState(SubmitState.ERROR);
    }
  }, [message, contact]);

  if (!open) return null;

  const sending = state === SubmitState.SENDING;
  const success = state === SubmitState.SUCCESS;
  const disabled = sending || !message.trim();

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">{t('feedback.title')}</span>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>
        <div className="settings-body feedback-body">
          {success ? (
            <div className="feedback-success">{t('feedback.success')}</div>
          ) : (
            <>
              <p className="feedback-intro">{t('feedback.intro')}</p>
              <label className="feedback-field">
                <span className="feedback-label">{t('feedback.label.message')}</span>
                <textarea
                  className="feedback-textarea"
                  value={message}
                  maxLength={MAX_MESSAGE_LENGTH}
                  placeholder={t('feedback.placeholder.message')}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={sending}
                  rows={6}
                  autoFocus
                />
              </label>
              <label className="feedback-field">
                <span className="feedback-label">{t('feedback.label.contact')}</span>
                <input
                  className="feedback-input"
                  type="text"
                  value={contact}
                  maxLength={MAX_CONTACT_LENGTH}
                  placeholder={t('feedback.placeholder.contact')}
                  onChange={(e) => setContact(e.target.value)}
                  disabled={sending}
                />
              </label>
              {errorMessage && <div className="feedback-error">{errorMessage}</div>}
              <div className="feedback-actions">
                <button
                  className="feedback-submit"
                  onClick={handleSubmit}
                  disabled={disabled}
                >
                  {sending ? t('feedback.btn.sending') : t('feedback.btn.submit')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
