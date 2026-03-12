import React from 'react';
import { TimelineEvent, Operator } from '../../consts/viewTypes';
import { StatType, WeaponSkillType } from '../../consts/enums';
import { OperatorLoadoutState } from '../OperatorLoadoutHeader';
import { WEAPONS, ARMORS, GLOVES, KITS, CONSUMABLES, TACTICALS } from '../../utils/loadoutRegistry';
import { Gear } from '../../model/gears/gear';
import { MODEL_FACTORIES } from '../../controller/operators/operatorRegistry';
import { interpolateAttack } from '../../model/weapons/weapon';
import { aggregateLoadoutStats, weaponSkillStat } from '../../controller/calculation/loadoutAggregator';
import { getWeaponEffects } from '../../consts/weaponSkillEffects';
import { LoadoutStats } from '../InformationPane';
import { StatField, LevelSelect } from './SharedFields';

// ── Stat display helpers ─────────────────────────────────────────────────────

const STAT_LABELS: Record<StatType, string> = {
  [StatType.ATTACK]: 'ATK (Base)',
  [StatType.ATTACK_BONUS]: 'ATK%',
  [StatType.STRENGTH]: 'Strength',
  [StatType.STRENGTH_BONUS]: 'Strength%',
  [StatType.AGILITY]: 'Agility',
  [StatType.AGILITY_BONUS]: 'Agility%',
  [StatType.INTELLECT]: 'Intellect',
  [StatType.INTELLECT_BONUS]: 'Intellect%',
  [StatType.WILL]: 'Will',
  [StatType.WILL_BONUS]: 'Will%',
  [StatType.CRITICAL_RATE]: 'Crit Rate',
  [StatType.CRITICAL_DAMAGE]: 'Crit DMG',
  [StatType.ARTS_INTENSITY]: 'Arts Intensity',
  [StatType.PHYSICAL_RESISTANCE]: 'Phys RES',
  [StatType.HEAT_RESISTANCE]: 'Heat RES',
  [StatType.ELECTRIC_RESISTANCE]: 'Elec RES',
  [StatType.CRYO_RESISTANCE]: 'Cryo RES',
  [StatType.NATURE_RESISTANCE]: 'Nature RES',
  [StatType.AETHER_RESISTANCE]: 'Aether RES',
  [StatType.TREATMENT_BONUS]: 'Treatment',
  [StatType.TREATMENT_RECEIVED_BONUS]: 'Treatment Recv',
  [StatType.COMBO_SKILL_COOLDOWN_REDUCTION]: 'Combo CD Red',
  [StatType.ULTIMATE_GAIN_EFFICIENCY]: 'Ult Gain Eff',
  [StatType.STAGGER_EFFICIENCY_BONUS]: 'Stagger Eff',
  [StatType.PHYSICAL_DAMAGE_BONUS]: 'Phys DMG%',
  [StatType.HEAT_DAMAGE_BONUS]: 'Heat DMG%',
  [StatType.ELECTRIC_DAMAGE_BONUS]: 'Elec DMG%',
  [StatType.CRYO_DAMAGE_BONUS]: 'Cryo DMG%',
  [StatType.NATURE_DAMAGE_BONUS]: 'Nature DMG%',
  [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 'Basic ATK DMG%',
  [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 'Battle Skill DMG%',
  [StatType.COMBO_SKILL_DAMAGE_BONUS]: 'Combo Skill DMG%',
  [StatType.ULTIMATE_DAMAGE_BONUS]: 'Ultimate DMG%',
  [StatType.STAGGER_DAMAGE_BONUS]: 'Stagger DMG%',
  [StatType.FINAL_DAMAGE_REDUCTION]: 'Final DMG Red',
  [StatType.SKILL_DAMAGE_BONUS]: 'Skill DMG%',
  [StatType.ARTS_DAMAGE_BONUS]: 'Arts DMG%',
  [StatType.HP_BONUS]: 'HP%',
};

/** Stats that represent percentages (displayed as %). */
const PERCENT_STATS = new Set<StatType>([
  StatType.ATTACK_BONUS, StatType.STRENGTH_BONUS, StatType.AGILITY_BONUS,
  StatType.INTELLECT_BONUS, StatType.WILL_BONUS,
  StatType.CRITICAL_RATE, StatType.CRITICAL_DAMAGE, StatType.ARTS_INTENSITY,
  StatType.PHYSICAL_RESISTANCE, StatType.HEAT_RESISTANCE, StatType.ELECTRIC_RESISTANCE,
  StatType.CRYO_RESISTANCE, StatType.NATURE_RESISTANCE, StatType.AETHER_RESISTANCE,
  StatType.TREATMENT_BONUS, StatType.TREATMENT_RECEIVED_BONUS,
  StatType.COMBO_SKILL_COOLDOWN_REDUCTION, StatType.ULTIMATE_GAIN_EFFICIENCY,
  StatType.STAGGER_EFFICIENCY_BONUS,
  StatType.PHYSICAL_DAMAGE_BONUS, StatType.HEAT_DAMAGE_BONUS, StatType.ELECTRIC_DAMAGE_BONUS,
  StatType.CRYO_DAMAGE_BONUS, StatType.NATURE_DAMAGE_BONUS,
  StatType.BASIC_ATTACK_DAMAGE_BONUS, StatType.BATTLE_SKILL_DAMAGE_BONUS,
  StatType.COMBO_SKILL_DAMAGE_BONUS, StatType.ULTIMATE_DAMAGE_BONUS,
  StatType.STAGGER_DAMAGE_BONUS,
  StatType.FINAL_DAMAGE_REDUCTION, StatType.SKILL_DAMAGE_BONUS, StatType.ARTS_DAMAGE_BONUS,
  StatType.HP_BONUS,
]);

function formatStatValue(stat: StatType, value: number): string {
  if (PERCENT_STATS.has(stat)) return `${(value * 100).toFixed(2)}%`;
  return value.toFixed(2);
}



const statRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  padding: '1px 0', fontSize: 11,
};
const statLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
};
const statValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', textAlign: 'right',
};

