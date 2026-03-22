/**
 * Effect builder component.
 * Renders a single DSL Effect as a form row: VERB [cardinality] [adjective] OBJECT [prepositions].
 * Uses SentenceSlot for progressive disclosure with spring-momentum animations.
 */
import { useState } from 'react';
import { VerbType, ObjectType, SubjectType, DeterminerType, THRESHOLD_MAX, DURATION_END,
  VERB_LABELS, ADJECTIVE_LABELS, OBJECT_LABELS, TARGET_LABELS, DETERMINER_LABELS, OBJECT_ADJECTIVES,
  EFFECT_VERBS, getObjectsForEffectVerb, getEffectFieldVisibility, WITH_PROPERTY_LABELS,
  OBJECT_REQUIRED_ADJECTIVE, OBJECT_DEFAULT_ADJECTIVE,
  isValueLiteral, isValueVariable, isValueStat, isValueExpression, ValueOperator } from '../../dsl/semantics';
import type { Effect, ValueNode } from '../../dsl/semantics';
import { StatusIdSelect, InflictionIdSelect, ReactionIdSelect } from './InteractionBuilder';
import SentenceSlot from './SentenceSlot';
import CustomSelect from './CustomSelect';
import ExpressionEditorModal from './ExpressionEditorModal';

import type { AdjectiveType } from '../../dsl/semantics';

interface EffectBuilderProps {
  value: Effect;
  onChange: (value: Effect) => void;
  onRemove?: () => void;
  compact?: boolean;
}

