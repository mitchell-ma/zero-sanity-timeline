/**
 * Effect builder component.
 * Renders a single DSL Effect as a form row: VERB [cardinality] [adjective] OBJECT [prepositions].
 */
import { VerbType, ObjectType, AdjectiveType, CardinalityConstraintType, SubjectType, OBJECT_ADJECTIVES, THRESHOLD_MAX } from '../../consts/semantics';
import type { Effect } from '../../consts/semantics';

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

const OBJECT_LABELS: Partial<Record<ObjectType, string>> = {
  [ObjectType.BASIC_ATTACK]: 'Basic Attack',
  [ObjectType.BATTLE_SKILL]: 'Battle Skill',
  [ObjectType.COMBO_SKILL]: 'Combo Skill',
  [ObjectType.ULTIMATE]: 'Ultimate',
  [ObjectType.FINAL_STRIKE]: 'Final Strike',
  [ObjectType.CRITICAL_HIT]: 'Critical Hit',
  [ObjectType.DAMAGE]: 'Damage',
  [ObjectType.STATUS]: 'Status',
  [ObjectType.INFLICTION]: 'Infliction',
  [ObjectType.REACTION]: 'Reaction',
  [ObjectType.ARTS_REACTION]: 'Arts Reaction',
  [ObjectType.STACKS]: 'Stacks',
  [ObjectType.TIME_STOP]: 'Time Stop',
  [ObjectType.GAME_TIME]: 'Game Time',
  [ObjectType.REAL_TIME]: 'Real Time',
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
};

const ADJ_LABELS: Record<AdjectiveType, string> = {
  [AdjectiveType.NONE]: '—',
  [AdjectiveType.NORMAL_ATTACK]: 'Normal Attack',
  [AdjectiveType.FINAL_STRIKE]: 'Final Strike',
  [AdjectiveType.HEAT]: 'Heat',
  [AdjectiveType.CRYO]: 'Cryo',
  [AdjectiveType.NATURE]: 'Nature',
  [AdjectiveType.ELECTRIC]: 'Electric',
  [AdjectiveType.PHYSICAL]: 'Physical',
  [AdjectiveType.COMBUSTION]: 'Combustion',
  [AdjectiveType.SOLIDIFICATION]: 'Solidification',
  [AdjectiveType.CORROSION]: 'Corrosion',
  [AdjectiveType.ELECTRIFICATION]: 'Electrification',
  [AdjectiveType.LIFT]: 'Lift',
  [AdjectiveType.KNOCK_DOWN]: 'Knock Down',
  [AdjectiveType.BREACH]: 'Breach',
  [AdjectiveType.CRUSH]: 'Crush',
  [AdjectiveType.FORCED]: 'Forced',
  [AdjectiveType.COMBO]: 'Combo',
  [AdjectiveType.DODGE]: 'Dodge',
  [AdjectiveType.ANIMATION]: 'Animation',
};

const CARDINALITY_LABELS: Record<CardinalityConstraintType, string> = {
  [CardinalityConstraintType.EXACTLY]: 'exactly',
  [CardinalityConstraintType.AT_LEAST]: 'at least',
  [CardinalityConstraintType.AT_MOST]: 'at most',
};

const TARGET_LABELS: Record<string, string> = {
  [SubjectType.THIS_OPERATOR]: 'This Operator',
  [SubjectType.OTHER_OPERATOR]: 'Other Operator',
  [SubjectType.OTHER_OPERATORS]: 'Other Operators',
  [SubjectType.ALL_OPERATORS]: 'All Operators',
  [SubjectType.ENEMY]: 'Enemy',
};

// Effect verbs (subset relevant for effects — no state assertion verbs)
const EFFECT_VERBS = [
  VerbType.APPLY, VerbType.CONSUME, VerbType.ABSORB,
  VerbType.RECOVER, VerbType.EXPEND, VerbType.RETURN,
  VerbType.REFRESH, VerbType.RESET, VerbType.IGNORE,
  VerbType.PERFORM, VerbType.PERFORM_ALL,
];

function getObjectsForEffectVerb(verb: VerbType): ObjectType[] {
  switch (verb) {
    case VerbType.APPLY: return [ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.TIME_STOP, ObjectType.STAGGER];
    case VerbType.CONSUME: return [ObjectType.STACKS, ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.ULTIMATE_ENERGY];
    case VerbType.ABSORB: return [ObjectType.INFLICTION, ObjectType.STACKS];
    case VerbType.RECOVER:
    case VerbType.EXPEND:
    case VerbType.RETURN: return [ObjectType.SKILL_POINT, ObjectType.ULTIMATE_ENERGY, ObjectType.STAGGER, ObjectType.HP];
    case VerbType.REFRESH:
    case VerbType.RESET: return [ObjectType.STACKS, ObjectType.COOLDOWN, ObjectType.STATUS];
    case VerbType.IGNORE: return [ObjectType.STATUS];
    case VerbType.PERFORM: return [ObjectType.DAMAGE, ObjectType.BASIC_ATTACK, ObjectType.BATTLE_SKILL, ObjectType.COMBO_SKILL, ObjectType.ULTIMATE];
    default: return Object.values(ObjectType);
  }
}

