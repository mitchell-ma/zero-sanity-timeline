/**
 * Effect builder component.
 * Renders a single DSL Effect as a form row: VERB [cardinality] [adjective] OBJECT [prepositions].
 * Uses SentenceSlot for progressive disclosure with spring-momentum animations.
 */
import { VerbType, ObjectType, AdjectiveType, SubjectType, DeterminerType, OBJECT_ADJECTIVES, THRESHOLD_MAX, DURATION_END } from '../../consts/semantics';
import type { Effect } from '../../consts/semantics';
import SentenceSlot from './SentenceSlot';

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
  [VerbType.ENHANCE]: 'Enhance',
  [VerbType.EXPERIENCE]: 'Experience',
  [VerbType.DEAL]: 'Deal',
};

const OBJECT_LABELS: Partial<Record<ObjectType, string>> = {
  [ObjectType.BASIC_ATTACK]: 'Basic Attack',
  [ObjectType.NORMAL_ATTACK]: 'Normal Attack',
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
  [ObjectType.OPERATOR]: 'Operator',
  [ObjectType.ENEMY]: 'Enemy',
};

const ADJ_LABELS: Record<AdjectiveType, string> = {
  [AdjectiveType.NONE]: '—',
  [AdjectiveType.HEAT]: 'Heat',
  [AdjectiveType.CRYO]: 'Cryo',
  [AdjectiveType.NATURE]: 'Nature',
  [AdjectiveType.ELECTRIC]: 'Electric',
  [AdjectiveType.PHYSICAL]: 'Physical',
  [AdjectiveType.COMBUSTION]: 'Combustion',
  [AdjectiveType.SOLIDIFICATION]: 'Solidification',
  [AdjectiveType.CORROSION]: 'Corrosion',
  [AdjectiveType.ELECTRIFICATION]: 'Electrification',
  [AdjectiveType.LIFTED]: 'Lifted',
  [AdjectiveType.KNOCKED_DOWN]: 'Knocked Down',
  [AdjectiveType.CRUSHED]: 'Crushed',
  [AdjectiveType.COMBUSTED]: 'Combusted',
  [AdjectiveType.CORRODED]: 'Corroded',
  [AdjectiveType.ELECTRIFIED]: 'Electrified',
  [AdjectiveType.SOLIDIFIED]: 'Solidified',
  [AdjectiveType.BREACHED]: 'Breached',
  [AdjectiveType.LIFT]: 'Lift',
  [AdjectiveType.KNOCK_DOWN]: 'Knock Down',
  [AdjectiveType.BREACH]: 'Breach',
  [AdjectiveType.CRUSH]: 'Crush',
  [AdjectiveType.FORCED]: 'Forced',
  [AdjectiveType.NODE_STAGGERED]: 'Node Staggered',
  [AdjectiveType.FULL_STAGGERED]: 'Full Staggered',
  [AdjectiveType.COMBO]: 'Combo',
  [AdjectiveType.DODGE]: 'Dodge',
  [AdjectiveType.ANIMATION]: 'Animation',
};

const TARGET_LABELS: Record<string, string> = {
  [SubjectType.OPERATOR]: 'Operator',
  [SubjectType.ENEMY]: 'Enemy',
};

const DETERMINER_LABELS: Record<DeterminerType, string> = {
  [DeterminerType.THIS]: 'This',
  [DeterminerType.OTHER]: 'Other',
  [DeterminerType.ALL]: 'All',
  [DeterminerType.ANY]: 'Any',
};

// Effect verbs (subset relevant for effects — no state assertion verbs)
const EFFECT_VERBS = [
  VerbType.APPLY, VerbType.CONSUME,
  VerbType.RECOVER, VerbType.RETURN,
  VerbType.REFRESH, VerbType.EXTEND, VerbType.MERGE, VerbType.RESET, VerbType.IGNORE, VerbType.ENHANCE,
  VerbType.PERFORM, VerbType.DEAL,
  VerbType.ALL, VerbType.ANY,
];

