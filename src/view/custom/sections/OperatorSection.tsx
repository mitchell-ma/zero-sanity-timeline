/**
 * Operator form section — split layout matching the readonly viewer.
 *
 * Left column: Identity + Stats
 * Right column: Category tabs (Skills, Potentials, Talents, Statuses)
 *
 * Each tab shows:
 *   1. Builtin readonly cards (from game data via baseOperatorId)
 *   2. Linked custom entities (editable)
 *   3. Link picker + New button
 */
import { useState, useMemo, useCallback } from 'react';
import { WeaponType, ElementType, CombatSkillType, ELEMENT_COLORS } from '../../../consts/enums';
import { OperatorClassType } from '../../../model/enums/operators';
import type { CustomOperator, CustomPotentialEntry } from '../../../model/custom/customOperatorTypes';
import type { SkillType } from '../../../consts/viewTypes';
import type { Interaction, Predicate } from '../../../dsl/semantics';
import { NounType } from '../../../dsl/semantics';
import IdField from '../IdField';
import InteractionBuilder, { defaultInteraction } from '../InteractionBuilder';
import NumberInputWithFastForwardButtons from '../../components/inputs/NumberInputWithFastForwardButtons';
import { DataCardBody } from '../DataCardComponents';
import { getOperatorPotentialRaw, getOperatorStatuses } from '../../../controller/gameDataStore';
import { buildSkillEntries } from '../OperatorEventEditor';
import { getCustomSkills, createCustomSkill, getDefaultCustomSkill, updateCustomSkill } from '../../../controller/custom/customSkillController';
import { getLinksForSlot, addSkillLink, removeSkillLink } from '../../../controller/custom/customSkillLinkController';
import { getCustomOperatorStatuses, createCustomOperatorStatus, getDefaultCustomOperatorStatus, getStatusesForOperator, linkStatusToOperator, updateCustomOperatorStatus } from '../../../controller/custom/customOperatorStatusController';
import { getCustomOperatorTalents, createCustomOperatorTalent, getDefaultCustomOperatorTalent, getTalentsForOperator, linkTalentToOperator, updateCustomOperatorTalent } from '../../../controller/custom/customOperatorTalentController';
import SkillSection from './SkillSection';
import OperatorStatusSection from './OperatorStatusSection';
import OperatorTalentSection from './OperatorTalentSection';

const CLASS_TYPES = Object.values(OperatorClassType);
const ELEMENT_TYPES = Object.values(ElementType).filter((e) => e !== ElementType.NONE);
const WEAPON_TYPES = Object.values(WeaponType);

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

