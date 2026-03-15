import { useState, useRef, useEffect } from 'react';

interface AppBarProps {
  activeLoadoutName: string;
  onRenameLoadout: (name: string) => void;
  onClearLoadout: () => void;
  onClearAll: () => void;
  onExport: () => void;
  onImport: () => void;
  onDevlog: () => void;
  onKeys: () => void;
  onCustomContent: () => void;
  debugMode?: boolean;
  onToggleDebug?: () => void;
  lightMode?: boolean;
  onToggleTheme?: () => void;
}

export default function AppBar({
  activeLoadoutName, onRenameLoadout,
  onClearLoadout, onClearAll,
  onExport, onImport, onDevlog, onKeys, onCustomContent,
  debugMode, onToggleDebug,
  lightMode, onToggleTheme,
}: AppBarProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancellingRef = useRef(false);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const handleRenameStart = () => {
    setRenameValue(activeLoadoutName);
    setRenaming(true);
  };

  const handleRenameSubmit = () => {
    if (cancellingRef.current) { cancellingRef.current = false; return; }
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== activeLoadoutName) {
      onRenameLoadout(trimmed);
    }
    setRenaming(false);
  };

  return (
    <div className="app-bar">
      <div className="app-brand">
        <span className="brand-hex">&#x2B21;</span>
        <div className="brand-text">
          <span className="brand-title">ENDFIELD</span>
          <span className="brand-sub">ZERO SANITY TIMELINE</span>
        </div>
      </div>

      <div className="app-bar-divider" />

      <div className="app-bar-loadout">
        {renaming ? (
          <input
            ref={inputRef}
            className="app-bar-loadout-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') { cancellingRef.current = true; setRenaming(false); }
            }}
          />
        ) : (
          <span className="app-bar-loadout-name" title={activeLoadoutName}>
            {activeLoadoutName}
          </span>
        )}
        {!renaming && (
          <button className="app-bar-loadout-rename" onClick={handleRenameStart} title="Rename loadout">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M12.146.854a.5.5 0 01.708 0l2.292 2.292a.5.5 0 010 .708L5.854 13.146a.5.5 0 01-.233.131l-3.5 1a.5.5 0 01-.612-.612l1-3.5a.5.5 0 01.131-.233L12.146.854zM11.5 2.207L3.207 10.5l-.646 2.262 2.261-.646L13.086 3.854 11.5 2.207z"/>
            </svg>
          </button>
        )}
      </div>

      <div className="app-bar-divider" />

      <button className="btn-clear" onClick={onClearLoadout}>
        CLEAR
      </button>
      <button className="btn-clear" onClick={onClearAll}>
        CLEAR ALL
      </button>
      <button className="btn-devlog" onClick={onExport}>
        EXPORT
      </button>
      <button className="btn-devlog" onClick={onImport}>
        IMPORT
      </button>
      <button className="btn-devlog" onClick={onCustomContent}>
        CUSTOM
      </button>

      <div className="app-bar-right">
        <button
          className="btn-theme"
          onClick={onToggleTheme}
          title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {lightMode ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>
            </svg>
          )}
        </button>
        <button
          className={`btn-debug${debugMode ? ' btn-debug--active' : ''}`}
          onClick={onToggleDebug}
          title="Debug mode: bypass all validation"
        >
          DEBUG
        </button>
        <span className="wip-badge">WIP</span>
        <button className="btn-devlog" onClick={onDevlog}>
          DEVLOG
        </button>

        <button className="btn-keys" onClick={onKeys}>
          ?
        </button>
        <a
          className="github-link"
          href="https://github.com/mitchell-ma/zero-sanity-timeline"
          target="_blank"
          rel="noopener noreferrer"
          title="View on GitHub"
        >
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
      </div>
    </div>
  );
}
