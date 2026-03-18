import React from 'react';
import { TimelineEvent, Operator } from '../../consts/viewTypes';
import { StatType, StatOwnerType } from '../../consts/enums';
import { fmtN } from '../../utils/timeline';
import { OperatorLoadoutState } from '../OperatorLoadoutHeader';
import { LoadoutProperties } from '../InformationPane';
import { StatField } from './SharedFields';
import {
  formatStatValue,
  resolveWeaponBreakdown,
  resolveGearBreakdown,
  resolveGearBonusSummary,
  resolveTactical,
  resolveAggregatedStats,
} from '../../controller/info-pane/loadoutPaneController';
import type { StatSourceEntry } from '../../controller/calculation/loadoutAggregator';

// ── Stat display labels ─────────────────────────────────────────────────────

const STAT_LABELS: Record<StatType, string> = {
  [StatType.BASE_HP]: 'HP (Base)',
  [StatType.BASE_DEFENSE]: 'DEF',
  [StatType.BASE_ATTACK]: 'ATK (Base)',
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
  [StatType.FLAT_HP]: 'HP',
  // ── Enemy stats ──────────────────────────────────────────────────────────────
  [StatType.STAGGER_HP]: 'Stagger HP',
  [StatType.STAGGER_RECOVERY]: 'Stagger Recovery',
  [StatType.FINISHER_ATK_MULTIPLIER]: 'Finisher ATK Mult',
  [StatType.FINISHER_SP_GAIN]: 'Finisher SP Gain',
  [StatType.ATTACK_RANGE]: 'Attack Range',
  [StatType.WEIGHT]: 'Weight',
};

const DESC_FONT_SIZE = 14;

const statRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  padding: '1px 0', fontSize: 13,
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
  stats: LoadoutProperties;
  onStatsChange: (stats: LoadoutProperties) => void;
  onClose: () => void;
  allProcessedEvents?: readonly TimelineEvent[];
  verbose?: 0 | 1 | 2;
}

