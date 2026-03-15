/**
 * SVO Interaction builder component.
 * Renders a single Interaction as a form row with Subject/Verb/Object dropdowns.
 */
import { SubjectType, VerbType, ObjectType, CardinalityConstraintType } from '../../consts/semantics';
import type { Interaction, Effect } from '../../consts/semantics';
import { ElementType } from '../../consts/enums';

/** Union type for building both conditions (Interaction) and effects (Effect). */
type InteractionOrEffect = Interaction & Partial<Effect>;

const SUBJECT_LABELS: Record<SubjectType, string> = {
  [SubjectType.THIS_OPERATOR]: 'This Operator',
  [SubjectType.OTHER_OPERATOR]: 'Other Operator',
  [SubjectType.OTHER_OPERATORS]: 'Other Operators',
  [SubjectType.ALL_OPERATORS]: 'All Operators',
  [SubjectType.ENEMY]: 'Enemy',
  [SubjectType.ANY]: 'Any',
  [SubjectType.THIS_EVENT]: 'This Event',
  [SubjectType.SYSTEM]: 'System',
};

const VERB_LABELS: Record<VerbType, string> = {
  [VerbType.PERFORM]: 'Perform',
  [VerbType.PERFORM_ALL]: 'Perform All',
  [VerbType.APPLY]: 'Apply',
  [VerbType.CONSUME]: 'Consume',
  [VerbType.ABSORB]: 'Absorb',
  [VerbType.DEFEAT]: 'Defeat',
  [VerbType.HIT]: 'Hit',
  [VerbType.EXPEND]: 'Expend',
  [VerbType.RECOVER]: 'Recover',
  [VerbType.OVERHEAL]: 'Overheal',
  [VerbType.RETURN]: 'Return',
  [VerbType.LIFT]: 'Lift',
  [VerbType.KNOCK_DOWN]: 'Knock Down',
  [VerbType.BREACH]: 'Breach',
  [VerbType.CRUSH]: 'Crush',
  [VerbType.REFRESH]: 'Refresh',
  [VerbType.EXTEND]: 'Extend',
  [VerbType.MERGE]: 'Merge',
  [VerbType.RESET]: 'Reset',
  [VerbType.HAVE]: 'Have',
  [VerbType.IS]: 'Is',
  [VerbType.BECOME]: 'Become',
  [VerbType.IGNORE]: 'Ignore',
  [VerbType.EXPERIENCE]: 'Experience',
};

// Object types grouped by verb context
const PERFORM_OBJECTS = [
  ObjectType.BASIC_ATTACK, ObjectType.BATTLE_SKILL, ObjectType.COMBO_SKILL,
  ObjectType.ULTIMATE, ObjectType.FINAL_STRIKE, ObjectType.CRITICAL_HIT,
];
const STATUS_OBJECTS = [ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.ARTS_REACTION];
const RESOURCE_OBJECTS = [ObjectType.SKILL_POINT, ObjectType.ULTIMATE_ENERGY, ObjectType.STAGGER, ObjectType.COOLDOWN, ObjectType.HP];
const ENTITY_OBJECTS = [ObjectType.ENEMY, ObjectType.THIS_OPERATOR, ObjectType.OTHER_OPERATOR, ObjectType.ALL_OPERATORS];
const STATE_OBJECTS = [
  ObjectType.ACTIVE, ObjectType.LIFTED, ObjectType.KNOCKED_DOWN,
  ObjectType.BREACHED, ObjectType.CRUSHED, ObjectType.COMBUSTED,
  ObjectType.CORRODED, ObjectType.ELECTRIFIED, ObjectType.SOLIDIFIED,
];

