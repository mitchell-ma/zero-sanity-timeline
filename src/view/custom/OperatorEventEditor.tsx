/**
 * Operator Event Editor — displays full operator skill/status/talent JSON data
 * organized into collapsible subcategory sections, each with embedded ClauseEditor
 * instances for their clause/predicate/effects.
 *
 * Stylistically matches the ClauseEditor tree layout.
 */
import { useState, useCallback, useMemo } from 'react';
import { getOperatorSkills, getOperatorStatuses, getRawSkillTypeMap } from '../../controller/gameDataStore';
import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { getAllSkillLabels } from '../../controller/gameDataStore';
import type {  } from '../../consts/enums';
import type { Clause } from '../../dsl/semantics';
import ClauseEditor from './ClauseEditor';

/** Shape for JSON skill/segment/frame/status data flowing through the editor. */
export interface JsonSkillData {
  [key: string]: unknown;
  clause?: Clause;
  segments?: JsonSkillData[];
  frames?: JsonSkillData[];
  duration?: { value: number; unit: string };
  offset?: { value: number; unit: string };
  properties?: { name?: string; description?: string; duration?: { value: number; unit: string }; offset?: { value: number; unit: string } };
  metadata?: { dataSources?: string[]; originId?: string };
  dataSources?: string[];
  stacks?: JsonSkillData;
  onTriggerClause?: Clause;
  onEntryClause?: Clause;
  onExitClause?: Clause;
  id?: string;
  element?: string;
  target?: string;
  isForced?: boolean;
}

interface Props {
  operatorId: string;
  onBack?: () => void;
}

// ── Skill type ordering + labels ────────────────────────────────────────────

const SKILL_CATEGORY_ORDER = [
  'BASIC_ATTACK',
  'BATTLE',
  'COMBO',
  'ULTIMATE',
] as const;

const SKILL_CATEGORY_LABELS: Record<string, string> = {
  BASIC_ATTACK: 'Basic Attack',
  BATTLE_SKILL: 'Battle Skill',
  COMBO_SKILL: 'Combo Skill',
  ULTIMATE: 'Ultimate',
};

export interface SkillEntryData {
  id: string;
  label: string;
  data: JsonSkillData;
  subLabel?: string;
}

/** Build skill entry list for a single category (BASIC_ATTACK, BATTLE_SKILL, etc.) including variants. */
export function buildSkillEntries(
  operatorId: string,
  categoryKey: string,
): SkillEntryData[] {
  const opSkills = getOperatorSkills(operatorId);
  if (!opSkills) return [];
  const skills: Record<string, JsonSkillData> = {};
  opSkills.forEach((skill, skillId) => { skills[skillId] = skill.serialize() as JsonSkillData; });
  const skillTypeMap = getRawSkillTypeMap(operatorId);
  const entry = skillTypeMap[categoryKey];
  if (!entry) return [];
  const allIds: string[] = Array.isArray(entry) ? entry : Object.values(entry).flat();
  if (allIds.length === 0) return [];

  const entries: SkillEntryData[] = [];

  for (const skillId of allIds) {
    const data = skills[skillId];
    if (data) {
      entries.push({ id: skillId, label: getAllSkillLabels()[skillId as string] || data.properties?.name || skillId, data });
    }
  }

  return entries;
}

