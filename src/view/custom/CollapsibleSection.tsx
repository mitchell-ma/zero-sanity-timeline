/**
 * Reusable collapsible section wrapper for the Unified Customizer.
 */
import { useState } from 'react';

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function CollapsibleSection({ title, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`uc-section${open ? ' uc-section--open' : ''}`}>
      <button className="uc-section-header" onClick={() => setOpen((o) => !o)}>
        <svg className="uc-section-chevron" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
        </svg>
        <span>{title}</span>
      </button>
      {open && <div className="uc-section-body">{children}</div>}
    </div>
  );
}
