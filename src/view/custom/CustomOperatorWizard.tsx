/**
 * Multi-step wizard for creating/editing custom operators.
 */
import { useState, useMemo } from 'react';
import { WeaponType, ElementType, CombatSkillType } from '../../consts/enums';
import { OperatorClassType } from '../../model/enums/operators';
import { ObjectType, SubjectType, VerbType, DeterminerType } from '../../consts/semantics';
import type { Interaction, Predicate } from '../../consts/semantics';
import type { CustomOperator, CustomCombatSkillDef } from '../../model/custom/customOperatorTypes';
import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { COMBAT_SKILL_LABELS } from '../../consts/timelineColumnLabels';
import { getCustomSkills } from '../../controller/custom/customSkillController';
import type { SkillType, SkillDef } from '../../consts/viewTypes';
import InteractionBuilder from './InteractionBuilder';
import ClauseBuilder from './ClauseBuilder';
import IdField from './IdField';
import SegmentFrameEditor from './SegmentFrameEditor';
import StatusEventEditor, { defaultStatusEventDef } from './StatusEventEditor';

// ── Auto-generate combo description from trigger conditions ─────────────────

const OPERATOR_DET_DESC: Partial<Record<DeterminerType, string>> = {
  [DeterminerType.THIS]: 'this operator',
  [DeterminerType.OTHER]: 'other operator',
  [DeterminerType.ALL]: 'all operators',
  [DeterminerType.ANY]: 'any operator',
};

const SUBJECT_DESC: Partial<Record<string, string>> = {
  [SubjectType.ENEMY]: 'enemy',
};

const VERB_DESC: Partial<Record<string, string>> = {
  [VerbType.PERFORM]: 'performs',
  [VerbType.APPLY]: 'applies',
  [VerbType.IS]: 'is',
  [VerbType.HAVE]: 'have',
  [VerbType.HIT]: 'hits',
  [VerbType.CONSUME]: 'consumes',
  [VerbType.DEFEAT]: 'defeats',
};

const OBJECT_DESC: Partial<Record<string, string>> = {
  [ObjectType.BASIC_ATTACK]: 'Basic Attack',
  [ObjectType.BATTLE_SKILL]: 'Battle Skill',
  [ObjectType.COMBO_SKILL]: 'Combo Skill',
  [ObjectType.ULTIMATE]: 'Ultimate',
  [ObjectType.FINAL_STRIKE]: 'Final Strike',
  [ObjectType.COMBUSTED]: 'Combusted',
  [ObjectType.CORRODED]: 'Corroded',
  [ObjectType.ELECTRIFIED]: 'Electrified',
  [ObjectType.SOLIDIFIED]: 'Solidified',
  [ObjectType.BREACHED]: 'Breached',
  [ObjectType.CRUSHED]: 'Crushed',
  [ObjectType.LIFTED]: 'Lifted',
  [ObjectType.KNOCKED_DOWN]: 'Knocked Down',
  [ObjectType.ACTIVE]: 'Active',
  [ObjectType.INFLICTION]: 'Infliction',
  [ObjectType.REACTION]: 'Reaction',
  [ObjectType.STATUS]: 'Status',
  [ObjectType.STAGGER]: 'Stagger',
};

function describeCondition(c: Interaction): string {
  const subject = c.subjectType === SubjectType.OPERATOR
    ? (OPERATOR_DET_DESC[c.subjectDeterminer ?? DeterminerType.THIS] ?? 'this operator')
    : (SUBJECT_DESC[c.subjectType] ?? c.subjectType.toLowerCase().replace(/_/g, ' '));
  const verb = c.negated
    ? `is not`
    : (VERB_DESC[c.verbType] ?? c.verbType.toLowerCase().replace(/_/g, ' '));
  const object = OBJECT_DESC[c.objectType] ?? c.objectType.replace(/_/g, ' ');
  const id = c.objectId ? ` (${c.objectId.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())})` : '';
  return `${subject} ${verb} ${object}${id}`;
}

