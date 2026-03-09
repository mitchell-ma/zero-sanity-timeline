import { useState, useEffect, useRef, useCallback } from 'react';
import { framesToSeconds, secondsToFrames, frameToDetailLabel, frameToTimeLabelPrecise, FPS } from '../utils/timeline';
import { SKILL_LABELS, REACTION_LABELS, COMBAT_SKILL_LABELS } from '../consts/channelLabels';
import { CombatSkillsType } from '../consts/enums';
import { TimelineEvent, Operator, Enemy, SkillType, SelectedFrame } from "../consts/viewTypes";
import { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { WEAPONS, ARMORS, GLOVES, KITS, CONSUMABLES, TACTICALS } from '../utils/loadoutRegistry';

// ── Loadout stats type (shared across app) ──────────────────────────────────

export interface LoadoutStats {
  operatorLevel: number;
  potential: number;
  talentOneLevel: number;
  talentTwoLevel: number;
  basicAttackLevel: number;
  battleSkillLevel: number;
  comboSkillLevel: number;
  ultimateLevel: number;
  weaponLevel: number;
  weaponSkill1Level: number;
  weaponSkill2Level: number;
  weaponSkill3Level: number;
  gearRank: number;
}

export const DEFAULT_LOADOUT_STATS: LoadoutStats = {
  operatorLevel: 90,
  potential: 5,
  talentOneLevel: 3,
  talentTwoLevel: 3,
  basicAttackLevel: 12,
  battleSkillLevel: 12,
  comboSkillLevel: 12,
  ultimateLevel: 12,
  weaponLevel: 90,
  weaponSkill1Level: 5,
  weaponSkill2Level: 5,
  weaponSkill3Level: 5,
  gearRank: 4,
};

/** Generate default loadout stats for a given operator rarity. */
export function getDefaultLoadoutStats(rarity: number): LoadoutStats {
  return {
    ...DEFAULT_LOADOUT_STATS,
    potential: rarity >= 6 ? 0 : 5,
  };
}

const LEVEL_BREAKPOINTS = [1, 20, 40, 60, 80, 90];

// ── Shared field components ─────────────────────────────────────────────────

function DurationField({ label, value, onChange, onCommit }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="edit-field">
      <span className="edit-field-label">{label}</span>
      <div className="edit-field-row">
        <input
          className="edit-input"
          type="number"
          step="0.1"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => { if (e.key === 'Enter') { onCommit(); (e.target as HTMLInputElement).blur(); } }}
        />
        <span className="edit-input-unit">s</span>
      </div>
    </div>
  );
}

/** Initial delay before repeating (ms). */
const REPEAT_DELAY = 400;
/** Interval between repeats (ms). */
const REPEAT_INTERVAL = 80;

function StatField({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startRepeat = useCallback((delta: number) => {
    stopRepeat();
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        const next = Math.max(min, Math.min(max, valueRef.current + delta));
        if (next !== valueRef.current) onChange(next);
      }, REPEAT_INTERVAL);
    }, REPEAT_DELAY);
  }, [min, max, onChange, stopRepeat]);

  // Clean up on unmount
  useEffect(() => stopRepeat, [stopRepeat]);

  return (
    <div className="stat-field">
      <span className="edit-field-label">{label}</span>
      <div className="stat-field-controls">
        <button
          className="stat-arrow"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          onMouseDown={() => startRepeat(-1)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
        >-</button>
        <input
          className="edit-input stat-field-input"
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = Math.max(min, Math.min(max, Number(e.target.value) || min));
            onChange(v);
          }}
        />
        <button
          className="stat-arrow"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          onMouseDown={() => startRepeat(1)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
        >+</button>
      </div>
    </div>
  );
}

function LevelSelect({ label, value, options, onChange }: {
  label: string;
  value: number;
  options: number[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="stat-field">
      <span className="edit-field-label">{label}</span>
      <select
        className="edit-input stat-level-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((lv) => (
          <option key={lv} value={lv}>{lv}</option>
        ))}
      </select>
    </div>
  );
}

// ── Event pane content ──────────────────────────────────────────────────────

interface EventPaneProps {
  event: TimelineEvent;
  operators: Operator[];
  slots: { slotId: string; operator: Operator | null }[];
  enemy: Enemy;
  onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  selectedFrame?: SelectedFrame | null;
}

