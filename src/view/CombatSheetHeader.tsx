import React, { useMemo } from 'react';
import type { Slot } from '../controller/timeline/columnBuilder';
import type { DamageStatistics, DamageTableColumn } from '../controller/calculation/damageTableBuilder';
import type { LoadoutProperties } from './InformationPane';
import type { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { ElementType } from '../consts/enums';
import { OperatorClassType } from '../model/enums/operators';
import { NounType } from '../dsl/semantics';
import {
  ELEMENT_ICONS,
  CLASS_ICONS,
  POTENTIAL_ICONS,
  weaponSkillLevelToPotential,
} from '../utils/metaIcons';
import {
  getWeapon,
  getGearPiece,
  getConsumable,
  getTactical,
} from '../controller/gameDataStore';

interface CombatSheetHeaderProps {
  slots: Slot[];
  loadouts?: Record<string, OperatorLoadoutState>;
  loadoutProperties: Record<string, LoadoutProperties>;
  statistics: DamageStatistics;
  tableColumns: DamageTableColumn[];
}

/** Column keys the stats table renders, in display order. */
const STATS_COLUMNS: ReadonlyArray<{ columnId: string; label: string }> = [
  { columnId: NounType.BASIC_ATTACK, label: 'Basic'    },
  { columnId: NounType.BATTLE,       label: 'Battle'   },
  { columnId: NounType.COMBO,        label: 'Combo'    },
  { columnId: NounType.ULTIMATE,     label: 'Ultimate' },
];

const FPS = 120;

function formatDamage(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatSeconds(frames: number): string {
  return `${(frames / FPS).toFixed(1)}`;
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function OperatorBadges({ props, element, operatorClassType }: {
  props?: LoadoutProperties;
  element: ElementType;
  operatorClassType?: OperatorClassType;
}) {
  const potRank = props?.operator.potential ?? 0;
  const potIcon = POTENTIAL_ICONS[Math.max(0, Math.min(5, potRank))];
  const classIcon = operatorClassType ? CLASS_ICONS[operatorClassType] : undefined;
  const elemIcon = ELEMENT_ICONS[element];
  const isArts = element === ElementType.ARTS;

  return (
    <div className="csh-op-badges">
      <div className="csh-op-badge csh-op-badge--pot" title={`P${potRank}`}>
        <img src={potIcon} alt={`P${potRank}`} />
      </div>
      {classIcon && (
        <div className="csh-op-badge csh-op-badge--cls" title={operatorClassType}>
          <img src={classIcon} alt={operatorClassType} />
        </div>
      )}
      {isArts ? (
        <div className="csh-op-badge csh-op-badge--ele csh-op-badge--ele-arts" title="Arts">ARTS</div>
      ) : elemIcon ? (
        <div className="csh-op-badge csh-op-badge--ele" title={element}>
          <img src={elemIcon} alt={element} />
        </div>
      ) : null}
    </div>
  );
}

function GearSlotIcon({ icon, name }: { icon: string; name?: string }) {
  return (
    <div className="csh-slot csh-slot--filled" title={name}>
      <div className="csh-slot-icon" style={{ backgroundImage: `url(${icon})` }} />
    </div>
  );
}

function GearSlotEmpty({ label }: { label: string }) {
  return <div className="csh-slot csh-slot--empty" data-label={label} />;
}

function WpnPotSlot({ rank }: { rank: number }) {
  return (
    <div className="csh-slot csh-slot--wpn-pot" title={`Weapon P${rank}`}>
      <div className="csh-slot-icon" style={{ backgroundImage: `url(${POTENTIAL_ICONS[rank]})` }} />
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default React.memo(function CombatSheetHeader({
  slots, loadouts, loadoutProperties, statistics, tableColumns,
}: CombatSheetHeaderProps) {
  // Build lookup: slotId → columnId → damage (for per-skill breakdown)
  const opColumnDamage = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const col of tableColumns) {
      const dmg = statistics.columnTotals.get(col.key) ?? 0;
      let inner = map.get(col.ownerEntityId);
      if (!inner) { inner = new Map(); map.set(col.ownerEntityId, inner); }
      inner.set(col.columnId, (inner.get(col.columnId) ?? 0) + dmg);
    }
    return map;
  }, [statistics.columnTotals, tableColumns]);

  // Duration derived from teamDps (teamTotal / dps = seconds).
  const durationSec = useMemo(() => {
    if (statistics.teamDps != null && statistics.teamDps > 0) {
      return statistics.teamTotalDamage / statistics.teamDps;
    }
    return null;
  }, [statistics.teamDps, statistics.teamTotalDamage]);

  const occupiedSlots = slots.filter((s) => s.operator);
  const slotCount = occupiedSlots.length;
  // Grid columns follow the actual slot count — no empty cells when <4 operators,
  // keeps the component flexible for any team size.
  const gridTemplate = { gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` };

  return (
    <section className="csh">
      {/* ── LEFT: operator cards + equipment strips ─────────────────────────── */}
      <div className="csh-team">
        <div className="csh-cards-row" style={gridTemplate}>
          {occupiedSlots.map((slot) => {
            const op = slot.operator!;
            const props = loadoutProperties[slot.slotId];
            const element = op.element as ElementType;
            const operatorClassType = op.operatorClassType as OperatorClassType | undefined;
            return (
              <article
                key={slot.slotId}
                className="csh-op-card"
                style={{ '--accent': op.color } as React.CSSProperties}
              >
                {op.splash && (
                  <div
                    className="csh-op-splash"
                    style={{ backgroundImage: `url(${op.splash})` }}
                  />
                )}
                <OperatorBadges
                  props={props}
                  element={element}
                  operatorClassType={operatorClassType}
                />
                <div className="csh-op-accent" />
              </article>
            );
          })}
        </div>

        {/* Row A: WPN / WPN-POT / CSM / TAC */}
        <div className="csh-gear-row" style={gridTemplate}>
          {occupiedSlots.map((slot) => {
            const op = slot.operator!;
            const lo = loadouts?.[slot.slotId];
            const props = loadoutProperties[slot.slotId];
            const wpn = lo?.weaponId ? getWeapon(lo.weaponId) : undefined;
            const csm = lo?.consumableId ? getConsumable(lo.consumableId) : undefined;
            const tac = lo?.tacticalId ? getTactical(lo.tacticalId) : undefined;
            const weaponPotRank = weaponSkillLevelToPotential(props?.weapon.skill3Level ?? 4);
            return (
              <div
                key={slot.slotId}
                className="csh-gear-strip csh-gear-strip--wct"
                style={{ '--accent': op.color } as React.CSSProperties}
              >
                {wpn?.icon ? <GearSlotIcon icon={wpn.icon} name={wpn.name} /> : <GearSlotEmpty label="WPN" />}
                <WpnPotSlot rank={weaponPotRank} />
                {csm?.icon ? <GearSlotIcon icon={csm.icon} name={csm.name} /> : <GearSlotEmpty label="CSM" />}
                {tac?.icon ? <GearSlotIcon icon={tac.icon} name={tac.name} /> : <GearSlotEmpty label="TAC" />}
              </div>
            );
          })}
        </div>

        {/* Row B: ARM / GLV / K1 / K2 */}
        <div className="csh-gear-row" style={gridTemplate}>
          {occupiedSlots.map((slot) => {
            const op = slot.operator!;
            const lo = loadouts?.[slot.slotId];
            const arm = lo?.armorId ? getGearPiece(lo.armorId) : undefined;
            const glv = lo?.glovesId ? getGearPiece(lo.glovesId) : undefined;
            const k1 = lo?.kit1Id ? getGearPiece(lo.kit1Id) : undefined;
            const k2 = lo?.kit2Id ? getGearPiece(lo.kit2Id) : undefined;
            return (
              <div
                key={slot.slotId}
                className="csh-gear-strip csh-gear-strip--gears"
                style={{ '--accent': op.color } as React.CSSProperties}
              >
                {arm?.icon ? <GearSlotIcon icon={arm.icon} name={arm.name} /> : <GearSlotEmpty label="ARM" />}
                {glv?.icon ? <GearSlotIcon icon={glv.icon} name={glv.name} /> : <GearSlotEmpty label="GLV" />}
                {k1?.icon  ? <GearSlotIcon icon={k1.icon}  name={k1.name}  /> : <GearSlotEmpty label="K1"  />}
                {k2?.icon  ? <GearSlotIcon icon={k2.icon}  name={k2.name}  /> : <GearSlotEmpty label="K2"  />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT: stats table ─────────────────────────────────────────────── */}
      <div className="csh-stats">
        <div className="csh-stats-head">
          <div>Operator</div>
          <div>Total</div>
          {STATS_COLUMNS.map((c) => <div key={c.columnId}>{c.label}</div>)}
        </div>

        <div className="csh-stats-body">
          {occupiedSlots.map((slot) => {
            const op = slot.operator!;
            const opStats = statistics.operators.find((o) => o.ownerEntityId === slot.slotId);
            const total = opStats?.totalDamage ?? 0;
            const teamPct = opStats?.teamPct ?? 0;
            const skillBreakdown = opColumnDamage.get(slot.slotId);
            return (
              <div
                key={slot.slotId}
                className="csh-stats-row"
                style={{ '--accent': op.color } as React.CSSProperties}
              >
                <div className="csh-op-tag">
                  <span className="csh-tag-dot" />
                  <span className="csh-tag-name">{op.name}</span>
                </div>
                <div className="csh-num-cell">
                  <span className="csh-num csh-num--lead">{formatDamage(total)}</span>
                  <span className="csh-pct csh-pct--team">{total > 0 ? formatPct(teamPct) : ''}</span>
                </div>
                {STATS_COLUMNS.map((col) => {
                  const dmg = skillBreakdown?.get(col.columnId) ?? 0;
                  const pct = total > 0 ? dmg / total : 0;
                  const isEmpty = dmg <= 0;
                  return (
                    <div
                      key={col.columnId}
                      className={`csh-num-cell${isEmpty ? ' csh-num-cell--dim' : ''}`}
                    >
                      <span className="csh-num">{formatDamage(dmg)}</span>
                      <span className="csh-pct">{isEmpty ? '' : formatPct(pct)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="csh-team-footer">
          <div className="csh-team-stat">
            <div className="csh-ts-label">Team DPS</div>
            <div className="csh-ts-value">
              {statistics.teamDps != null ? formatDamage(statistics.teamDps) : '—'}
              {statistics.teamDps != null && <span className="csh-ts-unit">/s</span>}
            </div>
          </div>
          <div className="csh-team-divider" />
          <div className="csh-team-stat">
            <div className="csh-ts-label">Duration</div>
            <div className="csh-ts-value">
              {durationSec != null ? durationSec.toFixed(1) : '—'}
              {durationSec != null && <span className="csh-ts-unit">s</span>}
            </div>
          </div>
          <div className="csh-team-divider" />
          {statistics.timeToKill != null && (
            <>
              <div className="csh-team-stat">
                <div className="csh-ts-label">Time to Kill</div>
                <div className="csh-ts-value">
                  {formatSeconds(statistics.timeToKill)}
                  <span className="csh-ts-unit">s</span>
                </div>
              </div>
              <div className="csh-team-divider" />
            </>
          )}
          <div className="csh-team-stat">
            <div className="csh-ts-label">Team Total</div>
            <div className="csh-ts-value">{formatDamage(statistics.teamTotalDamage)}</div>
          </div>
        </div>
      </div>
    </section>
  );
});
