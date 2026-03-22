/**
 * Modal wrapper for the StatusEventEditor.
 */
import { useState } from 'react';
import StatusEventEditor from './StatusEventEditor';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface Props {
  onClose: () => void;
}

export default function StatusEditorModal({ onClose }: Props) {
  const [status, setStatus] = useState<Record<string, JsonValue>>({
    properties: { id: '', name: '' },
    metadata: {},
  });

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="ce-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ce-modal-header">
          <span className="ce-modal-title">Status Event Editor</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="ce-modal-body">
          <StatusEventEditor
            value={status}
            onChange={(next) => {
              setStatus(next);
              // eslint-disable-next-line no-console
              console.log('[StatusEventEditor]', JSON.stringify(next, null, 2));
            }}
          />
        </div>
      </div>
    </div>
  );
}
