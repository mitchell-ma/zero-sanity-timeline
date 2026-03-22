/**
 * Modal wrapper for the EventViewer.
 * Allows experimenting with event building in isolation.
 */
import { useState } from 'react';
import EventViewer from './EventViewer';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface Props {
  onClose: () => void;
}

export default function ClauseEditorModal({ onClose }: Props) {
  const [event, setEvent] = useState<Record<string, JsonValue>>({
    properties: { id: '', name: '' },
    metadata: {},
  });

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="ce-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ce-modal-header">
          <span className="ce-modal-title">Event Viewer</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="ce-modal-body">
          <EventViewer
            value={event}
            onChange={(next) => {
              setEvent(next);
              // eslint-disable-next-line no-console
              console.log('[EventViewer]', JSON.stringify(next, null, 2));
            }}
          />
        </div>
      </div>
    </div>
  );
}
