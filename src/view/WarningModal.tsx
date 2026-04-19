interface WarningModalProps {
  message: string;
  onClose: () => void;
  title?: string;
  intro?: string;
}

const DEFAULT_TITLE = 'LOAD WARNING';
const DEFAULT_INTRO = 'Failed to restore saved sheet data. The sheet has been reset to defaults.';

export default function WarningModal({ message, onClose, title = DEFAULT_TITLE, intro = DEFAULT_INTRO }: WarningModalProps) {
  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="devlog-modal warning-modal" onClick={(e) => e.stopPropagation()}>
        <div className="devlog-header">
          <span className="devlog-title warning-title">{title}</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="devlog-body">
          {intro && <p className="warning-text">{intro}</p>}
          <div className="warning-detail">{message}</div>
        </div>
        <div className="warning-footer">
          <button className="btn-warning-ok" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}