function generateComboDescription(triggerClause: Predicate[]): string {
  if (triggerClause.length === 0) return '';
  const parts = triggerClause
    .map((pred) => pred.conditions.map(describeCondition).join(' and '))
    .filter(Boolean);
  if (parts.length === 0) return '';
  return 'Available when ' + parts.join(', or ');
}

/** Default interaction for combo triggers — "Enemy IS [state]" rather than generic "This Operator PERFORM Battle Skill". */
function defaultComboTrigger(): Interaction {
  return {
    subjectType: SubjectType.ENEMY as any,
    verbType: VerbType.IS,
    objectType: ObjectType.COMBUSTED as any,
  };
}

const WEAPON_LABELS: Record<WeaponType, string> = {
  [WeaponType.SWORD]: 'Sword', [WeaponType.GREAT_SWORD]: 'Great Sword',
  [WeaponType.POLEARM]: 'Polearm', [WeaponType.HANDCANNON]: 'Handcannon',
  [WeaponType.ARTS_UNIT]: 'Arts Unit',
};

const CLASS_LABELS: Record<OperatorClassType, string> = {
  [OperatorClassType.GUARD]: 'Guard', [OperatorClassType.CASTER]: 'Caster',
  [OperatorClassType.STRIKER]: 'Striker', [OperatorClassType.VANGUARD]: 'Vanguard',
  [OperatorClassType.DEFENDER]: 'Defender', [OperatorClassType.SUPPORTER]: 'Supporter',
};

const ELEMENT_LABELS: Record<ElementType, string> = {
  [ElementType.NONE]: 'None', [ElementType.PHYSICAL]: 'Physical',
  [ElementType.HEAT]: 'Heat', [ElementType.CRYO]: 'Cryo',
  [ElementType.NATURE]: 'Nature', [ElementType.ELECTRIC]: 'Electric',
};

const SKILL_SLOT_LABELS = {
  basicAttack: 'Basic Attack',
  battleSkill: 'Battle Skill',
  comboSkill: 'Combo Skill',
  ultimate: 'Ultimate',
} as const;

interface Props {
  initial: CustomOperator;
  onSave: (operator: CustomOperator) => string[];
  onCancel: () => void;
}

/** A selectable skill option — built-in or custom. */
interface SkillOption {
  id: string;
  label: string;
  operatorName?: string;
  source: 'builtin' | 'custom';
  skillType: CombatSkillType;
  data: CustomCombatSkillDef;
}

function buildSkillOptions(): SkillOption[] {
  const options: SkillOption[] = [];

  const SKILL_TYPE_MAP: Record<SkillType, CombatSkillType> = {
    basic: CombatSkillType.BASIC_ATTACK,
    battle: CombatSkillType.BATTLE_SKILL,
    combo: CombatSkillType.COMBO_SKILL,
    ultimate: CombatSkillType.ULTIMATE,
  };

  // Built-in skills from all operators
  for (const op of ALL_OPERATORS) {
    for (const [key, skill] of Object.entries(op.skills) as [SkillType, SkillDef][]) {
      const combatSkillType = SKILL_TYPE_MAP[key];
      const label = (COMBAT_SKILL_LABELS as any)[skill.name] || skill.name;
      const totalFrames = skill.defaultActivationDuration + skill.defaultActiveDuration;
      options.push({
        id: `builtin:${op.id}:${key}`,
        label,
        operatorName: op.name,
        source: 'builtin',
        skillType: combatSkillType,
        data: {
          name: skill.name,
          combatSkillType,
          element: skill.element as ElementType | undefined,
          durationSeconds: Math.max(totalFrames / 120, 0.1),
          cooldownSeconds: skill.defaultCooldownDuration > 0 ? skill.defaultCooldownDuration / 120 : undefined,
          animationSeconds: skill.animationDuration ? skill.animationDuration / 120 : undefined,
          resourceInteractions: skill.skillPointCost
            ? [{ resourceType: 'SKILL_POINT', verbType: 'CONSUME', value: skill.skillPointCost }]
            : undefined,
        },
      });
    }
  }

  // Custom skills
  for (const cs of getCustomSkills()) {
    options.push({
      id: `custom:${cs.id}`,
      label: cs.name,
      source: 'custom',
      skillType: cs.combatSkillType,
      data: {
        name: cs.name,
        combatSkillType: cs.combatSkillType,
        element: cs.element,
        durationSeconds: cs.durationSeconds,
        cooldownSeconds: cs.cooldownSeconds,
        animationSeconds: cs.animationSeconds,
        resourceInteractions: cs.resourceInteractions,
      },
    });
  }

  return options;
}

