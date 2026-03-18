/**
 * Read-only full-page viewer for built-in game content.
 * Shows all data fields and triggered effects expressed as SVO text.
 */
import { useState, useCallback } from 'react';
import { ContentCategory, ContentSelection } from '../../consts/contentBrowserTypes';
import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { WEAPONS, GEARS } from '../../utils/loadoutRegistry';
import { WEAPON_DATA } from '../../model/weapons/weaponData';
import { getWeaponEffectDefs, getGearEffectDefs, resolveTargetDisplay, resolveDurationSeconds, resolveTriggerInteractions } from '../../model/game-data/weaponGearEffectLoader';
import { getGearSetEffects } from '../../consts/gearSetEffects';
import { COMBAT_SKILL_LABELS } from '../../consts/timelineColumnLabels';
import { getOperatorJson } from '../../model/event-frames/operatorJsonLoader';
import type { CombatSkillsType } from '../../consts/enums';
import type { SkillType } from '../../consts/viewTypes';
import type { Interaction, Effect } from '../../consts/semantics';
import { formatSegmentDisplayName } from '../../utils/semanticsTranslation';

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
  if (e.toObjectType) parts.push(`TO ${String(e.toObjectType).replace(/_/g, ' ')}`);
  if (e.fromObjectType) parts.push(`FROM ${String(e.fromObjectType).replace(/_/g, ' ')}`);
  if (e.onObjectType) parts.push(`ON ${String(e.onObjectType).replace(/_/g, ' ')}`);
  if (e.cardinalityConstraint) parts.push(e.cardinalityConstraint.replace(/_/g, ' '));
  if (e.withPreposition) {
    const wp = e.withPreposition;
    const wpParts: string[] = [];
    for (const [k, v] of Object.entries(wp)) {
      const val = typeof v.value === 'number' ? v.value : `[${(v.value as number[]).slice(0, 3).join(', ')}${(v.value as number[]).length > 3 ? '...' : ''}]`;
      wpParts.push(`${k.replace(/_/g, ' ').toUpperCase()} ${val}`);
    }
    if (wpParts.length) parts.push(`WITH ${wpParts.join(', ')}`);
  }
  return parts.join(' ');
}

