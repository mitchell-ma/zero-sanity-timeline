/**
 * SVO Interaction builder component.
 * Renders a single Interaction as a form row with Subject/Verb/Object dropdowns.
 * Uses SentenceSlot for progressive disclosure with spring-momentum animations.
 */
import { SubjectType, VerbType, ObjectType, CardinalityConstraintType, DeterminerType } from '../../consts/semantics';
import type { Interaction, Effect } from '../../consts/semantics';
import SentenceSlot from './SentenceSlot';

/** Union type for building both conditions (Interaction) and effects (Effect). */
type InteractionOrEffect = Interaction & Partial<Effect>;

const DETERMINER_LABELS: Record<DeterminerType, string> = {
  [DeterminerType.THIS]: 'This',
  [DeterminerType.OTHER]: 'Other',
  [DeterminerType.ALL]: 'All',
  [DeterminerType.ANY]: 'Any',
};

const SUBJECT_LABELS: Partial<Record<SubjectType, string>> = {
  [SubjectType.OPERATOR]: 'Operator',
  [SubjectType.ENEMY]: 'Enemy',
  [SubjectType.THIS_EVENT]: 'This Event',
  [SubjectType.SYSTEM]: 'System',
};

/** Only subject-position nouns — keeps the dropdown compact. */
const SUBJECT_OPTIONS: SubjectType[] = Object.keys(SUBJECT_LABELS) as SubjectType[];

const VERB_LABELS: Record<VerbType, string> = {
  [VerbType.ALL]: 'All',
  [VerbType.ANY]: 'Any',
  [VerbType.PERFORM]: 'Perform',
  [VerbType.APPLY]: 'Apply',
  [VerbType.CONSUME]: 'Consume',
  [VerbType.DEFEAT]: 'Defeat',
  [VerbType.HIT]: 'Hit',
  [VerbType.RECOVER]: 'Recover',
  [VerbType.OVERHEAL]: 'Overheal',
  [VerbType.RETURN]: 'Return',
  [VerbType.REFRESH]: 'Refresh',
  [VerbType.EXTEND]: 'Extend',
  [VerbType.MERGE]: 'Merge',
  [VerbType.RESET]: 'Reset',
  [VerbType.HAVE]: 'Have',
  [VerbType.IS]: 'Is',
  [VerbType.BECOME]: 'Become',
  [VerbType.RECEIVE]: 'Receive',
  [VerbType.IGNORE]: 'Ignore',
  [VerbType.EXPERIENCE]: 'Experience',
  [VerbType.DEAL]: 'Deal',
};

// Object types grouped by verb context
const PERFORM_OBJECTS = [
  ObjectType.BASIC_ATTACK, ObjectType.BATTLE_SKILL, ObjectType.COMBO_SKILL,
  ObjectType.ULTIMATE, ObjectType.FINAL_STRIKE, ObjectType.CRITICAL_HIT,
];
const STATUS_OBJECTS = [ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.ARTS_REACTION];
const RESOURCE_OBJECTS = [ObjectType.SKILL_POINT, ObjectType.ULTIMATE_ENERGY, ObjectType.STAGGER, ObjectType.COOLDOWN, ObjectType.HP];
const ENTITY_OBJECTS = [ObjectType.ENEMY, ObjectType.OPERATOR];
const STATE_OBJECTS = [
  ObjectType.ACTIVE, ObjectType.LIFTED, ObjectType.KNOCKED_DOWN,
  ObjectType.BREACHED, ObjectType.CRUSHED, ObjectType.COMBUSTED,
  ObjectType.CORRODED, ObjectType.ELECTRIFIED, ObjectType.SOLIDIFIED,
  ObjectType.STAGGER,
];

function getObjectsForVerb(verb: VerbType): ObjectType[] {
  switch (verb) {
    case VerbType.PERFORM: return PERFORM_OBJECTS;
    case VerbType.APPLY: return [...STATUS_OBJECTS, ...ENTITY_OBJECTS];
    case VerbType.CONSUME: return [...STATUS_OBJECTS, ObjectType.STACKS, ...RESOURCE_OBJECTS];
    case VerbType.DEFEAT:
    case VerbType.HIT: return ENTITY_OBJECTS;
    case VerbType.RECOVER:
    case VerbType.RETURN: return RESOURCE_OBJECTS;
    case VerbType.OVERHEAL: return [ObjectType.HP];
    case VerbType.HAVE: return [...STATUS_OBJECTS, ...RESOURCE_OBJECTS, ObjectType.STACKS];
    case VerbType.IS:
    case VerbType.BECOME: return STATE_OBJECTS;
    case VerbType.RECEIVE: return [...STATUS_OBJECTS, ObjectType.STAGGER];
    case VerbType.REFRESH:
    case VerbType.EXTEND:
    case VerbType.MERGE:
    case VerbType.RESET: return [...STATUS_OBJECTS, ObjectType.STACKS, ObjectType.COOLDOWN];
    default: return Object.values(ObjectType);
  }
}