const DEFAULT_SKILLS: CustomOperator['skills'] = {
  basicAttack: { name: 'Basic Attack', combatSkillType: CombatSkillType.BASIC_ATTACK, durationSeconds: 1 },
  battleSkill: { name: 'Battle Skill', combatSkillType: CombatSkillType.BATTLE_SKILL, durationSeconds: 1 },
  comboSkill: { name: 'Combo Skill', combatSkillType: CombatSkillType.COMBO_SKILL, durationSeconds: 1 },
  ultimate: { name: 'Ultimate', combatSkillType: CombatSkillType.ULTIMATE, durationSeconds: 3 },
};

export default function CustomOperatorWizard({ initial, onSave, onCancel }: Props) {
  const [operator, setOperator] = useState<CustomOperator>(() => {
    const parsed = JSON.parse(JSON.stringify(initial));
    if (!parsed.skills) parsed.skills = JSON.parse(JSON.stringify(DEFAULT_SKILLS));
    return parsed;
  });
  const [errors, setErrors] = useState<string[]>([]);
  const skillOptions = useMemo(() => buildSkillOptions(), []);

  const update = (patch: Partial<CustomOperator>) => setOperator((o) => ({ ...o, ...patch }));

  const handleSave = () => {
    const errs = onSave(operator);
    if (errs.length > 0) setErrors(errs);
  };

  return (
    <div className="custom-wizard">
      <div className="wizard-header">
        <h3>{initial.name ? `Edit: ${initial.name}` : 'New Custom Operator'}</h3>
      </div>

      <div className="wizard-body">
        <div className="wizard-section">
          <div className="wizard-section-title">Identity</div>
          <IdField
            value={operator.id}
            onChange={(id) => update({ id })}
            originalId={initial.id}
          />
          <label className="wz-field">
            <span>Name</span>
            <input type="text" value={operator.name} onChange={(e) => update({ name: e.target.value })} placeholder="Operator name" />
          </label>
          <label className="wz-field">
            <span>Class</span>
            <select value={operator.operatorClassType} onChange={(e) => update({ operatorClassType: e.target.value as OperatorClassType })}>
              {Object.values(OperatorClassType).map((c) => <option key={c} value={c}>{CLASS_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="wz-field">
            <span>Element</span>
            <select value={operator.elementType} onChange={(e) => update({ elementType: e.target.value as ElementType })}>
              {Object.values(ElementType).map((el) => <option key={el} value={el}>{ELEMENT_LABELS[el]}</option>)}
            </select>
          </label>
          <label className="wz-field">
            <span>Weapon Type</span>
            <select value={operator.weaponType} onChange={(e) => update({ weaponType: e.target.value as WeaponType })}>
              {Object.values(WeaponType).map((w) => <option key={w} value={w}>{WEAPON_LABELS[w]}</option>)}
            </select>
          </label>
          <label className="wz-field">
            <span>Rarity</span>
            <div className="wz-radio-group">
              {([4, 5, 6] as const).map((r) => (
                <label key={r} className={`wz-radio${operator.operatorRarity === r ? ' active' : ''}`}>
                  <input type="radio" checked={operator.operatorRarity === r} onChange={() => update({ operatorRarity: r })} />
                  {r}★
                </label>
              ))}
            </div>
          </label>
        </div>

        <div className="wizard-section">
          <div className="wizard-section-title">Stats</div>
          <div className="wz-subsection">
            <div className="wz-subsection-header"><span>Lv1 Stats</span></div>
            <StatsEditor
              stats={operator.baseStats.lv1 as Record<string, number>}
              onChange={(lv1) => update({ baseStats: { ...operator.baseStats, lv1 } })}
            />
          </div>
          <div className="wz-subsection">
            <div className="wz-subsection-header"><span>Lv90 Stats</span></div>
            <StatsEditor
              stats={operator.baseStats.lv90 as Record<string, number>}
              onChange={(lv90) => update({ baseStats: { ...operator.baseStats, lv90 } })}
            />
          </div>
        </div>

        <div className="wizard-section">
          <div className="wizard-section-title">Skills</div>
          {(Object.keys(SKILL_SLOT_LABELS) as (keyof typeof SKILL_SLOT_LABELS)[]).map((key) => (
            <SkillSlotEditor
              key={key}
              label={SKILL_SLOT_LABELS[key]}
              slotKey={key}
              skill={operator.skills![key]}
              skillOptions={skillOptions}
              onChange={(s) => update({ skills: { ...operator.skills!, [key]: s } })}
            />
          ))}
        </div>

        <div className="wizard-section">
          <div className="wizard-section-title">Combo</div>
          <div className="wz-subsection">
            <div className="wz-subsection-header">
              <span>Trigger Conditions (any match)</span>
              <button className="btn-add-sm" onClick={() => {
                const triggerClause = [...operator.combo.triggerClause, { conditions: [defaultComboTrigger()], effects: [] }];
                update({ combo: { ...operator.combo, triggerClause, description: generateComboDescription(triggerClause) } });
              }}>+</button>
            </div>
            {operator.combo.triggerClause.map((predicate, i) => (
              <InteractionBuilder
                key={i}
                value={predicate.conditions[0]}
                onChange={(t) => {
                  const triggerClause = [...operator.combo.triggerClause];
                  triggerClause[i] = { ...triggerClause[i], conditions: [t] };
                  update({ combo: { ...operator.combo, triggerClause, description: generateComboDescription(triggerClause) } });
                }}
                onRemove={operator.combo.triggerClause.length > 1 ? () => {
                  const triggerClause = operator.combo.triggerClause.filter((_, j) => j !== i);
                  update({ combo: { ...operator.combo, triggerClause, description: generateComboDescription(triggerClause) } });
                } : undefined}
                compact
              />
            ))}
          </div>
          <label className="wz-field">
            <span>Description</span>
            <input type="text" value={operator.combo.description} onChange={(e) => update({
              combo: { ...operator.combo, description: e.target.value },
            })} placeholder="e.g. Available when enemy is Combusted" />
          </label>
          <label className="wz-field">
            <span>Window (frames)</span>
            <input type="number" min={1} value={operator.combo.windowFrames ?? 720} onChange={(e) => update({
              combo: { ...operator.combo, windowFrames: Number(e.target.value) },
            })} />
          </label>
        </div>

        <div className="wizard-section">
          <div className="wizard-section-title">
            Statuses{operator.statusEvents?.length ? ` (${operator.statusEvents.length})` : ''}
          </div>
          <div className="wizard-section-intro">
            Define operator-specific statuses — self-buffs, debuffs, reactions, and threshold effects.
          </div>

          {(operator.statusEvents ?? []).map((se, i) => (
            <StatusEventEditor
              key={i}
              value={se}
              onChange={(updated) => {
                const statusEvents = [...(operator.statusEvents ?? [])];
                statusEvents[i] = updated;
                update({ statusEvents });
              }}
              onRemove={() => update({
                statusEvents: (operator.statusEvents ?? []).filter((_, j) => j !== i),
              })}
            />
          ))}

          <button className="btn-create" onClick={() => update({
            statusEvents: [...(operator.statusEvents ?? []), defaultStatusEventDef()],
          })}>
            + New Status Event
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="wizard-errors">
          {errors.map((e, i) => <div key={i} className="wizard-error">{e}</div>)}
        </div>
      )}

      <div className="wizard-footer">
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button className="btn-save" onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}

// ── Stats Editor ────────────────────────────────────────────────────────────

function StatsEditor({ stats, onChange }: { stats: Record<string, number>; onChange: (s: Record<string, number>) => void }) {
  const entries = Object.entries(stats);
  return (
    <div className="stat-boost-editor">
      {entries.map(([key, value], i) => (
        <div key={i} className="buff-row">
          <input className="ib-input ib-object-id" type="text" value={key} onChange={(e) => {
            const newStats = { ...stats };
            delete newStats[key];
            newStats[e.target.value] = value;
            onChange(newStats);
          }} />
          <input className="ib-input" type="number" step="any" value={value} onChange={(e) => {
            onChange({ ...stats, [key]: Number(e.target.value) });
          }} />
          <button className="ib-remove" onClick={() => {
            const newStats = { ...stats };
            delete newStats[key];
            onChange(newStats);
          }}>×</button>
        </div>
      ))}
      <button className="btn-add-sm" onClick={() => onChange({ ...stats, '': 0 })}>+</button>
    </div>
  );
}

// ── Skill Slot Editor ───────────────────────────────────────────────────────

const COMBAT_SKILL_TYPE_FOR_SLOT: Record<string, CombatSkillType> = {
  basicAttack: CombatSkillType.BASIC_ATTACK,
  battleSkill: CombatSkillType.BATTLE_SKILL,
  comboSkill: CombatSkillType.COMBO_SKILL,
  ultimate: CombatSkillType.ULTIMATE,
};

function SkillSlotEditor({ label, slotKey, skill, skillOptions, onChange }: {
  label: string;
  slotKey: string;
  skill: CustomCombatSkillDef;
  skillOptions: SkillOption[];
  onChange: (s: CustomCombatSkillDef) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const expectedType = COMBAT_SKILL_TYPE_FOR_SLOT[slotKey];

  // Find currently selected option
  const currentOptionId = skillOptions.find(
    (o) => o.data.name === skill.name && o.skillType === skill.combatSkillType
  )?.id ?? '';

  // Filter options: show all skills of same type + all custom skills
  const filteredOptions = skillOptions.filter(
    (o) => o.skillType === expectedType || o.source === 'custom'
  );

  const handleSelect = (optionId: string) => {
    const opt = skillOptions.find((o) => o.id === optionId);
    if (opt) {
      onChange({ ...opt.data, combatSkillType: expectedType });
    }
  };

  return (
    <div className="skill-editor">
      <div className="skill-editor-header">
        <span className="skill-index">{label}</span>
        <button
          className="btn-sm"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Hide Details' : 'Details'}
        </button>
      </div>
      <label className="wz-field">
        <span>Skill</span>
        <select value={currentOptionId} onChange={(e) => handleSelect(e.target.value)}>
          <option value="">-- Select a skill --</option>
          {filteredOptions
            .slice()
            .sort((a, b) => {
              const aPrefix = a.operatorName ?? 'CUSTOM';
              const bPrefix = b.operatorName ?? 'CUSTOM';
              return aPrefix.localeCompare(bPrefix) || a.label.localeCompare(b.label);
            })
            .map((o) => (
            <option key={o.id} value={o.id}>
              {o.operatorName ?? 'CUSTOM'} - {o.label}
            </option>
          ))}
        </select>
      </label>

      {showDetails && (
        <div className="skill-details">
          <div className="wz-field-row">
            <label className="wz-field">
              <span>Duration (s)</span>
              <input type="number" min={0} step="any" value={skill.durationSeconds}
                onChange={(e) => onChange({ ...skill, durationSeconds: Number(e.target.value) })} />
            </label>
            <label className="wz-field">
              <span>Cooldown (s)</span>
              <input type="number" min={0} step="any" value={skill.cooldownSeconds ?? 0}
                onChange={(e) => onChange({ ...skill, cooldownSeconds: Number(e.target.value) || undefined })} />
            </label>
          </div>

          {/* Activation Clause */}
          <div className="wz-subsection">
            <ClauseBuilder
              value={skill.clause ?? []}
              onChange={(clause) => onChange({ ...skill, clause: clause.length > 0 ? clause : undefined })}
              conditionsOnly
              label="Activation Conditions (when this variant is available)"
            />
          </div>

          {/* Segments & Frames */}
          <div className="wz-subsection">
            <SegmentFrameEditor
              segments={skill.segments ?? []}
              onChange={(segments) => onChange({ ...skill, segments: segments.length > 0 ? segments : undefined })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
