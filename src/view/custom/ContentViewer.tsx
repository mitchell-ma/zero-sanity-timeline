/**
 * Read-only full-page viewer for built-in game content.
 * Shows all data fields and triggered effects expressed as SVO text.
 */
import { useState, useCallback } from 'react';
import { ContentCategory, ContentSelection } from '../../consts/contentBrowserTypes';
import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { WEAPONS, GEARS } from '../../utils/loadoutRegistry';
import { WEAPON_DATA } from '../../model/weapons/weaponData';
import { WEAPON_SKILL_EFFECTS } from '../../consts/weaponSkillEffects';
import { GEAR_SET_EFFECTS } from '../../consts/gearSetEffects';
import { COMBAT_SKILL_LABELS } from '../../consts/timelineColumnLabels';
import { triggerConditionToInteraction } from '../../controller/custom/bridgeUtils';
import { getOperatorJson } from '../../model/event-frames/operatorJsonLoader';
import type { CombatSkillsType, TriggerConditionType } from '../../consts/enums';
import type { SkillType } from '../../consts/viewTypes';
import type { Interaction, Effect } from '../../consts/semantics';

interface Props {
  selection: ContentSelection;
  onCloneAsCustom: () => void;
}

/** Navigation callback to drill into a referenced item. */
type NavigateFn = (sel: ContentSelection) => void;

function interactionToText(i: Interaction): string {
  const parts: string[] = [];
  parts.push(i.subjectType.replace(/_/g, ' '));
  if (i.subjectProperty) parts.push(`'s ${i.subjectProperty.replace(/_/g, ' ')}`);
  if (i.negated) parts.push('NOT');
  parts.push(i.verbType.replace(/_/g, ' '));
  parts.push(i.objectType.replace(/_/g, ' '));
  if (i.objectId) parts.push(`(${i.objectId})`);
  if (i.cardinalityConstraint && i.cardinality != null) {
    parts.push(`${i.cardinalityConstraint.replace(/_/g, ' ')} ${i.cardinality}`);
  }
  if (i.element) parts.push(`[${i.element}]`);
  return parts.join(' ');
}

function effectToText(e: Effect): string {
  const parts: string[] = [];
  parts.push(e.verbType.replace(/_/g, ' '));
  if (e.cardinality != null) parts.push(String(e.cardinality));
  if (e.adjective) {
    const adjs = Array.isArray(e.adjective) ? e.adjective : [e.adjective];
    parts.push(adjs.map((a) => a.replace(/_/g, ' ')).join(' '));
  }
  if (e.objectType) parts.push(e.objectType.replace(/_/g, ' '));
  if (e.objectId) parts.push(`(${e.objectId})`);
  if (e.element) parts.push(`[${e.element}]`);
  if (e.toObjectType) parts.push(`TO ${String(e.toObjectType).replace(/_/g, ' ')}`);
  if (e.fromObjectType) parts.push(`FROM ${String(e.fromObjectType).replace(/_/g, ' ')}`);
  if (e.forDuration != null) parts.push(`FOR ${e.forDuration}s`);
  if (e.onObjectType) parts.push(`ON ${String(e.onObjectType).replace(/_/g, ' ')}`);
  if (e.cardinalityConstraint) parts.push(e.cardinalityConstraint.replace(/_/g, ' '));
  if (e.withMultiplier) parts.push(`WITH × [${e.withMultiplier.slice(0, 3).join(', ')}${e.withMultiplier.length > 3 ? '...' : ''}]`);
  return parts.join(' ');
}

function triggerText(tc: TriggerConditionType): string {
  return interactionToText(triggerConditionToInteraction(tc));
}

function starStr(n: number): string { return `${n}\u2605`; }

export default function ContentViewer({ selection, onCloneAsCustom }: Props) {
  const [navStack, setNavStack] = useState<ContentSelection[]>([]);
  const current = navStack.length > 0 ? navStack[navStack.length - 1] : selection;

  const navigate = useCallback((sel: ContentSelection) => {
    setNavStack((prev) => [...prev, sel]);
  }, []);

  const goBack = useCallback(() => {
    setNavStack((prev) => prev.slice(0, -1));
  }, []);

  // Reset stack when the external selection changes
  const [lastExternalId, setLastExternalId] = useState(selection.id);
  if (selection.id !== lastExternalId) {
    setLastExternalId(selection.id);
    setNavStack([]);
  }

  return (
    <div className="content-viewer">
      <div className="content-viewer-toolbar">
        {navStack.length > 0 && (
          <button className="btn-back cv-back-btn" onClick={goBack}>
            Back
          </button>
        )}
        <button className="btn-devlog" onClick={onCloneAsCustom}>
          Clone as Custom
        </button>
      </div>
      <div className="content-viewer-body">
        {current.category === ContentCategory.OPERATORS && <OperatorView id={current.id} navigate={navigate} />}
        {current.category === ContentCategory.SKILLS && <SkillView id={current.id} navigate={navigate} />}
        {current.category === ContentCategory.TALENTS && <TalentView id={current.id} />}
        {current.category === ContentCategory.WEAPONS && <WeaponView id={current.id} navigate={navigate} />}
        {current.category === ContentCategory.GEAR_SETS && <GearSetView id={current.id} navigate={navigate} />}
        {current.category === ContentCategory.WEAPON_EFFECTS && <WeaponEffectView id={current.id} />}
        {current.category === ContentCategory.GEAR_EFFECTS && <GearEffectView id={current.id} />}
      </div>
    </div>
  );
}