const OBJECT_LABELS: Partial<Record<ObjectType, string>> = {
  [ObjectType.BASIC_ATTACK]: 'Basic Attack',
  [ObjectType.NORMAL_ATTACK]: 'Normal Attack',
  [ObjectType.BATTLE_SKILL]: 'Battle Skill',
  [ObjectType.COMBO_SKILL]: 'Combo Skill',
  [ObjectType.ULTIMATE]: 'Ultimate',
  [ObjectType.FINAL_STRIKE]: 'Final Strike',
  [ObjectType.CRITICAL_HIT]: 'Critical Hit',
  [ObjectType.STATUS]: 'Status',
  [ObjectType.INFLICTION]: 'Infliction',
  [ObjectType.REACTION]: 'Reaction',
  [ObjectType.ARTS_REACTION]: 'Arts Reaction',
  [ObjectType.STACKS]: 'Stacks',
  [ObjectType.SKILL_POINT]: 'Skill Point',
  [ObjectType.ULTIMATE_ENERGY]: 'Ultimate Energy',
  [ObjectType.STAGGER]: 'Stagger',
  [ObjectType.COOLDOWN]: 'Cooldown',
  [ObjectType.HP]: 'HP',
  [ObjectType.OPERATOR]: 'Operator',
  [ObjectType.ENEMY]: 'Enemy',
  [ObjectType.ACTIVE]: 'Active',
  [ObjectType.LIFTED]: 'Lifted',
  [ObjectType.KNOCKED_DOWN]: 'Knocked Down',
  [ObjectType.BREACHED]: 'Breached',
  [ObjectType.CRUSHED]: 'Crushed',
  [ObjectType.COMBUSTED]: 'Combusted',
  [ObjectType.CORRODED]: 'Corroded',
  [ObjectType.ELECTRIFIED]: 'Electrified',
  [ObjectType.SOLIDIFIED]: 'Solidified',
};

const CARDINALITY_LABELS: Record<CardinalityConstraintType, string> = {
  [CardinalityConstraintType.EXACTLY]: 'exactly',
  [CardinalityConstraintType.AT_LEAST]: 'at least',
  [CardinalityConstraintType.AT_MOST]: 'at most',
};

// Verbs that support cardinality
const CARDINALITY_VERBS = new Set([VerbType.HAVE, VerbType.HIT, VerbType.PERFORM, VerbType.CONSUME]);
// Verbs that support subjectProperty
const PROPERTY_VERBS = new Set([VerbType.IS, VerbType.OVERHEAL]);
// Objects that need an objectId
const NEEDS_OBJECT_ID = new Set<string>([ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.COOLDOWN, ObjectType.STAGGER]);

interface InteractionBuilderProps {
  value: InteractionOrEffect;
  onChange: (value: InteractionOrEffect) => void;
  onRemove?: () => void;
  compact?: boolean;
}

