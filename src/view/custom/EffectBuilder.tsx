/**
 * Effect builder component.
 * Renders a single DSL Effect as a form row: VERB [cardinality] [adjective] OBJECT [prepositions].
 * Uses SentenceSlot for progressive disclosure with spring-momentum animations.
 */
import { VerbType, ObjectType, SubjectType, DeterminerType, THRESHOLD_MAX, DURATION_END,
  VERB_LABELS, ADJECTIVE_LABELS, OBJECT_LABELS, TARGET_LABELS, DETERMINER_LABELS, OBJECT_ADJECTIVES,
  EFFECT_VERBS, getObjectsForEffectVerb, getEffectFieldVisibility, WithValueVerb, WITH_PROPERTY_LABELS,
  OBJECT_REQUIRED_ADJECTIVE, OBJECT_DEFAULT_ADJECTIVE } from '../../consts/semantics';
import type { Effect, WithValue } from '../../consts/semantics';
import { StatusIdSelect, InflictionIdSelect, ReactionIdSelect } from './InteractionBuilder';
import SentenceSlot from './SentenceSlot';
import CustomSelect from './CustomSelect';

import type { AdjectiveType } from '../../consts/semantics';

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
              value={(value.with?.duration?.value as number) ?? 0}
              onChange={(e) => {
                const dur = Number(e.target.value) || undefined;
                update({ with: dur != null ? { ...value.with, duration: { verb: WithValueVerb.IS, value: dur } } : value.with });
              }}
            />
            <span className="ib-label">s</span>
          </SentenceSlot>
        </div>
      </SentenceSlot>

      {/* WITH properties — renders value/multiplier data from with preposition */}
      {vis.withProperties.filter((p) => p !== 'duration').map((propKey) => {
        const wv = value.with?.[propKey] as WithValue | undefined;
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

// ── WITH property row ──────────────────────────────────────────────────────

function WithPropertyRow({ propKey, withValue, onChange }: {
  propKey: string;
  withValue: WithValue | undefined;
  onChange: (wv: WithValue) => void;
}) {
  const label = WITH_PROPERTY_LABELS[propKey] ?? propKey;
  const verb = withValue?.verb ?? WithValueVerb.IS;
  const val = withValue?.value;

  const updateVerb = (newVerb: WithValueVerb) => {
    if (newVerb === WithValueVerb.BASED_ON) {
      onChange({ verb: newVerb, object: 'SKILL_LEVEL', value: Array.isArray(val) ? val : Array(12).fill(val ?? 0) });
    } else {
      onChange({ verb: newVerb, value: Array.isArray(val) ? val[0] ?? 0 : val ?? 0 });
    }
  };

  return (
    <div className="interaction-row interaction-row--with">
      <span className="ce-badge ce-badge--keyword">WITH</span>
      <span className="ib-label">{label}</span>
      <CustomSelect
        className="ib-with-verb"
        value={verb}
        options={Object.values(WithValueVerb).map((v) => ({ value: v, label: v === WithValueVerb.IS ? 'is' : 'based on' }))}
        onChange={(v) => updateVerb(v as WithValueVerb)}
      />
      {verb === WithValueVerb.IS ? (
        <input
          className="ib-input ib-with-value"
          type="number"
          step="any"
          value={(val as number) ?? 0}
          onChange={(e) => onChange({ ...withValue!, verb, value: Number(e.target.value) || 0 })}
        />
      ) : (
        <>
          <span className="ib-label">{withValue?.object ?? 'SKILL_LEVEL'}</span>
          <table className="ib-level-table">
            <thead>
              <tr>
                {(Array.isArray(val) ? val : Array(12).fill(0)).map((_, i) => (
                  <th key={i}>{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {(Array.isArray(val) ? val : Array(12).fill(0)).map((v, i) => (
                  <td key={i}>
                    <input
                      className="ib-input ib-level-input"
                      type="number"
                      step="any"
                      value={v}
                      onChange={(e) => {
                        const arr = Array.isArray(val) ? [...val] : Array(12).fill(0);
                        arr[i] = Number(e.target.value) || 0;
                        onChange({ ...withValue!, verb, value: arr });
                      }}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </>
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