function OperatorView({ id, navigate }: { id: string; navigate: NavigateFn }) {
  const op = ALL_OPERATORS.find((o) => o.id === id);
  if (!op) return <div className="content-viewer-empty">Operator not found</div>;

  const SKILL_TYPE_LABELS: Record<string, string> = {
    basic: 'Basic Attack',
    battle: 'Battle Skill',
    combo: 'Combo Skill',
    ultimate: 'Ultimate',
  };

  const viewSkill = (key: string) => navigate({
    id: `skill:${id}:${key}`,
    category: ContentCategory.SKILLS,
    source: 'builtin',
  });

  const viewTalent = (slot: number) => navigate({
    id: `talent:${id}:${slot}`,
    category: ContentCategory.TALENTS,
    source: 'builtin',
  });

  const viewWeapon = (name: string) => {
    if (WEAPONS.find((w) => w.name === name)) {
      navigate({ id: name, category: ContentCategory.WEAPONS, source: 'builtin' });
    }
  };

  const viewGearSet = (pieceName: string) => {
    const gear = GEARS.find((g) => g.name === pieceName);
    if (gear) navigate({ id: gear.gearSetType, category: ContentCategory.GEAR_SETS, source: 'builtin' });
  };

  return (
    <>
      <h2 className="cv-title" style={{ color: op.color }}>{op.name}</h2>
      <div className="cv-field-grid">
        <Field label="Rarity" value={starStr(op.rarity)} />
        <Field label="Role" value={op.role} />
        <Field label="Element" value={op.element} />
        <Field label="Weapon Types" value={op.weaponTypes.join(', ')} />
        <Field label="Ultimate Energy" value={String(op.ultimateEnergyCost)} />
      </div>

      <Section title="Default Loadout">
        <div className="cv-field-grid">
          <FieldWithNav label="Weapon" value={op.weapon} onView={() => viewWeapon(op.weapon)} />
          <FieldWithNav label="Armor" value={op.armor} onView={() => viewGearSet(op.armor)} />
          <FieldWithNav label="Gloves" value={op.gloves} onView={() => viewGearSet(op.gloves)} />
          <FieldWithNav label="Kit 1" value={op.kit1} onView={() => viewGearSet(op.kit1)} />
          <FieldWithNav label="Kit 2" value={op.kit2} onView={() => viewGearSet(op.kit2)} />
          <Field label="Food" value={op.food} />
          <Field label="Tactical" value={op.tactical} />
        </div>
      </Section>

      <Section title="Skills">
        {Object.entries(op.skills).map(([key, skill]) => (
          <div key={key} className="cv-effect-card">
            <div className="cv-effect-card-header">
              <div className="cv-effect-name">{skill.name || key}</div>
              <button className="cv-view-btn" onClick={() => viewSkill(key)}>View</button>
            </div>
            <div className="cv-skill-type-badge">{SKILL_TYPE_LABELS[key] ?? key}</div>
            {skill.description && <div className="cv-effect-desc">{skill.description}</div>}
            <div className="cv-field-grid">
              {skill.element && <Field label="Element" value={skill.element} />}
              <Field label="Activation" value={`${skill.defaultActivationDuration}f`} />
              <Field label="Active" value={`${skill.defaultActiveDuration}f`} />
              <Field label="Cooldown" value={`${skill.defaultCooldownDuration}f`} />
              {skill.animationDuration != null && <Field label="Animation" value={`${skill.animationDuration}f`} />}
              {skill.skillPointCost != null && <Field label="SP Cost" value={String(skill.skillPointCost)} />}
              {skill.gaugeGain != null && <Field label="Gauge Gain" value={String(skill.gaugeGain)} />}
              {skill.teamGaugeGain != null && <Field label="Team Gauge" value={String(skill.teamGaugeGain)} />}
            </div>
            {skill.gaugeGainByEnemies && (
              <div className="cv-field-grid" style={{ marginTop: '0.25rem' }}>
                {Object.entries(skill.gaugeGainByEnemies).map(([count, gain]) => (
                  <Field key={count} label={`Gauge (${count} enemy)`} value={String(gain)} />
                ))}
              </div>
            )}
            {skill.publishesTriggers && skill.publishesTriggers.length > 0 && (
              <div className="cv-triggers">
                <span className="cv-label">Publishes:</span>
                {skill.publishesTriggers.map((t, j) => (
                  <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
                ))}
              </div>
            )}
            {skill.triggerCondition && (
              <div className="cv-triggers">
                <span className="cv-label">Trigger:</span>
                <code className="cv-trigger-tag">{skill.triggerCondition}</code>
              </div>
            )}
            {skill.spReturnNotes && skill.spReturnNotes.length > 0 && (
              <div className="cv-note">{skill.spReturnNotes.join(' · ')}</div>
            )}
          </div>
        ))}
      </Section>

      <Section title="Talents">
        <div className="cv-effect-card">
          <div className="cv-effect-card-header">
            <div className="cv-effect-name">{op.talentOneName || 'Talent 1'}</div>
            <button className="cv-view-btn" onClick={() => viewTalent(1)}>View</button>
          </div>
          <Field label="Max Level" value={String(op.maxTalentOneLevel)} />
          {op.talentDescriptions?.[1]?.map((desc, i) => (
            <div key={i} className="cv-talent-level">
              <span className="cv-talent-level-num">Lv{i + 1}</span>
              <span className="cv-talent-level-desc">{desc}</span>
            </div>
          ))}
        </div>
        <div className="cv-effect-card">
          <div className="cv-effect-card-header">
            <div className="cv-effect-name">{op.talentTwoName || 'Talent 2'}</div>
            <button className="cv-view-btn" onClick={() => viewTalent(2)}>View</button>
          </div>
          <Field label="Max Level" value={String(op.maxTalentTwoLevel)} />
          {op.talentDescriptions?.[2]?.map((desc, i) => (
            <div key={i} className="cv-talent-level">
              <span className="cv-talent-level-num">Lv{i + 1}</span>
              <span className="cv-talent-level-desc">{desc}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Attribute Increase">
        <div className="cv-field-grid">
          <Field label="Name" value={op.attributeIncreaseName} />
          <Field label="Attribute" value={op.attributeIncreaseAttribute} />
          <Field label="Max Level" value={String(op.maxAttributeIncreaseLevel)} />
        </div>
      </Section>

      {op.triggerCapability && (
        <Section title="Combo Trigger">
          <div className="cv-effect-card">
            <div className="cv-effect-desc">{op.triggerCapability.comboDescription}</div>
            <Field label="Window" value={`${op.triggerCapability.comboWindowFrames}f (${(op.triggerCapability.comboWindowFrames / 120).toFixed(1)}s)`} />
            {op.triggerCapability.comboRequires.length > 0 && (
              <div className="cv-triggers">
                <span className="cv-label">Requires:</span>
                {op.triggerCapability.comboRequires.map((t, j) => (
                  <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {op.potentialDescriptions && op.potentialDescriptions.length > 0 && (
        <Section title="Potentials">
          {op.potentialDescriptions.map((desc, i) => (
            <div key={i} className="cv-talent-level">
              <span className="cv-talent-level-num">P{i + 1}</span>
              <span className="cv-talent-level-desc">{desc}</span>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

function WeaponView({ id, navigate }: { id: string; navigate: NavigateFn }) {
  const entry = WEAPONS.find((w) => w.name === id);
  const config = WEAPON_DATA[id];
  const effects = WEAPON_SKILL_EFFECTS.find((e) => e.weaponName === id);

  if (!entry || !config) return <div className="content-viewer-empty">Weapon not found</div>;

  const viewWeaponEffect = () => {
    if (effects) navigate({ id: `wse:${id}`, category: ContentCategory.WEAPON_EFFECTS, source: 'builtin' });
  };

  return (
    <>
      <h2 className="cv-title">{entry.name}</h2>
      <div className="cv-field-grid">
        <Field label="Rarity" value={starStr(entry.rarity)} />
        <Field label="Type" value={config.type.replace(/_/g, ' ')} />
        <Field label="Base ATK (Lv1)" value={String(config.baseAtk.lv1)} />
        <Field label="Base ATK (Lv90)" value={String(config.baseAtk.lv90)} />
      </div>

      <Section title="Skills">
        <div className="cv-subsection">
          <Field label="Skill 1" value={config.skill1.replace(/_/g, ' ')} />
          <Field label="Skill 2" value={config.skill2.replace(/_/g, ' ')} />
          {config.skill3 && <Field label="Skill 3" value={config.skill3.replace(/_/g, ' ')} />}
        </div>
      </Section>

      {effects && (
        <SectionWithNav title="Triggered Effects" onView={viewWeaponEffect}>
          {effects.effects.map((eff, i) => (
            <div key={i} className="cv-effect-card">
              <div className="cv-effect-name">{eff.label}</div>
              {eff.description && <div className="cv-effect-desc">{eff.description}</div>}
              <div className="cv-field-grid">
                <Field label="Target" value={eff.target} />
                <Field label="Duration" value={`${eff.durationSeconds}s`} />
                <Field label="Max Stacks" value={String(eff.maxStacks)} />
                {eff.cooldownSeconds > 0 && <Field label="Cooldown" value={`${eff.cooldownSeconds}s`} />}
              </div>
              <div className="cv-triggers">
                <span className="cv-label">Triggers:</span>
                {eff.triggers.map((t, j) => (
                  <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
                ))}
              </div>
              {eff.buffs.length > 0 && (
                <div className="cv-buffs">
                  <span className="cv-label">Buffs:</span>
                  {eff.buffs.map((b, j) => (
                    <span key={j} className="cv-buff-tag">
                      {b.stat} {b.valueMin}\u2013{b.valueMax}{b.perStack ? ' /stack' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </SectionWithNav>
      )}
    </>
  );
}

function GearSetView({ id, navigate }: { id: string; navigate: NavigateFn }) {
  const pieces = GEARS.filter((g) => g.gearSetType === id);
  const effects = GEAR_SET_EFFECTS.find((e) => e.gearSetType === id);

  const viewGearEffect = () => {
    navigate({ id: `gse:${id}`, category: ContentCategory.GEAR_EFFECTS, source: 'builtin' });
  };

  if (pieces.length === 0) return <div className="content-viewer-empty">Gear set not found</div>;

  return (
    <>
      <h2 className="cv-title">{effects?.label ?? id}</h2>
      <Section title={`Pieces (${pieces.length})`}>
        {pieces.map((p) => (
          <div key={p.name} className="cv-subsection">
            <span className="cv-piece-name">{p.name}</span>
            <span className="cv-piece-meta">{starStr(p.rarity)} {p.gearCategory}</span>
          </div>
        ))}
      </Section>

      {effects && (
        <>
          {Object.keys(effects.passiveStats).length > 0 && (
            <Section title="Passive Stats (3-piece)">
              <div className="cv-field-grid">
                {Object.entries(effects.passiveStats).map(([stat, val]) => (
                  <Field key={stat} label={stat.replace(/_/g, ' ')} value={String(val)} />
                ))}
              </div>
            </Section>
          )}

          {effects.effects.length > 0 && (
            <SectionWithNav title="Triggered Effects" onView={viewGearEffect}>
              {effects.effects.map((eff, i) => (
                <div key={i} className="cv-effect-card">
                  <div className="cv-effect-name">{eff.label}</div>
                  <div className="cv-field-grid">
                    <Field label="Target" value={eff.target} />
                    <Field label="Duration" value={`${eff.durationSeconds}s`} />
                    <Field label="Max Stacks" value={String(eff.maxStacks)} />
                    {eff.cooldownSeconds > 0 && <Field label="Cooldown" value={`${eff.cooldownSeconds}s`} />}
                  </div>
                  <div className="cv-triggers">
                    <span className="cv-label">Triggers:</span>
                    {eff.triggers.map((t, j) => (
                      <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
                    ))}
                  </div>
                  {eff.buffs.length > 0 && (
                    <div className="cv-buffs">
                      <span className="cv-label">Buffs:</span>
                      {eff.buffs.map((b, j) => (
                        <span key={j} className="cv-buff-tag">
                          {b.stat} {b.value}{b.perStack ? ' /stack' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </SectionWithNav>
          )}
        </>
      )}
    </>
  );
}

function WeaponEffectView({ id }: { id: string }) {
  const weaponName = id.replace(/^wse:/, '');
  const entry = WEAPON_SKILL_EFFECTS.find((e) => e.weaponName === weaponName);
  if (!entry) return <div className="content-viewer-empty">Weapon effect not found</div>;

  return (
    <>
      <h2 className="cv-title">{entry.weaponName}</h2>
      {entry.effects.map((eff, i) => (
        <div key={i} className="cv-effect-card">
          <div className="cv-effect-name">{eff.label}</div>
          {eff.description && <div className="cv-effect-desc">{eff.description}</div>}
          <div className="cv-field-grid">
            <Field label="Skill Key" value={eff.skillKey.replace(/_/g, ' ')} />
            <Field label="Target" value={eff.target} />
            <Field label="Duration" value={`${eff.durationSeconds}s`} />
            <Field label="Max Stacks" value={String(eff.maxStacks)} />
            {eff.cooldownSeconds > 0 && <Field label="Cooldown" value={`${eff.cooldownSeconds}s`} />}
          </div>
          <div className="cv-triggers">
            <span className="cv-label">Triggers:</span>
            {eff.triggers.map((t, j) => (
              <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
            ))}
          </div>
          {eff.buffs.length > 0 && (
            <div className="cv-buffs">
              <span className="cv-label">Buffs:</span>
              {eff.buffs.map((b, j) => (
                <span key={j} className="cv-buff-tag">
                  {b.stat} {b.valueMin}\u2013{b.valueMax}{b.perStack ? ' /stack' : ''}
                </span>
              ))}
            </div>
          )}
          {eff.note && <div className="cv-note">{eff.note}</div>}
        </div>
      ))}
    </>
  );
}

function GearEffectView({ id }: { id: string }) {
  const gearSetType = id.replace(/^gse:/, '');
  const entry = GEAR_SET_EFFECTS.find((e) => e.gearSetType === gearSetType);
  if (!entry) return <div className="content-viewer-empty">Gear effect not found</div>;

  return (
    <>
      <h2 className="cv-title">{entry.label}</h2>

      {Object.keys(entry.passiveStats).length > 0 && (
        <Section title="Passive Stats">
          <div className="cv-field-grid">
            {Object.entries(entry.passiveStats).map(([stat, val]) => (
              <Field key={stat} label={stat.replace(/_/g, ' ')} value={String(val)} />
            ))}
          </div>
        </Section>
      )}

      {entry.effects.length > 0 && (
        <Section title="Triggered Effects">
          {entry.effects.map((eff, i) => (
            <div key={i} className="cv-effect-card">
              <div className="cv-effect-name">{eff.label}</div>
              <div className="cv-field-grid">
                <Field label="Target" value={eff.target} />
                <Field label="Duration" value={`${eff.durationSeconds}s`} />
                <Field label="Max Stacks" value={String(eff.maxStacks)} />
                {eff.cooldownSeconds > 0 && <Field label="Cooldown" value={`${eff.cooldownSeconds}s`} />}
              </div>
              <div className="cv-triggers">
                <span className="cv-label">Triggers:</span>
                {eff.triggers.map((t, j) => (
                  <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
                ))}
              </div>
              {eff.buffs.length > 0 && (
                <div className="cv-buffs">
                  <span className="cv-label">Buffs:</span>
                  {eff.buffs.map((b, j) => (
                    <span key={j} className="cv-buff-tag">
                      {b.stat} {b.value}{b.perStack ? ' /stack' : ''}
                    </span>
                  ))}
                </div>
              )}
              {eff.note && <div className="cv-note">{eff.note}</div>}
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

const SKILL_TYPE_TO_JSON_KEY: Record<string, string> = {
  basic: 'BASIC_ATTACK', battle: 'BATTLE_SKILL', combo: 'COMBO_SKILL', ultimate: 'ULTIMATE',
};

function SkillView({ id, navigate }: { id: string; navigate: NavigateFn }) {
  // id format: "skill:{operatorId}:{skillType}"
  const parts = id.split(':');
  const opId = parts[1];
  const skillType = parts[2] as SkillType;
  const op = ALL_OPERATORS.find((o) => o.id === opId);
  const skill = op?.skills[skillType];
  if (!op || !skill) return <div className="content-viewer-empty">Skill not found</div>;

  const SKILL_TYPE_LABELS: Record<string, string> = {
    basic: 'Basic Attack', battle: 'Battle Skill', combo: 'Combo Skill', ultimate: 'Ultimate',
  };
  const skillName = skill.name as CombatSkillsType;
  const label = COMBAT_SKILL_LABELS[skillName] || skill.name;

  const viewOperator = () => navigate({ id: opId, category: ContentCategory.OPERATORS, source: 'builtin' });

  // Load raw JSON data for this skill
  const opJson = getOperatorJson(opId);
  const jsonKey = SKILL_TYPE_TO_JSON_KEY[skillType];
  const skillJson = opJson?.skills?.[jsonKey] as Record<string, any> | undefined;

  // Also find all variants (ENHANCED_, EMPOWERED_, etc.)
  const variants: { key: string; data: Record<string, any> }[] = [];
  if (opJson?.skills) {
    for (const [k, v] of Object.entries(opJson.skills)) {
      if (k !== jsonKey && k.includes(jsonKey)) {
        variants.push({ key: k, data: v as Record<string, any> });
      }
    }
  }

  // Find related status events
  const statusEvents: Record<string, any>[] = opJson?.statusEvents ?? [];

  return (
    <>
      <h2 className="cv-title" style={{ color: op.color }}>{label}</h2>
      <div className="cv-skill-type-badge">{SKILL_TYPE_LABELS[skillType] ?? skillType}</div>
      <div className="cv-field-grid" style={{ marginTop: '0.5rem' }}>
        <FieldWithNav label="Operator" value={op.name} onView={viewOperator} />
        <Field label="Skill Key" value={skill.name} />
        {skill.element && <Field label="Element" value={skill.element} />}
      </div>

      {skill.description && (
        <Section title="Description">
          <div className="cv-effect-desc">{skill.description}</div>
        </Section>
      )}

      <Section title="Timings">
        <div className="cv-field-grid">
          <Field label="Activation" value={`${skill.defaultActivationDuration}f (${(skill.defaultActivationDuration / 120).toFixed(2)}s)`} />
          <Field label="Active" value={`${skill.defaultActiveDuration}f (${(skill.defaultActiveDuration / 120).toFixed(2)}s)`} />
          <Field label="Cooldown" value={`${skill.defaultCooldownDuration}f (${(skill.defaultCooldownDuration / 120).toFixed(2)}s)`} />
          {skill.animationDuration != null && (
            <Field label="Animation" value={`${skill.animationDuration}f (${(skill.animationDuration / 120).toFixed(2)}s)`} />
          )}
        </div>
      </Section>

      <Section title="Resources">
        <div className="cv-field-grid">
          {skill.skillPointCost != null && <Field label="SP Cost" value={String(skill.skillPointCost)} />}
          {skill.gaugeGain != null && <Field label="Gauge Gain" value={String(skill.gaugeGain)} />}
          {skill.teamGaugeGain != null && <Field label="Team Gauge" value={String(skill.teamGaugeGain)} />}
        </div>
        {skill.gaugeGainByEnemies && (
          <div className="cv-field-grid" style={{ marginTop: '0.25rem' }}>
            {Object.entries(skill.gaugeGainByEnemies).map(([count, gain]) => (
              <Field key={count} label={`Gauge (${count} enemy)`} value={String(gain)} />
            ))}
          </div>
        )}
      </Section>

      {/* DSL Effects from JSON */}
      {skillJson?.effects && Array.isArray(skillJson.effects) && skillJson.effects.length > 0 && (
        <Section title="Effects (DSL)">
          <div className="cv-triggers">
            {(skillJson.effects as Effect[]).map((eff, i) => (
              <code key={i} className="cv-trigger-tag">{effectToText(eff)}</code>
            ))}
          </div>
        </Section>
      )}

      {/* Activation Clause from JSON */}
      {skillJson?.clause && Array.isArray(skillJson.clause) && skillJson.clause.length > 0 && (
        <Section title="Activation Clause">
          {(skillJson.clause as any[]).map((pred, pi) => (
            <div key={pi} className="cv-effect-card">
              {pi > 0 && <div className="cv-clause-or">OR</div>}
              <div className="cv-clause-conditions">
                <span className="cv-label">When ALL:</span>
                {(pred.conditions ?? []).map((c: Interaction, ci: number) => (
                  <code key={ci} className="cv-trigger-tag">{interactionToText(c)}</code>
                ))}
              </div>
              {pred.effects && pred.effects.length > 0 && (
                <div className="cv-clause-effects">
                  <span className="cv-label">Then:</span>
                  {pred.effects.map((e: Effect, ei: number) => (
                    <code key={ei} className="cv-trigger-tag">{effectToText(e)}</code>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Segments from JSON */}
      {skillJson?.segments && Array.isArray(skillJson.segments) && (
        <Section title={`Segments (${skillJson.segments.length})`}>
          {(skillJson.segments as any[]).map((seg, si) => (
            <SegmentView key={si} index={si} segment={seg} />
          ))}
        </Section>
      )}

      {/* Frames from JSON (non-segmented skills) */}
      {skillJson?.frames && Array.isArray(skillJson.frames) && !skillJson.segments && (
        <Section title={`Frames (${skillJson.frames.length})`}>
          {(skillJson.frames as any[]).map((frame, fi) => (
            <FrameView key={fi} index={fi} frame={frame} />
          ))}
        </Section>
      )}

      {skill.publishesTriggers && skill.publishesTriggers.length > 0 && (
        <Section title="Publishes Triggers">
          <div className="cv-triggers">
            {skill.publishesTriggers.map((t, j) => (
              <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
            ))}
          </div>
        </Section>
      )}

      {skill.triggerCondition && (
        <Section title="Trigger Condition">
          <code className="cv-trigger-tag">{skill.triggerCondition}</code>
        </Section>
      )}

      {skill.spReturnNotes && skill.spReturnNotes.length > 0 && (
        <Section title="SP Return Notes">
          {skill.spReturnNotes.map((note, i) => (
            <div key={i} className="cv-note">{note}</div>
          ))}
        </Section>
      )}

      {/* Skill Variants */}
      {variants.length > 0 && (
        <Section title="Variants">
          {variants.map((v) => (
            <VariantView key={v.key} variantKey={v.key} data={v.data} />
          ))}
        </Section>
      )}

      {/* Related Status Events */}
      {statusEvents.length > 0 && (
        <Section title="Operator Status Events">
          {statusEvents.map((se, i) => (
            <StatusEventView key={i} data={se} />
          ))}
        </Section>
      )}
    </>
  );
}

// ── Skill sub-views ──────────────────────────────────────────────────────────

function SegmentView({ index, segment }: { index: number; segment: Record<string, any> }) {
  const dur = segment.duration;
  const durStr = dur ? `${dur.value}${dur.unit === 'FRAME' ? 'f' : 's'}` : '?';
  const frames: any[] = segment.frames ?? [];
  const effects: Effect[] = segment.effects ?? [];
  const stats: any[] = segment.stats ?? [];

  return (
    <div className="cv-effect-card">
      <div className="cv-effect-name">
        {segment.name ? `${index + 1}. ${segment.name}` : `Segment ${index + 1}`}
        <span className="cv-inline-meta"> — {durStr}</span>
      </div>
      {segment.experience && <Field label="Time Dependency" value={segment.experience} />}
      {effects.length > 0 && (
        <div className="cv-triggers">
          <span className="cv-label">Effects:</span>
          {effects.map((e, i) => <code key={i} className="cv-trigger-tag">{effectToText(e)}</code>)}
        </div>
      )}
      {stats.length > 0 && (
        <div className="cv-field-grid">
          {stats.map((s: any, i: number) => (
            <Field key={i} label={s.statType} value={Array.isArray(s.value) ? s.value.join(', ') : String(s.value)} />
          ))}
        </div>
      )}
      {frames.length > 0 && (
        <div className="cv-frames-list">
          <span className="cv-label">Frames ({frames.length}):</span>
          {frames.map((f: any, fi: number) => <FrameView key={fi} index={fi} frame={f} />)}
        </div>
      )}
    </div>
  );
}

function FrameView({ index, frame }: { index: number; frame: Record<string, any> }) {
  const offset = frame.offset;
  const offsetStr = offset ? `${offset.value}${offset.unit === 'FRAME' ? 'f' : 's'}` : '0';

  // Extract multiplier keys from first level entry (if present)
  const multipliers: any[] = frame.multipliers ?? [];
  const multKeys = multipliers.length > 0 ? Object.keys(multipliers[0]).filter((k) => k !== 'level') : [];

  // Frame-level effects
  const effects: Effect[] = frame.effects ?? [];
  const statusInteractions: Interaction[] = frame.statusInteractions ?? [];

  return (
    <div className="cv-frame-card">
      <div className="cv-frame-header">
        <span className="cv-label">@{offsetStr}</span>
      </div>
      {effects.length > 0 && (
        <div className="cv-triggers">
          {effects.map((e, i) => <code key={i} className="cv-trigger-tag">{effectToText(e)}</code>)}
        </div>
      )}
      {statusInteractions.length > 0 && (
        <div className="cv-triggers">
          <span className="cv-label">Status:</span>
          {statusInteractions.map((si, i) => <code key={i} className="cv-trigger-tag">{interactionToText(si)}</code>)}
        </div>
      )}
      {multKeys.length > 0 && (
        <div className="cv-multiplier-table">
          <table className="cv-mult-table">
            <thead>
              <tr>
                <th>Lv</th>
                {multKeys.map((k) => <th key={k}>{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {multipliers.map((m: any, mi: number) => (
                <tr key={mi}>
                  <td>{m.level}</td>
                  {multKeys.map((k) => <td key={k}>{m[k]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VariantView({ variantKey, data }: { variantKey: string; data: Record<string, any> }) {
  const dur = data.duration;
  const durStr = dur ? (typeof dur === 'number' ? `${dur}s` : `${dur.value}${dur.unit === 'FRAME' ? 'f' : 's'}`) : '';
  const frames: any[] = data.frames ?? [];
  const effects: Effect[] = data.effects ?? [];
  const clause: any[] = data.clause ?? [];

  return (
    <div className="cv-effect-card">
      <div className="cv-effect-name">{variantKey.replace(/_/g, ' ')}</div>
      {durStr && <Field label="Duration" value={durStr} />}
      {clause.length > 0 && (
        <div className="cv-clause-conditions">
          <span className="cv-label">Clause:</span>
          {clause.map((pred: any, pi: number) => (
            <div key={pi}>
              {(pred.conditions ?? []).map((c: Interaction, ci: number) => (
                <code key={ci} className="cv-trigger-tag">{interactionToText(c)}</code>
              ))}
            </div>
          ))}
        </div>
      )}
      {effects.length > 0 && (
        <div className="cv-triggers">
          <span className="cv-label">Effects:</span>
          {effects.map((e, i) => <code key={i} className="cv-trigger-tag">{effectToText(e)}</code>)}
        </div>
      )}
      {frames.length > 0 && <Field label="Frames" value={`${frames.length} frame(s)`} />}
    </div>
  );
}

function StatusEventView({ data }: { data: Record<string, any> }) {
  const stack = data.stack ?? {};
  const maxArr = stack.max ?? [];
  const maxStr = Array.isArray(maxArr) ? maxArr.join('/') : String(maxArr);
  const dur = data.duration;
  const durStr = dur ? (Array.isArray(dur.value) ? dur.value.join(', ') : dur.value) + (dur.unit === 'FRAME' ? 'f' : 's') : '';
  const stats: any[] = data.stats ?? [];
  const triggerClause: any[] = data.triggerClause ?? [];
  const clause: any[] = data.clause ?? [];

  return (
    <div className="cv-effect-card">
      <div className="cv-effect-name">{data.name}</div>
      <div className="cv-field-grid">
        <Field label="Target" value={String(data.target ?? '').replace(/_/g, ' ')} />
        <Field label="Element" value={String(data.element ?? 'NONE')} />
        <Field label="Named" value={data.isNamedEvent ? 'Yes' : 'No'} />
        <Field label="Force Applied" value={data.isForceApplied ? 'Yes' : 'No'} />
        {durStr && <Field label="Duration" value={durStr} />}
      </div>
      <div className="cv-field-grid">
        <Field label="Stack Type" value={String(stack.interactionType ?? 'NONE')} />
        <Field label="Max Stacks" value={maxStr} />
        <Field label="Instances" value={String(stack.instances ?? 1)} />
      </div>

      {triggerClause.length > 0 && (
        <div className="cv-clause-conditions">
          <span className="cv-label">Trigger:</span>
          {triggerClause.map((pred: any, pi: number) => (
            <div key={pi}>
              {(pred.conditions ?? []).map((c: Interaction, ci: number) => (
                <code key={ci} className="cv-trigger-tag">{interactionToText(c)}</code>
              ))}
            </div>
          ))}
        </div>
      )}

      {clause.length > 0 && (
        <div className="cv-clause-conditions">
          <span className="cv-label">Reactions:</span>
          {clause.map((pred: any, pi: number) => (
            <div key={pi} className="cv-effect-card" style={{ padding: '0.25rem' }}>
              <div>
                {(pred.conditions ?? []).map((c: Interaction, ci: number) => (
                  <code key={ci} className="cv-trigger-tag">{interactionToText(c)}</code>
                ))}
              </div>
              {pred.effects && pred.effects.length > 0 && (
                <div>
                  <span className="cv-label">→</span>
                  {pred.effects.map((e: Effect, ei: number) => (
                    <code key={ei} className="cv-trigger-tag">{effectToText(e)}</code>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {stats.length > 0 && (
        <div className="cv-field-grid">
          {stats.map((s: any, i: number) => (
            <Field key={i} label={s.statType} value={Array.isArray(s.value) ? s.value.join(', ') : String(s.value)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TalentView({ id }: { id: string }) {
  // id format: "talent:{operatorId}:{slot}"
  const parts = id.split(':');
  const opId = parts[1];
  const slot = parseInt(parts[2], 10);
  const op = ALL_OPERATORS.find((o) => o.id === opId);
  if (!op) return <div className="content-viewer-empty">Operator not found</div>;

  const talentName = slot === 1 ? op.talentOneName : op.talentTwoName;
  const maxLevel = slot === 1 ? op.maxTalentOneLevel : op.maxTalentTwoLevel;
  const descriptions = op.talentDescriptions?.[slot];

  return (
    <>
      <h2 className="cv-title" style={{ color: op.color }}>{talentName || `Talent ${slot}`}</h2>
      <div className="cv-field-grid">
        <Field label="Operator" value={op.name} />
        <Field label="Slot" value={`Talent ${slot}`} />
        <Field label="Max Level" value={String(maxLevel)} />
      </div>

      {descriptions && descriptions.length > 0 && (
        <Section title="Level Descriptions">
          {descriptions.map((desc, i) => (
            <div key={i} className="cv-talent-level">
              <span className="cv-talent-level-num">Lv{i + 1}</span>
              <span className="cv-talent-level-desc">{desc}</span>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="cv-field">
      <span className="cv-field-label">{label}</span>
      <span className="cv-field-value">{value}</span>
    </div>
  );
}

function FieldWithNav({ label, value, onView }: { label: string; value: string; onView: () => void }) {
  return (
    <div className="cv-field cv-field--nav">
      <span className="cv-field-label">{label}</span>
      <span className="cv-field-value">{value}</span>
      <button className="cv-view-btn cv-view-btn--inline" onClick={onView}>View</button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cv-section">
      <div className="cv-section-title">{title}</div>
      {children}
    </div>
  );
}

function SectionWithNav({ title, children, onView }: { title: string; children: React.ReactNode; onView: () => void }) {
  return (
    <div className="cv-section">
      <div className="cv-section-title cv-section-title--nav">
        <span>{title}</span>
        <button className="cv-view-btn" onClick={onView}>View</button>
      </div>
      {children}
    </div>
  );
}