/** Maps CombatSkillType → NounType (SkillType) for the link table. */
const COMBAT_TO_NOUN: Record<string, SkillType> = {
  [CombatSkillType.BASIC_ATTACK]: NounType.BASIC_ATTACK as SkillType,
  [CombatSkillType.BATTLE_SKILL]: NounType.BATTLE_SKILL as SkillType,
  [CombatSkillType.COMBO_SKILL]: NounType.COMBO_SKILL as SkillType,
  [CombatSkillType.ULTIMATE]: NounType.ULTIMATE as SkillType,
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
  const isFixed = (key: string) => key === 'BASE_HP' || key === 'BASE_ATTACK' || key === 'BASE_DEFENSE';

  return (
    <div className="ops-stat-block">
      <div className="ops-stat-header">
        <span>{title}</span>
        <button className="ops-btn-micro" onClick={() => onChange({ ...stats, '': 0 })} title="Add stat">+</button>
      </div>
      <div className="ops-stat-grid">
        {entries.map(([key, val], i) => (
          <div key={i} className="ops-stat-row">
            <NumberInputWithFastForwardButtons
              label={isFixed(key) ? (
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
              value={val ?? 0}
              min={0}
              max={99999}
              step={1}
              holdStep={10}
              onChange={(v) => onChange({ ...stats, [key]: v })}
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

// ── Expandable custom entity card ───────────────────────────────────────────

function EditableEntityCard({ name, meta, isOpen, onToggle, onUnlink, children }: {
  name: string;
  meta?: string;
  isOpen: boolean;
  onToggle: () => void;
  onUnlink: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`ops-skill-card ops-skill-card--custom${isOpen ? ' ops-skill-card--open' : ''}`}>
      <div className="ops-skill-card-header" onClick={onToggle}>
        <div className="ops-skill-card-header-content">
          <div className="ops-skill-card-title-row">
            <span className="ops-skill-card-name">{name || 'Untitled'}</span>
            {meta && <span className="ops-linked-card-meta">{meta}</span>}
            <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
          </div>
        </div>
        <button
          className="ops-btn-micro ops-btn-micro--dim"
          onClick={(e) => { e.stopPropagation(); onUnlink(); }}
          title="Unlink"
        >&times;</button>
      </div>
      {isOpen && (
        <div className="ops-skill-form">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Link picker (select + link + new buttons) ─────────────────────────────

function LinkPicker({ items, onLink, onCreate, placeholder }: {
  items: { id: string; name: string; meta?: string }[];
  onLink: (id: string) => void;
  onCreate: () => void;
  placeholder?: string;
}) {
  const [selectedId, setSelectedId] = useState('');
  return (
    <div className="ops-link-picker">
      <select
        className="ops-link-picker-select"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        <option value="">{placeholder ?? 'Link existing...'}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}{item.meta ? ` (${item.meta})` : ''}
          </option>
        ))}
      </select>
      <button
        className="ops-link-picker-btn"
        disabled={!selectedId}
        onClick={() => { if (selectedId) { onLink(selectedId); setSelectedId(''); } }}
      >
        Link
      </button>
      <button className="ops-link-picker-btn ops-link-picker-btn--new" onClick={onCreate}>
        + New
      </button>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function OperatorSection({ data, onChange, originalId }: Props) {
  const [activeSkillType, setActiveSkillType] = useState<CombatSkillType>(CombatSkillType.BASIC_ATTACK);
  const [activeCategory, setActiveCategory] = useState<'skills' | 'potentials' | 'talents' | 'statuses'>('skills');
  const [, setRefreshKey] = useState(0);
  const [openBuiltinSkills, setOpenBuiltinSkills] = useState<Set<number>>(new Set());
  const [openBuiltinPotentials, setOpenBuiltinPotentials] = useState<Set<number>>(new Set());
  const [openBuiltinTalents, setOpenBuiltinTalents] = useState<Set<number>>(new Set());
  const [openBuiltinStatuses, setOpenBuiltinStatuses] = useState<Set<number>>(new Set());
  const [openCustomIds, setOpenCustomIds] = useState<Set<string>>(new Set());

  const update = (patch: Partial<CustomOperator>) => onChange({ ...data, ...patch });
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);
  // bump() triggers re-render to pick up changes from link controllers
  const toggleCustom = useCallback((id: string) => setOpenCustomIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);

  const baseId = data.baseOperatorId;

  // ── Builtin data from game data ──────────────────────────────────────────
  const builtinPotentials = useMemo(() => baseId ? getOperatorPotentialRaw(baseId) : [], [baseId]);
  const builtinTalents = useMemo(() => {
    if (!baseId) return [];
    return getOperatorStatuses(baseId)
      .map((s) => s.serialize() as Record<string, unknown>)
      .filter((s) => (s.properties as Record<string, unknown> | undefined)?.eventCategoryType === 'TALENT');
  }, [baseId]);
  const builtinStatuses = useMemo(() => {
    if (!baseId) return [];
    return getOperatorStatuses(baseId)
      .map((s) => s.serialize() as Record<string, unknown>)
      .filter((s) => (s.properties as Record<string, unknown> | undefined)?.eventCategoryType !== 'TALENT');
  }, [baseId]);
  const builtinSkillEntries = useMemo(() => {
    if (!baseId) return [];
    const skillType = COMBAT_TO_NOUN[activeSkillType];
    return buildSkillEntries(baseId, skillType as SkillType) ?? [];
  }, [baseId, activeSkillType]);

  // ── Linked custom entities ───────────────────────────────────────────────
  const skillNounType = COMBAT_TO_NOUN[activeSkillType];

  // Read linked entities — refreshKey forces recalculation after link mutations
  const linkedSkillIds = getLinksForSlot(data.id, skillNounType);
  const allCustomSkills = getCustomSkills();
  const linkedSkills = allCustomSkills.filter((s) => linkedSkillIds.includes(s.id));
  const linkedStatuses = getStatusesForOperator(data.id);
  const linkedTalents = getTalentsForOperator(data.id);

  // Link picker items (available to link)
  const linkedSkillIdSet = new Set(linkedSkillIds);
  const availableSkills = allCustomSkills
    .filter((s) => s.combatSkillType === activeSkillType && !linkedSkillIdSet.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));

  const linkedStatusIdSet = new Set(linkedStatuses.map((s) => s.id));
  const availableStatuses = getCustomOperatorStatuses()
    .filter((s) => !s.operatorId && !linkedStatusIdSet.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));

  const linkedTalentIdSet = new Set(linkedTalents.map((t) => t.id));
  const availableTalents = getCustomOperatorTalents()
    .filter((t) => !t.operatorId && !linkedTalentIdSet.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, meta: `Slot ${t.slot}` }));

  // ── Skill link handlers ──────────────────────────────────────────────────
  const handleLinkSkill = useCallback((customSkillId: string) => {
    addSkillLink(data.id, skillNounType, customSkillId);
    bump();
  }, [data.id, skillNounType, bump]);

  const handleUnlinkSkill = useCallback((customSkillId: string) => {
    removeSkillLink(data.id, skillNounType, customSkillId);
    bump();
  }, [data.id, skillNounType, bump]);

  const handleNewSkill = useCallback(() => {
    const skill = getDefaultCustomSkill();
    skill.combatSkillType = activeSkillType;
    skill.name = SKILL_TAB_LABELS[activeSkillType] ?? activeSkillType;
    const errors = createCustomSkill(skill);
    if (errors.length === 0) {
      addSkillLink(data.id, skillNounType, skill.id);
      bump();
    }
  }, [data.id, skillNounType, activeSkillType, bump]);

  // ── Status link handlers ─────────────────────────────────────────────────
  const handleLinkStatus = useCallback((statusId: string) => {
    linkStatusToOperator(statusId, data.id);
    bump();
  }, [data.id, bump]);

  const handleUnlinkStatus = useCallback((statusId: string) => {
    linkStatusToOperator(statusId, undefined);
    bump();
  }, [bump]);

  const handleNewStatus = useCallback(() => {
    const status = getDefaultCustomOperatorStatus();
    status.operatorId = data.id;
    createCustomOperatorStatus(status);
    bump();
  }, [data.id, bump]);

  // ── Talent link handlers ─────────────────────────────────────────────────
  const handleLinkTalent = useCallback((talentId: string) => {
    linkTalentToOperator(talentId, data.id);
    bump();
  }, [data.id, bump]);

  const handleUnlinkTalent = useCallback((talentId: string) => {
    linkTalentToOperator(talentId, undefined);
    bump();
  }, [bump]);

  const handleNewTalent = useCallback(() => {
    const talent = getDefaultCustomOperatorTalent();
    talent.operatorId = data.id;
    createCustomOperatorTalent(talent);
    bump();
  }, [data.id, bump]);

  // ── Combo trigger helpers ────────────────────────────────────────────────
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

  // ── Skill count for tab badges ───────────────────────────────────────────
  const skillCountByType = (type: CombatSkillType) => {
    const nounType = COMBAT_TO_NOUN[type];
    const linked = getLinksForSlot(data.id, nounType).length;
    const builtin = baseId ? (buildSkillEntries(baseId, nounType as SkillType) ?? []).length : 0;
    return linked + builtin;
  };

  return (
    <div className="ops-root ops-root--split" style={{ '--op-accent': ELEMENT_COLORS[data.elementType] ?? ELEMENT_COLORS[ElementType.NONE] } as React.CSSProperties}>
      {/* ── LEFT COLUMN: Identity + Stats ── */}
      <div className="ops-split-left">
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
      </div>

      {/* ── RIGHT COLUMN: Category Tabs + Content ── */}
      <div className="ops-split-right">
        {/* Category tabs */}
        <div className="ops-skill-tabs">
          {(['skills', 'potentials', 'talents', 'statuses'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              className={`ops-skill-tab${activeCategory === cat ? ' ops-skill-tab--active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              <span className="ops-skill-tab-label">{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
            </button>
          ))}
        </div>

        {/* ─── SKILLS TAB ────────────────────────────────────────── */}
        {activeCategory === 'skills' && (
          <>
            {/* Skill sub-tabs */}
            <div className="ops-skill-tabs ops-skill-tabs--sub">
              {SKILL_TYPE_ORDER.map((type) => {
                const count = skillCountByType(type);
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

            {/* Builtin skills (readonly) */}
            {builtinSkillEntries.length > 0 && (
              <div className="ops-builtin-section">
                <span className="ops-builtin-label">Base</span>
                {builtinSkillEntries.map((entry, i) => {
                  const isOpen = openBuiltinSkills.has(i);
                  const desc = entry.data?.properties?.description as string | undefined;
                  return (
                    <div key={entry.id} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
                      <div className="ops-skill-card-header" onClick={() => setOpenBuiltinSkills((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
                        <div className="ops-skill-card-header-content">
                          <div className="ops-skill-card-title-row">
                            <span className="ops-skill-card-index">{i + 1}</span>
                            <span className="ops-skill-card-name">{entry.label}</span>
                            <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                          </div>
                          {desc && <span className="ops-skill-card-desc">{desc}</span>}
                        </div>
                      </div>
                      {isOpen && <DataCardBody data={entry.data as unknown as Record<string, unknown>} />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Linked custom skills */}
            {linkedSkills.length > 0 && (
              <div className="ops-linked-section">
                <span className="ops-builtin-label">Custom</span>
                {linkedSkills.map((skill) => (
                  <EditableEntityCard
                    key={skill.id}
                    name={skill.name || 'Untitled Skill'}
                    meta={skill.element ?? data.elementType}
                    isOpen={openCustomIds.has(skill.id)}
                    onToggle={() => toggleCustom(skill.id)}
                    onUnlink={() => handleUnlinkSkill(skill.id)}
                  >
                    <SkillSection
                      data={skill}
                      onChange={(updated) => { updateCustomSkill(skill.id, updated); bump(); }}
                    />
                  </EditableEntityCard>
                ))}
              </div>
            )}

            {builtinSkillEntries.length === 0 && linkedSkills.length === 0 && (
              <div className="ops-empty">No {SKILL_TAB_LABELS[activeSkillType]?.toLowerCase()} skills</div>
            )}

            {/* Link picker */}
            <LinkPicker
              items={availableSkills}
              onLink={handleLinkSkill}
              onCreate={handleNewSkill}
              placeholder={`Link ${SKILL_TAB_LABELS[activeSkillType]} skill...`}
            />
          </>
        )}

        {/* ─── POTENTIALS TAB ────────────────────────────────────── */}
        {activeCategory === 'potentials' && (
          <>
            {/* Builtin potentials (readonly) */}
            {builtinPotentials.length > 0 && (
              <div className="ops-builtin-section">
                <span className="ops-builtin-label">Base</span>
                {builtinPotentials.map((pot, i) => {
                  const potTyped = pot as { level?: number; name?: string; description?: string };
                  const isOpen = openBuiltinPotentials.has(i);
                  return (
                    <div key={i} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
                      <div className="ops-skill-card-header" onClick={() => setOpenBuiltinPotentials((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
                        <div className="ops-skill-card-header-content">
                          <div className="ops-skill-card-title-row">
                            <span className="ops-skill-card-index">P{potTyped.level ?? i + 1}</span>
                            <span className="ops-skill-card-name">{potTyped.name ?? `Potential ${i + 1}`}</span>
                            <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                          </div>
                          {potTyped.description && <span className="ops-skill-card-desc">{potTyped.description}</span>}
                        </div>
                      </div>
                      {isOpen && <DataCardBody data={pot as Record<string, unknown>} />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Inline custom potentials */}
            {data.potentials.length > 0 && (
              <div className="ops-linked-section">
                <span className="ops-builtin-label">Custom</span>
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
              </div>
            )}

            {builtinPotentials.length === 0 && data.potentials.length === 0 && (
              <div className="ops-empty">No potentials</div>
            )}

            {data.potentials.length < 5 && (
              <div className="ops-link-picker">
                <button className="ops-link-picker-btn ops-link-picker-btn--new" onClick={() => update({ potentials: [...data.potentials, { level: nextPotentialLevel(), type: '', description: '' }] })}>
                  + New Potential
                </button>
              </div>
            )}
          </>
        )}

        {/* ─── TALENTS TAB ──────────────────────────────────────── */}
        {activeCategory === 'talents' && (
          <>
            {/* Builtin talents (readonly) */}
            {builtinTalents.length > 0 && (
              <div className="ops-builtin-section">
                <span className="ops-builtin-label">Base</span>
                {builtinTalents.map((s, i) => {
                  const props = s.properties as Record<string, unknown>;
                  const name = (props.name as string) ?? (props.id as string) ?? `Talent ${i + 1}`;
                  const desc = props.description as string | undefined;
                  const isOpen = openBuiltinTalents.has(i);
                  return (
                    <div key={i} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
                      <div className="ops-skill-card-header" onClick={() => setOpenBuiltinTalents((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
                        <div className="ops-skill-card-header-content">
                          <div className="ops-skill-card-title-row">
                            <span className="ops-skill-card-index">T{i + 1}</span>
                            <span className="ops-skill-card-name">{name}</span>
                            <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                          </div>
                          {desc && <span className="ops-skill-card-desc">{desc}</span>}
                        </div>
                      </div>
                      {isOpen && <DataCardBody data={s} />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Linked custom talents */}
            {linkedTalents.length > 0 && (
              <div className="ops-linked-section">
                <span className="ops-builtin-label">Custom</span>
                {linkedTalents.map((talent) => (
                  <EditableEntityCard
                    key={talent.id}
                    name={talent.name || 'Untitled Talent'}
                    meta={`Slot ${talent.slot}`}
                    isOpen={openCustomIds.has(talent.id)}
                    onToggle={() => toggleCustom(talent.id)}
                    onUnlink={() => handleUnlinkTalent(talent.id)}
                  >
                    <OperatorTalentSection
                      data={talent}
                      onChange={(updated) => { updateCustomOperatorTalent(talent.id, updated); bump(); }}
                    />
                  </EditableEntityCard>
                ))}
              </div>
            )}

            {builtinTalents.length === 0 && linkedTalents.length === 0 && (
              <div className="ops-empty">No talents</div>
            )}

            <LinkPicker
              items={availableTalents}
              onLink={handleLinkTalent}
              onCreate={handleNewTalent}
              placeholder="Link talent..."
            />
          </>
        )}

        {/* ─── STATUSES TAB ──────────────────────────────────────── */}
        {activeCategory === 'statuses' && (
          <>
            {/* Builtin statuses (readonly) */}
            {builtinStatuses.length > 0 && (
              <div className="ops-builtin-section">
                <span className="ops-builtin-label">Base</span>
                {builtinStatuses.map((s, i) => {
                  const props = s.properties as Record<string, unknown>;
                  const name = (props.name as string) ?? (props.id as string) ?? `Status ${i + 1}`;
                  const desc = props.description as string | undefined;
                  const isOpen = openBuiltinStatuses.has(i);
                  return (
                    <div key={i} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
                      <div className="ops-skill-card-header" onClick={() => setOpenBuiltinStatuses((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
                        <div className="ops-skill-card-header-content">
                          <div className="ops-skill-card-title-row">
                            <span className="ops-skill-card-index">{i + 1}</span>
                            <span className="ops-skill-card-name">{name}</span>
                            <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                          </div>
                          {desc && <span className="ops-skill-card-desc">{desc}</span>}
                        </div>
                      </div>
                      {isOpen && <DataCardBody data={s} />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Linked custom statuses */}
            {linkedStatuses.length > 0 && (
              <div className="ops-linked-section">
                <span className="ops-builtin-label">Custom</span>
                {linkedStatuses.map((status) => (
                  <EditableEntityCard
                    key={status.id}
                    name={status.name || 'Untitled Status'}
                    meta={status.statusEvent?.element}
                    isOpen={openCustomIds.has(status.id)}
                    onToggle={() => toggleCustom(status.id)}
                    onUnlink={() => handleUnlinkStatus(status.id)}
                  >
                    <OperatorStatusSection
                      data={status}
                      onChange={(updated) => { updateCustomOperatorStatus(status.id, updated); bump(); }}
                    />
                  </EditableEntityCard>
                ))}
              </div>
            )}

            {builtinStatuses.length === 0 && linkedStatuses.length === 0 && (
              <div className="ops-empty">No statuses</div>
            )}

            <LinkPicker
              items={availableStatuses}
              onLink={handleLinkStatus}
              onCreate={handleNewStatus}
              placeholder="Link status..."
            />
          </>
        )}
      </div>
    </div>
  );
}
