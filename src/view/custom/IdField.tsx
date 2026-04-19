/**
 * ID field with live global uniqueness warning.
 * Shows a warning if the entered ID conflicts with any other custom content item.
 */
import { useState, useEffect } from 'react';
import { checkIdConflict } from '../../utils/customContentStorage';

interface IdFieldProps {
  value: string;
  onChange: (id: string) => void;
  /** The item's original ID (before any edits). Used to exclude self from conflict check. */
  originalId?: string;
  /** Container class override. Defaults to 'wz-field' (column layout). */
  fieldClassName?: string;
  /** Label span class override. Defaults to undefined (no extra class). */
  labelClassName?: string;
}

export default function IdField({ value, onChange, originalId, fieldClassName = 'wz-field', labelClassName }: IdFieldProps) {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!value.trim()) {
      setWarning(null);
      return;
    }
    const conflict = checkIdConflict(value, originalId);
    if (conflict) {
      setWarning(`Already used by a custom ${conflict}`);
    } else {
      setWarning(null);
    }
  }, [value, originalId]);

  return (
    <label className={fieldClassName}>
      <span className={labelClassName}>ID</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="unique-kebab-case-id"
        className={warning ? 'id-field--conflict' : ''}
      />
      {warning && <span className="id-field-warning">{warning}</span>}
    </label>
  );
}
