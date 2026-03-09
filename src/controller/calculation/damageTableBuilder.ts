import { TimelineEvent, Column, MiniTimeline, EventSegmentData } from '../../consts/viewTypes';
import { COMBAT_SKILL_LABELS } from '../../consts/channelLabels';
import { CombatSkillsType, TimelineSourceType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';

/** A single row in the damage calculation table — one per frame tick. */
export interface DamageTableRow {
  /** Unique key for React rendering. */
  key: string;
  /** Absolute frame number in the timeline. */
  absoluteFrame: number;
  /** Human-readable label: "EventName > Segment > Tick N". */
  label: string;
  /** The column key this tick belongs to (matches Column.key). */
  columnKey: string;
  /** Owner ID (slot ID) of the event. */
  ownerId: string;
  /** Column ID (skill type) of the event. */
  columnId: string;
  /** The event this tick belongs to. */
  eventId: string;
  /** Segment index within the event (0 if non-sequenced). */
  segmentIndex: number;
  /** Frame index within the segment. */
  frameIndex: number;
  /** Placeholder damage value. */
  damage: number;
}

/** Column descriptor for the damage table header. */
export interface DamageTableColumn {
  key: string;
  label: string;
  ownerId: string;
  columnId: string;
  color: string;
}

function getEventDisplayName(name: string): string {
  return COMBAT_SKILL_LABELS[name as CombatSkillsType] ?? name;
}

/** Enhanced skills (during ultimate) should map to the ultimate column in the sheet. */
function isUltEnhanced(name: string): boolean {
  return name.includes('_ENHANCED');
}

/**
 * Build damage table rows from timeline events.
 * Only operator skill columns with frame data produce rows.
 */
export function buildDamageTableRows(
  events: TimelineEvent[],
  columns: Column[],
): DamageTableRow[] {
  const rows: DamageTableRow[] = [];

  // Build column lookup: ownerId-columnId → Column
  const colLookup = new Map<string, MiniTimeline>();
  for (const col of columns) {
    if (col.type === 'mini-timeline' && col.source === TimelineSourceType.OPERATOR) {
      colLookup.set(`${col.ownerId}-${col.columnId}`, col);
    }
  }

  for (const ev of events) {
    // Ult-enhanced skills (e.g. FLAMING_CINDERS_ENHANCED) map to the ultimate column
    const effectiveColumnId = isUltEnhanced(ev.name) ? 'ultimate' : ev.columnId;
    const col = colLookup.get(`${ev.ownerId}-${effectiveColumnId}`)
      ?? colLookup.get(`${ev.ownerId}-${ev.columnId}`);
    if (!col) continue;

    const eventName = getEventDisplayName(ev.name);

    if (ev.segments && ev.segments.length > 0) {
      // Sequenced event — iterate segments and their frames
      let segmentFrameOffset = 0;
      for (let si = 0; si < ev.segments.length; si++) {
        const seg = ev.segments[si];
        const segLabel = seg.label ?? `Seg ${si + 1}`;

        if (seg.frames) {
          for (let fi = 0; fi < seg.frames.length; fi++) {
            const frame = seg.frames[fi];
            const absoluteFrame = ev.startFrame + segmentFrameOffset + frame.offsetFrame;
            rows.push({
              key: `${ev.id}-s${si}-f${fi}`,
              absoluteFrame,
              label: `${eventName} > ${segLabel} > Tick ${fi + 1}`,
              columnKey: col.key,
              ownerId: ev.ownerId,
              columnId: effectiveColumnId,
              eventId: ev.id,
              segmentIndex: si,
              frameIndex: fi,
              damage: 100, // placeholder
            });
          }
        }

        segmentFrameOffset += seg.durationFrames;
      }
    }
    // Non-sequenced events (standard 3-phase) don't have frame ticks — skip for now
  }

  // Sort by absolute frame
  rows.sort((a, b) => a.absoluteFrame - b.absoluteFrame || a.label.localeCompare(b.label));

  return rows;
}

/**
 * Build the column descriptors for the damage table.
 * Returns only operator skill columns (no common, no enemy, no placeholders, no derived).
 */
export function buildDamageTableColumns(columns: Column[]): DamageTableColumn[] {
  const result: DamageTableColumn[] = [];
  for (const col of columns) {
    if (col.type !== 'mini-timeline') continue;
    if (col.source !== TimelineSourceType.OPERATOR) continue;
    if ((col as MiniTimeline).derived) continue;
    result.push({
      key: col.key,
      label: col.label,
      ownerId: col.ownerId,
      columnId: col.columnId,
      color: col.color,
    });
  }
  return result;
}