export default function EffectBuilder({ value, onChange, onRemove, compact }: EffectBuilderProps) {
  const objects = getObjectsForEffectVerb(value.verb);
  const adjectives = value.object ? (OBJECT_ADJECTIVES[value.object] ?? []) : [];
  const vis = getEffectFieldVisibility(value);
  const isMax = value.cardinality === THRESHOLD_MAX;

  const update = (patch: Partial<Effect>) => onChange({ ...value, ...patch });

  return (
    <div className={`interaction-builder${compact ? ' interaction-builder--compact' : ''}`}>
      <div className="interaction-row">
        {/* Verb — always visible */}
        <CustomSelect
          className="ib-verb"
          value={value.verb}
          options={EFFECT_VERBS.map((v) => ({ value: v, label: VERB_LABELS[v] }))}
          onChange={(v) => {
            const newVerb = v as VerbType;
            const newObjects = getObjectsForEffectVerb(newVerb);
            const newObj = newObjects.includes(value.object ?? ObjectType.STATUS) ? value.object : newObjects[0];
            update({ verb: newVerb, object: newObj });
          }}
        />

        {/* Cardinality — slides in when verb needs it */}
        <SentenceSlot active={vis.showCardinality}>
          <input
            className="ib-input ib-quantity"
            type={isMax ? 'text' : 'number'}
            min={0}
            value={isMax ? 'MAX' : (value.cardinality ?? '')}
            placeholder="#"
            onChange={(e) => {
              const raw = e.target.value.toUpperCase();
              if (raw === 'MAX') {
                update({ cardinality: THRESHOLD_MAX });
              } else {
                update({ cardinality: Number(e.target.value) || undefined });
              }
            }}
          />
        </SentenceSlot>

        {/* Adjective — slides in when object type has adjectives (hidden for STATUS) */}
        <SentenceSlot active={vis.showAdjective}>
          <CustomSelect
            value={Array.isArray(value.adjective) ? value.adjective[0] ?? '' : value.adjective ?? ''}
            options={[
              ...(OBJECT_REQUIRED_ADJECTIVE.has(value.object ?? '') ? [] : [{ value: '', label: '—' }]),
              ...adjectives.map((a) => ({ value: a, label: ADJECTIVE_LABELS[a] })),
            ]}
            onChange={(v) => {
              const adj = (v || OBJECT_DEFAULT_ADJECTIVE[value.object as ObjectType] || undefined) as AdjectiveType | undefined;
              update({ adjective: adj });
            }}
          />
        </SentenceSlot>

        {/* Object ID — LEFT of the object dropdown */}
        <SentenceSlot active={vis.showObjectId}>
          {vis.showObjectIdIsStatus ? (
            <StatusIdSelect value={value.objectId ?? ''} onChange={(id) => update({ objectId: id || undefined })} />
          ) : vis.showObjectIdIsInfliction ? (
            <InflictionIdSelect value={value.objectId ?? ''} onChange={(id) => update({ objectId: id || undefined })} />
          ) : vis.showObjectIdIsReaction ? (
            <ReactionIdSelect value={value.objectId ?? ''} onChange={(id) => update({ objectId: id || undefined })} />
          ) : (
            <input
              className="ib-input ib-object-id"
              type="text"
              placeholder="ID"
              value={value.objectId ?? ''}
              onChange={(e) => update({ objectId: e.target.value || undefined })}
            />
          )}
        </SentenceSlot>

        {/* Object — always visible */}
        <CustomSelect
          className="ib-object"
          value={value.object ?? ''}
          options={objects.map((o) => ({ value: o, label: OBJECT_LABELS[o] ?? o }))}
          onChange={(v) => {
            const newObj = v as ObjectType;
            if (newObj === ObjectType.STATUS) {
              update({ object: newObj, adjective: undefined });
            } else if (OBJECT_DEFAULT_ADJECTIVE[newObj]) {
              update({ object: newObj, adjective: value.adjective || OBJECT_DEFAULT_ADJECTIVE[newObj] });
            } else {
              update({ object: newObj });
            }
          }}
        />

        {onRemove && (
          <button className="ib-remove" onClick={onRemove} title="Remove">&times;</button>
        )}
      </div>

      {/* Preposition row — slides down when verb needs qualifiers */}
      <SentenceSlot active={vis.showQualifierRow} row>
        <div className="interaction-row interaction-row--qualifier">
          <SentenceSlot active={vis.showTo}>
            <span className="ce-badge ce-badge--keyword">TO</span>
            <SentenceSlot active={value.toObject === SubjectType.OPERATOR}>
              <CustomSelect
                className="ib-determiner"
                value={value.toDeterminer ?? DeterminerType.THIS}
                options={Object.values(DeterminerType).map((d) => ({ value: d, label: DETERMINER_LABELS[d] }))}
                onChange={(v) => update({ toDeterminer: v as DeterminerType })}
              />
            </SentenceSlot>
            <CustomSelect
              value={value.toObject ?? ''}
              options={[{ value: '', label: '—' }, ...Object.entries(TARGET_LABELS).map(([k, label]) => ({ value: k, label }))]}
              onChange={(v) => update({ toObject: v || undefined })}
            />
          </SentenceSlot>
          <SentenceSlot active={vis.showFrom}>
            <span className="ce-badge ce-badge--keyword">FROM</span>
            <SentenceSlot active={value.fromObject === SubjectType.OPERATOR}>
              <CustomSelect
                className="ib-determiner"
                value={value.fromDeterminer ?? DeterminerType.THIS}
                options={Object.values(DeterminerType).map((d) => ({ value: d, label: DETERMINER_LABELS[d] }))}
                onChange={(v) => update({ fromDeterminer: v as DeterminerType })}
              />
            </SentenceSlot>
            <CustomSelect
              value={value.fromObject ?? ''}
              options={[{ value: '', label: '—' }, ...Object.entries(TARGET_LABELS).map(([k, label]) => ({ value: k, label }))]}
              onChange={(v) => update({ fromObject: v || undefined })}
            />
          </SentenceSlot>
          <SentenceSlot active={vis.showOn}>
            <span className="ce-badge ce-badge--keyword">ON</span>
            <SentenceSlot active={value.onObject === SubjectType.OPERATOR}>
              <CustomSelect
                className="ib-determiner"
                value={value.onDeterminer ?? DeterminerType.THIS}
                options={Object.values(DeterminerType).map((d) => ({ value: d, label: DETERMINER_LABELS[d] }))}
                onChange={(v) => update({ onDeterminer: v as DeterminerType })}
              />
            </SentenceSlot>
            <CustomSelect
              value={value.onObject ?? ''}
              options={[{ value: '', label: '—' }, ...Object.entries(TARGET_LABELS).map(([k, label]) => ({ value: k, label }))]}
              onChange={(v) => update({ onObject: v || undefined })}
            />
          </SentenceSlot>
          <SentenceSlot active={vis.showUntilEnd}>
            <label className="ib-checkbox">
              <input
                type="checkbox"
                checked={value.until === DURATION_END}
                onChange={(e) => update({ until: e.target.checked ? DURATION_END : undefined })}
              />
              UNTIL END
            </label>
          </SentenceSlot>
          <SentenceSlot active={vis.showDuration}>
            <span className="ce-badge ce-badge--keyword">FOR</span>
            <input
              className="ib-input"
              type="number"
              step="any"
              min={0}
              value={value.with?.duration && isValueLiteral(value.with.duration) ? value.with.duration.value : 0}
              onChange={(e) => {
                const dur = Number(e.target.value) || undefined;
                update({ with: dur != null ? { ...value.with, duration: { verb: VerbType.IS, value: dur } } : value.with });
              }}
            />
            <span className="ib-label">s</span>
          </SentenceSlot>
        </div>
      </SentenceSlot>

      {/* WITH properties — renders value/multiplier data from with preposition */}
      {vis.withProperties.filter((p) => p !== 'duration').map((propKey) => {
        const wv = value.with?.[propKey] as ValueNode | undefined;
        return (
          <WithPropertyRow
            key={propKey}
            propKey={propKey}
            withValue={wv}
            onChange={(next) => {
              update({ with: { ...value.with, [propKey]: next } });
            }}
          />
        );
      })}
    </div>
  );
}

