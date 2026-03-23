/**
 * SVO Interaction builder component.
 * Renders a single Interaction as a form row with Subject/Verb/Object dropdowns.
 * Uses SentenceSlot for progressive disclosure with spring-momentum animations.
 */
import { SubjectType, VerbType, ObjectType, CardinalityConstraintType, DeterminerType,
  VERB_LABELS, OBJECT_LABELS, SUBJECT_LABELS, DETERMINER_LABELS, CARDINALITY_LABELS, TARGET_LABELS, WITH_PROPERTY_LABELS, WITH_BOOLEAN_PROPERTIES,
  getInteractionFieldVisibility, getVerbsForSubject, getObjectsForConditionVerb, isValueLiteral } from '../../dsl/semantics';
import type { Interaction, Effect, WithPreposition } from '../../dsl/semantics';
import { getAllStatusIds, getAllInflictionIds, getAllReactionIds } from '../../model/event-frames/operatorJsonLoader';
import SentenceSlot from './SentenceSlot';
import CustomSelect from './CustomSelect';

/** Union type for building both conditions (Interaction) and effects (Effect). */
type InteractionOrEffect = Interaction & Partial<Effect>;

/** Only subject-position nouns — keeps the dropdown compact. */
const SUBJECT_OPTIONS: SubjectType[] = Object.keys(SUBJECT_LABELS) as SubjectType[];

interface InteractionBuilderProps {
  value: InteractionOrEffect;
  onChange: (value: InteractionOrEffect) => void;
  onRemove?: () => void;
  compact?: boolean;
}

