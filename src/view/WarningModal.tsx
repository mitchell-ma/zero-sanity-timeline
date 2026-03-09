interface WarningModalProps {
  message: string;
  onClose: () => void;
}

export default function WarningModal({ message, onClose }: WarningModalProps) {
  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="devlog-modal warning-modal" onClick={(e) => e.stopPropagation()}>
        <div className="devlog-header">
          <span className="devlog-title warning-title">LOAD WARNING</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="devlog-body">
          <p className="warning-text">Failed to restore saved sheet data. The sheet has been reset to defaults.</p>
          <div className="warning-detail">{message}</div>
        </div>
        <div className="warning-footer">
          <button className="btn-warning-ok" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}