// ── Expression summary ────────────────────────────────────────────────────

/** Compact inline summary of a ValueNode for display in the WITH row. */
function summarizeNode(node: ValueNode): string {
  if (isValueLiteral(node)) return String(node.value);
  if (isValueVariable(node)) {
    const obj = node.object.replace(/_/g, ' ').toLowerCase();
    if (Array.isArray(node.value)) return `[${node.value[0]}..${node.value[node.value.length - 1]}] by ${obj}`;
    return obj;
  }
  if (isValueStat(node)) {
    return node.objectId.replace(/_/g, ' ').toLowerCase();
  }
  if (isValueExpression(node)) {
    const op = node.operator.replace(/_/g, ' ');
    return `${op}(${summarizeNode(node.left)}, ${summarizeNode(node.right)})`;
  }
  return '?';
}

// ── WITH property row ──────────────────────────────────────────────────────

const WITH_VERB_OPTIONS = [
  { value: 'IS', label: 'is' },
  { value: 'VARY_BY', label: 'vary by' },
  { value: 'EXPR', label: 'expression' },
];

function WithPropertyRow({ propKey, withValue: node, onChange }: {
  propKey: string;
  withValue: ValueNode | undefined;
  onChange: (wv: ValueNode) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const label = WITH_PROPERTY_LABELS[propKey] ?? propKey;
  const isLiteral = !node || isValueLiteral(node);
  const isVariable = node && isValueVariable(node);
  const isExpr = node && isValueExpression(node);

  // Extract raw value for display
  const val = isLiteral && node ? node.value
    : isVariable ? node.value
    : undefined;

  const verbValue = isExpr ? 'EXPR' : isVariable ? VerbType.VARY_BY : VerbType.IS;

  const updateVerb = (newVerb: string) => {
    if (newVerb === 'EXPR') {
      setModalOpen(true);
      // If not already an expression, wrap current value
      if (!isExpr) {
        onChange({ operator: ValueOperator.MULT, left: node ?? { verb: VerbType.IS, value: 0 }, right: { verb: VerbType.IS, value: 1 } });
      }
      return;
    }
    if (newVerb === VerbType.VARY_BY) {
      const arr = Array.isArray(val) ? val : Array(12).fill(typeof val === 'number' ? val : 0);
      onChange({ verb: VerbType.VARY_BY, object: 'SKILL_LEVEL', value: arr });
    } else {
      const num = Array.isArray(val) ? val[0] ?? 0 : typeof val === 'number' ? val : 0;
      onChange({ verb: VerbType.IS, value: num });
    }
  };

  return (
    <div className="interaction-row interaction-row--with">
      <span className="ce-badge ce-badge--keyword">WITH</span>
      <span className="ib-label">{label}</span>
      <CustomSelect
        className="ib-with-verb"
        value={verbValue}
        options={WITH_VERB_OPTIONS}
        onChange={(v) => updateVerb(v)}
      />
      {isExpr ? (
        <>
          <span className="expr-summary">{summarizeNode(node)}</span>
          <button className="expr-open-btn" onClick={() => setModalOpen(true)}>Edit</button>
        </>
      ) : isLiteral ? (
        <input
          className="ib-input ib-with-value"
          type="number"
          step="any"
          value={(val as number) ?? 0}
          onChange={(e) => onChange({ verb: VerbType.IS, value: Number(e.target.value) || 0 })}
        />
      ) : (
        <>
          <span className="ib-label">{isVariable ? node.object : 'SKILL_LEVEL'}</span>
          <table className="ib-level-table">
            <thead>
              <tr>
                {(Array.isArray(val) ? val : Array(12).fill(0)).map((_: number, i: number) => (
                  <th key={i}>{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {(Array.isArray(val) ? val : Array(12).fill(0)).map((v: number, i: number) => (
                  <td key={i}>
                    <input
                      className="ib-input ib-level-input"
                      type="number"
                      step="any"
                      value={v}
                      onChange={(e) => {
                        const arr = Array.isArray(val) ? [...val] : Array(12).fill(0);
                        arr[i] = Number(e.target.value) || 0;
                        onChange({ verb: VerbType.VARY_BY, object: isVariable ? node.object : 'SKILL_LEVEL', value: arr });
                      }}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </>
      )}
      {modalOpen && (
        <ExpressionEditorModal
          value={node ?? { verb: VerbType.IS, value: 0 }}
          onChange={onChange}
          onClose={() => setModalOpen(false)}
          label={label}
        />
      )}
    </div>
  );
}

/** Helper to create a default Effect. */
export function defaultEffect(): Effect {
  return {
    verb: VerbType.APPLY,
    object: ObjectType.STATUS,
    objectId: '',
    toDeterminer: DeterminerType.THIS,
    toObject: SubjectType.OPERATOR,
  };
}