function getObjectsForEffectVerb(verb: VerbType): ObjectType[] {
  switch (verb) {
    case VerbType.APPLY: return [ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.TIME_STOP, ObjectType.STAGGER];
    case VerbType.CONSUME: return [ObjectType.STACKS, ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.ULTIMATE_ENERGY, ObjectType.SKILL_POINT, ObjectType.COOLDOWN];
    case VerbType.RECOVER:
    case VerbType.RETURN: return [ObjectType.SKILL_POINT, ObjectType.ULTIMATE_ENERGY, ObjectType.HP];
    case VerbType.REFRESH:
    case VerbType.EXTEND:
    case VerbType.MERGE:
    case VerbType.RESET: return [ObjectType.STACKS, ObjectType.COOLDOWN, ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION];
    case VerbType.IGNORE: return [ObjectType.STATUS, ObjectType.ULTIMATE_ENERGY];
    case VerbType.ENHANCE: return [ObjectType.BASIC_ATTACK, ObjectType.BATTLE_SKILL, ObjectType.COMBO_SKILL, ObjectType.ULTIMATE];
    case VerbType.PERFORM: return [ObjectType.BASIC_ATTACK, ObjectType.BATTLE_SKILL, ObjectType.COMBO_SKILL, ObjectType.ULTIMATE, ObjectType.FINAL_STRIKE, ObjectType.NORMAL_ATTACK];
    case VerbType.DEAL: return [ObjectType.DAMAGE];
    default: return Object.values(ObjectType);
  }
}

// Which verbs need a TO preposition
const NEEDS_TO = new Set([VerbType.APPLY, VerbType.RECOVER, VerbType.RETURN]);
// Which verbs need a FROM preposition
const NEEDS_FROM = new Set([VerbType.CONSUME]);
// Which verbs need an ON preposition
const NEEDS_ON = new Set([VerbType.EXTEND, VerbType.REFRESH, VerbType.MERGE, VerbType.IGNORE]);
// Which objects need an objectId
const NEEDS_ID = new Set<string>([ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.COOLDOWN]);
// Which verbs support cardinality
const NEEDS_CARDINALITY = new Set([VerbType.APPLY, VerbType.CONSUME, VerbType.RECOVER, VerbType.RETURN]);
// Which verbs support FOR duration
const NEEDS_DURATION = new Set([VerbType.APPLY]);

interface EffectBuilderProps {
  value: Effect;
  onChange: (value: Effect) => void;
  onRemove?: () => void;
  compact?: boolean;
}

