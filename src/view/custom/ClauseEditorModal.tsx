/**
 * Modal wrapper for the standalone ClauseEditor.
 * Allows experimenting with clause building in isolation.
 */
import ClauseEditor from './ClauseEditor';

interface Props {
  onClose: () => void;
}

export default function ClauseEditorModal({ onClose }: Props) {
  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="ce-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ce-modal-header">
          <span className="ce-modal-title">Clause Editor</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="ce-modal-body">
          <ClauseEditor
            onChange={(clause) => {
              // eslint-disable-next-line no-console
              console.log('[ClauseEditor] clause:', JSON.stringify(clause, null, 2));
            }}
          />
        </div>
      </div>
    </div>
  );
}
