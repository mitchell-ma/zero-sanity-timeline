import { t } from '../locales/locale';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="keys-modal" onClick={(e) => e.stopPropagation()}>
        <div className="devlog-header">
          <span className="devlog-title">{t('keyboard.title')}</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>
        <table className="keys-table">
          <thead>
            <tr><th>{t('keyboard.header.action')}</th><th>{t('keyboard.header.shortcut')}</th></tr>
          </thead>
          <tbody>
            <tr><td>{t('keyboard.zoomInOut')}</td><td><kbd>Shift</kbd> + <kbd>Scroll</kbd></td></tr>
            <tr><td>{t('keyboard.panTimeline')}</td><td><kbd>Scroll</kbd></td></tr>
            <tr><td>{t('keyboard.undo')}</td><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td></tr>
            <tr><td>{t('keyboard.redo')}</td><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></td></tr>
            <tr><td>{t('keyboard.selectAll')}</td><td><kbd>Ctrl</kbd> + <kbd>A</kbd></td></tr>
            <tr><td>{t('keyboard.multiSelect')}</td><td><kbd>Ctrl</kbd> + <kbd>Click</kbd></td></tr>
            <tr><td>{t('keyboard.deleteSelected')}</td><td><kbd>Delete</kbd></td></tr>
            <tr><td>{t('keyboard.duplicateSelected')}</td><td><kbd>Ctrl</kbd> + <kbd>D</kbd></td></tr>
            <tr><td>{t('keyboard.contextMenu')}</td><td><kbd>Right-click</kbd></td></tr>
            <tr><td>{t('keyboard.moveEvent')}</td><td><kbd>Drag</kbd></td></tr>
            <tr><td>{t('keyboard.save')}</td><td><kbd>Ctrl</kbd> + <kbd>S</kbd></td></tr>
            <tr><td>{t('keyboard.closeInfoPanel')}</td><td><kbd>Esc</kbd></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
