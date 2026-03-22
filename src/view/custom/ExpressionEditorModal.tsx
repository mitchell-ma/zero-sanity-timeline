/**
 * Modal wrapper for the ExpressionEditor.
 * Draft state — edits apply on "Apply", discard on "Cancel" / overlay click.
 */
import { useState } from 'react';
import type { ValueNode } from '../../consts/semantics';
import ExpressionEditor from './ExpressionEditor';

interface Props {
  value: ValueNode;
  onChange: (node: ValueNode) => void;
  onClose: () => void;
  label?: string;
}

export default function ExpressionEditorModal({ value, onChange, onClose, label }: Props) {
  const [draft, setDraft] = useState<ValueNode>(value);

  const apply = () => {
    onChange(draft);
    onClose();
  };

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="expr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ce-modal-header">
          <span className="ce-modal-title">{label ? `Expression — ${label}` : 'Expression Editor'}</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="expr-modal-body">
          <ExpressionEditor value={draft} onChange={setDraft} />
        </div>
        <div className="expr-modal-footer">
          <button className="expr-btn expr-btn--cancel" onClick={onClose}>Cancel</button>
          <button className="expr-btn expr-btn--apply" onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
