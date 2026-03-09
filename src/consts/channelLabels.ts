import { SkillType } from './viewTypes';

// ── Skill labels ────────────────────────────────────────────────────────────

export const SKILL_LABELS: Record<SkillType, string> = {
  basic:    'BASIC',
  battle:   'BATTLE',
  combo:    'COMBO',
  ultimate: 'ULT',
};

// ── Reaction labels & micro-columns ─────────────────────────────────────────

export const REACTION_LABELS: Record<string, { label: string; color: string }> = {
  combustion:      { label: 'Combustion',      color: '#ff5522' },
  solidification:  { label: 'Solidification',  color: '#88ddff' },
  corrosion:       { label: 'Corrosion',       color: '#33cc66' },
  electrification: { label: 'Electrification', color: '#e8c840' },
};

export const REACTION_MICRO_COLUMNS = [
  { id: 'combustion',      label: 'COMB',  color: '#ff5522' },
  { id: 'solidification',  label: 'SOLID', color: '#88ddff' },
  { id: 'corrosion',       label: 'CORR',  color: '#33cc66' },
  { id: 'electrification', label: 'ELEC',  color: '#e8c840' },
];
