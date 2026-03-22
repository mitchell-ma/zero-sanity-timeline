/**
 * Expression tree editor.
 *
 * Renders a recursive binary expression tree (ValueNode) with editable
 * leaf nodes and operation selectors.
 *
 * Tree grammar:
 *   ValueNode = ValueLiteral | ValueVariable | ValueStat | ValueExpression
 *   ValueLiteral    = { verb: "IS", value: number }
 *   ValueVariable   = { verb: "VARY_BY", object: string, value?: number[] }
 *   ValueStat       = { verb: "IS", object: "STAT", objectId: string }
 *   ValueExpression = { operation: ValueOperation, left: ValueNode, right: ValueNode }
 */
import {
  VerbType, ValueOperation,
  isValueLiteral, isValueVariable, isValueStat, isValueExpression,
} from '../../dsl/semantics';
import { CoreNounType } from '../../dsl/semantics';
import type { ValueNode, ValueLiteral, ValueVariable, ValueStat } from '../../dsl/semantics';
import { StatType } from '../../model/enums/stats';
import CustomSelect from './CustomSelect';

// ── Constants ───────────────────────────────────────────────────────────────

const OPERATOR_OPTIONS = Object.values(ValueOperation).map((op) => ({
  value: op,
  label: op.replace(/_/g, ' '),
}));

const NODE_TYPE_OPTIONS = [
  { value: 'literal', label: 'Value' },
  { value: 'variable', label: 'Vary By' },
  { value: 'stat', label: 'Stat' },
  { value: 'expression', label: 'Expression' },
];

const STAT_OPTIONS = Object.values(StatType).map((s) => ({
  value: s,
  label: s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
}));

const VARIABLE_OBJECT_OPTIONS = [
  { value: 'SKILL_LEVEL', label: 'Skill Level' },
  { value: 'POTENTIAL', label: 'Potential' },
  { value: 'TALENT_ONE_LEVEL', label: 'Talent 1 Level' },
  { value: 'TALENT_TWO_LEVEL', label: 'Talent 2 Level' },
  { value: 'ATTRIBUTE_INCREASE_LEVEL', label: 'Attr. Increase Level' },
];

/** Starting index for level table headers (skill level is 1-indexed, others are 0-indexed). */
const VARIABLE_START_INDEX: Record<string, number> = {
  SKILL_LEVEL: 1,
  POTENTIAL: 0,
  TALENT_ONE_LEVEL: 0,
  TALENT_TWO_LEVEL: 0,
  ATTRIBUTE_INCREASE_LEVEL: 0,
};