export default function InteractionBuilder({ value, onChange, onRemove, compact }: InteractionBuilderProps) {
  const objects = getObjectsForVerb(value.verbType);
  const showCardinality = CARDINALITY_VERBS.has(value.verbType);
  const showProperty = PROPERTY_VERBS.has(value.verbType);
  const showObjectId = NEEDS_OBJECT_ID.has(value.objectType);
  const showNegated = value.verbType === VerbType.IS || value.verbType === VerbType.BECOME;

  const update = (patch: Partial<InteractionOrEffect>) => onChange({ ...value, ...patch });

  return (
    <div className={`interaction-builder${compact ? ' interaction-builder--compact' : ''}`}>
      <div className="interaction-row">
        {/* Determiner — visible when subject is OPERATOR */}
        <SentenceSlot active={value.subjectType === SubjectType.OPERATOR}>
          <select
            className="ib-select ib-determiner"
            value={value.subjectDeterminer ?? DeterminerType.THIS}
            onChange={(e) => update({ subjectDeterminer: e.target.value as DeterminerType })}
          >
            {Object.values(DeterminerType).map((d) => (
              <option key={d} value={d}>{DETERMINER_LABELS[d]}</option>
            ))}
          </select>
        </SentenceSlot>

        {/* Subject — always visible */}
        <select
          className="ib-select ib-subject"
          value={value.subjectType}
          onChange={(e) => update({ subjectType: e.target.value as SubjectType })}
        >
          {SUBJECT_OPTIONS.map((s) => (
            <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
          ))}
        </select>

        {/* Subject Property (possessive) — slides in for IS/OVERHEAL */}
        <SentenceSlot active={showProperty}>
          <span className="ib-label">&rsquo;s</span>
          <select
            className="ib-select ib-property"
            value={value.subjectProperty ?? ''}
            onChange={(e) => update({ subjectProperty: (e.target.value || undefined) as ObjectType | undefined })}
          >
            <option value="">—</option>
            {[ObjectType.ULTIMATE, ObjectType.BATTLE_SKILL, ObjectType.COMBO_SKILL, ObjectType.BASIC_ATTACK, ObjectType.HP].map((o) => (
              <option key={o} value={o}>{OBJECT_LABELS[o] ?? o}</option>
            ))}
          </select>
        </SentenceSlot>

        {/* Verb — always visible */}
        <select
          className="ib-select ib-verb"
          value={value.verbType}
          onChange={(e) => {
            const newVerb = e.target.value as VerbType;
            const newObjects = getObjectsForVerb(newVerb);
            const newObj = newObjects.includes(value.objectType) ? value.objectType : newObjects[0];
            update({ verbType: newVerb, objectType: newObj });
          }}
        >
          {Object.values(VerbType).map((v) => (
            <option key={v} value={v}>{VERB_LABELS[v]}</option>
          ))}
        </select>

        {/* Negated (IS NOT) — slides in for IS/BECOME */}
        <SentenceSlot active={showNegated}>
          <label className="ib-checkbox">
            <input
              type="checkbox"
              checked={value.negated ?? false}
              onChange={(e) => update({ negated: e.target.checked || undefined })}
            />
            NOT
          </label>
        </SentenceSlot>

        {/* Object — always visible */}
        <select
          className="ib-select ib-object"
          value={value.objectType}
          onChange={(e) => update({ objectType: e.target.value as ObjectType })}
        >
          {objects.map((o) => (
            <option key={o} value={o}>{OBJECT_LABELS[o] ?? o}</option>
          ))}
        </select>

        {/* Object ID — slides in when object needs an identifier */}
        <SentenceSlot active={showObjectId}>
          <input
            className="ib-input ib-object-id"
            type="text"
            placeholder="ID"
            value={value.objectId ?? ''}
            onChange={(e) => update({ objectId: e.target.value || undefined })}
          />
        </SentenceSlot>

        {onRemove && (
          <button className="ib-remove" onClick={onRemove} title="Remove">&times;</button>
        )}
      </div>

      {/* Cardinality row — slides down when verb supports cardinality */}
      <SentenceSlot active={showCardinality} row>
        <div className="interaction-row interaction-row--qualifier">
          <select
            className="ib-select ib-cardinality"
            value={value.cardinalityConstraint ?? ''}
            onChange={(e) => update({ cardinalityConstraint: (e.target.value || undefined) as CardinalityConstraintType | undefined })}
          >
            <option value="">—</option>
            {Object.values(CardinalityConstraintType).map((c) => (
              <option key={c} value={c}>{CARDINALITY_LABELS[c]}</option>
            ))}
          </select>
          <SentenceSlot active={!!value.cardinalityConstraint}>
            <input
              className="ib-input ib-cardinality-value"
              type="number"
              min={0}
              value={value.cardinality ?? 0}
              onChange={(e) => update({ cardinality: Number(e.target.value) })}
            />
          </SentenceSlot>
        </div>
      </SentenceSlot>
    </div>
  );
}

/** Helper to create a default Interaction. */
export function defaultInteraction(): Interaction {
  return {
    subjectDeterminer: DeterminerType.THIS,
    subjectType: SubjectType.OPERATOR,
    verbType: VerbType.PERFORM,
    objectType: ObjectType.BATTLE_SKILL,
  };
}