// ── LoadoutPane ──────────────────────────────────────────────────────────────

interface LoadoutPaneProps {
  operatorId: string;
  slotId: string;
  operator: Operator;
  loadout: OperatorLoadoutState;
  stats: LoadoutStats;
  onStatsChange: (stats: LoadoutStats) => void;
  onClose: () => void;
  allProcessedEvents?: readonly TimelineEvent[];
}

function LoadoutPane({ operatorId, slotId, operator, loadout, stats, onStatsChange, onClose, allProcessedEvents }: LoadoutPaneProps) {
  const set = (key: keyof LoadoutStats) => (v: number) =>
    onStatsChange({ ...stats, [key]: v });

  const weapon = loadout.weaponName !== null ? WEAPONS.find((w) => w.name === loadout.weaponName) ?? null : null;
  const armor  = loadout.armorName  !== null ? ARMORS.find((a) => a.name === loadout.armorName)   ?? null : null;
  const gloves = loadout.glovesName !== null ? GLOVES.find((g) => g.name === loadout.glovesName)  ?? null : null;
  const kit1   = loadout.kit1Name   !== null ? KITS.find((k) => k.name === loadout.kit1Name)      ?? null : null;
  const kit2   = loadout.kit2Name   !== null ? KITS.find((k) => k.name === loadout.kit2Name)      ?? null : null;
  const food   = loadout.consumableName !== null ? CONSUMABLES.find((c) => c.name === loadout.consumableName) ?? null : null;
  const tac    = loadout.tacticalName   !== null ? TACTICALS.find((t) => t.name === loadout.tacticalName)     ?? null : null;

  return (
    <>
      <div className="edit-panel-header">
        <div
          style={{
            width: 4, height: 40, borderRadius: 2, flexShrink: 0,
            background: operator.color,
            boxShadow: `0 0 8px ${operator.color}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          <div className="edit-panel-skill-name">{operator.name}</div>
          <div className="edit-panel-op-name" style={{ color: operator.color }}>
            {operator.role}
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· LOADOUT</span>
          </div>
        </div>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">Operator</span>
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Operator Level</span>}     value={stats.operatorLevel}     min={1} max={90}  holdSnaps={[1, 10, 20, 30, 40, 50, 60, 70, 80, 90]} showMinMax onChange={set('operatorLevel')} />
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Potential</span>}           value={stats.potential}         min={0} max={5}  showMinMax onChange={set('potential')} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Talents</span>
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{operator.attributeIncreaseName}</span>}  value={stats.attributeIncreaseLevel}  min={0} max={operator.maxAttributeIncreaseLevel}  showMinMax onChange={set('attributeIncreaseLevel')} />
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{operator.talentOneName}</span>}      value={stats.talentOneLevel}   min={0} max={operator.maxTalentOneLevel}  showMinMax onChange={set('talentOneLevel')} />
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{operator.talentTwoName}</span>}      value={stats.talentTwoLevel}   min={0} max={operator.maxTalentTwoLevel}  showMinMax onChange={set('talentTwoLevel')} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Skills</span>
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Basic Attack Level</span>}  value={stats.basicAttackLevel}  min={1} max={12} holdSnaps={[1, 3, 6, 9, 12]} showMinMax onChange={set('basicAttackLevel')} />
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Battle Skill Level</span>}  value={stats.battleSkillLevel}  min={1} max={12} holdSnaps={[1, 3, 6, 9, 12]} showMinMax onChange={set('battleSkillLevel')} />
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Combo Skill Level</span>}   value={stats.comboSkillLevel}   min={1} max={12} holdSnaps={[1, 3, 6, 9, 12]} showMinMax onChange={set('comboSkillLevel')} />
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Ultimate Level</span>}      value={stats.ultimateLevel}     min={1} max={12} holdSnaps={[1, 3, 6, 9, 12]} showMinMax onChange={set('ultimateLevel')} />
        </div>

        {weapon && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Weapon</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>{weapon.name}</div>
            <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Weapon Level</span>}    value={stats.weaponLevel}       min={1} max={90}  holdSnaps={[1, 10, 20, 30, 40, 50, 60, 70, 80, 90]} showMinMax onChange={set('weaponLevel')} />
            {(() => {
              const wpn = weapon.create();
              const factory = MODEL_FACTORIES[operatorId];
              const operatorModel = factory ? factory(stats.operatorLevel) : null;
              const mainAttr = operatorModel?.mainAttributeType ?? StatType.STRENGTH;
              const allSkills = [wpn.weaponSkillOne, wpn.weaponSkillTwo, wpn.weaponSkillThree];
              const levelKeys: (keyof LoadoutStats)[] = ['weaponSkill1Level', 'weaponSkill2Level', 'weaponSkill3Level'];
              const levelValues = [stats.weaponSkill1Level, stats.weaponSkill2Level, stats.weaponSkill3Level];
              const elements: React.ReactNode[] = [];

              // Skill level editors
              for (let i = 0; i < allSkills.length; i++) {
                const sk = allSkills[i];
                if (!sk) continue;
                const skillName = sk.weaponSkillType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                elements.push(
                  <StatField
                    key={`skill-${i}`}
                    label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Skill {i + 1} ({skillName})</span>}
                    value={levelValues[i]}
                    min={1} max={9}
                    holdSnaps={[1, 3, 6, 9]}
                    showMinMax
                    onChange={set(levelKeys[i])}
                  />
                );
              }

              // Base ATK
              const baseAtk = interpolateAttack(wpn.baseAttack, stats.weaponLevel);
              elements.push(
                <div key="base-atk" style={{ ...statRowStyle, marginTop: 4 }}>
                  <span style={statLabelStyle}>ATK (Base)</span>
                  <span style={statValueStyle}>{baseAtk.toFixed(2)}</span>
                </div>
              );

              // Per-skill stat contribution rows
              for (let i = 0; i < allSkills.length; i++) {
                const sk = allSkills[i];
                if (!sk) continue;
                sk.level = levelValues[i];
                const stat = weaponSkillStat(sk.weaponSkillType as WeaponSkillType, mainAttr);
                if (stat != null) {
                  const value = sk.getValue();
                  if (value !== 0) {
                    elements.push(
                      <div key={`stat-${i}`} style={statRowStyle}>
                        <span style={statLabelStyle}>Skill {i + 1}: {STAT_LABELS[stat] ?? stat}</span>
                        <span style={statValueStyle}>{formatStatValue(stat, value)}</span>
                      </div>
                    );
                  }
                } else {
                  // Named/unique skills — show passive stats from getPassiveStats()
                  const passiveStats = sk.getPassiveStats();
                  for (const [key, value] of Object.entries(passiveStats)) {
                    if ((value as number) !== 0) {
                      elements.push(
                        <div key={`stat-${i}-${key}`} style={statRowStyle}>
                          <span style={statLabelStyle}>Skill {i + 1}: {STAT_LABELS[key as StatType] ?? key}</span>
                          <span style={statValueStyle}>{formatStatValue(key as StatType, value as number)}</span>
                        </div>
                      );
                    }
                  }
                }
              }

              // Named skill effect stat rows (skill 3 / triggered effects)
              const effects = getWeaponEffects(weapon.name);
              if (effects) {
                const sk3 = wpn.weaponSkillThree;
                const effectGroups = sk3?.getNamedEffectGroups?.() ?? null;

                for (let ei = 0; ei < effects.effects.length; ei++) {
                  const eff = effects.effects[ei];
                  const group = effectGroups?.[ei] ?? null;

                  // Skill 3 header with label
                  elements.push(
                    <div key={`eff-hdr-${ei}`} style={{ ...statRowStyle, marginTop: ei === 0 ? 4 : 8 }}>
                      <span style={statLabelStyle}>Skill 3: {eff.label}</span>
                    </div>
                  );

                  // Wiki description of the triggered effect
                  if (eff.description) {
                    elements.push(
                      <div key={`eff-desc-${ei}`} style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 2, marginTop: -1 }}>
                        {eff.description}
                      </div>
                    );
                  }

                  // Secondary attribute passive bonus (e.g. Flow: Unbridled Edge)
                  if (ei === 0 && sk3 && 'getElementDmgBonus' in sk3 && operatorModel) {
                    const secBonus = sk3.getValue();
                    if (secBonus > 0) {
                      const secAttr = operatorModel.secondaryAttributeType;
                      const secLabel = STAT_LABELS[secAttr] ?? secAttr;
                      elements.push(
                        <div key="sec-attr-bonus" style={statRowStyle}>
                          <span style={statLabelStyle}>Secondary Attr% ({secLabel}%)</span>
                          <span style={statValueStyle}>{(secBonus * 100).toFixed(2)}%</span>
                        </div>
                      );
                    }
                  }

                  // Buff stat lines with actual values (or fallback to min-max range)
                  const stackSuffix = eff.maxStacks > 1 ? `/stack (max ${eff.maxStacks})` : '';
                  for (let bi = 0; bi < eff.buffs.length; bi++) {
                    const b = eff.buffs[bi];
                    const statLabel = STAT_LABELS[b.stat as StatType] ?? b.stat;
                    const isPercent = PERCENT_STATS.has(b.stat as StatType);

                    // Use model value if available, otherwise show min-max range
                    const modelStat = group?.stats[bi];
                    let valStr: string;
                    if (modelStat && modelStat.value !== 0) {
                      valStr = isPercent
                        ? `${(modelStat.value * 100).toFixed(2)}%`
                        : modelStat.value.toFixed(2);
                    } else {
                      valStr = isPercent
                        ? `${(b.valueMin * 100).toFixed(2)}–${(b.valueMax * 100).toFixed(2)}%`
                        : `${b.valueMin}–${b.valueMax}`;
                    }

                    const durationSuffix = ` (${eff.durationSeconds}s)`;
                    elements.push(
                      <div key={`eff-${ei}-${bi}`} style={statRowStyle}>
                        <span style={statLabelStyle}>{statLabel}{durationSuffix}</span>
                        <span style={statValueStyle}>{valStr}{b.perStack ? stackSuffix : ''}</span>
                      </div>
                    );
                  }

                  // Meta line for stacks, cooldown, notes
                  const metaParts = [
                    eff.maxStacks > 1 ? `${eff.maxStacks} stacks` : '',
                    eff.cooldownSeconds > 0 ? `${eff.cooldownSeconds}s CD` : '',
                  ].filter(Boolean);
                  if (eff.note || metaParts.length > 0) {
                    const metaStr = [eff.note, ...metaParts].filter(Boolean).join(' · ');
                    elements.push(
                      <div key={`eff-meta-${ei}`} style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 2 }}>
                        {metaStr}
                      </div>
                    );
                  }
                }
              }

              return elements;
            })()}
          </div>
        )}

        {(armor || gloves || kit1 || kit2) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Gear</span>
            {(() => {
              const agg = aggregateLoadoutStats(operatorId, loadout, stats);
              if (!agg?.gearSetActive || !agg.gearSetType) return null;
              return (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>
                    Set: {agg.gearSetType.replace(/_/g, ' ')}
                  </div>
                  {agg.gearSetDescription && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                      {agg.gearSetDescription}
                    </div>
                  )}
                </div>
              );
            })()}
            {([
              { entry: armor,  registry: ARMORS, ranksKey: 'armorRanks' as const },
              { entry: gloves, registry: GLOVES, ranksKey: 'glovesRanks' as const },
              { entry: kit1,   registry: KITS,   ranksKey: 'kit1Ranks' as const },
              { entry: kit2,   registry: KITS,   ranksKey: 'kit2Ranks' as const },
            ] as const).map(({ entry, registry, ranksKey }) => {
              if (!entry) return null;
              const gear: Gear = entry.create();
              gear.rank = 4;
              const statKeys = gear.getStatKeys();
              const ranks = stats[ranksKey] ?? {};
              const resolvedStats = gear.getStatsPerLine(ranks);
              return (
                <React.Fragment key={ranksKey}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', marginTop: 6 }}>{entry.name}</div>
                  {statKeys.map((statType) => (
                    <StatField
                      key={statType}
                      label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{STAT_LABELS[statType] ?? statType}</span>}
                      value={ranks[statType] ?? 4}
                      min={1}
                      max={4}
                      showMinMax
                      onChange={(v) => onStatsChange({ ...stats, [ranksKey]: { ...ranks, [statType]: v } })}
                    />
                  ))}
                  {statKeys.map((statType) => (
                    <div key={`val-${statType}`} style={statRowStyle}>
                      <span style={statLabelStyle}>{STAT_LABELS[statType] ?? statType}</span>
                      <span style={statValueStyle}>{formatStatValue(statType, resolvedStats[statType] ?? 0)}</span>
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {(food || tac) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Tactical</span>
            {food && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{food.name}</div>}
            {tac  && (() => {
              const tacInstance = tac.create();
              const modelMax = tacInstance.maxUses;
              const currentMax = stats.tacticalMaxUses ?? modelMax;
              return (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{tac.name}</div>
                  <StatField
                    label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Uses</span>}
                    value={currentMax}
                    min={0}
                    max={modelMax}
                    showMinMax
                    onChange={(v) => onStatsChange({ ...stats, tacticalMaxUses: v })}
                  />
                </>
              );
            })()}
          </div>
        )}

        <AggregatedStatsSection operatorId={operatorId} loadout={loadout} stats={stats} color={operator.color} />
      </div>
    </>
  );
}

/** Maps flat attribute stats to their percentage bonus counterparts. */
const FLAT_ATTR_TO_BONUS: Partial<Record<StatType, StatType>> = {
  [StatType.STRENGTH]: StatType.STRENGTH_BONUS,
  [StatType.AGILITY]: StatType.AGILITY_BONUS,
  [StatType.INTELLECT]: StatType.INTELLECT_BONUS,
  [StatType.WILL]: StatType.WILL_BONUS,
};

/** Stat display groups matching in-game layout. */
const STAT_ATTRIBUTES: StatType[] = [
  StatType.STRENGTH, StatType.AGILITY, StatType.INTELLECT, StatType.WILL,
  StatType.STRENGTH_BONUS, StatType.AGILITY_BONUS, StatType.INTELLECT_BONUS, StatType.WILL_BONUS,
];


const STAT_OTHER: StatType[] = [
  StatType.CRITICAL_RATE, StatType.CRITICAL_DAMAGE, StatType.ARTS_INTENSITY,
  StatType.TREATMENT_BONUS, StatType.TREATMENT_RECEIVED_BONUS,
  StatType.COMBO_SKILL_COOLDOWN_REDUCTION, StatType.ULTIMATE_GAIN_EFFICIENCY,
  StatType.STAGGER_EFFICIENCY_BONUS, StatType.STAGGER_DAMAGE_BONUS,
  StatType.PHYSICAL_DAMAGE_BONUS, StatType.HEAT_DAMAGE_BONUS, StatType.ELECTRIC_DAMAGE_BONUS,
  StatType.CRYO_DAMAGE_BONUS, StatType.NATURE_DAMAGE_BONUS, StatType.ARTS_DAMAGE_BONUS,
  StatType.BASIC_ATTACK_DAMAGE_BONUS, StatType.BATTLE_SKILL_DAMAGE_BONUS,
  StatType.COMBO_SKILL_DAMAGE_BONUS, StatType.ULTIMATE_DAMAGE_BONUS,
  StatType.SKILL_DAMAGE_BONUS,
  StatType.FINAL_DAMAGE_REDUCTION,
  StatType.PHYSICAL_RESISTANCE, StatType.HEAT_RESISTANCE, StatType.ELECTRIC_RESISTANCE,
  StatType.CRYO_RESISTANCE, StatType.NATURE_RESISTANCE, StatType.AETHER_RESISTANCE,
];

function AggregatedStatsSection({ operatorId, loadout, stats, color }: {
  operatorId: string; loadout: OperatorLoadoutState; stats: LoadoutStats; color: string;
}) {
  const agg = aggregateLoadoutStats(operatorId, loadout, stats);
  if (!agg) return null;

  return (
    <>
      <div className="edit-panel-section">
        <span className="edit-section-label">Main Stats</span>
        <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12 }}>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>HP</span>
          <span style={statValueStyle}>—</span>
        </div>
        <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12, marginTop: 4 }}>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>ATK</span>
          <span style={statValueStyle}>{agg.effectiveAttack.toFixed(2)}</span>
        </div>
        <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
          <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 11, marginTop: 2 }}>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Base ATK</span>
            <span style={statValueStyle}>{agg.baseAttack.toFixed(2)}</span>
          </div>
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Operator</span>
              <span style={statValueStyle}>{agg.operatorBaseAttack.toFixed(2)}</span>
            </div>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Weapon</span>
              <span style={statValueStyle}>{agg.weaponBaseAttack.toFixed(2)}</span>
            </div>
          </div>
          <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 11, marginTop: 2 }}>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>ATK Bonus</span>
            <span style={statValueStyle}>{agg.atkPercentageBonus.toFixed(2)}</span>
          </div>
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Percentage Bonus</span>
              <span style={statValueStyle}>{formatStatValue(StatType.ATTACK_BONUS, agg.atkBonus)} → {agg.atkPercentageBonus.toFixed(2)}</span>
            </div>
          </div>
          <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 11, marginTop: 2 }}>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Attribute Bonus</span>
            <span style={statValueStyle}>{((agg.mainAttributeBonus + agg.secondaryAttributeBonus) * 100).toFixed(2)}%</span>
          </div>
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>ATK bonus from {STAT_LABELS[agg.mainAttributeType]}</span>
              <span style={statValueStyle}>{(agg.mainAttributeBonus * 100).toFixed(2)}%</span>
            </div>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>ATK bonus from {STAT_LABELS[agg.secondaryAttributeType]}</span>
              <span style={statValueStyle}>{(agg.secondaryAttributeBonus * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
        <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12, marginTop: 4 }}>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Defense</span>
          <span style={statValueStyle}>—</span>
        </div>
      </div>

      <div className="edit-panel-section">
        <span className="edit-section-label">Attributes</span>
        {STAT_ATTRIBUTES.map((stat) => {
          let value = agg.stats[stat];
          // Apply percentage bonus to flat attributes (matches in-game display)
          const bonusStat = FLAT_ATTR_TO_BONUS[stat];
          if (bonusStat) {
            value = Math.floor(value * (1 + agg.stats[bonusStat]));
          }
          return (
            <div key={stat} style={statRowStyle}>
              <span style={statLabelStyle}>{STAT_LABELS[stat]}</span>
              <span style={{ ...statValueStyle, color: value !== 0 ? undefined : 'var(--text-muted)' }}>
                {value !== 0 ? formatStatValue(stat, value) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="edit-panel-section">
        <span className="edit-section-label">Other Stats</span>
        {STAT_OTHER.map((stat) => {
          const raw = agg.stats[stat];
          const value = stat === StatType.ULTIMATE_GAIN_EFFICIENCY ? raw + 1 : raw;
          return (
            <div key={stat} style={statRowStyle}>
              <span style={statLabelStyle}>{STAT_LABELS[stat]}</span>
              <span style={{ ...statValueStyle, color: raw !== 0 ? undefined : 'var(--text-muted)' }}>
                {raw !== 0 ? formatStatValue(stat, value) : '—'}
              </span>
            </div>
          );
        })}
      </div>

    </>
  );
}

export default LoadoutPane;