const VARIABLE_ARRAY_LENGTHS: Record<string, number> = {
  SKILL_LEVEL: 12,
  POTENTIAL: 6,
  TALENT_ONE_LEVEL: 3,
  TALENT_TWO_LEVEL: 3,
  ATTRIBUTE_INCREASE_LEVEL: 5,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function defaultLiteral(): ValueLiteral {
  return { verb: VerbType.IS, value: 0 };
}

function defaultVariable(): ValueVariable {
  return { verb: VerbType.VARY_BY, object: 'SKILL_LEVEL', value: Array(12).fill(0) };
}

function getNodeType(node: ValueNode): string {
  if (isValueLiteral(node)) return 'literal';
  if (isValueVariable(node)) return 'variable';
  if (isValueStat(node)) return 'stat';
  return 'expression';
}

/** Convert node to a new type, preserving values where possible. */
function convertNode(node: ValueNode, toType: string): ValueNode {
  if (toType === 'literal') {
    if (isValueLiteral(node)) return node;
    if (isValueVariable(node) && typeof node.value === 'number') return { verb: VerbType.IS, value: node.value };
    if (isValueVariable(node) && Array.isArray(node.value)) return { verb: VerbType.IS, value: node.value[0] ?? 0 };
    return defaultLiteral();
  }
  if (toType === 'variable') {
    if (isValueVariable(node)) return node;
    if (isValueLiteral(node)) return { verb: VerbType.VARY_BY, object: 'SKILL_LEVEL', value: Array(12).fill(node.value) };
    return defaultVariable();
  }
  if (toType === 'stat') {
    if (isValueStat(node)) return node;
    return { verb: VerbType.IS, object: CoreNounType.STAT, objectId: StatType.INTELLECT };
  }
  if (toType === 'expression') {
    if (isValueExpression(node)) return node;
    return { operation: ValueOperation.MULT, left: node, right: defaultLiteral() };
  }
  return node;
}

// ── Public component ────────────────────────────────────────────────────────

interface ExpressionEditorProps {
  value: ValueNode;
  onChange: (node: ValueNode) => void;
}

export default function ExpressionEditor({ value, onChange }: ExpressionEditorProps) {
  return <NodeEditor node={value} onChange={onChange} />;
}

// ── Recursive node editor ───────────────────────────────────────────────────

function NodeEditor({ node, onChange }: {
  node: ValueNode;
  onChange: (node: ValueNode) => void;
}) {
  const nodeType = getNodeType(node);

  const changeType = (newType: string) => {
    onChange(convertNode(node, newType));
  };

  return (
    <div className="expr-node">
      <div className="expr-node-head">
        <CustomSelect
          className="expr-type-select"
          value={nodeType}
          options={NODE_TYPE_OPTIONS}
          onChange={changeType}
        />
        {isValueExpression(node) && (
          <CustomSelect
            className="expr-op-select"
            value={node.operation}
            options={OPERATOR_OPTIONS}
            onChange={(op) => onChange({ ...node, operation: op as ValueOperation })}
          />
        )}
        {isValueLiteral(node) && (
          <LiteralEditor node={node} onChange={onChange} />
        )}
        {isValueVariable(node) && (
          <VariableEditor node={node} onChange={onChange} />
        )}
        {isValueStat(node) && (
          <StatEditor node={node} onChange={onChange} />
        )}
      </div>

      {/* Level table for variable nodes — below the head, not inside it */}
      {isValueVariable(node) && (
        <VariableLevelTable node={node} onChange={onChange} />
      )}

      {isValueExpression(node) && (
        <div className="expr-children">
          <div className="expr-branch">
            <div className="expr-branch-arm"><span className="expr-branch-label">L</span></div>
            <NodeEditor node={node.left} onChange={(left) => onChange({ ...node, left })} />
          </div>
          <div className="expr-branch">
            <div className="expr-branch-arm"><span className="expr-branch-label">R</span></div>
            <NodeEditor node={node.right} onChange={(right) => onChange({ ...node, right })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Leaf editors ────────────────────────────────────────────────────────────

function LiteralEditor({ node, onChange }: { node: ValueLiteral; onChange: (n: ValueNode) => void }) {
  return (
    <input
      className="ib-input expr-literal-input"
      type="number"
      step="any"
      value={node.value}
      onChange={(e) => onChange({ verb: VerbType.IS, value: Number(e.target.value) || 0 })}
    />
  );
}

function StatEditor({ node, onChange }: { node: ValueStat; onChange: (n: ValueNode) => void }) {
  return (
    <CustomSelect
      className="expr-var-select"
      value={node.objectId ?? node.stat ?? ''}
      options={STAT_OPTIONS}
      onChange={(obj) => onChange({ verb: VerbType.IS, object: CoreNounType.STAT, objectId: obj })}
    />
  );
}

/** Inline part: just the dependency selector (sits in the node head row). */
function VariableEditor({ node, onChange }: { node: ValueVariable; onChange: (n: ValueNode) => void }) {
  const changeObject = (obj: string) => {
    const arr = Array.isArray(node.value) ? node.value : [];
    const newLen = VARIABLE_ARRAY_LENGTHS[obj] ?? 12;
    const newArr = Array(newLen).fill(0).map((_, i) => arr[i] ?? 0);
    onChange({ verb: VerbType.VARY_BY, object: obj, value: newArr });
  };

  return (
    <CustomSelect
      className="expr-var-select"
      value={node.object}
      options={VARIABLE_OBJECT_OPTIONS}
      onChange={changeObject}
    />
  );
}

/** Level table for variable nodes — rendered below the head row. */
function VariableLevelTable({ node, onChange }: { node: ValueVariable; onChange: (n: ValueNode) => void }) {
  const arrLen = VARIABLE_ARRAY_LENGTHS[node.object] ?? 12;
  const startIdx = VARIABLE_START_INDEX[node.object] ?? 0;
  const arr = Array.isArray(node.value) ? node.value : Array(arrLen).fill(0);

  return (
    <div className="expr-level-row">
      <table className="ib-level-table expr-level-table">
        <thead>
          <tr>
            {arr.map((_: number, i: number) => (
              <th key={i}>{i + startIdx}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {arr.map((v: number, i: number) => (
              <td key={i}>
                <input
                  className="ib-input ib-level-input"
                  type="number"
                  step="any"
                  value={v}
                  onChange={(e) => {
                    const next = [...arr];
                    next[i] = Number(e.target.value) || 0;
                    onChange({ verb: VerbType.VARY_BY, object: node.object, value: next });
                  }}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
