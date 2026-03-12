import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TimelineEvent, Operator, Enemy, SelectedFrame, ResourceConfig, Column, MiniTimeline } from '../consts/viewTypes';
import { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { EnemyStats } from '../controller/appStateController';
import type { DamageTableRow } from '../controller/calculation/damageTableBuilder';
import EventPane from './info-pane/EventPane';
import LoadoutPane from './info-pane/LoadoutPane';
import EnemyPane from './info-pane/EnemyPane';
import ResourcePane from './info-pane/ResourcePane';
import DamageBreakdownPane from './info-pane/DamageBreakdownPane';

// ── Loadout stats type (shared across app) ──────────────────────────────────

export interface LoadoutStats {
  operatorLevel: number;
  potential: number;
  talentOneLevel: number;
  talentTwoLevel: number;
  attributeIncreaseLevel: number;
  basicAttackLevel: number;
  battleSkillLevel: number;
  comboSkillLevel: number;
  ultimateLevel: number;
  weaponLevel: number;
  weaponSkill1Level: number;
  weaponSkill2Level: number;
  weaponSkill3Level: number;
  /** Per-stat-line ranks for each gear piece. Keyed by StatType. Missing keys default to 4. */
  armorRanks: Record<string, number>;
  glovesRanks: Record<string, number>;
  kit1Ranks: Record<string, number>;
  kit2Ranks: Record<string, number>;
  /** Override for tactical max uses. undefined = use model default. */
  tacticalMaxUses?: number;
}

export const DEFAULT_LOADOUT_STATS: LoadoutStats = {
  operatorLevel: 90,
  potential: 5,
  talentOneLevel: 3,
  talentTwoLevel: 3,
  attributeIncreaseLevel: 4,
  basicAttackLevel: 12,
  battleSkillLevel: 12,
  comboSkillLevel: 12,
  ultimateLevel: 12,
  weaponLevel: 90,
  weaponSkill1Level: 9,
  weaponSkill2Level: 9,
  weaponSkill3Level: 9,
  armorRanks: {},
  glovesRanks: {},
  kit1Ranks: {},
  kit2Ranks: {},
};

/** Generate default loadout stats for a given operator. */
export function getDefaultLoadoutStats(op: { rarity: number; maxTalentOneLevel: number; maxTalentTwoLevel: number }): LoadoutStats {
  return {
    ...DEFAULT_LOADOUT_STATS,
    potential: op.rarity >= 6 ? 0 : 5,
    talentOneLevel: op.maxTalentOneLevel,
    talentTwoLevel: op.maxTalentTwoLevel,
  };
}

// ── Unified information pane ────────────────────────────────────────────────

type InformationPaneProps = {
  pinned?: boolean;
  onTogglePin?: () => void;
  triggerClose?: boolean;
  debugMode?: boolean;
} & (
  | {
      mode: 'event';
      event: TimelineEvent;
      processedEvent?: TimelineEvent;
      operators: Operator[];
      slots: { slotId: string; operator: Operator | null }[];
      enemy: Enemy;
      columns: Column[];
      onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
      onRemove: (id: string) => void;
      onClose: () => void;
      selectedFrames?: SelectedFrame[];
      readOnly?: boolean;
      editContext?: string | null;
      rawEvents?: readonly TimelineEvent[];
      allProcessedEvents?: readonly TimelineEvent[];
    }
  | {
      mode: 'loadout';
      operatorId: string;
      slotId: string;
      operator: Operator;
      loadout: OperatorLoadoutState;
      stats: LoadoutStats;
      onStatsChange: (stats: LoadoutStats) => void;
      onClose: () => void;
      allProcessedEvents?: readonly TimelineEvent[];
    }
  | {
      mode: 'enemy';
      enemy: Enemy;
      enemyStats: EnemyStats;
      onEnemyStatsChange: (stats: EnemyStats) => void;
      onClose: () => void;
    }
  | {
      mode: 'resource';
      label: string;
      color: string;
      config: ResourceConfig;
      onChange: (config: ResourceConfig) => void;
      onClose: () => void;
    }
  | {
      mode: 'damage';
      damageRow: DamageTableRow;
      onClose: () => void;
    }
);

export default function InformationPane(props: InformationPaneProps) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setClosing(true);
  }, []);

  // Parent-triggered close (ignored when pinned)
  useEffect(() => {
    if (props.triggerClose && !closing && !props.pinned) setClosing(true);
  }, [props.triggerClose, closing, props.pinned]);

  useEffect(() => {
    if (!closing) return;
    const el = panelRef.current;
    if (!el) { props.onClose(); return; }
    const onEnd = () => props.onClose();
    el.addEventListener('animationend', onEnd, { once: true });
    return () => el.removeEventListener('animationend', onEnd);
  }, [closing, props.onClose]);

  return (
    <div
      ref={panelRef}
      className={`event-edit-panel${closing ? ' event-edit-panel--closing' : ''}`}
    >
      <div className="edit-panel-actions">
        {props.onTogglePin && (
          <button
            className={`edit-panel-pin${props.pinned ? ' edit-panel-pin--active' : ''}`}
            onClick={props.onTogglePin}
            title={props.pinned ? 'Unpin panel' : 'Pin panel open'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5"/>
              <path d="M5 12H19"/>
              <path d="M15 3L9 3L8.5 7.5L7 9.5V12H17V9.5L15.5 7.5Z" fill={props.pinned ? 'currentColor' : 'none'}/>
            </svg>
          </button>
        )}
        <button className="edit-panel-close" onClick={handleClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      {props.mode === 'event' ? (
        <EventPane
          event={props.event}
          processedEvent={props.processedEvent}
          operators={props.operators}
          slots={props.slots}
          enemy={props.enemy}
          columns={props.columns}
          onUpdate={props.onUpdate}
          onRemove={props.onRemove}
          onClose={handleClose}
          selectedFrames={props.selectedFrames}
          readOnly={props.readOnly}
          editContext={props.editContext}
          debugMode={props.debugMode}
          rawEvents={props.rawEvents}
          allProcessedEvents={props.allProcessedEvents}
        />
      ) : props.mode === 'loadout' ? (
        <LoadoutPane
          operatorId={props.operatorId}
          slotId={props.slotId}
          operator={props.operator}
          loadout={props.loadout}
          stats={props.stats}
          onStatsChange={props.onStatsChange}
          onClose={handleClose}
          allProcessedEvents={props.allProcessedEvents}
        />
      ) : props.mode === 'enemy' ? (
        <EnemyPane
          enemy={props.enemy}
          stats={props.enemyStats}
          onStatsChange={props.onEnemyStatsChange}
          onClose={handleClose}
        />
      ) : props.mode === 'resource' ? (
        <ResourcePane
          label={props.label}
          color={props.color}
          config={props.config}
          onChange={props.onChange}
          onClose={handleClose}
        />
      ) : (
        <DamageBreakdownPane row={props.damageRow} />
      )}
    </div>
  );
}
