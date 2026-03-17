import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TimelineEvent, Operator, Enemy, SelectedFrame, ResourceConfig, Column } from '../consts/viewTypes';
import { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { EnemyStats } from '../controller/appStateController';
import type { DamageTableRow } from '../controller/calculation/damageTableBuilder';
import EventPane from './info-pane/EventPane';
import LoadoutPane from './info-pane/LoadoutPane';
import EnemyPane from './info-pane/EnemyPane';
import ResourcePane from './info-pane/ResourcePane';
import DamageBreakdownPane from './info-pane/DamageBreakdownPane';

// ── Loadout properties type (shared across app) ─────────────────────────────

export interface OperatorProperties {
  level: number;
  potential: number;
  talentOneLevel: number;
  talentTwoLevel: number;
  attributeIncreaseLevel: number;
}

export interface SkillProperties {
  basicAttackLevel: number;
  battleSkillLevel: number;
  comboSkillLevel: number;
  ultimateLevel: number;
}

export interface WeaponProperties {
  level: number;
  skill1Level: number;
  skill2Level: number;
  skill3Level: number;
}

export interface GearProperties {
  /** Per-stat-line ranks for each gear piece. Keyed by StatType. Missing keys default to 4. */
  armorRanks: Record<string, number>;
  glovesRanks: Record<string, number>;
  kit1Ranks: Record<string, number>;
  kit2Ranks: Record<string, number>;
}

export interface LoadoutProperties {
  operator: OperatorProperties;
  skills: SkillProperties;
  weapon: WeaponProperties;
  gear: GearProperties;
  /** Override for tactical max uses. undefined = use model default. */
  tacticalMaxUses?: number;
}


export const DEFAULT_LOADOUT_PROPERTIES: LoadoutProperties = {
  operator: {
    level: 90,
    potential: 5,
    talentOneLevel: 3,
    talentTwoLevel: 3,
    attributeIncreaseLevel: 4,
  },
  skills: {
    basicAttackLevel: 12,
    battleSkillLevel: 12,
    comboSkillLevel: 12,
    ultimateLevel: 12,
  },
  weapon: {
    level: 90,
    skill1Level: 9,
    skill2Level: 9,
    skill3Level: 9,
  },
  gear: {
    armorRanks: {},
    glovesRanks: {},
    kit1Ranks: {},
    kit2Ranks: {},
  },
};

/** Generate default loadout properties for a given operator. */
export function getDefaultLoadoutProperties(op: { rarity: number; maxTalentOneLevel: number; maxTalentTwoLevel: number }): LoadoutProperties {
  return {
    ...DEFAULT_LOADOUT_PROPERTIES,
    operator: {
      ...DEFAULT_LOADOUT_PROPERTIES.operator,
      potential: op.rarity >= 6 ? 0 : 5,
      talentOneLevel: op.maxTalentOneLevel,
      talentTwoLevel: op.maxTalentTwoLevel,
    },
  };
}

// ── Unified information pane ────────────────────────────────────────────────

type InformationPaneProps = {
  pinned?: boolean;
  onTogglePin?: () => void;
  /** 0 = succinct, 1 = detailed, 2 = verbose */
  verbose?: 0 | 1 | 2;
  onToggleVerbose?: () => void;
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
      isDerived?: boolean;
      editContext?: string | null;
      rawEvents?: readonly TimelineEvent[];
      allProcessedEvents?: readonly TimelineEvent[];
      loadoutProperties?: Record<string, LoadoutProperties>;
      damageRows?: DamageTableRow[];
      spConsumptionHistory?: { eventId: string; frame: number; naturalConsumed: number; returnedConsumed: number }[];
      onSaveAsCustomSkill?: (event: TimelineEvent) => void;
    }
  | {
      mode: 'loadout';
      operatorId: string;
      slotId: string;
      operator: Operator;
      loadout: OperatorLoadoutState;
      stats: LoadoutProperties;
      onStatsChange: (stats: LoadoutProperties) => void;
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
      /** Total resource wasted due to overflow. */
      wasted?: number;
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
  const verbose = props.verbose ?? 1;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing, props.onClose]);

  return (
    <div
      ref={panelRef}
      className={`event-edit-panel${closing ? ' event-edit-panel--closing' : ''}`}
    >
      <div className="edit-panel-actions">
        {props.onToggleVerbose && <button
          className={`edit-panel-verbose${verbose > 0 ? ' edit-panel-verbose--active' : ''}`}
          onClick={props.onToggleVerbose}
          title={verbose === 0 ? 'Succinct' : verbose === 1 ? 'Detailed' : 'Verbose'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h16"/>
            {verbose >= 1 && <path d="M4 7h10"/>}
            {verbose >= 2 && <path d="M4 17h14"/>}
          </svg>
        </button>}
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
          isDerived={props.isDerived}
          editContext={props.editContext}
          debugMode={props.debugMode}
          rawEvents={props.rawEvents}
          allProcessedEvents={props.allProcessedEvents}
          loadoutProperties={props.loadoutProperties}
          damageRows={props.damageRows}
          spConsumptionHistory={props.spConsumptionHistory}
          onSaveAsCustomSkill={props.onSaveAsCustomSkill}
          verbose={verbose}
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
          verbose={verbose}
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
          wasted={props.wasted}
        />
      ) : (
        <DamageBreakdownPane row={props.damageRow} />
      )}
    </div>
  );
}