export default function EffectBuilder({ value, onChange, onRemove, compact }: EffectBuilderProps) {
  const objects = getObjectsForEffectVerb(value.verb);
  const adjectives = value.object ? (OBJECT_ADJECTIVES[value.object] ?? []) : [];
  const showAdjective = adjectives.length > 0;
  const showObjectId = NEEDS_ID.has(value.object ?? ObjectType.STATUS);
  const showTo = NEEDS_TO.has(value.verb);
  const showFrom = NEEDS_FROM.has(value.verb);
  const showOn = NEEDS_ON.has(value.verb);
  const showCardinality = NEEDS_CARDINALITY.has(value.verb);
  const showDuration = NEEDS_DURATION.has(value.verb) && value.object === ObjectType.TIME_STOP;
  const showUntilEnd = value.verb === VerbType.EXTEND;
  const isMax = value.cardinality === THRESHOLD_MAX;
  const showQualifierRow = showTo || showFrom || showOn || showDuration || showUntilEnd;

  const update = (patch: Partial<Effect>) => onChange({ ...value, ...patch });

  return (
    <div className={`interaction-builder${compact ? ' interaction-builder--compact' : ''}`}>
      <div className="interaction-row">
        {/* Verb — always visible */}
        <select
          className="ib-select ib-verb"
          value={value.verb}
          onChange={(e) => {
            const newVerb = e.target.value as VerbType;
            const newObjects = getObjectsForEffectVerb(newVerb);
            const newObj = newObjects.includes(value.object ?? ObjectType.STATUS) ? value.object : newObjects[0];
            update({ verb: newVerb, object: newObj });
          }}
        >
          {EFFECT_VERBS.map((v) => (
            <option key={v} value={v}>{VERB_LABELS[v]}</option>
          ))}
        </select>

        {/* Cardinality — slides in when verb needs it */}
        <SentenceSlot active={showCardinality}>
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
        </SentenceSlot>

        {/* Adjective — slides in when object type has adjectives */}
        <SentenceSlot active={showAdjective}>
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
        </SentenceSlot>

        {/* Object — always visible */}
        <select
          className="ib-select ib-object"
          value={value.object ?? ''}
          onChange={(e) => update({ object: e.target.value as ObjectType })}
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
            placeholder="ID (e.g. MELTING_FLAME)"
            value={value.objectId ?? ''}
            onChange={(e) => update({ objectId: e.target.value || undefined })}
          />
        </SentenceSlot>

        {onRemove && (
          <button className="ib-remove" onClick={onRemove} title="Remove">&times;</button>
        )}
      </div>

      {/* Preposition row — slides down when verb needs qualifiers */}
      <SentenceSlot active={showQualifierRow} row>
        <div className="interaction-row interaction-row--qualifier">
          <SentenceSlot active={showTo}>
            <span className="ib-label">TO</span>
            <SentenceSlot active={value.toObject === SubjectType.OPERATOR}>
              <select
                className="ib-select ib-determiner"
                value={value.toDeterminer ?? DeterminerType.THIS}
                onChange={(e) => update({ toDeterminer: e.target.value as DeterminerType })}
              >
                {Object.values(DeterminerType).map((d) => (
                  <option key={d} value={d}>{DETERMINER_LABELS[d]}</option>
                ))}
              </select>
            </SentenceSlot>
            <select
              className="ib-select"
              value={value.toObject ?? ''}
              onChange={(e) => update({ toObject: e.target.value || undefined })}
            >
              <option value="">—</option>
              {Object.entries(TARGET_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </SentenceSlot>
          <SentenceSlot active={showFrom}>
            <span className="ib-label">FROM</span>
            <SentenceSlot active={value.fromObject === SubjectType.OPERATOR}>
              <select
                className="ib-select ib-determiner"
                value={value.fromDeterminer ?? DeterminerType.THIS}
                onChange={(e) => update({ fromDeterminer: e.target.value as DeterminerType })}
              >
                {Object.values(DeterminerType).map((d) => (
                  <option key={d} value={d}>{DETERMINER_LABELS[d]}</option>
                ))}
              </select>
            </SentenceSlot>
            <select
              className="ib-select"
              value={value.fromObject ?? ''}
              onChange={(e) => update({ fromObject: e.target.value || undefined })}
            >
              <option value="">—</option>
              {Object.entries(TARGET_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </SentenceSlot>
          <SentenceSlot active={showOn}>
            <span className="ib-label">ON</span>
            <SentenceSlot active={value.onObject === SubjectType.OPERATOR}>
              <select
                className="ib-select ib-determiner"
                value={value.onDeterminer ?? DeterminerType.THIS}
                onChange={(e) => update({ onDeterminer: e.target.value as DeterminerType })}
              >
                {Object.values(DeterminerType).map((d) => (
                  <option key={d} value={d}>{DETERMINER_LABELS[d]}</option>
                ))}
              </select>
            </SentenceSlot>
            <select
              className="ib-select"
              value={value.onObject ?? ''}
              onChange={(e) => update({ onObject: e.target.value || undefined })}
            >
              <option value="">—</option>
              {Object.entries(TARGET_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </SentenceSlot>
          <SentenceSlot active={showUntilEnd}>
            <label className="ib-checkbox">
              <input
                type="checkbox"
                checked={value.until === DURATION_END}
                onChange={(e) => update({ until: e.target.checked ? DURATION_END : undefined })}
              />
              UNTIL END
            </label>
          </SentenceSlot>
          <SentenceSlot active={showDuration}>
            <span className="ib-label">FOR</span>
            <input
              className="ib-input"
              type="number"
              step="any"
              min={0}
              value={(value.with?.duration?.value as number) ?? 0}
              onChange={(e) => {
                const dur = Number(e.target.value) || undefined;
                update({ with: dur != null ? { ...value.with, duration: { verb: 'IS' as any, value: dur } } : value.with });
              }}
            />
            <span className="ib-label">s</span>
          </SentenceSlot>
        </div>
      </SentenceSlot>
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