function EventPane({
  event,
  operators,
  enemy,
  onUpdate,
  onRemove,
  onClose,
  selectedFrame,
  slots,
}: EventPaneProps) {
  let ownerName        = '';
  let skillName        = '';
  let ownerColor       = '#4488ff';
  let triggerCondition: string | null = null;
  let columnLabel     = '';

  if (event.ownerId === 'enemy') {
    ownerName  = enemy.name;
    const status = enemy.statuses.find((s) => s.id === event.columnId);
    const reaction = REACTION_LABELS[event.columnId];
    if (status) {
      skillName    = status.label;
      ownerColor   = status.color;
      columnLabel = 'INFLICTION';
    } else if (reaction) {
      skillName    = reaction.label;
      ownerColor   = reaction.color;
      columnLabel = 'ARTS REACTION';
    } else {
      skillName    = event.columnId;
      ownerColor   = '#cc3333';
      columnLabel = 'STATUS';
    }
  } else {
    const slot = slots.find((s) => s.slotId === event.ownerId);
    const op = slot?.operator;
    if (op) {
      ownerName  = op.name;
      ownerColor = op.color;
      if (event.columnId === 'melting-flame') {
        skillName    = 'Melting Flame';
        ownerColor   = '#f07030';
        columnLabel = 'STATUS';
      } else {
        const skillType = event.columnId as SkillType;
        const skill = op.skills[skillType];
        if (skill) {
          skillName        = skill.name;
          triggerCondition = skill.triggerCondition;
          columnLabel     = SKILL_LABELS[skillType] ?? event.columnId.toUpperCase();
        }
      }
    }
  }

  const combatLabel = COMBAT_SKILL_LABELS[event.name as CombatSkillsType];
  if (combatLabel) {
    skillName = combatLabel;
  } else if (event.name && event.name !== event.columnId) {
    skillName = event.name;
  }

  const isSequenced = event.segments && event.segments.length > 0;

  const selectedFrameElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selectedFrame && selectedFrameElRef.current) {
      selectedFrameElRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedFrame]);

  const [activeSec,     setActiveSec]     = useState(framesToSeconds(event.activationDuration));
  const [lingerSec,     setLingerSec]     = useState(framesToSeconds(event.activeDuration));
  const [cooldownSec,   setCooldownSec]   = useState(framesToSeconds(event.cooldownDuration));
  const [startWholeSec, setStartWholeSec] = useState(String(Math.floor(event.startFrame / FPS)));
  const [startModFrame, setStartModFrame] = useState(String(event.startFrame % FPS));

  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setStartWholeSec(String(Math.floor(event.startFrame / FPS)));
    setStartModFrame(String(event.startFrame % FPS));
    setActiveSec(framesToSeconds(event.activationDuration));
    setLingerSec(framesToSeconds(event.activeDuration));
    setCooldownSec(framesToSeconds(event.cooldownDuration));
  }, [event.id, event.startFrame, event.activationDuration, event.activeDuration, event.cooldownDuration]);

  const computedStartFrame = Math.max(0, (parseInt(startWholeSec) || 0) * FPS + (parseInt(startModFrame) || 0));

  const commit = () => {
    if (isSequenced) {
      onUpdate(event.id, { startFrame: computedStartFrame });
    } else {
      onUpdate(event.id, {
        startFrame:        computedStartFrame,
        activationDuration:    secondsToFrames(activeSec),
        activeDuration: secondsToFrames(lingerSec),
        cooldownDuration:  secondsToFrames(cooldownSec),
      });
    }
  };

  const handleFocus = () => { focusedRef.current = true; };
  const handleBlur = () => { focusedRef.current = false; commit(); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); }
  };

  const totalDurationFrames = isSequenced
    ? event.segments!.reduce((sum, s) => sum + s.durationFrames, 0)
    : event.activationDuration + event.activeDuration + event.cooldownDuration;

  return (
    <>
      <div className="edit-panel-header">
        <div
          style={{
            width: 4, height: 40, borderRadius: 2, flexShrink: 0,
            background: ownerColor,
            boxShadow: `0 0 8px ${ownerColor}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          <div className="edit-panel-skill-name">{skillName}</div>
          <div className="edit-panel-op-name" style={{ color: ownerColor }}>
            {ownerName}
            {columnLabel && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· {columnLabel}</span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            @ {frameToDetailLabel(event.startFrame)}
          </div>
        </div>
        <button className="edit-panel-close" onClick={onClose}>×</button>
      </div>

      <div className="edit-panel-body" onFocus={handleFocus}>
        {triggerCondition && (
          <div className="edit-panel-trigger">{triggerCondition}</div>
        )}

        <div className="edit-panel-section">
          <span className="edit-section-label">Timing</span>
          <div className="edit-field">
            <span className="edit-field-label">Start offset</span>
            <div className="edit-field-row">
              <input
                className="edit-input"
                type="number"
                step="1"
                min="0"
                value={startWholeSec}
                onChange={(e) => setStartWholeSec(e.target.value)}
                onBlur={handleBlur}
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
              />
              <span className="edit-input-unit">s</span>
              <input
                className="edit-input"
                type="number"
                step="1"
                min="0"
                max={FPS - 1}
                value={startModFrame}
                onChange={(e) => setStartModFrame(e.target.value)}
                onBlur={handleBlur}
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
              />
              <span className="edit-input-unit">f</span>
            </div>
            <div className="edit-field-computed">
              = {frameToTimeLabelPrecise(computedStartFrame)}
            </div>
          </div>
        </div>

        {isSequenced ? (
          <>
            {event.segments!.map((seg, si) => {
              const segLabel = seg.label ? `Sequence ${seg.label}` : `Sequence ${si + 1}`;
              return (
                <div key={si} className="edit-panel-section">
                  <span className="edit-section-label">{segLabel}</span>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
                    <div>Duration: {framesToSeconds(seg.durationFrames)}s ({seg.durationFrames}f)</div>
                  </div>
                  {seg.frames && seg.frames.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {seg.frames.map((f, fi) => {
                        const isSelected = selectedFrame?.eventId === event.id
                          && selectedFrame.segmentIndex === si
                          && selectedFrame.frameIndex === fi;
                        return (
                          <div
                            key={fi}
                            ref={isSelected ? selectedFrameElRef : undefined}
                            style={{
                              fontSize: 11,
                              fontFamily: 'var(--font-mono)',
                              lineHeight: 1.8,
                              padding: '1px 4px',
                              borderRadius: 2,
                              background: isSelected ? 'rgba(255, 221, 68, 0.15)' : 'transparent',
                              color: isSelected ? '#ffdd44' : 'var(--text-muted)',
                              borderLeft: isSelected ? '2px solid #ffdd44' : '2px solid transparent',
                            }}
                          >
                            <div>Hit {fi + 1} — Offset: {framesToSeconds(f.offsetFrame)}s ({f.offsetFrame}f)</div>
                            {(f.skillPointRecovery ?? 0) > 0 && (
                              <div style={{ paddingLeft: 8 }}>SP Recovery: {f.skillPointRecovery}</div>
                            )}
                            {(f.stagger ?? 0) > 0 && (
                              <div style={{ paddingLeft: 8 }}>Stagger: {f.stagger}</div>
                            )}
                            {f.applyArtsInfliction && (
                              <div style={{ paddingLeft: 8, color: '#f07030' }}>
                                Apply: {f.applyArtsInfliction.element} Infliction ×{f.applyArtsInfliction.stacks}
                              </div>
                            )}
                            {f.absorbArtsInfliction && (
                              <div style={{ paddingLeft: 8, color: '#f0a040' }}>
                                Absorb: {f.absorbArtsInfliction.element} Infliction (max {f.absorbArtsInfliction.stacks}) → {f.absorbArtsInfliction.exchangeStatus.replace(/_/g, ' ')} ({f.absorbArtsInfliction.ratio})
                              </div>
                            )}
                            {f.applyForcedReaction && (
                              <div style={{ paddingLeft: 8, color: '#ff5522' }}>
                                Apply: {f.applyForcedReaction.reaction.replace(/_/g, ' ')} (Lv.{f.applyForcedReaction.statusLevel})
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="edit-panel-section">
              <span className="edit-section-label">Summary</span>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
                <div>Sequences: {event.segments!.length}</div>
                <div>Total Duration: {framesToSeconds(totalDurationFrames)}s ({totalDurationFrames}f)</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="edit-panel-section">
              <span className="edit-section-label">Active Phase</span>
              <DurationField label="Duration" value={activeSec} onChange={setActiveSec} onCommit={handleBlur} />
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Lingering Effect</span>
              <DurationField label="Duration (0 = none)" value={lingerSec} onChange={setLingerSec} onCommit={handleBlur} />
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Cooldown</span>
              <DurationField label="Duration (0 = none)" value={cooldownSec} onChange={setCooldownSec} onCommit={handleBlur} />
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Info</span>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
                <div>Active: {framesToSeconds(event.activationDuration)}s</div>
                <div>Total: {framesToSeconds(totalDurationFrames)}s</div>
                <div>Frames: {event.activationDuration} / {event.activeDuration} / {event.cooldownDuration}</div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="edit-panel-footer">
        <button className="btn-delete-event" onClick={() => onRemove(event.id)}>
          REMOVE EVENT
        </button>
      </div>
    </>
  );
}

// ── Loadout pane content ────────────────────────────────────────────────────

interface LoadoutPaneProps {
  operator: Operator;
  loadout: OperatorLoadoutState;
  stats: LoadoutStats;
  onStatsChange: (stats: LoadoutStats) => void;
  onClose: () => void;
}

function LoadoutPane({ operator, loadout, stats, onStatsChange, onClose }: LoadoutPaneProps) {
  const set = (key: keyof LoadoutStats) => (v: number) =>
    onStatsChange({ ...stats, [key]: v });

  const weapon = loadout.weaponIdx !== null ? WEAPONS[loadout.weaponIdx] : null;
  const armor  = loadout.armorIdx  !== null ? ARMORS[loadout.armorIdx]   : null;
  const gloves = loadout.glovesIdx !== null ? GLOVES[loadout.glovesIdx]  : null;
  const kit1   = loadout.kit1Idx   !== null ? KITS[loadout.kit1Idx]      : null;
  const kit2   = loadout.kit2Idx   !== null ? KITS[loadout.kit2Idx]      : null;
  const food   = loadout.consumableIdx !== null ? CONSUMABLES[loadout.consumableIdx] : null;
  const tac    = loadout.tacticalIdx   !== null ? TACTICALS[loadout.tacticalIdx]     : null;

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
        <button className="edit-panel-close" onClick={onClose}>×</button>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">Operator</span>
          <LevelSelect label="Operator Level"     value={stats.operatorLevel}     options={LEVEL_BREAKPOINTS} onChange={set('operatorLevel')} />
          <StatField   label="Potential"           value={stats.potential}         min={0} max={5}  onChange={set('potential')} />
          <StatField   label="Talent 1 Level"      value={stats.talentOneLevel}   min={0} max={3}  onChange={set('talentOneLevel')} />
          <StatField   label="Talent 2 Level"      value={stats.talentTwoLevel}   min={0} max={3}  onChange={set('talentTwoLevel')} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Skills</span>
          <StatField label="Basic Attack Level"  value={stats.basicAttackLevel}  min={1} max={12} onChange={set('basicAttackLevel')} />
          <StatField label="Battle Skill Level"  value={stats.battleSkillLevel}  min={1} max={12} onChange={set('battleSkillLevel')} />
          <StatField label="Combo Skill Level"   value={stats.comboSkillLevel}   min={1} max={12} onChange={set('comboSkillLevel')} />
          <StatField label="Ultimate Level"      value={stats.ultimateLevel}     min={1} max={12} onChange={set('ultimateLevel')} />
        </div>

        {weapon && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Weapon</span>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{weapon.name}</div>
            <LevelSelect label="Weapon Level"    value={stats.weaponLevel}       options={LEVEL_BREAKPOINTS} onChange={set('weaponLevel')} />
            <StatField   label="Skill 1 Level"   value={stats.weaponSkill1Level} min={1} max={5}  onChange={set('weaponSkill1Level')} />
            <StatField   label="Skill 2 Level"   value={stats.weaponSkill2Level} min={1} max={5}  onChange={set('weaponSkill2Level')} />
            <StatField   label="Skill 3 Level"   value={stats.weaponSkill3Level} min={1} max={5}  onChange={set('weaponSkill3Level')} />
          </div>
        )}

        {(armor || gloves || kit1 || kit2) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Gear</span>
            {armor  && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{armor.name}</div>}
            {gloves && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{gloves.name}</div>}
            {kit1   && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{kit1.name}</div>}
            {kit2   && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{kit2.name}</div>}
            <StatField label="Gear Rank" value={stats.gearRank} min={1} max={4} onChange={set('gearRank')} />
          </div>
        )}

        {(food || tac) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Items</span>
            {food && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{food.name}</div>}
            {tac  && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{tac.name}</div>}
          </div>
        )}
      </div>
    </>
  );
}

// ── Unified information pane ────────────────────────────────────────────────

type InformationPaneProps =
  | ({
      mode: 'event';
      event: TimelineEvent;
      operators: Operator[];
      slots: { slotId: string; operator: Operator | null }[];
      enemy: Enemy;
      onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
      onRemove: (id: string) => void;
      onClose: () => void;
      selectedFrame?: SelectedFrame | null;
    })
  | ({
      mode: 'loadout';
      operator: Operator;
      loadout: OperatorLoadoutState;
      stats: LoadoutStats;
      onStatsChange: (stats: LoadoutStats) => void;
      onClose: () => void;
    });

export default function InformationPane(props: InformationPaneProps) {
  return (
    <div className="event-edit-panel">
      {props.mode === 'event' ? (
        <EventPane
          event={props.event}
          operators={props.operators}
          slots={props.slots}
          enemy={props.enemy}
          onUpdate={props.onUpdate}
          onRemove={props.onRemove}
          onClose={props.onClose}
          selectedFrame={props.selectedFrame}
        />
      ) : (
        <LoadoutPane
          operator={props.operator}
          loadout={props.loadout}
          stats={props.stats}
          onStatsChange={props.onStatsChange}
          onClose={props.onClose}
        />
      )}
    </div>
  );
}