function triggerText(t: Interaction): string {
  return interactionToText(t);
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
  const dslDefs = getWeaponEffectDefs(id);

  if (!entry || !config) return <div className="content-viewer-empty">Weapon not found</div>;

  const viewWeaponEffect = () => {
    if (dslDefs.length > 0) navigate({ id: `wse:${id}`, category: ContentCategory.WEAPON_EFFECTS, source: 'builtin' });
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

      {dslDefs.length > 0 && (
        <SectionWithNav title="Triggered Effects" onView={viewWeaponEffect}>
          {dslDefs.map((def: any, i: number) => (
            <div key={i} className="cv-effect-card">
              <div className="cv-effect-name">{def.label ?? def.name}</div>
              <div className="cv-field-grid">
                <Field label="Target" value={resolveTargetDisplay(def)} />
                <Field label="Duration" value={`${resolveDurationSeconds(def)}s`} />
                <Field label="Max Stacks" value={String(def.stack?.max?.P0 ?? 1)} />
                {def.cooldownSeconds > 0 && <Field label="Cooldown" value={`${def.cooldownSeconds}s`} />}
              </div>
              <div className="cv-triggers">
                <span className="cv-label">Triggers:</span>
                {resolveTriggerInteractions(def).map((t: any, j: number) => (
                  <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
                ))}
              </div>
              {def.buffs?.length > 0 && (
                <div className="cv-buffs">
                  <span className="cv-label">Buffs:</span>
                  {def.buffs.map((b: any, j: number) => (
                    <span key={j} className="cv-buff-tag">
                      {b.stat} {b.valueMin != null ? `${b.valueMin}\u2013${b.valueMax}` : b.value}{b.perStack ? ' /stack' : ''}
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
  const passiveEntry = getGearSetEffects(id as any);
  const dslDefs = getGearEffectDefs(id);

  const viewGearEffect = () => {
    navigate({ id: `gse:${id}`, category: ContentCategory.GEAR_EFFECTS, source: 'builtin' });
  };

  if (pieces.length === 0) return <div className="content-viewer-empty">Gear set not found</div>;

  return (
    <>
      <h2 className="cv-title">{passiveEntry?.label ?? id}</h2>
      <Section title={`Pieces (${pieces.length})`}>
        {pieces.map((p) => (
          <div key={p.name} className="cv-subsection">
            <span className="cv-piece-name">{p.name}</span>
            <span className="cv-piece-meta">{starStr(p.rarity)} {p.gearCategory}</span>
          </div>
        ))}
      </Section>

      {passiveEntry && Object.keys(passiveEntry.passiveStats).length > 0 && (
        <Section title="Passive Stats (3-piece)">
          <div className="cv-field-grid">
            {Object.entries(passiveEntry.passiveStats).map(([stat, val]) => (
              <Field key={stat} label={stat.replace(/_/g, ' ')} value={String(val)} />
            ))}
          </div>
        </Section>
      )}

      {dslDefs.length > 0 && (
        <SectionWithNav title="Triggered Effects" onView={viewGearEffect}>
          {dslDefs.map((def: any, i: number) => (
            <div key={i} className="cv-effect-card">
              <div className="cv-effect-name">{def.label ?? def.name}</div>
              <div className="cv-field-grid">
                <Field label="Target" value={resolveTargetDisplay(def)} />
                <Field label="Duration" value={`${resolveDurationSeconds(def)}s`} />
                <Field label="Max Stacks" value={String(def.stack?.max?.P0 ?? 1)} />
                {def.cooldownSeconds > 0 && <Field label="Cooldown" value={`${def.cooldownSeconds}s`} />}
              </div>
              <div className="cv-triggers">
                <span className="cv-label">Triggers:</span>
                {resolveTriggerInteractions(def).map((t: any, j: number) => (
                  <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
                ))}
              </div>
              {def.buffs?.length > 0 && (
                <div className="cv-buffs">
                  <span className="cv-label">Buffs:</span>
                  {def.buffs.map((b: any, j: number) => (
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
  );
}

function WeaponEffectView({ id }: { id: string }) {
  const weaponName = id.replace(/^wse:/, '');
  const dslDefs = getWeaponEffectDefs(weaponName);
  if (dslDefs.length === 0) return <div className="content-viewer-empty">Weapon effect not found</div>;

  return (
    <>
      <h2 className="cv-title">{weaponName}</h2>
      {dslDefs.map((def: any, i: number) => (
        <div key={i} className="cv-effect-card">
          <div className="cv-effect-name">{def.label ?? def.name}</div>
          <div className="cv-field-grid">
            <Field label="Origin" value={(def.originId ?? '').replace(/_/g, ' ')} />
            <Field label="Target" value={resolveTargetDisplay(def)} />
            <Field label="Duration" value={`${resolveDurationSeconds(def)}s`} />
            <Field label="Max Stacks" value={String(def.stack?.max?.P0 ?? 1)} />
            {def.cooldownSeconds > 0 && <Field label="Cooldown" value={`${def.cooldownSeconds}s`} />}
          </div>
          <div className="cv-triggers">
            <span className="cv-label">Triggers:</span>
            {resolveTriggerInteractions(def).map((t: any, j: number) => (
              <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
            ))}
          </div>
          {def.buffs?.length > 0 && (
            <div className="cv-buffs">
              <span className="cv-label">Buffs:</span>
              {def.buffs.map((b: any, j: number) => (
                <span key={j} className="cv-buff-tag">
                  {b.stat} {b.valueMin != null ? `${b.valueMin}\u2013${b.valueMax}` : b.value}{b.perStack ? ' /stack' : ''}
                </span>
              ))}
            </div>
          )}
          {def.note && <div className="cv-note">{def.note}</div>}
        </div>
      ))}
    </>
  );
}

function GearEffectView({ id }: { id: string }) {
  const gearSetType = id.replace(/^gse:/, '');
  const passiveEntry = getGearSetEffects(gearSetType as any);
  const dslDefs = getGearEffectDefs(gearSetType);
  if (!passiveEntry && dslDefs.length === 0) return <div className="content-viewer-empty">Gear effect not found</div>;

  return (
    <>
      <h2 className="cv-title">{passiveEntry?.label ?? gearSetType}</h2>

      {passiveEntry && Object.keys(passiveEntry.passiveStats).length > 0 && (
        <Section title="Passive Stats">
          <div className="cv-field-grid">
            {Object.entries(passiveEntry.passiveStats).map(([stat, val]) => (
              <Field key={stat} label={stat.replace(/_/g, ' ')} value={String(val)} />
            ))}
          </div>
        </Section>
      )}

      {dslDefs.length > 0 && (
        <Section title="Triggered Effects">
          {dslDefs.map((def: any, i: number) => (
            <div key={i} className="cv-effect-card">
              <div className="cv-effect-name">{def.label ?? def.name}</div>
              <div className="cv-field-grid">
                <Field label="Target" value={resolveTargetDisplay(def)} />
                <Field label="Duration" value={`${resolveDurationSeconds(def)}s`} />
                <Field label="Max Stacks" value={String(def.stack?.max?.P0 ?? 1)} />
                {def.cooldownSeconds > 0 && <Field label="Cooldown" value={`${def.cooldownSeconds}s`} />}
              </div>
              <div className="cv-triggers">
                <span className="cv-label">Triggers:</span>
                {resolveTriggerInteractions(def).map((t: any, j: number) => (
                  <code key={j} className="cv-trigger-tag">{triggerText(t)}</code>
                ))}
              </div>
              {def.buffs?.length > 0 && (
                <div className="cv-buffs">
                  <span className="cv-label">Buffs:</span>
                  {def.buffs.map((b: any, j: number) => (
                    <span key={j} className="cv-buff-tag">
                      {b.stat} {b.value}{b.perStack ? ' /stack' : ''}
                    </span>
                  ))}
                </div>
              )}
              {def.note && <div className="cv-note">{def.note}</div>}
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

  const hasSegments = skillJson?.segments && Array.isArray(skillJson.segments) && skillJson.segments.length > 0;
  const hasFrames = skillJson?.frames && Array.isArray(skillJson.frames) && skillJson.frames.length > 0;

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

      {/* ── Event Hierarchy ──────────────────────────────────── */}

      {/* Segmented skills (basic attacks): combo chain hierarchy */}
      {hasSegments && (
        <Section title="Combo Chain">
          <div className="cv-chain">
            {(skillJson!.segments as any[]).map((seg, si) => (
              <SegmentView key={si} index={si} segment={seg} isComboChain />
            ))}
          </div>
        </Section>
      )}

      {/* Non-segmented skills: frame timeline */}
      {hasFrames && !hasSegments && (
        <Section title="Frame Data">
          <div className="cv-frame-timeline">
            {(skillJson!.frames as any[]).map((frame, fi) => (
              <FrameView key={fi} index={fi} frame={frame} total={skillJson!.frames.length} />
            ))}
          </div>
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

      {/* Skill Variants — each rendered as its own skill category */}
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

/** Default hit names for basic attack combo chain segments. */
const HIT_NAMES = ['Hit 1', 'Hit 2', 'Hit 3', 'Hit 4', 'Hit 5', 'Hit 6', 'Hit 7', 'Hit 8'];

function SegmentView({ index, segment, isComboChain }: { index: number; segment: Record<string, any>; isComboChain?: boolean }) {
  const dur = segment.duration;
  const durVal = dur?.value ?? 0;
  const durStr = dur ? `${durVal}${dur.unit === 'FRAME' ? 'f' : 's'}` : '—';
  const frames: any[] = segment.frames ?? [];
  const effects: Effect[] = segment.effects ?? [];
  const stats: any[] = segment.stats ?? [];

  // Derive a meaningful name
  const segName = segment.name
    ? segment.name
    : isComboChain
      ? (index < HIT_NAMES.length ? HIT_NAMES[index] : `Hit ${index + 1}`)
      : formatSegmentDisplayName(undefined, index);

  // Count total hits (frames) in this segment
  const hitCount = frames.length;

  return (
    <div className="cv-chain-segment">
      <div className="cv-chain-segment-header">
        <span className="cv-chain-segment-name">{segName}</span>
        <span className="cv-chain-segment-meta">
          {durVal > 0 && <span className="cv-chain-dur">{durStr}</span>}
          {hitCount > 0 && <span className="cv-chain-hits">{hitCount} hit{hitCount > 1 ? 's' : ''}</span>}
        </span>
      </div>

      {segment.experience && (
        <div className="cv-chain-segment-detail">
          <span className="cv-label">Time:</span> {segment.experience}
        </div>
      )}

      {effects.length > 0 && (
        <div className="cv-chain-segment-effects">
          {effects.map((e, i) => <code key={i} className="cv-trigger-tag">{effectToText(e)}</code>)}
        </div>
      )}

      {stats.length > 0 && (
        <div className="cv-field-grid cv-chain-stats">
          {stats.map((s: any, i: number) => (
            <Field key={i} label={s.statType} value={Array.isArray(s.value) ? s.value.join(', ') : String(s.value)} />
          ))}
        </div>
      )}

      {frames.length > 0 && (
        <div className="cv-chain-frames">
          {frames.map((f: any, fi: number) => (
            <FrameView key={fi} index={fi} frame={f} total={frames.length} />
          ))}
        </div>
      )}
    </div>
  );
}

function FrameView({ index, frame, total }: { index: number; frame: Record<string, any>; total: number }) {
  const offset = frame.offset;
  const offsetStr = offset ? `${offset.value}${offset.unit === 'FRAME' ? 'f' : 's'}` : '0';

  // Extract multiplier keys from first level entry (if present)
  const multipliers: any[] = frame.multipliers ?? [];
  const multKeys = multipliers.length > 0 ? Object.keys(multipliers[0]).filter((k) => k !== 'level') : [];

  // Frame-level effects
  const effects: Effect[] = frame.effects ?? [];
  const statusInteractions: Interaction[] = frame.statusInteractions ?? [];

  const hasContent = effects.length > 0 || statusInteractions.length > 0 || multKeys.length > 0;
  const dataSources: string[] = frame.dataSources ?? [];

  return (
    <div className="cv-frame-card">
      <div className="cv-frame-header">
        <span className="cv-frame-offset">@{offsetStr}</span>
        {total > 1 && <span className="cv-frame-index">#{index + 1}</span>}
        {dataSources.length > 0 && (
          <span className="cv-frame-source">{dataSources.join(', ')}</span>
        )}
      </div>

      {!hasContent && (
        <span className="cv-frame-empty">damage frame</span>
      )}

      {effects.length > 0 && (
        <div className="cv-frame-effects">
          {effects.map((e, i) => <code key={i} className="cv-trigger-tag">{effectToText(e)}</code>)}
        </div>
      )}

      {statusInteractions.length > 0 && (
        <div className="cv-frame-effects">
          <span className="cv-label">Status:</span>
          {statusInteractions.map((si, i) => <code key={i} className="cv-trigger-tag">{interactionToText(si)}</code>)}
        </div>
      )}

      {multKeys.length > 0 && (
        <MultiplierTable multipliers={multipliers} keys={multKeys} />
      )}
    </div>
  );
}

/** Compact multiplier table with level rows and stat columns. */
function MultiplierTable({ multipliers, keys }: { multipliers: any[]; keys: string[] }) {
  // Show only a few representative levels for compactness
  const displayLevels = multipliers.length <= 6
    ? multipliers
    : [multipliers[0], multipliers[Math.floor(multipliers.length / 2)], multipliers[multipliers.length - 1]];

  return (
    <div className="cv-multiplier-table">
      <table className="cv-mult-table">
        <thead>
          <tr>
            <th>Lv</th>
            {keys.map((k) => <th key={k}>{formatMultKey(k)}</th>)}
          </tr>
        </thead>
        <tbody>
          {displayLevels.map((m: any, mi: number) => (
            <tr key={mi}>
              <td className="cv-mult-lv">{m.level}</td>
              {keys.map((k) => <td key={k}>{formatMultValue(m[k])}</td>)}
            </tr>
          ))}
          {multipliers.length > 6 && (
            <tr className="cv-mult-more">
              <td colSpan={keys.length + 1}>{multipliers.length} levels total</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatMultKey(key: string): string {
  return key
    .replace(/^atk_scale$/, 'ATK%')
    .replace(/^atk_scale_(\d)$/, 'ATK%$1')
    .replace(/^poise$/, 'Poise')
    .replace(/^poise_extra$/, 'Poise+')
    .replace(/^count$/, 'Count')
    .replace(/^duration$/, 'Dur')
    .replace(/^extra_usp$/, 'USP+')
    .replace(/^atb$/, 'ATB')
    .replace(/_/g, ' ');
}

function formatMultValue(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'number') return v % 1 === 0 ? String(v) : v.toFixed(3);
  return String(v);
}

function VariantView({ variantKey, data }: { variantKey: string; data: Record<string, any> }) {
  const dur = data.duration;
  const durStr = dur ? (typeof dur === 'number' ? `${dur}s` : `${dur.value}${dur.unit === 'FRAME' ? 'f' : 's'}`) : '';
  const frames: any[] = data.frames ?? [];
  const segments: any[] = data.segments ?? [];
  const effects: Effect[] = data.effects ?? [];
  const clause: any[] = data.clause ?? [];

  return (
    <div className="cv-variant-card">
      <div className="cv-variant-header">{variantKey.replace(/_/g, ' ')}</div>
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

      {/* Variant segments (e.g. ENHANCED_BASIC_ATTACK has its own chain) */}
      {segments.length > 0 && (
        <div className="cv-chain" style={{ marginTop: '0.375rem' }}>
          {segments.map((seg: any, si: number) => (
            <SegmentView key={si} index={si} segment={seg} isComboChain />
          ))}
        </div>
      )}

      {/* Variant frames */}
      {frames.length > 0 && !segments.length && (
        <div className="cv-frame-timeline" style={{ marginTop: '0.375rem' }}>
          {frames.map((f: any, fi: number) => (
            <FrameView key={fi} index={fi} frame={f} total={frames.length} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusEventView({ data }: { data: Record<string, any> }) {
  const stack = data.stack ?? {};
  const maxRaw = stack.max ?? [];
  const maxVals = Array.isArray(maxRaw) ? maxRaw : typeof maxRaw === 'object' && maxRaw !== null ? Object.values(maxRaw) : [maxRaw];
  const maxUnique = Array.from(new Set(maxVals));
  const maxStr = maxUnique.join('/');
  const dur = data.duration ?? data.properties?.duration;
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
        <Field label="Stack Type" value={String(stack.verbType ?? stack.interactionType ?? 'NONE')} />
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