export default function OperatorEventEditor({ operatorId, onBack }: Props) {
  const op = ALL_OPERATORS.find((o) => o.id === operatorId);
  const skills = useMemo(() => {
    const opSkills = getOperatorSkills(operatorId);
    if (!opSkills) return {} as Record<string, JsonSkillData>;
    const result: Record<string, JsonSkillData> = {};
    opSkills.forEach((skill, skillId) => { result[skillId] = skill.serialize() as JsonSkillData; });
    return result;
  }, [operatorId]);
  const statusEvents = useMemo(() => {
    return getOperatorStatuses(operatorId).map(s => s.serialize() as JsonSkillData);
  }, [operatorId]);
  const skillTypeMap = useMemo(() => getRawSkillTypeMap(operatorId), [operatorId]);

  if (!op || !Object.keys(skills).length) {
    return <div className="oee-empty">Operator not found</div>;
  }

  // Group skills by category using skillTypeMap
  const skillCategories = SKILL_CATEGORY_ORDER.map((cat) => {
    const mapping = skillTypeMap[cat];
    const entries: { id: string; label: string; data: JsonSkillData; subLabel?: string }[] = [];

    const skillIds = mapping as string[] | undefined;
    if (!skillIds || skillIds.length === 0) return { category: cat, entries };

    for (const skillId of skillIds) {
      const data = skills[skillId];
      if (!data) continue;
      const displayLabel = getAllSkillLabels()[skillId as string] || data.properties?.name || skillId;
      entries.push({ id: skillId, label: displayLabel, data });
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

export function SkillEntrySection({ entry, readOnly, defaultOpen }: { entry: { id: string; label: string; data: JsonSkillData; subLabel?: string }; readOnly?: boolean; defaultOpen?: boolean }) {
  void defaultOpen;
  const data = entry.data;
  const segments = data.segments ?? [];
  const frames = data.frames ?? [];
  const clause: Clause = data.clause ?? [];

  return (
    <div className="ev">
      {data.properties?.name && (
        <div className="ev-row"><span className="ev-row-label">Name</span><div className="ev-row-controls"><span className="ev-field-value">{data.properties.name}</span></div></div>
      )}
      {data.properties?.description && (
        <div className="ev-row"><span className="ev-row-label">Description</span><div className="ev-row-controls"><span className="ev-field-value" style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{data.properties.description}</span></div></div>
      )}

      {clause.length > 0 && <ClauseSection title="Clause" clause={clause} readOnly={readOnly} />}

      {segments.map((seg, si) => (
        <SegmentSection key={si} segment={seg} index={si} readOnly={readOnly} />
      ))}

      {frames.length > 0 && segments.length === 0 && frames.map((frame, fi) => (
        <FrameSection key={fi} frame={frame} index={fi} readOnly={readOnly} />
      ))}
    </div>
  );
}

// ── Segment section ─────────────────────────────────────────────────────────

const HIT_NAMES = ['Hit 1', 'Hit 2', 'Hit 3', 'Hit 4', 'Hit 5', 'Hit 6', 'Hit 7', 'Hit 8'];

function resolveLeafNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'value' in v) return resolveLeafNumber((v as Record<string, unknown>).value);
  return null;
}

function SegmentSection({ segment, index, readOnly }: { segment: JsonSkillData; index: number; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const name = segment.properties?.name || (index < HIT_NAMES.length ? HIT_NAMES[index] : `Hit ${index + 1}`);
  const dur = segment.properties?.duration ?? segment.duration;
  const durVal = dur ? resolveLeafNumber(dur.value) : null;
  const durStr = durVal != null ? `${durVal}${dur!.unit === 'FRAME' ? 'f' : 's'}` : '';
  const segFrames = segment.frames ?? [];
  const clause: Clause = segment.clause ?? [];

  return (
    <>
      <div className="ev-seg-bar" onClick={() => setOpen(!open)}>
        <span className="ev-seg-chevron">{open ? '\u25BE' : '\u25B8'}</span>
        <span className="ev-seg-name">{name}</span>
        {durStr && <span className="ev-seg-meta">{durStr}</span>}
      </div>

      {open && (
        <>
          {clause.length > 0 && <ClauseSection title="Clause" clause={clause} readOnly={readOnly} />}
          {segFrames.map((frame, fi) => (
            <FrameSection key={fi} frame={frame} index={fi} readOnly={readOnly} />
          ))}
        </>
      )}
    </>
  );
}

// ── Frame section ───────────────────────────────────────────────────────────

function FrameSection({ frame, index, readOnly }: { frame: JsonSkillData; index: number; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const offset = frame.properties?.offset ?? frame.offset;
  const offsetStr = offset ? `${offset.value}${offset.unit === 'FRAME' ? 'f' : 's'}` : '0';
  const clause: Clause = frame.clause ?? [];
  const hasClause = clause.length > 0;

  return (
    <>
      <div className="ev-frame-bar" onClick={() => setOpen(!open)}>
        <span className="ev-seg-chevron">{open ? '\u25BE' : '\u25B8'}</span>
        <span className="ev-frame-offset">@{offsetStr}</span>
        <span className="ev-seg-meta">Frame #{index + 1}</span>
        {!hasClause && <span className="ev-frame-empty">damage only</span>}
      </div>

      {open && hasClause && (
        <ClauseSection title="Clause" clause={clause} readOnly={readOnly} />
      )}
    </>
  );
}

// ── Status entry section ────────────────────────────────────────────────────

function StatusEntrySection({ status, index }: { status: JsonSkillData; index: number }) {
  const [open, setOpen] = useState(false);
  const statusProps = status.properties as Record<string, unknown> | undefined;
  const statusId = (statusProps?.id as string) ?? (statusProps?.name as string) ?? `Status ${index + 1}`;
  const element = (statusProps?.element as string) ?? 'NONE';
  const sl = status.stacks ?? {};
  const onTriggerClause: Clause = status.onTriggerClause ?? [];
  const clause: Clause = status.clause ?? [];
  const onEntryClause: Clause = status.onEntryClause ?? [];
  const onExitClause: Clause = status.onExitClause ?? [];
  const segments = status.segments ?? [];
  const originId = (status.metadata?.originId as string) ?? '';

  const limitRaw = sl.limit as Record<string, unknown> | undefined;
  const limitStr = typeof limitRaw === 'object' && limitRaw !== null
    ? String((limitRaw.value as number) ?? 1)
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
              <span className="oee-meta-value">{String(sl.interactionType ?? 'NONE')}</span>
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

function ClauseSection({ title, clause, conditionsOnly, readOnly }: {
  title: string;
  clause: Clause;
  conditionsOnly?: boolean;
  readOnly?: boolean;
}) {
  const handleChange = useCallback((updated: Clause) => {
    console.log(`[OEE] ${title} changed:`, updated);
  }, [title]);

  return (
    <>
      <div className="ev-label">{title}</div>
      <ClauseEditor
        initialValue={clause}
        onChange={handleChange}
        conditionsOnly={conditionsOnly}
        readOnly={readOnly}
      />
    </>
  );
}
