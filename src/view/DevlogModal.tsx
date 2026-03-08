import { useEffect, useState } from 'react';

interface DevlogModalProps {
  open: boolean;
  onClose: () => void;
}

interface DevlogEntry {
  date: string;
  items: string[];
}

function parseDevlog(raw: string): DevlogEntry[] {
  const entries: DevlogEntry[] = [];
  let current: DevlogEntry | null = null;
  for (const line of raw.split('\n')) {
    const dateMatch = line.match(/^## (.+)/);
    if (dateMatch) {
      current = { date: dateMatch[1], items: [] };
      entries.push(current);
    } else if (current && line.startsWith('- ')) {
      current.items.push(line.slice(2));
    }
  }
  return entries;
}

export default function DevlogModal({ open, onClose }: DevlogModalProps) {
  const [entries, setEntries] = useState<DevlogEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch(`${process.env.PUBLIC_URL}/devlog.md`)
      .then((r) => r.text())
      .then((text) => setEntries(parseDevlog(text)))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="devlog-modal" onClick={(e) => e.stopPropagation()}>
        <div className="devlog-header">
          <span className="devlog-title">DEVLOG</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="devlog-body">
          {entries.map((entry) => (
            <div key={entry.date} className="devlog-entry">
              <div className="devlog-date">{entry.date}</div>
              <ul className="devlog-list">
                {entry.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