function LoadoutPane({ operatorId, slotId, operator, loadout, stats, onStatsChange, onClose, allProcessedEvents, verbose = 1 }: LoadoutPaneProps) {
  const setOperator = (key: keyof LoadoutProperties['operator']) => (v: number) =>
    onStatsChange({ ...stats, operator: { ...stats.operator, [key]: v } });
  const setSkill = (key: keyof LoadoutProperties['skills']) => (v: number) =>
    onStatsChange({ ...stats, skills: { ...stats.skills, [key]: v } });
  const setWeapon = (key: keyof LoadoutProperties['weapon']) => (v: number) =>
    onStatsChange({ ...stats, weapon: { ...stats.weapon, [key]: v } });
  const setGear = (ranksKey: keyof LoadoutProperties['gear'], ranks: Record<string, number>) =>
    onStatsChange({ ...stats, gear: { ...stats.gear, [ranksKey]: ranks } });

  const weaponData = resolveWeaponBreakdown(operatorId, loadout, stats);
  const gearData = resolveGearBreakdown(operatorId, loadout, stats);
  const gearBonus = resolveGearBonusSummary(gearData);
  const { foodName, tactical } = resolveTactical(loadout, stats);

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
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Operator Level</span>} value={stats.operator.level} min={1} max={90} holdSnaps={[1, 10, 20, 30, 40, 50, 60, 70, 80, 90]} showMinMax onChange={setOperator('level')} />
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Potential</span>} value={stats.operator.potential} min={0} max={5} showMinMax onChange={setOperator('potential')} />
          {verbose >= 1 &&operator.potentialDescriptions && stats.operator.potential > 0 && operator.potentialDescriptions.slice(0, stats.operator.potential).map((desc, i) => (
            <div key={i} style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px' }}>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginRight: 4 }}>P{i + 1}</span>
              {desc}
            </div>
          ))}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Talents</span>
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Attribute Increase</span>} value={stats.operator.attributeIncreaseLevel} min={0} max={operator.maxAttributeIncreaseLevel} showMinMax onChange={setOperator('attributeIncreaseLevel')} />
          {verbose >= 1 &&stats.operator.attributeIncreaseLevel > 0 && (
            <>
              <div style={{ fontSize: DESC_FONT_SIZE, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', padding: '2px 6px 0' }}>{operator.attributeIncreaseName}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, lineHeight: 1.4, padding: '2px 6px 4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{STAT_LABELS[operator.attributeIncreaseAttribute as StatType] ?? operator.attributeIncreaseAttribute}</span>
                <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>+{[0, 10, 15, 15, 20][stats.operator.attributeIncreaseLevel]} <span style={{ color: 'var(--text-muted)' }}>(+{[0, 10, 25, 40, 60][stats.operator.attributeIncreaseLevel]} total)</span></span>
              </div>
            </>
          )}
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Talent 1</span>} value={stats.operator.talentOneLevel} min={0} max={operator.maxTalentOneLevel} showMinMax onChange={setOperator('talentOneLevel')} />
          {verbose >= 1 &&stats.operator.talentOneLevel > 0 && operator.talentDescriptions?.[1]?.length && (
            <>
              <div style={{ fontSize: DESC_FONT_SIZE, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', padding: '2px 6px 0' }}>{operator.talentOneName}</div>
              <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px 4px' }}>
                {operator.talentDescriptions[1][Math.min(stats.operator.talentOneLevel - 1, operator.talentDescriptions[1].length - 1)]}
              </div>
            </>
          )}
          <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Talent 2</span>} value={stats.operator.talentTwoLevel} min={0} max={operator.maxTalentTwoLevel} showMinMax onChange={setOperator('talentTwoLevel')} />
          {verbose >= 1 &&stats.operator.talentTwoLevel > 0 && operator.talentDescriptions?.[2]?.length && (
            <>
              <div style={{ fontSize: DESC_FONT_SIZE, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', padding: '2px 6px 0' }}>{operator.talentTwoName}</div>
              <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px 4px' }}>
                {operator.talentDescriptions[2][Math.min(stats.operator.talentTwoLevel - 1, operator.talentDescriptions[2].length - 1)]}
              </div>
            </>
          )}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Skills</span>
          {(['basic', 'battle', 'combo', 'ultimate'] as const).map((skillType) => {
            const skill = operator.skills[skillType];
            const levelKey = ({ basic: 'basicAttackLevel', battle: 'battleSkillLevel', combo: 'comboSkillLevel', ultimate: 'ultimateLevel' } as const)[skillType];
            const labelText = ({ basic: 'Basic Attack', battle: 'Battle Skill', combo: 'Combo Skill', ultimate: 'Ultimate Skill' })[skillType];
            return (
              <React.Fragment key={skillType}>
                <StatField
                  label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{labelText}</span>}
                  value={stats.skills[levelKey]}
                  min={1} max={12}
                  holdSnaps={[1, 3, 6, 9, 12]}
                  showMinMax
                  onChange={setSkill(levelKey)}
                />
                {verbose >= 1 &&skill.description && (
                  <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 6px 4px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{skill.name.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}</div>
                    {skill.description}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {weaponData && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Weapon</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>{weaponData.name}</div>
            <StatField label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Weapon Level</span>} value={stats.weapon.level} min={1} max={90} holdSnaps={[1, 10, 20, 30, 40, 50, 60, 70, 80, 90]} showMinMax onChange={setWeapon('level')} />
            {weaponData.skills.map((sk) => (
              <StatField
                key={`skill-${sk.index}`}
                label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Skill {sk.index + 1} ({sk.name})</span>}
                value={[stats.weapon.skill1Level, stats.weapon.skill2Level, stats.weapon.skill3Level][sk.index]}
                min={1} max={9}
                holdSnaps={[1, 3, 6, 9]}
                showMinMax
                onChange={setWeapon((['skill1Level', 'skill2Level', 'skill3Level'] as const)[sk.index])}
              />
            ))}
            <div style={{ ...statRowStyle, marginTop: 4 }}>
              <span style={statLabelStyle}>ATK (Base)</span>
              <span style={statValueStyle}>{fmtN(weaponData.baseAtk)}</span>
            </div>
            {weaponData.statContributions.map((c) => (
              <div key={`stat-${c.skillIndex}`} style={statRowStyle}>
                <span style={statLabelStyle}>Skill {c.skillIndex + 1}: {STAT_LABELS[c.stat] ?? c.stat}</span>
                <span style={statValueStyle}>{formatStatValue(c.stat, c.value)}</span>
              </div>
            ))}
            {weaponData.passiveStats.map((p) => (
              <div key={`stat-${p.skillIndex}-${p.stat}`} style={statRowStyle}>
                <span style={statLabelStyle}>Skill {p.skillIndex + 1}: {STAT_LABELS[p.stat] ?? p.stat}</span>
                <span style={statValueStyle}>{formatStatValue(p.stat, p.value)}</span>
              </div>
            ))}
            {weaponData.effects.map((eff, ei) => (
              <React.Fragment key={`eff-${ei}`}>
                <div style={{ ...statRowStyle, marginTop: ei === 0 ? 4 : 8 }}>
                  <span style={statLabelStyle}>Skill 3: {eff.label}</span>
                </div>
                {verbose >= 1 &&eff.description && (
                  <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 2, marginTop: -1 }}>
                    {eff.description}
                  </div>
                )}
                {eff.secondaryAttrBonus && (
                  <div style={statRowStyle}>
                    <span style={statLabelStyle}>Secondary Attr% ({STAT_LABELS[eff.secondaryAttrBonus.label as StatType] ?? eff.secondaryAttrBonus.label}%)</span>
                    <span style={statValueStyle}>{fmtN(eff.secondaryAttrBonus.value * 100)}%</span>
                  </div>
                )}
                {eff.buffs.map((b, bi) => (
                  <div key={`eff-${ei}-${bi}`} style={statRowStyle}>
                    <span style={statLabelStyle}>{STAT_LABELS[b.statLabel as StatType] ?? b.statLabel} ({eff.durationSeconds}s)</span>
                    <span style={statValueStyle}>{b.valueStr}{b.perStack ? eff.stackSuffix : ''}</span>
                  </div>
                ))}
                {verbose >= 1 &&eff.metaStr && (
                  <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 2 }}>
                    {eff.metaStr}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {gearData && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Gear</span>
            {gearData.setActive && gearData.setName && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>
                  Set: {gearData.setName}
                </div>
                {verbose >= 1 &&gearData.setDescription && (
                  <div style={{ fontSize: DESC_FONT_SIZE, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                    {gearData.setDescription}
                  </div>
                )}
              </div>
            )}
            {gearData.pieces.map((piece) => (
              <React.Fragment key={piece.ranksKey}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', marginTop: 6 }}>{piece.name}</div>
                {piece.statKeys.map((statType) => (
                  <StatField
                    key={statType}
                    label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{STAT_LABELS[statType] ?? statType}</span>}
                    value={piece.ranks[statType] ?? 4}
                    min={1}
                    max={4}
                    showMinMax
                    onChange={(v) => setGear(piece.ranksKey as keyof LoadoutProperties['gear'], { ...piece.ranks, [statType]: v })}
                  />
                ))}
                {piece.statKeys.map((statType) => (
                  <div key={`val-${statType}`} style={statRowStyle}>
                    <span style={statLabelStyle}>{STAT_LABELS[statType] ?? statType}</span>
                    <span style={statValueStyle}>{formatStatValue(statType, piece.resolvedStats[statType] ?? 0)}</span>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}

        {gearBonus && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Gear Bonus</span>
            {gearBonus.totalDefense > 0 && (
              <div style={statRowStyle}>
                <span style={statLabelStyle}>DEF</span>
                <span style={statValueStyle}>{gearBonus.totalDefense.toFixed(0)}</span>
              </div>
            )}
            {gearBonus.stats.map((s) => (
              <div key={s.stat} style={statRowStyle}>
                <span style={statLabelStyle}>{STAT_LABELS[s.stat] ?? s.stat}</span>
                <span style={statValueStyle}>{formatStatValue(s.stat, s.value)}</span>
              </div>
            ))}
          </div>
        )}

        {(foodName || tactical) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Tactical</span>
            {foodName && <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{foodName}</div>}
            {tactical && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{tactical.name}</div>
                <StatField
                  label={<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Uses</span>}
                  value={tactical.currentMaxUses}
                  min={0}
                  max={tactical.modelMaxUses}
                  showMinMax
                  onChange={(v) => onStatsChange({ ...stats, tacticalMaxUses: v })}
                />
              </>
            )}
          </div>
        )}

        <AggregatedStatsSection operatorId={operatorId} loadout={loadout} stats={stats} color={operator.color} />
      </div>
    </>
  );
}

function AggregatedStatsSection({ operatorId, loadout, stats, color }: {
  operatorId: string; loadout: OperatorLoadoutState; stats: LoadoutProperties; color: string;
}) {
  const data = resolveAggregatedStats(operatorId, loadout, stats, StatOwnerType.OPERATOR);
  if (!data) return null;

  const { agg } = data;
  const totalDefense = agg.stats[StatType.BASE_DEFENSE] ?? 0;

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
          <span style={statValueStyle}>{fmtN(agg.effectiveAttack)}</span>
        </div>
        <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
          <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 13, marginTop: 2 }}>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Base ATK</span>
            <span style={statValueStyle}>{fmtN(agg.baseAttack)}</span>
          </div>
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Operator</span>
              <span style={statValueStyle}>{fmtN(agg.operatorBaseAttack)}</span>
            </div>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Weapon</span>
              <span style={statValueStyle}>{fmtN(agg.weaponBaseAttack)}</span>
            </div>
          </div>
          <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 13, marginTop: 2 }}>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>ATK Bonus</span>
            <span style={statValueStyle}>{fmtN(agg.atkPercentageBonus)}</span>
          </div>
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Percentage Bonus</span>
              <span style={statValueStyle}>{formatStatValue(StatType.ATTACK_BONUS, agg.atkBonus)} → {fmtN(agg.atkPercentageBonus)}</span>
            </div>
          </div>
          <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 13, marginTop: 2 }}>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Attribute Bonus</span>
            <span style={statValueStyle}>{fmtN((agg.displayMainAttributeBonus + agg.displaySecondaryAttributeBonus) * 100)}%</span>
          </div>
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>ATK bonus from {STAT_LABELS[agg.mainAttributeType]}</span>
              <span style={statValueStyle}>{fmtN(agg.displayMainAttributeBonus * 100)}%</span>
            </div>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>ATK bonus from {STAT_LABELS[agg.secondaryAttributeType]}</span>
              <span style={statValueStyle}>{fmtN(agg.displaySecondaryAttributeBonus * 100)}%</span>
            </div>
          </div>
        </div>
        <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12, marginTop: 4 }}>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Defense</span>
          <span style={{ ...statValueStyle, color: totalDefense === 0 ? 'var(--text-muted)' : undefined }}>{totalDefense > 0 ? totalDefense.toFixed(0) : '—'}</span>
        </div>
      </div>

      <div className="edit-panel-section">
        <span className="edit-section-label">Attributes</span>
        {data.attributes.map((a) => (
          <StatWithSources
            key={a.stat}
            stat={a.stat}
            value={a.isZero ? undefined : a.value}
            sources={agg.statSources[a.stat]}
          />
        ))}
      </div>

      <div className="edit-panel-section">
        <span className="edit-section-label">Other Stats</span>
        {data.otherStats.map((s) => (
          <StatWithSources
            key={s.stat}
            stat={s.stat}
            value={s.isZero ? undefined : s.value}
            displayValue={s.isZero ? undefined : formatStatValue(s.stat, s.value)}
            sources={agg.statSources[s.stat]}
          />
        ))}
      </div>
    </>
  );
}

// ── Stat with permanent source breakdown (nested | lines like ATK) ───────────

function StatWithSources({ stat, value, displayValue, sources }: {
  stat: StatType;
  value?: number;
  displayValue?: string;
  sources?: StatSourceEntry[];
}) {
  const isZero = value == null;
  const hasSources = sources && sources.length > 0 && !isZero;

  return (
    <>
      <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12, marginTop: 4 }}>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
          {STAT_LABELS[stat]}
        </span>
        <span style={{ ...statValueStyle, color: isZero ? 'var(--text-muted)' : undefined }}>
          {isZero ? '—' : (displayValue ?? formatStatValue(stat, value!))}
        </span>
      </div>
      {hasSources && (
        <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
          {sources!.map((s, i) => (
            <div key={i} style={statRowStyle}>
              <span style={statLabelStyle}>{s.source}</span>
              <span style={statValueStyle}>{formatStatValue(stat, s.value)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default LoadoutPane;
