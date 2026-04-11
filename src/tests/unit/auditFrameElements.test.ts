/**
 * Audit: every damage / status frame should set `properties.element`.
 *
 * The canvas renderer reads `frame.properties.element` directly via
 * `dataDrivenEventFrames.ts:167` to populate the marker's `damageElement`.
 * When the field is missing, the marker carries no element and the canvas
 * has to fall back to a segment-level color via a secondary path that
 * doesn't cover every render site (info pane card, hover tooltips, etc).
 *
 * This test walks all operator skills + statuses + generic statuses,
 * finds every frame whose `clause` contains a DEAL DAMAGE, APPLY
 * INFLICTION, or APPLY REACTION effect, and asserts the frame carries
 * `properties.element`.
 *
 * Tracked in docs/todo.md → "Audit: every damage / status frame should
 * set properties.element".
 */

import { getAllOperatorSkillSetIds, getOperatorSkills } from '../../model/game-data/operatorSkillsStore';
import { getAllOperatorStatuses } from '../../model/game-data/operatorStatusesStore';
import { AdjectiveType, NounType, VerbType } from '../../dsl/semantics';

interface FrameLocation {
  source: string;       // e.g. "snowshine/skills/ultimate-frigid-snowfield"
  segmentIndex: number;
  frameIndex: number;
  reason: string;       // why this frame should have an element
}

/**
 * Walk a frame's clause and decide whether it should carry a damageElement.
 * Returns the reason string if the frame contains an element-tinted effect,
 * or null if it's a non-element frame (e.g. APPLY STAT, RECOVER HP).
 */
function elementRequirementReason(frame: Record<string, unknown>): string | null {
  const clauses = (frame.clause ?? []) as Record<string, unknown>[];
  for (const pred of clauses) {
    const effects = (pred.effects ?? []) as Record<string, unknown>[];
    for (const ef of effects) {
      const verb = ef.verb as string | undefined;
      const obj = ef.object as string | undefined;
      const objId = ef.objectId as string | undefined;
      const objQual = ef.objectQualifier as string | undefined;

      // DEAL <ELEMENT> DAMAGE / DEAL DAMAGE — needs element if qualifier present
      if (verb === VerbType.DEAL && obj === NounType.DAMAGE) {
        // Stagger doesn't need element. Cryo / Heat / Nature / Electric / Arts do.
        if (objQual && objQual !== AdjectiveType.PHYSICAL) {
          return `DEAL ${objQual} DAMAGE`;
        }
      }

      // APPLY INFLICTION / APPLY STATUS REACTION — element-tinted
      if (verb === VerbType.APPLY) {
        if (obj === NounType.INFLICTION && objQual) {
          return `APPLY ${objQual} INFLICTION`;
        }
        // APPLY STATUS REACTION X — reaction qualifier carries the element
        if (obj === NounType.STATUS && objId === NounType.REACTION && objQual) {
          return `APPLY REACTION ${objQual}`;
        }
      }
    }
  }
  return null;
}

/** Walk all segments + frames in a parsed JSON shape and collect element-deficient frames. */
function findMissingElements(segments: unknown[], source: string): FrameLocation[] {
  const out: FrameLocation[] = [];
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si] as Record<string, unknown>;
    const frames = (seg.frames ?? []) as Record<string, unknown>[];
    for (let fi = 0; fi < frames.length; fi++) {
      const frame = frames[fi];
      const reason = elementRequirementReason(frame);
      if (!reason) continue;
      const props = (frame.properties ?? {}) as Record<string, unknown>;
      if (!props.element) {
        out.push({ source, segmentIndex: si, frameIndex: fi, reason });
      }
    }
  }
  return out;
}

describe('Audit: damage/status frames must set properties.element', () => {
  it('every operator skill frame with DEAL/APPLY-element effect carries properties.element', () => {
    const missing: FrameLocation[] = [];
    for (const operatorId of getAllOperatorSkillSetIds()) {
      const skills = getOperatorSkills(operatorId);
      if (!skills) continue;
      skills.forEach((skill, skillId) => {
        const segments = skill.segments as unknown[];
        if (segments.length === 0) return;
        const source = `${operatorId}/skills/${skillId}`;
        missing.push(...findMissingElements(segments, source));
      });
    }
    if (missing.length > 0) {
      const formatted = missing
        .map(m => `  ${m.source} segment[${m.segmentIndex}] frame[${m.frameIndex}] — ${m.reason}`)
        .join('\n');
      throw new Error(`${missing.length} frame(s) missing properties.element:\n${formatted}`);
    }
  });

  it('every operator status frame with DEAL/APPLY-element effect carries properties.element', () => {
    const missing: FrameLocation[] = [];
    for (const status of getAllOperatorStatuses()) {
      const json = status.serialize();
      const segments = (json.segments ?? []) as unknown[];
      if (segments.length === 0) continue;
      const source = `status/${status.id}`;
      missing.push(...findMissingElements(segments, source));
    }
    if (missing.length > 0) {
      const formatted = missing
        .map(m => `  ${m.source} segment[${m.segmentIndex}] frame[${m.frameIndex}] — ${m.reason}`)
        .join('\n');
      throw new Error(`${missing.length} frame(s) missing properties.element:\n${formatted}`);
    }
  });
});