function getObjectsForVerb(verb: VerbType): ObjectType[] {
  switch (verb) {
    case VerbType.PERFORM: return PERFORM_OBJECTS;
    case VerbType.APPLY: return [...STATUS_OBJECTS, ...ENTITY_OBJECTS];
    case VerbType.CONSUME:
    case VerbType.ABSORB: return [...STATUS_OBJECTS, ObjectType.STACKS];
    case VerbType.DEFEAT:
    case VerbType.HIT: return ENTITY_OBJECTS;
    case VerbType.EXPEND:
    case VerbType.RECOVER:
    case VerbType.RETURN: return RESOURCE_OBJECTS;
    case VerbType.OVERHEAL: return [ObjectType.HP];
    case VerbType.HAVE: return [...STATUS_OBJECTS, ...RESOURCE_OBJECTS, ObjectType.STACKS];
    case VerbType.IS: return STATE_OBJECTS;
    case VerbType.LIFT:
    case VerbType.KNOCK_DOWN:
    case VerbType.BREACH:
    case VerbType.CRUSH: return ENTITY_OBJECTS;
    case VerbType.REFRESH:
    case VerbType.EXTEND:
    case VerbType.MERGE:
    case VerbType.RESET: return [...STATUS_OBJECTS, ObjectType.STACKS, ObjectType.COOLDOWN];
    default: return Object.values(ObjectType);
  }
}

const OBJECT_LABELS: Partial<Record<ObjectType, string>> = {
  [ObjectType.BASIC_ATTACK]: 'Basic Attack',
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
  [ObjectType.THIS_OPERATOR]: 'This Operator',
  [ObjectType.OTHER_OPERATOR]: 'Other Operator',
  [ObjectType.OTHER_OPERATORS]: 'Other Operators',
  [ObjectType.ALL_OPERATORS]: 'All Operators',
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
const NEEDS_OBJECT_ID = new Set([ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.COOLDOWN]);

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
  const showNegated = value.verbType === VerbType.IS;
  const showConversion = value.verbType === VerbType.ABSORB;

  const update = (patch: Partial<InteractionOrEffect>) => onChange({ ...value, ...patch });

  return (
    <div className={`interaction-builder${compact ? ' interaction-builder--compact' : ''}`}>
      <div className="interaction-row">
        {/* Subject */}
        <select
          className="ib-select ib-subject"
          value={value.subjectType}
          onChange={(e) => update({ subjectType: e.target.value as SubjectType })}
        >
          {Object.values(SubjectType).map((s) => (
            <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
          ))}
        </select>

        {/* Subject Property (possessive) */}
        {showProperty && (
          <>
            <span className="ib-label">'s</span>
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
          </>
        )}

        {/* Verb */}
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

        {/* Negated (IS NOT) */}
        {showNegated && (
          <label className="ib-checkbox">
            <input
              type="checkbox"
              checked={value.negated ?? false}
              onChange={(e) => update({ negated: e.target.checked || undefined })}
            />
            NOT
          </label>
        )}

        {/* Object */}
        <select
          className="ib-select ib-object"
          value={value.objectType}
          onChange={(e) => update({ objectType: e.target.value as ObjectType })}
        >
          {objects.map((o) => (
            <option key={o} value={o}>{OBJECT_LABELS[o] ?? o}</option>
          ))}
        </select>

        {/* Object ID */}
        {showObjectId && (
          <input
            className="ib-input ib-object-id"
            type="text"
            placeholder="ID"
            value={value.objectId ?? ''}
            onChange={(e) => update({ objectId: e.target.value || undefined })}
          />
        )}

        {onRemove && (
          <button className="ib-remove" onClick={onRemove} title="Remove">×</button>
        )}
      </div>

      {/* Cardinality row */}
      {showCardinality && (
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
          {value.cardinalityConstraint && (
            <input
              className="ib-input ib-cardinality-value"
              type="number"
              min={0}
              value={value.cardinality ?? 0}
              onChange={(e) => update({ cardinality: Number(e.target.value) })}
            />
          )}
        </div>
      )}

      {/* TODO: Compound PERFORM UI for ABSORB + APPLY grouping */}
    </div>
  );
}

/** Helper to create a default Interaction. */
export function defaultInteraction(): Interaction {
  return {
    subjectType: SubjectType.THIS_OPERATOR,
    verbType: VerbType.PERFORM,
    objectType: ObjectType.BATTLE_SKILL,
  };
}
