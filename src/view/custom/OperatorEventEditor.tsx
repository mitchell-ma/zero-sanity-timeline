/**
 * Operator Event Editor — displays full operator skill/status/talent JSON data
 * organized into collapsible subcategory sections, each with embedded ClauseEditor
 * instances for their clause/predicate/effects.
 *
 * Stylistically matches the ClauseEditor tree layout.
 */
import { useState, useCallback, useMemo } from 'react';
import { getOperatorJson, getRawSkillTypeMap } from '../../model/event-frames/operatorJsonLoader';
import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { COMBAT_SKILL_LABELS } from '../../consts/timelineColumnLabels';
import type { CombatSkillsType } from '../../consts/enums';
import type { Clause } from '../../consts/semantics';
import ClauseEditor from './ClauseEditor';

interface Props {
  operatorId: string;
  onBack?: () => void;
}

// ── Skill type ordering + labels ────────────────────────────────────────────

const SKILL_CATEGORY_ORDER = [
  'BASIC_ATTACK',
  'BATTLE_SKILL',
  'COMBO_SKILL',
  'ULTIMATE',
] as const;

const SKILL_CATEGORY_LABELS: Record<string, string> = {
  BASIC_ATTACK: 'Basic Attack',
  BATTLE_SKILL: 'Battle Skill',
  COMBO_SKILL: 'Combo Skill',
  ULTIMATE: 'Ultimate',
};

const BATK_VARIANT_LABELS: Record<string, string> = {
  BATK: 'Normal Chain',
  FINISHER: 'Finisher',
  DIVE: 'Dive Attack',
};

export default function OperatorEventEditor({ operatorId, onBack }: Props) {
  const op = ALL_OPERATORS.find((o) => o.id === operatorId);
  const opJson = useMemo(() => getOperatorJson(operatorId), [operatorId]);
  const skillTypeMap = useMemo(() => getRawSkillTypeMap(operatorId), [operatorId]);

  if (!op || !opJson) {
    return <div className="oee-empty">Operator not found</div>;
  }

  const skills = (opJson.skills ?? {}) as Record<string, any>;
  const statusEvents = (opJson.statusEvents ?? []) as any[];

  // Group skills by category using skillTypeMap
  const skillCategories = SKILL_CATEGORY_ORDER.map((cat) => {
    const mapping = skillTypeMap[cat];
    const entries: { id: string; label: string; data: any; subLabel?: string }[] = [];

    if (!mapping) return { category: cat, entries };

    if (typeof mapping === 'string') {
      // Simple mapping: one skill ID
      const data = skills[mapping];
      if (data) {
        const displayLabel = COMBAT_SKILL_LABELS[mapping as CombatSkillsType] || data.name || mapping;
        entries.push({ id: mapping, label: displayLabel, data });
      }
      // Also find variants (ENHANCED_, EMPOWERED_)
      for (const [key, val] of Object.entries(skills)) {
        if (key !== mapping && key.startsWith(mapping + '_')) {
          const suffix = key.slice(mapping.length + 1);
          const variantLabel = suffix.replace(/_/g, ' ');
          entries.push({ id: key, label: COMBAT_SKILL_LABELS[key as CombatSkillsType] || (val as any).name || key, data: val, subLabel: variantLabel });
        }
      }
    } else if (typeof mapping === 'object') {
      // BASIC_ATTACK: { BATK, FINISHER, DIVE }
      const seenIds = new Set<string>();
      for (const [variant, skillId] of Object.entries(mapping)) {
        if (seenIds.has(skillId as string)) continue;
        seenIds.add(skillId as string);
        const data = skills[skillId as string];
        if (data) {
          const displayLabel = COMBAT_SKILL_LABELS[skillId as CombatSkillsType] || (data as any).name || (skillId as string);
          entries.push({ id: skillId as string, label: displayLabel, data, subLabel: BATK_VARIANT_LABELS[variant] || variant });
        }
        // Variants of this BATK skill (ENHANCED_, etc.)
        for (const [key, val] of Object.entries(skills)) {
          if (key !== skillId && key.startsWith((skillId as string) + '_') && !seenIds.has(key)) {
            seenIds.add(key);
            const suffix = key.slice((skillId as string).length + 1);
            entries.push({ id: key, label: COMBAT_SKILL_LABELS[key as CombatSkillsType] || (val as any).name || key, data: val, subLabel: `${BATK_VARIANT_LABELS[variant] || variant} (${suffix.replace(/_/g, ' ')})` });
          }
        }
      }
    }

    return { category: cat, entries };
  }).filter((c) => c.entries.length > 0);

  return (
    <div className="oee">
      <div className="oee-toolbar">
        {onBack && <button className="btn-back cv-back-btn" onClick={onBack}>Back</button>}
      </div>

      <h2 className="oee-title" style={{ color: op.color }}>{op.name}</h2>
      <div className="oee-subtitle">Event Editor</div>

      <div className="oee-body">
        {/* ── Skill categories ── */}
        {skillCategories.map(({ category, entries }) => (
          <CategorySection key={category} title={SKILL_CATEGORY_LABELS[category] || category} defaultOpen>
            {entries.map((entry) => (
              <SkillEntrySection key={entry.id} entry={entry} />
            ))}
          </CategorySection>
        ))}

        {/* ── Status events ── */}
        {statusEvents.length > 0 && (
          <CategorySection title="Status Events" defaultOpen>
            {statusEvents.map((se, i) => (
              <StatusEntrySection key={se.id || i} status={se} index={i} />
            ))}
          </CategorySection>
        )}
      </div>
    </div>
  );
}