// Which verbs need a TO preposition
const NEEDS_TO = new Set([VerbType.APPLY, VerbType.RECOVER, VerbType.RETURN]);
// Which verbs need a FROM preposition
const NEEDS_FROM = new Set([VerbType.ABSORB]);
// Which objects need an objectId
const NEEDS_ID = new Set([ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.COOLDOWN]);
// Which verbs support cardinality
const NEEDS_CARDINALITY = new Set([VerbType.APPLY, VerbType.CONSUME, VerbType.ABSORB, VerbType.RECOVER, VerbType.EXPEND, VerbType.RETURN]);
// Which verbs support FOR duration
const NEEDS_DURATION = new Set([VerbType.APPLY]);

interface EffectBuilderProps {
  value: Effect;
  onChange: (value: Effect) => void;
  onRemove?: () => void;
  compact?: boolean;
}

export default function EffectBuilder({ value, onChange, onRemove, compact }: EffectBuilderProps) {
  const objects = getObjectsForEffectVerb(value.verbType);
  const adjectives = value.objectType ? (OBJECT_ADJECTIVES[value.objectType] ?? []) : [];
  const showAdjective = adjectives.length > 0;
  const showObjectId = NEEDS_ID.has(value.objectType ?? ObjectType.STATUS);
  const showTo = NEEDS_TO.has(value.verbType);
  const showFrom = NEEDS_FROM.has(value.verbType);
  const showCardinality = NEEDS_CARDINALITY.has(value.verbType);
  const showDuration = NEEDS_DURATION.has(value.verbType) && value.objectType === ObjectType.TIME_STOP;
  const isMax = value.cardinality === THRESHOLD_MAX;

  const update = (patch: Partial<Effect>) => onChange({ ...value, ...patch });

  return (
    <div className={`interaction-builder${compact ? ' interaction-builder--compact' : ''}`}>
      <div className="interaction-row">
        {/* Verb */}
        <select
          className="ib-select ib-verb"
          value={value.verbType}
          onChange={(e) => {
            const newVerb = e.target.value as VerbType;
            const newObjects = getObjectsForEffectVerb(newVerb);
            const newObj = newObjects.includes(value.objectType ?? ObjectType.STATUS) ? value.objectType : newObjects[0];
            update({ verbType: newVerb, objectType: newObj });
          }}
        >
          {EFFECT_VERBS.map((v) => (
            <option key={v} value={v}>{VERB_LABELS[v]}</option>
          ))}
        </select>

        {/* Cardinality */}
        {showCardinality && (
          <>
            <input
              className="ib-input ib-quantity"
              type={isMax ? 'text' : 'number'}
              min={0}
              value={isMax ? 'MAX' : (value.cardinality ?? '')}
              placeholder="#"
              onChange={(e) => {
                const raw = e.target.value.toUpperCase();
                if (raw === 'MAX') {
                  update({ cardinality: THRESHOLD_MAX as any });
                } else {
                  update({ cardinality: Number(e.target.value) || undefined });
                }
              }}
            />
          </>
        )}

        {/* Adjective */}
        {showAdjective && (
          <select
            className="ib-select"
            value={Array.isArray(value.adjective) ? value.adjective[0] ?? '' : value.adjective ?? ''}
            onChange={(e) => update({ adjective: (e.target.value || undefined) as AdjectiveType | undefined })}
          >
            <option value="">—</option>
            {adjectives.map((a) => (
              <option key={a} value={a}>{ADJ_LABELS[a]}</option>
            ))}
          </select>
        )}

        {/* Object */}
        <select
          className="ib-select ib-object"
          value={value.objectType ?? ''}
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
            placeholder="ID (e.g. MELTING_FLAME)"
            value={value.objectId ?? ''}
            onChange={(e) => update({ objectId: e.target.value || undefined })}
          />
        )}

        {onRemove && (
          <button className="ib-remove" onClick={onRemove} title="Remove">×</button>
        )}
      </div>

      {/* Preposition row */}
      {(showTo || showFrom || showDuration) && (
        <div className="interaction-row interaction-row--qualifier">
          {showTo && (
            <>
              <span className="ib-label">TO</span>
              <select
                className="ib-select"
                value={value.toObjectType ?? ''}
                onChange={(e) => update({ toObjectType: e.target.value || undefined })}
              >
                <option value="">—</option>
                {Object.entries(TARGET_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </>
          )}
          {showFrom && (
            <>
              <span className="ib-label">FROM</span>
              <select
                className="ib-select"
                value={value.fromObjectType ?? ''}
                onChange={(e) => update({ fromObjectType: e.target.value || undefined })}
              >
                <option value="">—</option>
                {Object.entries(TARGET_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </>
          )}
          {showDuration && (
            <>
              <span className="ib-label">FOR</span>
              <input
                className="ib-input"
                type="number"
                step="any"
                min={0}
                value={value.forDuration ?? 0}
                onChange={(e) => update({ forDuration: Number(e.target.value) || undefined })}
              />
              <span className="ib-label">s</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Helper to create a default Effect. */
export function defaultEffect(): Effect {
  return {
    verbType: VerbType.APPLY,
    objectType: ObjectType.STATUS,
    objectId: '',
    toObjectType: SubjectType.THIS_OPERATOR,
  };
}
