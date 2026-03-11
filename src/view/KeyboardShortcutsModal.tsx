interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="keys-modal" onClick={(e) => e.stopPropagation()}>
        <div className="devlog-header">
          <span className="devlog-title">KEYBOARD CONTROLS</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>
        <table className="keys-table">
          <thead>
            <tr><th>Action</th><th>Shortcut</th></tr>
          </thead>
          <tbody>
            <tr><td>Zoom in/out</td><td><kbd>Shift</kbd> + <kbd>Scroll</kbd></td></tr>
            <tr><td>Pan timeline</td><td><kbd>Scroll</kbd></td></tr>
            <tr><td>Undo</td><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td></tr>
            <tr><td>Redo</td><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></td></tr>
            <tr><td>Select all events</td><td><kbd>Ctrl</kbd> + <kbd>A</kbd></td></tr>
            <tr><td>Multi-select</td><td><kbd>Ctrl</kbd> + <kbd>Click</kbd></td></tr>
            <tr><td>Delete selected</td><td><kbd>Delete</kbd></td></tr>
            <tr><td>Duplicate selected</td><td><kbd>Ctrl</kbd> + <kbd>D</kbd></td></tr>
            <tr><td>Context menu</td><td><kbd>Right-click</kbd></td></tr>
            <tr><td>Move event / Marquee select</td><td><kbd>Drag</kbd></td></tr>
            <tr><td>Close info panel</td><td><kbd>Esc</kbd></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