// ── Category section (collapsible top-level) ────────────────────────────────

function CategorySection({ title, children, defaultOpen }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  return (
    <div className="oee-category">
      <div className="oee-category-header" onClick={() => setOpen(!open)}>
        <span className="oee-category-chevron">{open ? '\u25BE' : '\u25B8'}</span>
        <span className="oee-category-title">{title}</span>
      </div>
      {open && <div className="oee-category-body">{children}</div>}
    </div>
  );
}

// ── Skill entry section ─────────────────────────────────────────────────────

function SkillEntrySection({ entry }: { entry: { id: string; label: string; data: any; subLabel?: string } }) {
  const [open, setOpen] = useState(false);
  const data = entry.data;
  const segments: any[] = data.segments ?? [];
  const frames: any[] = data.frames ?? [];
  const clause: Clause = data.clause ?? [];
  const hasContent = segments.length > 0 || frames.length > 0 || clause.length > 0;

  return (
    <div className="oee-entry">
      <div className="oee-entry-header" onClick={() => setOpen(!open)}>
        <span className="oee-entry-chevron">{open ? '\u25BE' : '\u25B8'}</span>
        <span className="oee-entry-name">{entry.label}</span>
        {entry.subLabel && <span className="oee-entry-badge">{entry.subLabel}</span>}
        {!hasContent && <span className="oee-entry-empty">no event data</span>}
      </div>

      {open && (
        <div className="oee-entry-body">
          {/* Skill-level metadata */}
          {data.name && (
            <div className="oee-meta-row">
              <span className="oee-meta-label">Name</span>
              <span className="oee-meta-value">{data.name}</span>
            </div>
          )}
          {data.description && (
            <div className="oee-meta-row oee-meta-row--desc">
              <span className="oee-meta-label">Description</span>
              <span className="oee-meta-value oee-meta-desc">{data.description}</span>
            </div>
          )}

          {/* Skill-level clause */}
          {clause.length > 0 && (
            <ClauseSection title="Skill Clause" clause={clause} />
          )}

          {/* Segments (basic attack combo chain) */}
          {segments.length > 0 && (
            <div className="oee-segments">
              {segments.map((seg, si) => (
                <SegmentSection key={si} segment={seg} index={si} />
              ))}
            </div>
          )}

          {/* Frames (non-segmented skills) */}
          {frames.length > 0 && segments.length === 0 && (
            <div className="oee-frames">
              {frames.map((frame, fi) => (
                <FrameSection key={fi} frame={frame} index={fi} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Segment section ─────────────────────────────────────────────────────────

const HIT_NAMES = ['Hit 1', 'Hit 2', 'Hit 3', 'Hit 4', 'Hit 5', 'Hit 6', 'Hit 7', 'Hit 8'];

function SegmentSection({ segment, index }: { segment: any; index: number }) {
  const [open, setOpen] = useState(false);
  const name = segment.name || (index < HIT_NAMES.length ? HIT_NAMES[index] : `Hit ${index + 1}`);
  const dur = segment.properties?.duration ?? segment.duration;
  const durStr = dur ? `${dur.value}${dur.unit === 'FRAME' ? 'f' : 's'}` : '';
  const frames: any[] = segment.frames ?? [];
  const clause: Clause = segment.clause ?? [];

  return (
    <div className="oee-segment">
      <div className="oee-segment-header" onClick={() => setOpen(!open)}>
        <span className="oee-entry-chevron">{open ? '\u25BE' : '\u25B8'}</span>
        <span className="oee-segment-name">{name}</span>
        {durStr && <span className="oee-segment-dur">{durStr}</span>}
        <span className="oee-segment-hits">{frames.length} frame{frames.length !== 1 ? 's' : ''}</span>
      </div>

      {open && (
        <div className="oee-segment-body">
          {/* Segment-level clause */}
          {clause.length > 0 && (
            <ClauseSection title="Segment Clause" clause={clause} />
          )}

          {/* Frames within segment */}
          {frames.map((frame, fi) => (
            <FrameSection key={fi} frame={frame} index={fi} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Frame section ───────────────────────────────────────────────────────────

function FrameSection({ frame, index }: { frame: any; index: number }) {
  const [open, setOpen] = useState(false);
  const offset = frame.properties?.offset ?? frame.offset;
  const offsetStr = offset ? `${offset.value}${offset.unit === 'FRAME' ? 'f' : 's'}` : '0';
  const clause: Clause = frame.clause ?? [];
  const dataSources: string[] = frame.metadata?.dataSources ?? frame.dataSources ?? [];
  const hasClause = clause.length > 0;

  return (
    <div className="oee-frame">
      <div className="oee-frame-header" onClick={() => setOpen(!open)}>
        <span className="oee-entry-chevron">{open ? '\u25BE' : '\u25B8'}</span>
        <span className="oee-frame-offset">@{offsetStr}</span>
        <span className="oee-frame-index">Frame #{index + 1}</span>
        {dataSources.length > 0 && <span className="oee-frame-source">{dataSources.join(', ')}</span>}
        {!hasClause && <span className="oee-entry-empty">damage only</span>}
      </div>

      {open && hasClause && (
        <div className="oee-frame-body">
          <ClauseSection title="Frame Clause" clause={clause} />
        </div>
      )}
    </div>
  );
}

// ── Status entry section ────────────────────────────────────────────────────

function StatusEntrySection({ status, index }: { status: any; index: number }) {
  const [open, setOpen] = useState(false);
  const statusId = status.id ?? status.name ?? `Status ${index + 1}`;
  const element = status.element ?? 'NONE';
  const sl = status.statusLevel ?? {};
  const onTriggerClause: Clause = status.onTriggerClause ?? [];
  const clause: Clause = status.clause ?? [];
  const onEntryClause: Clause = status.onEntryClause ?? [];
  const onExitClause: Clause = status.onExitClause ?? [];
  const segments: any[] = status.segments ?? [];
  const originId = status.originId ?? '';

  const limitRaw = sl.limit;
  const limitStr = typeof limitRaw === 'object' && limitRaw !== null
    ? Object.values(limitRaw).join('/')
    : String(limitRaw ?? 1);

  return (
    <div className="oee-entry">
      <div className="oee-entry-header" onClick={() => setOpen(!open)}>
        <span className="oee-entry-chevron">{open ? '\u25BE' : '\u25B8'}</span>
        <span className="oee-entry-name">{statusId}</span>
        <span className="oee-entry-badge">{element}</span>
        {originId && <span className="oee-entry-origin">from {originId}</span>}
      </div>

      {open && (
        <div className="oee-entry-body">
          {/* Status metadata */}
          <div className="oee-meta-grid">
            <div className="oee-meta-row">
              <span className="oee-meta-label">Interaction</span>
              <span className="oee-meta-value">{sl.statusLevelInteractionType ?? 'NONE'}</span>
            </div>
            <div className="oee-meta-row">
              <span className="oee-meta-label">Max Stacks</span>
              <span className="oee-meta-value">{limitStr}</span>
            </div>
            {status.target && (
              <div className="oee-meta-row">
                <span className="oee-meta-label">Target</span>
                <span className="oee-meta-value">{String(status.target).replace(/_/g, ' ')}</span>
              </div>
            )}
            {status.isForced && (
              <div className="oee-meta-row">
                <span className="oee-meta-label">Forced</span>
                <span className="oee-meta-value">Yes</span>
              </div>
            )}
          </div>

          {/* Trigger clause */}
          {onTriggerClause.length > 0 && (
            <ClauseSection title="Trigger Clause" clause={onTriggerClause} conditionsOnly />
          )}

          {/* Reaction clause */}
          {clause.length > 0 && (
            <ClauseSection title="Reaction Clause" clause={clause} />
          )}

          {/* Entry clause */}
          {onEntryClause.length > 0 && (
            <ClauseSection title="On Entry Clause" clause={onEntryClause} />
          )}

          {/* Exit clause */}
          {onExitClause.length > 0 && (
            <ClauseSection title="On Exit Clause" clause={onExitClause} />
          )}

          {/* Status segments */}
          {segments.length > 0 && (
            <div className="oee-segments">
              {segments.map((seg, si) => (
                <SegmentSection key={si} segment={seg} index={si} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Clause section (wraps ClauseEditor with a label) ────────────────────────

function ClauseSection({ title, clause, conditionsOnly }: {
  title: string;
  clause: Clause;
  conditionsOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const handleChange = useCallback((updated: Clause) => {
    // Read-only for now — changes are logged but not persisted
    console.log(`[OEE] ${title} changed:`, updated);
  }, [title]);

  return (
    <div className="oee-clause-section">
      <div className="oee-clause-header" onClick={() => setExpanded(!expanded)}>
        <span className="oee-entry-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
        <span className="oee-clause-title">{title}</span>
        <span className="oee-clause-count">{clause.length} predicate{clause.length !== 1 ? 's' : ''}</span>
      </div>
      {expanded && (
        <div className="oee-clause-body">
          <ClauseEditor
            initialValue={clause}
            onChange={handleChange}
            conditionsOnly={conditionsOnly}
          />
        </div>
      )}
    </div>
  );
}
