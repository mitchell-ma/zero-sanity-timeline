/**
 * Operator form section — linear, flat layout.
 * All fields visible in a single scroll. No collapsible nesting.
 *
 * Sections flow top → bottom:
 *   Identity → Stats → Skills (tabbed, list per type) → Potentials → Status Events
 *
 * Skills are stored as a flat array grouped by combatSkillType in the tab UI.
 * Combo trigger is edited inside the Combo tab (not a standalone section).
 */
import { useState } from 'react';
import { WeaponType, ElementType, CombatSkillType, TimeInteractionType } from '../../../consts/enums';
import { OperatorClassType } from '../../../model/enums/operators';
import type { CustomOperator, CustomCombatSkillDef, CustomPotentialEntry } from '../../../model/custom/customOperatorTypes';
import type { CustomStatusEventDef } from '../../../model/custom/customStatusEventTypes';
import type { Interaction, Predicate } from '../../../dsl/semantics';
import IdField from '../IdField';
import InteractionBuilder, { defaultInteraction } from '../InteractionBuilder';
import StatusEventFields from './StatusEventFields';
import ClauseEditor from '../ClauseEditor';

const CLASS_TYPES = Object.values(OperatorClassType);
const ELEMENT_TYPES = Object.values(ElementType).filter((e) => e !== ElementType.NONE);
const WEAPON_TYPES = Object.values(WeaponType);
const TIME_INTERACTION_TYPES = Object.values(TimeInteractionType);

const SKILL_TYPE_ORDER = [
  CombatSkillType.BASIC_ATTACK,
  CombatSkillType.BATTLE_SKILL,
  CombatSkillType.COMBO_SKILL,
  CombatSkillType.ULTIMATE,
] as const;

const SKILL_TAB_LABELS: Record<string, string> = {
  [CombatSkillType.BASIC_ATTACK]: 'Basic',
  [CombatSkillType.BATTLE_SKILL]: 'Battle',
  [CombatSkillType.COMBO_SKILL]: 'Combo',
  [CombatSkillType.ULTIMATE]: 'Ultimate',
};
const SKILL_TAB_ABBREV: Record<string, string> = {
  [CombatSkillType.BASIC_ATTACK]: 'BATK',
  [CombatSkillType.BATTLE_SKILL]: 'BSKL',
  [CombatSkillType.COMBO_SKILL]: 'CMB',
  [CombatSkillType.ULTIMATE]: 'ULT',
};

interface Props {
  data: CustomOperator;
  onChange: (data: CustomOperator) => void;
  originalId?: string;
}

// ── Section divider ───────────────────────────────────────────────────────────

function Section({ label, children, trailing }: { label: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="ops-section">
      <div className="ops-section-rule">
        <span className="ops-section-label">{label}</span>
        {trailing && <span className="ops-section-trailing">{trailing}</span>}
      </div>
      <div className="ops-section-body">{children}</div>
    </div>
  );
}

// ── Stat grid (compact 2-col: stat + value) ──────────────────────────────────

