import React from 'react';
import { frameToTimeLabelPrecise } from '../../utils/timeline';
import type { DamageTableRow } from '../../controller/calculation/damageTableBuilder';
import type { DamageParams } from '../../model/calculation/damageFormulas';

/** Multiplier display entry for the breakdown table. */
interface MultiplierEntry {
  label: string;
  value: number;
  /** How to format: 'flat' for attack, 'multiplier' for xN.NN, 'percent' for N.N% */
  format: 'flat' | 'multiplier' | 'percent';
  /** Short description of where this value comes from. */
  source: string;
}

function formatMultiplierValue(value: number, format: MultiplierEntry['format']): string {
  if (format === 'flat') return Math.round(value).toLocaleString();
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
  return `x${value.toFixed(4)}`;
}

function getMultiplierClass(value: number, format: MultiplierEntry['format']): string {
  if (format === 'flat') return '';
  if (value > 1.001) return 'dmg-breakdown-positive';
  if (value < 0.999) return 'dmg-breakdown-negative';
  return 'dmg-breakdown-neutral';
}

function buildMultiplierEntries(params: DamageParams): MultiplierEntry[] {
  return [
    {
      label: 'Attack',
      value: params.attack,
      format: 'flat',
      source: '(Operator ATK + Weapon ATK) x (1 + ATK%) + flat bonuses',
    },
    {
      label: 'Skill Multiplier',
      value: params.baseMultiplier,
      format: 'percent',
      source: 'Skill scaling (% of ATK)',
    },
    {
      label: 'Attribute Bonus',
      value: params.attributeBonus,
      format: 'multiplier',
      source: '1 + 0.005 x Main Attr + 0.002 x Secondary Attr',
    },
    {
      label: 'Damage Bonus',
      value: params.multiplierGroup,
      format: 'multiplier',
      source: '1 + Element DMG% + Skill Type DMG% + Skill DMG% + Arts DMG%',
    },
    {
      label: 'Critical (Expected)',
      value: params.critMultiplier,
      format: 'multiplier',
      source: '1 + Crit Rate x Crit DMG',
    },
    {
      label: 'Arts Amp',
      value: params.ampMultiplier,
      format: 'multiplier',
      source: params.ampMultiplier > 1.001 ? 'Arts Amp active' : 'No Arts Amp',
    },
    {
      label: 'Stagger',
      value: params.staggerMultiplier,
      format: 'multiplier',
      source: params.staggerMultiplier > 1.001 ? 'Enemy staggered (x1.3)' : 'Enemy not staggered',
    },
    {
      label: 'Finisher',
      value: params.finisherMultiplier,
      format: 'multiplier',
      source: params.finisherMultiplier > 1.001 ? 'Final strike bonus' : 'Not a final strike',
    },
    {
      label: 'Link',
      value: params.linkMultiplier,
      format: 'multiplier',
      source: params.linkMultiplier > 1.001 ? 'Link attack active' : 'No link buff',
    },
    {
      label: 'Weaken',
      value: params.weakenMultiplier,
      format: 'multiplier',
      source: params.weakenMultiplier < 0.999 ? 'Enemy weakened' : 'No weaken debuff',
    },
    {
      label: 'Susceptibility',
      value: params.susceptibilityMultiplier,
      format: 'multiplier',
      source: params.susceptibilityMultiplier > 1.001 ? 'Element susceptibility active' : 'No susceptibility',
    },
    {
      label: 'Fragility',
      value: params.fragilityMultiplier,
      format: 'multiplier',
      source: params.fragilityMultiplier > 1.001 ? 'Increased DMG Taken active' : 'No fragility debuff',
    },
    {
      label: 'DMG Reduction',
      value: params.dmgReductionMultiplier,
      format: 'multiplier',
      source: params.dmgReductionMultiplier < 0.999 ? 'Enemy has DMG reduction' : 'No DMG reduction',
    },
    {
      label: 'Protection',
      value: params.protectionMultiplier,
      format: 'multiplier',
      source: params.protectionMultiplier < 0.999 ? 'Enemy has protection' : 'No protection',
    },
    {
      label: 'Defense',
      value: params.defenseMultiplier,
      format: 'multiplier',
      source: `100 / (DEF + 100)`,
    },
    {
      label: 'Resistance',
      value: params.resistanceMultiplier,
      format: 'multiplier',
      source: params.resistanceMultiplier < 0.999 ? 'Enemy resists this element'
        : params.resistanceMultiplier > 1.001 ? 'Enemy weak to this element'
        : 'No elemental resistance',
    },
  ];
}

function DamageBreakdownPane({ row }: { row: DamageTableRow }) {
  if (!row.params) {
    return (
      <>
        <div className="edit-panel-header">
          <div className="edit-panel-skill-name">{row.label}</div>
          <div className="edit-info-text" style={{ marginTop: 8 }}>
            {frameToTimeLabelPrecise(row.absoluteFrame)}
          </div>
        </div>
        <div className="edit-panel-body">
          <div className="edit-panel-section">
            <span className="edit-info-text">No damage data available for this tick.</span>
          </div>
        </div>
      </>
    );
  }

  const entries = buildMultiplierEntries(row.params);
  const finalDamage = row.damage ?? 0;

  return (
    <>
      <div className="edit-panel-header">
        <div className="edit-panel-skill-name">{row.label}</div>
        <div className="edit-info-text" style={{ marginTop: 4 }}>
          {frameToTimeLabelPrecise(row.absoluteFrame)}
        </div>
        <div className="dmg-breakdown-total">
          {Math.floor(finalDamage).toLocaleString()}
          <span className="dmg-breakdown-total-label"> damage</span>
        </div>
      </div>
      <div className="edit-panel-body">
        <div className="dmg-breakdown-formula">
          <div className="dmg-breakdown-header">
            <span>Multiplier</span>
            <span>Value</span>
          </div>
          {entries.map((entry) => (
            <div
              key={entry.label}
              className={`dmg-breakdown-row ${getMultiplierClass(entry.value, entry.format)}`}
            >
              <div className="dmg-breakdown-label">{entry.label}</div>
              <div className="dmg-breakdown-value">
                {formatMultiplierValue(entry.value, entry.format)}
              </div>
              <div className="dmg-breakdown-source">{entry.source}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default DamageBreakdownPane;