export default function InteractionBuilder({ value, onChange, onRemove, compact }: InteractionBuilderProps) {
  const update = (patch: Partial<InteractionOrEffect>) => onChange({ ...value, ...patch });
  const vis = getInteractionFieldVisibility(value as Interaction);
  const verbOptions = value.subject ? getVerbsForSubject(value.subject) : [];
  const objects = value.verb ? getObjectsForConditionVerb(value.verb) : [];

  return (
    <div className={`interaction-builder${compact ? ' interaction-builder--compact' : ''}`}>
      <div className="interaction-row">
        <SentenceSlot active={vis.showDeterminer}>
          <CustomSelect
            className="ib-determiner"
            value={value.subjectDeterminer ?? ''}
            placeholder="Determiner"
            options={Object.values(DeterminerType).map((d) => ({ value: d, label: DETERMINER_LABELS[d] }))}
            onChange={(v) => update({ subjectDeterminer: v as DeterminerType })}
          />
        </SentenceSlot>

        {/* Step 1: Subject — always visible */}
        <CustomSelect
          className="ib-subject"
          value={value.subject}
          placeholder="Subject"
          options={SUBJECT_OPTIONS.map((s) => ({ value: s, label: SUBJECT_LABELS[s] ?? s }))}
          onChange={(v) => update({ subject: v as SubjectType })}
        />

        <SentenceSlot active={vis.showVerb}>
          <CustomSelect
            className="ib-verb"
            value={value.verb}
            placeholder="Verb"
            options={verbOptions.map((v) => ({ value: v, label: VERB_LABELS[v] }))}
            onChange={(v) => {
              const newVerb = v as VerbType;
              const newObjects = getObjectsForConditionVerb(newVerb);
              const newObj = newObjects.includes(value.object) ? value.object : '' as ObjectType;
              update({ verb: newVerb, object: newObj });
            }}
          />
        </SentenceSlot>

        <SentenceSlot active={vis.showProperty}>
          <span className="ib-label">&rsquo;s</span>
          <CustomSelect
            className="ib-property"
            value={value.subjectProperty ?? ''}
            options={[
              { value: '', label: '—' },
              ...[ObjectType.ULTIMATE, ObjectType.BATTLE_SKILL, ObjectType.COMBO_SKILL, ObjectType.BASIC_ATTACK, ObjectType.HP].map((o) => ({ value: o, label: OBJECT_LABELS[o] ?? o })),
            ]}
            onChange={(v) => update({ subjectProperty: (v || undefined) as ObjectType | undefined })}
          />
        </SentenceSlot>

        <SentenceSlot active={vis.showNegated}>
          <label className="ib-checkbox">
            <input
              type="checkbox"
              checked={value.negated ?? false}
              onChange={(e) => update({ negated: e.target.checked || undefined })}
            />
            NOT
          </label>
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

        <SentenceSlot active={vis.showObject}>
          <CustomSelect
            className="ib-object"
            value={value.object}
            placeholder="Object"
            options={objects.map((o) => ({ value: o, label: OBJECT_LABELS[o] ?? o }))}
            onChange={(v) => update({ object: v as ObjectType })}
          />
        </SentenceSlot>

        {onRemove && (
          <button className="ib-remove" onClick={onRemove} title="Remove">&times;</button>
        )}
      </div>

      <SentenceSlot active={vis.showCardinality} row>
        <div className="interaction-row interaction-row--qualifier">
          <CustomSelect
            className="ib-cardinality"
            value={value.cardinalityConstraint ?? ''}
            options={[
              { value: '', label: '—' },
              ...Object.values(CardinalityConstraintType).map((c) => ({ value: c, label: CARDINALITY_LABELS[c] })),
            ]}
            onChange={(v) => update({ cardinalityConstraint: (v || undefined) as CardinalityConstraintType | undefined })}
          />
          <SentenceSlot active={vis.showCardinalityValue}>
            <input
              className="ib-input ib-cardinality-value"
              type="number"
              min={0}
              value={value.value && isValueLiteral(value.value) ? value.value.value : 0}
              onChange={(e) => update({ value: { verb: VerbType.IS as const, value: Number(e.target.value) } })}
            />
          </SentenceSlot>
        </div>
      </SentenceSlot>

      {/* TO — single tree row */}
      {vis.showTo && (
        <ul className="ce-ul">
          <li className="ce-li ce-li--last ce-li--leaf">
            <button className="ce-line-btn ce-line-btn--remove" onClick={() => update({ to: undefined, toDeterminer: undefined })} title="Clear">&times;</button>
            <div className="interaction-row">
              <span className="ce-badge ce-badge--keyword">TO</span>
              <SentenceSlot active={value.to === SubjectType.OPERATOR}>
                <CustomSelect
                  className="ib-determiner"
                  value={value.toDeterminer ?? ''}
                  placeholder="Determiner"
                  options={Object.values(DeterminerType).map((d) => ({ value: d, label: DETERMINER_LABELS[d] }))}
                  onChange={(v) => update({ toDeterminer: v as DeterminerType })}
                />
              </SentenceSlot>
              <CustomSelect
                value={value.to ?? ''}
                placeholder="Target"
                options={Object.entries(TARGET_LABELS).map(([k, label]) => ({ value: k, label }))}
                onChange={(v) => update({ to: v || undefined })}
              />
            </div>
          </li>
        </ul>
      )}

      {/* FROM — single tree row */}
      {vis.showFrom && (
        <ul className="ce-ul">
          <li className="ce-li ce-li--last ce-li--leaf">
            <button className="ce-line-btn ce-line-btn--remove" onClick={() => update({ fromObject: undefined, fromDeterminer: undefined })} title="Clear">&times;</button>
            <div className="interaction-row">
              <span className="ce-badge ce-badge--keyword">FROM</span>
              <SentenceSlot active={value.fromObject === SubjectType.OPERATOR}>
                <CustomSelect
                  className="ib-determiner"
                  value={value.fromDeterminer ?? ''}
                  placeholder="Determiner"
                  options={Object.values(DeterminerType).map((d) => ({ value: d, label: DETERMINER_LABELS[d] }))}
                  onChange={(v) => update({ fromDeterminer: v as DeterminerType })}
                />
              </SentenceSlot>
              <CustomSelect
                value={value.fromObject ?? ''}
                placeholder="Source"
                options={Object.entries(TARGET_LABELS).map(([k, label]) => ({ value: k, label }))}
                onChange={(v) => update({ fromObject: v || undefined })}
              />
            </div>
          </li>
        </ul>
      )}

      {/* Forced target — non-editable label */}
      {vis.forcedTarget && (
        <ul className="ce-ul">
          <li className="ce-li ce-li--last ce-li--leaf">
            <div className="interaction-row">
              <span className="ce-badge ce-badge--keyword">TO</span>
              <span className="ce-label">{SUBJECT_LABELS[vis.forcedTarget] ?? vis.forcedTarget}</span>
            </div>
          </li>
        </ul>
      )}

      {/* WITH — inline if 1 property, branched if multiple */}
      {vis.withProperties.length === 1 && (
        <ul className="ce-ul">
          <li className="ce-li ce-li--last ce-li--leaf">
            <div className="interaction-row">
              <span className="ce-badge ce-badge--keyword">WITH</span>
              <WithPropertyInput prop={vis.withProperties[0]} value={value} update={update} />
            </div>
          </li>
        </ul>
      )}
      {vis.withProperties.length > 1 && (
        <ul className="ce-ul">
          <li className="ce-li ce-li--last">
            <div className="ce-label-row">
              <span className="ce-badge ce-badge--keyword">WITH</span>
            </div>
            <ul className="ce-ul">
              {vis.withProperties.map((prop, pi) => (
                <li key={prop} className={`ce-li ce-li--leaf${pi === vis.withProperties.length - 1 ? ' ce-li--last' : ''}`}>
                  <div className="interaction-row">
                    <WithPropertyInput prop={prop} value={value} update={update} />
                  </div>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      )}
    </div>
  );
}

/** Helper to create a default Interaction — starts empty for progressive flow. */
export function defaultInteraction(): Interaction {
  return {
    subject: '' as SubjectType,
    verb: '' as VerbType,
    object: '' as ObjectType,
  };
}

/** Dropdown for status IDs — uses CustomSelect with all known statuses. */
export function StatusIdSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const entries = getAllStatusIds();
  return (
    <CustomSelect
      className="ib-object-id"
      value={value}
      placeholder="Status"
      options={entries.map((e) => ({ value: e.id, label: e.label }))}
      onChange={onChange}
    />
  );
}

/** Dropdown for infliction IDs — uses CustomSelect with all known inflictions. */
export function InflictionIdSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const entries = getAllInflictionIds();
  return (
    <CustomSelect
      className="ib-object-id"
      value={value}
      placeholder="Infliction"
      options={entries.map((e) => ({ value: e.id, label: e.label }))}
      onChange={onChange}
    />
  );
}

/** Single WITH property input — toggle for booleans, number input for others. */
function WithPropertyInput({ prop, value, update }: {
  prop: string;
  value: InteractionOrEffect;
  update: (patch: Partial<InteractionOrEffect>) => void;
}) {
  const w = (value.with ?? {}) as WithPreposition;
  const isBoolean = WITH_BOOLEAN_PROPERTIES.has(prop);

  const setWith = (next: WithPreposition) => {
    update({ with: Object.keys(next).length > 0 ? next : undefined });
  };

  if (isBoolean) {
    const wNode = w[prop];
    const checked = !!(wNode && 'value' in wNode && wNode.value);
    return (
      <>
        <span className="ce-label ce-label--dim">{WITH_PROPERTY_LABELS[prop] ?? prop}</span>
        <button
          type="button"
          className={`ib-toggle${checked ? ' ib-toggle--on' : ''}`}
          onClick={() => {
            const next = { ...w };
            if (checked) {
              delete next[prop];
            } else {
              next[prop] = { verb: VerbType.IS, value: 1 };
            }
            setWith(next);
          }}
        >
          <span className="ib-toggle-knob" />
        </button>
      </>
    );
  }

  return (
    <>
      <span className="ce-label ce-label--dim">{WITH_PROPERTY_LABELS[prop] ?? prop}</span>
      <input
        className="ib-input"
        type="number"
        step="any"
        min={0}
        value={(() => { const n = w[prop]; return n && 'value' in n && typeof n.value === 'number' ? n.value : ''; })()}
        placeholder="0"
        onChange={(e) => {
          const next = { ...w };
          const num = Number(e.target.value);
          if (e.target.value === '' || isNaN(num)) {
            delete next[prop];
          } else {
            next[prop] = { verb: VerbType.IS, value: num };
          }
          setWith(next);
        }}
      />
    </>
  );
}

/** Dropdown for reaction IDs — uses CustomSelect with all known reactions. */
export function ReactionIdSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const entries = getAllReactionIds();
  return (
    <CustomSelect
      className="ib-object-id"
      value={value}
      placeholder="Reaction"
      options={entries.map((e) => ({ value: e.id, label: e.label }))}
      onChange={onChange}
    />
  );
}