function StatGrid({ stats, onChange, title }: {
  stats: Partial<Record<string, number>>;
  onChange: (stats: Partial<Record<string, number>>) => void;
  title: string;
}) {
  const entries = Object.entries(stats);
  const isFixed = (key: string) => key === 'BASE_ATTACK' || key === 'BASE_HP';

  return (
    <div className="ops-stat-block">
      <div className="ops-stat-header">
        <span>{title}</span>
        <button className="ops-btn-micro" onClick={() => onChange({ ...stats, '': 0 })} title="Add stat">+</button>
      </div>
      <div className="ops-stat-grid">
        {entries.map(([key, val], i) => (
          <div key={i} className="ops-stat-row">
            {isFixed(key) ? (
              <span className="ops-stat-name ops-stat-name--fixed">{key.replace(/_/g, ' ')}</span>
            ) : (
              <input
                className="ops-stat-name-input"
                type="text"
                value={key}
                placeholder="STAT_TYPE"
                onChange={(e) => {
                  const newStats: Record<string, number> = {};
                  for (const [k, v] of Object.entries(stats)) {
                    if (k === key) newStats[e.target.value] = v!;
                    else newStats[k] = v!;
                  }
                  onChange(newStats);
                }}
              />
            )}
            <input
              className="ops-stat-val"
              type="number"
              value={val}
              onChange={(e) => onChange({ ...stats, [key]: Number(e.target.value) })}
            />
            {!isFixed(key) && (
              <button className="ops-btn-micro ops-btn-micro--dim" onClick={() => {
                const next = { ...stats };
                delete next[key];
                onChange(next);
              }}>&times;</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Single skill editor (inline, flat) ───────────────────────────────────────

function SkillEditor({ skill, onChange, onRemove, index }: {
  skill: CustomCombatSkillDef;
  onChange: (skill: CustomCombatSkillDef) => void;
  onRemove: () => void;
  index: number;
}) {
  const up = (patch: Partial<CustomCombatSkillDef>) => onChange({ ...skill, ...patch });
  const spCost = skill.resourceInteractions?.find((r) => r.resourceType === 'SKILL_POINT')?.value ?? 0;
  const ultEnergy = skill.resourceInteractions?.find((r) => r.resourceType === 'ULTIMATE_ENERGY')?.value ?? 0;
  const isUltimate = skill.combatSkillType === CombatSkillType.ULTIMATE;

  return (
    <div className="ops-skill-card">
      <div className="ops-skill-card-header">
        <span className="ops-skill-card-index">{index + 1}</span>
        <span className="ops-skill-card-name">{skill.name || `Skill ${index + 1}`}</span>
        <button className="ops-btn-micro ops-btn-micro--dim" onClick={onRemove} title="Remove skill">&times;</button>
      </div>
      <div className="ops-skill-form">
        {/* Row 1: Name + Element */}
        <div className="ops-row">
          <label className="ops-field ops-field--grow">
            <span className="ops-field-label">Name</span>
            <input type="text" value={skill.name} onChange={(e) => up({ name: e.target.value })} />
          </label>
          <label className="ops-field">
            <span className="ops-field-label">Element</span>
            <select value={skill.element ?? ''} onChange={(e) => up({ element: e.target.value ? e.target.value as ElementType : undefined })}>
              <option value="">Inherit</option>
              {ELEMENT_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
        </div>

        {/* Row 2: Timings */}
        <div className="ops-row">
          <label className="ops-field">
            <span className="ops-field-label">Duration</span>
            <div className="ops-input-unit">
              <input type="number" step="any" value={skill.durationSeconds} onChange={(e) => up({ durationSeconds: Number(e.target.value) })} />
              <span className="ops-unit">s</span>
            </div>
          </label>
          <label className="ops-field">
            <span className="ops-field-label">Cooldown</span>
            <div className="ops-input-unit">
              <input type="number" step="any" value={skill.cooldownSeconds ?? ''} onChange={(e) => up({ cooldownSeconds: e.target.value ? Number(e.target.value) : undefined })} />
              <span className="ops-unit">s</span>
            </div>
          </label>
          <label className="ops-field">
            <span className="ops-field-label">Animation</span>
            <div className="ops-input-unit">
              <input type="number" step="any" value={skill.animationSeconds ?? ''} onChange={(e) => up({ animationSeconds: e.target.value ? Number(e.target.value) : undefined })} />
              <span className="ops-unit">s</span>
            </div>
          </label>
        </div>

        {/* Row 3: Time Interaction + Resources */}
        <div className="ops-row">
          <label className="ops-field">
            <span className="ops-field-label">Time</span>
            <select value={skill.timeInteractionType ?? ''} onChange={(e) => up({ timeInteractionType: e.target.value ? e.target.value as TimeInteractionType : undefined })}>
              <option value="">None</option>
              {TIME_INTERACTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="ops-field">
            <span className="ops-field-label">SP Cost</span>
            <input type="number" value={spCost} onChange={(e) => {
              const val = Number(e.target.value);
              const others = (skill.resourceInteractions ?? []).filter((r) => r.resourceType !== 'SKILL_POINT');
              up({ resourceInteractions: val > 0 ? [...others, { resourceType: 'SKILL_POINT', verb: 'CONSUME', value: val }] : others.length ? others : undefined });
            }} />
          </label>
          {isUltimate && (
            <label className="ops-field">
              <span className="ops-field-label">Energy Cost</span>
              <input type="number" value={ultEnergy} onChange={(e) => {
                const val = Number(e.target.value);
                const others = (skill.resourceInteractions ?? []).filter((r) => r.resourceType !== 'ULTIMATE_ENERGY');
                up({ resourceInteractions: val > 0 ? [...others, { resourceType: 'ULTIMATE_ENERGY', verb: 'CONSUME', value: val }] : others.length ? others : undefined });
              }} />
            </label>
          )}
        </div>

        {/* Segments */}
        <div className="ops-sub-section">
          <div className="ops-sub-header">
            <span className="ops-sub-label">Segments</span>
            <button className="ops-btn-micro" onClick={() => up({ segments: [...(skill.segments ?? []), { durationSeconds: 1 }] })}>+</button>
          </div>
          {(skill.segments ?? []).length === 0 && (
            <div className="ops-empty">No segments defined</div>
          )}
          {(skill.segments ?? []).map((seg, i) => (
            <div key={i} className="ops-segment-card">
              <div className="ops-segment-header">
                <span className="ops-segment-index">{i + 1}</span>
                <input
                  className="ops-segment-name-input"
                  type="text"
                  value={seg.name ?? ''}
                  placeholder={`Segment ${i + 1}`}
                  onChange={(e) => {
                    const segments = [...(skill.segments ?? [])];
                    segments[i] = { ...seg, name: e.target.value || undefined };
                    up({ segments });
                  }}
                />
                <div className="ops-input-unit ops-input-unit--compact">
                  <input type="number" step="any" value={seg.durationSeconds} onChange={(e) => {
                    const segments = [...(skill.segments ?? [])];
                    segments[i] = { ...seg, durationSeconds: Number(e.target.value) };
                    up({ segments });
                  }} />
                  <span className="ops-unit">s</span>
                </div>
                <button className="ops-btn-micro ops-btn-micro--dim" onClick={() => up({ segments: (skill.segments ?? []).filter((_, j) => j !== i) })}>&times;</button>
              </div>
            </div>
          ))}
        </div>

        {/* Multipliers */}
        <div className="ops-sub-section">
          <div className="ops-sub-header">
            <span className="ops-sub-label">Multipliers</span>
            <button className="ops-btn-micro" onClick={() => up({ multipliers: [...(skill.multipliers ?? []), { label: '', values: Array(12).fill(0) }] })}>+</button>
          </div>
          {(skill.multipliers ?? []).map((mult, i) => (
            <div key={i} className="ops-mult-card">
              <div className="ops-mult-header">
                <input
                  className="ops-mult-label-input"
                  type="text"
                  value={mult.label}
                  placeholder="Label"
                  onChange={(e) => {
                    const multipliers = [...(skill.multipliers ?? [])];
                    multipliers[i] = { ...mult, label: e.target.value };
                    up({ multipliers });
                  }}
                />
                <button className="ops-btn-micro ops-btn-micro--dim" onClick={() => up({ multipliers: (skill.multipliers ?? []).filter((_, j) => j !== i) })}>&times;</button>
              </div>
              <div className="ops-mult-grid">
                {Array.from({ length: 12 }, (_, j) => (
                  <div key={j} className="ops-mult-cell">
                    <span className="ops-mult-lv">{j + 1}</span>
                    <input
                      type="number"
                      step="any"
                      value={mult.values[j] ?? 0}
                      onChange={(e) => {
                        const multipliers = [...(skill.multipliers ?? [])];
                        const values = [...mult.values];
                        while (values.length < 12) values.push(0);
                        values[j] = Number(e.target.value);
                        multipliers[i] = { ...mult, values };
                        up({ multipliers });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Clause (DSL) */}
        <div className="ops-sub-section">
          <div className="ops-sub-header">
            <span className="ops-sub-label">Effect Clause</span>
          </div>
          <ClauseEditor initialValue={skill.clause ?? []} onChange={(clause) => up({ clause })} />
        </div>
      </div>
    </div>
  );
}

// ── Potential row ─────────────────────────────────────────────────────────────

function PotentialRow({ pot, onChange, onRemove }: {
  pot: CustomPotentialEntry;
  onChange: (pot: CustomPotentialEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="ops-potential-row">
      <span className="ops-potential-badge">P{pot.level}</span>
      <input
        className="ops-potential-desc"
        type="text"
        value={pot.description}
        placeholder="Effect description"
        onChange={(e) => onChange({ ...pot, description: e.target.value })}
      />
      <input
        className="ops-potential-type"
        type="text"
        value={pot.type}
        placeholder="Type"
        onChange={(e) => onChange({ ...pot, type: e.target.value })}
      />
      <button className="ops-btn-micro ops-btn-micro--dim" onClick={onRemove}>&times;</button>
    </div>
  );
}

// ── Default status event factory ─────────────────────────────────────────────

function defaultStatusEvent(): CustomStatusEventDef {
  return {
    name: '',
    target: 'wielder',
    element: ElementType.PHYSICAL,
    isNamedEvent: false,
    durationValues: [10],
    durationUnit: 'seconds',
    stack: { interactionType: 'REPLACE', max: 1, instances: 1 },
    clause: [],
    onTriggerClause: [],
    stats: [],
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OperatorSection({ data, onChange, originalId }: Props) {
  const [activeSkillType, setActiveSkillType] = useState<CombatSkillType>(CombatSkillType.BASIC_ATTACK);

  const update = (patch: Partial<CustomOperator>) => onChange({ ...data, ...patch });

  const skills = data.skills ?? [];

  // Group skills by type for the active tab
  const activeSkills = skills.filter(s => s.combatSkillType === activeSkillType);

  // Skill count per type for tab badges
  const countByType = (type: CombatSkillType) => skills.filter(s => s.combatSkillType === type).length;

  const updateSkill = (globalIndex: number, skill: CustomCombatSkillDef) => {
    const next = [...skills];
    next[globalIndex] = skill;
    update({ skills: next });
  };

  const removeSkill = (globalIndex: number) => {
    update({ skills: skills.filter((_, i) => i !== globalIndex) });
  };

  const addSkill = (type: CombatSkillType) => {
    const label = SKILL_TAB_LABELS[type] ?? type;
    update({ skills: [...skills, { name: label, combatSkillType: type, durationSeconds: 2 }] });
  };

  // Combo trigger helpers
  const isComboTab = activeSkillType === CombatSkillType.COMBO_SKILL;

  const updateTriggerClause = (index: number, condition: Interaction) => {
    const onTriggerClause = [...data.combo.onTriggerClause];
    onTriggerClause[index] = { ...onTriggerClause[index], conditions: [condition] };
    update({ combo: { ...data.combo, onTriggerClause } });
  };

  const addTriggerCondition = () => {
    const newPredicate: Predicate = { conditions: [defaultInteraction()], effects: [] };
    update({ combo: { ...data.combo, onTriggerClause: [...data.combo.onTriggerClause, newPredicate] } });
  };

  const nextPotentialLevel = (): 1 | 2 | 3 | 4 | 5 => {
    const used = new Set(data.potentials.map((p) => p.level));
    for (let l = 1; l <= 5; l++) {
      if (!used.has(l as 1 | 2 | 3 | 4 | 5)) return l as 1 | 2 | 3 | 4 | 5;
    }
    return 5;
  };

  return (
    <div className="ops-root">
      {/* ─── IDENTITY ──────────────────────────────────────────── */}
      <Section label="IDENTITY">
        <IdField value={data.id} onChange={(id) => update({ id })} originalId={originalId} />
        <div className="ops-row">
          <label className="ops-field ops-field--grow">
            <span className="ops-field-label">Name</span>
            <input type="text" value={data.name} onChange={(e) => update({ name: e.target.value })} placeholder="Operator name" />
          </label>
          <label className="ops-field">
            <span className="ops-field-label">Rarity</span>
            <div className="ops-rarity-group">
              {([4, 5, 6] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`ops-rarity-btn${data.operatorRarity === r ? ' ops-rarity-btn--active' : ''}`}
                  onClick={() => update({ operatorRarity: r })}
                >
                  {r}&#9733;
                </button>
              ))}
            </div>
          </label>
        </div>
        <div className="ops-row">
          <label className="ops-field">
            <span className="ops-field-label">Class</span>
            <select value={data.operatorClassType} onChange={(e) => update({ operatorClassType: e.target.value as OperatorClassType })}>
              {CLASS_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="ops-field">
            <span className="ops-field-label">Element</span>
            <select value={data.elementType} onChange={(e) => update({ elementType: e.target.value as ElementType })}>
              {ELEMENT_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
        </div>
        <div className="ops-weapon-row">
          <span className="ops-field-label">Weapons</span>
          <div className="ops-pill-group">
            {WEAPON_TYPES.map((w) => {
              const selected = data.weaponTypes.includes(w);
              return (
                <button
                  key={w}
                  type="button"
                  className={`ops-pill${selected ? ' ops-pill--active' : ''}`}
                  onClick={() => {
                    const next = selected
                      ? data.weaponTypes.filter((t) => t !== w)
                      : [...data.weaponTypes, w];
                    if (next.length > 0) update({ weaponTypes: next });
                  }}
                >
                  {w.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ─── BASE STATS ────────────────────────────────────────── */}
      <Section label="BASE STATS">
        <div className="ops-stats-pair">
          <StatGrid title="Lv 1" stats={data.baseStats.lv1} onChange={(s) => update({ baseStats: { ...data.baseStats, lv1: s } })} />
          <StatGrid title="Lv 90" stats={data.baseStats.lv90} onChange={(s) => update({ baseStats: { ...data.baseStats, lv90: s } })} />
        </div>
      </Section>

      {/* ─── SKILLS ────────────────────────────────────────────── */}
      <Section label="SKILLS">
        {/* Tab bar */}
        <div className="ops-skill-tabs">
          {SKILL_TYPE_ORDER.map((type) => {
            const count = countByType(type);
            return (
              <button
                key={type}
                type="button"
                className={`ops-skill-tab${activeSkillType === type ? ' ops-skill-tab--active' : ''}`}
                onClick={() => setActiveSkillType(type)}
              >
                <span className="ops-skill-tab-abbrev">{SKILL_TAB_ABBREV[type]}</span>
                <span className="ops-skill-tab-label">
                  {SKILL_TAB_LABELS[type]}
                  {count > 0 && <span className="ops-skill-tab-count">{count}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {/* Combo trigger — only shown in the Combo tab */}
        {isComboTab && (
          <div className="ops-combo-trigger-block">
            <div className="ops-sub-header">
              <span className="ops-sub-label">Combo Trigger</span>
              <button className="ops-btn-micro" onClick={addTriggerCondition} title="Add condition">+</button>
            </div>
            {data.combo.onTriggerClause.map((pred, i) => (
              <div key={i} className="ops-trigger-row">
                {pred.conditions.map((cond, ci) => (
                  <InteractionBuilder
                    key={ci}
                    value={cond}
                    onChange={(v) => updateTriggerClause(i, v)}
                    onRemove={() => update({ combo: { ...data.combo, onTriggerClause: data.combo.onTriggerClause.filter((_, j) => j !== i) } })}
                    compact
                  />
                ))}
              </div>
            ))}
            {data.combo.onTriggerClause.length === 0 && (
              <div className="ops-empty">No trigger conditions</div>
            )}
            <div className="ops-row" style={{ marginTop: '0.375rem' }}>
              <label className="ops-field ops-field--grow">
                <span className="ops-field-label">Description</span>
                <input type="text" value={data.combo.description} onChange={(e) => update({ combo: { ...data.combo, description: e.target.value } })} />
              </label>
              <label className="ops-field">
                <span className="ops-field-label">Window</span>
                <div className="ops-input-unit">
                  <input type="number" value={data.combo.windowFrames ?? ''} onChange={(e) => update({ combo: { ...data.combo, windowFrames: e.target.value ? Number(e.target.value) : undefined } })} />
                  <span className="ops-unit">f</span>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Skill list for the active type */}
        {activeSkills.length === 0 && (
          <div className="ops-empty">No {SKILL_TAB_LABELS[activeSkillType]?.toLowerCase()} skills defined</div>
        )}
        {activeSkills.map((skill, localIdx) => {
          const globalIdx = skills.indexOf(skill);
          return (
            <SkillEditor
              key={globalIdx}
              skill={skill}
              index={localIdx}
              onChange={(s) => updateSkill(globalIdx, s)}
              onRemove={() => removeSkill(globalIdx)}
            />
          );
        })}
        <button
          className="ops-add-skill-btn"
          type="button"
          onClick={() => addSkill(activeSkillType)}
        >
          + Add {SKILL_TAB_LABELS[activeSkillType]}
        </button>
      </Section>

      {/* ─── POTENTIALS ────────────────────────────────────────── */}
      <Section
        label="POTENTIALS"
        trailing={
          data.potentials.length < 5 ? (
            <button className="ops-btn-micro" onClick={() => update({ potentials: [...data.potentials, { level: nextPotentialLevel(), type: '', description: '' }] })} title="Add potential">+</button>
          ) : undefined
        }
      >
        {data.potentials.length === 0 && (
          <div className="ops-empty">No potentials defined</div>
        )}
        {data.potentials.map((pot, i) => (
          <PotentialRow
            key={i}
            pot={pot}
            onChange={(p) => {
              const potentials = [...data.potentials];
              potentials[i] = p;
              update({ potentials });
            }}
            onRemove={() => update({ potentials: data.potentials.filter((_, j) => j !== i) })}
          />
        ))}
      </Section>

      {/* ─── STATUS EVENTS ─────────────────────────────────────── */}
      <Section
        label="STATUS EVENTS"
        trailing={<button className="ops-btn-micro" onClick={() => update({ statusEvents: [...(data.statusEvents ?? []), defaultStatusEvent()] })} title="Add status">+</button>}
      >
        {(!data.statusEvents || data.statusEvents.length === 0) && (
          <div className="ops-empty">No status events. Add statuses this operator produces (buffs, debuffs, special states).</div>
        )}
        {(data.statusEvents ?? []).map((se, i) => (
          <div key={i} className="ops-status-card">
            <StatusEventFields
              event={se}
              label={se.name || `Status ${i + 1}`}
              onChange={(e) => {
                const statusEvents = [...(data.statusEvents ?? [])];
                statusEvents[i] = e;
                update({ statusEvents });
              }}
              onRemove={() => update({ statusEvents: (data.statusEvents ?? []).filter((_, j) => j !== i) })}
            />
          </div>
        ))}
      </Section>
    </div>
  );
}
