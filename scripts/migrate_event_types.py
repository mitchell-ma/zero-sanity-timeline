#!/usr/bin/env python3
"""
One-shot migration: properties.eventType -> properties.eventTypes (array).

Rules:
- "POTENTIAL_EVENT" -> ["STATUS"] AND ensure properties.eventCategoryType = "POTENTIAL"
- All other values: ["X"] (array of one)
- For talents/potentials that the existing engine inference would treat as
  "passive" (infinite duration + no APPLY/CONSUME EVENT trigger + has trigger
  or segments), append "AUTOMATIC" so the engine can detect them via the
  explicit flag instead of re-inferring.

Equip passives (weapon/gear/consumable APPLY STAT clauses) are NOT in scope —
they remain handled by the existing equip-clause registration in
triggerIndex.ts; AUTOMATIC is only for events that need a presence on the
timeline at frame 0.

Usage:
    python3 scripts/migrate_event_types.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GAME_DATA_ROOT = REPO_ROOT / "src" / "model" / "game-data"

FPS = 120
TOTAL_SECONDS = 900
TOTAL_FRAMES = FPS * TOTAL_SECONDS  # 108_000
PERMANENT_DURATION = 99999
UNLIMITED_STACKS = 99999

UNIT_SECOND = "SECOND"
NOUN_EVENT = "EVENT"
VERB_APPLY = "APPLY"
VERB_CONSUME = "CONSUME"
VERB_IS = "IS"

NOUN_TALENT = "TALENT"
NOUN_POTENTIAL = "POTENTIAL"

STACK_INTERACTION_NONE = "NONE"


def load_json(path: Path) -> dict | list:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data) -> None:
    """Write JSON preserving 2-space indent and trailing newline."""
    text = json.dumps(data, indent=2, ensure_ascii=False)
    with path.open("w", encoding="utf-8") as f:
        f.write(text)
        f.write("\n")


def get_duration_frames(duration: dict | None) -> int:
    """Mirror controller/timeline/triggerIndex.ts:getDurationFrames.
    No duration => INFINITY (returned as TOTAL_FRAMES). PERMANENT_DURATION
    sentinel resolves to TOTAL_FRAMES too.
    """
    if not duration:
        return TOTAL_FRAMES
    raw = duration.get("value")
    if isinstance(raw, dict):
        # ValueNode: { verb: IS, value: N } or VARY_BY arrays
        if raw.get("verb") == VERB_IS:
            val = raw.get("value", 0)
        else:
            arr = raw.get("value")
            val = arr[0] if isinstance(arr, list) and arr else 0
    elif isinstance(raw, list):
        val = raw[0] if raw else 0
    elif isinstance(raw, (int, float)):
        val = raw
    else:
        val = 0
    if val == PERMANENT_DURATION or val == 0:
        return TOTAL_FRAMES
    if duration.get("unit") == UNIT_SECOND:
        return round(val * FPS)
    return int(val)


def has_self_apply_consume(on_trigger_clause: list | None) -> bool:
    """True if any onTriggerClause effect APPLYs or CONSUMEs an EVENT."""
    if not on_trigger_clause:
        return False
    for tc in on_trigger_clause:
        for ef in tc.get("effects") or []:
            if (ef.get("verb") in (VERB_APPLY, VERB_CONSUME)
                    and ef.get("object") == NOUN_EVENT):
                return True
    return False


def is_counter(props: dict) -> bool:
    """NONE + unlimited-stack talent/potential — these start at 0 stacks and
    must NOT get a frame-0 presence event (see triggerIndex.ts:517-522)."""
    stacks = props.get("stacks") or {}
    if stacks.get("interactionType") != STACK_INTERACTION_NONE:
        return False
    limit = stacks.get("limit")
    if isinstance(limit, dict):
        limit = limit.get("value") if limit.get("verb") == VERB_IS else None
    if not isinstance(limit, (int, float)):
        return False
    return limit >= UNLIMITED_STACKS


def is_passive_talent_or_potential(json_data: dict) -> bool:
    """Mirror the talent/potential branch of triggerIndex.ts indexer."""
    props = json_data.get("properties") or {}
    ect = props.get("eventCategoryType") or props.get("type")
    if ect not in (NOUN_TALENT, NOUN_POTENTIAL):
        return False
    has_trigger = bool(json_data.get("onTriggerClause"))
    has_segments = bool(json_data.get("segments"))
    if not has_trigger and not has_segments:
        return False  # description-only metadata
    if is_counter(props):
        return False  # counters start at 0 stacks — no frame-0 presence
    duration_frames = get_duration_frames(props.get("duration"))
    return duration_frames >= TOTAL_FRAMES and not has_self_apply_consume(
        json_data.get("onTriggerClause")
    )


def migrate_file(path: Path, dry_run: bool) -> tuple[bool, str]:
    """Returns (changed, summary)."""
    data = load_json(path)
    if not isinstance(data, dict):
        return False, "skip (not an object)"
    props = data.get("properties")
    if not isinstance(props, dict):
        return False, "skip (no properties)"
    if "eventType" not in props and "eventTypes" not in props:
        return False, "skip (no eventType/eventTypes)"

    summary_parts: list[str] = []
    if "eventType" in props:
        old = props.pop("eventType")
        if old == "POTENTIAL_EVENT":
            new_types = ["STATUS"]
            if props.get("eventCategoryType") not in (NOUN_POTENTIAL,):
                props["eventCategoryType"] = NOUN_POTENTIAL
                summary_parts.append("eventCategoryType=POTENTIAL")
        else:
            new_types = [old]
        # Ordered insert: keep eventTypes near where eventType was. json.dumps
        # preserves insertion order; rebuild props to put eventTypes after id.
        props["eventTypes"] = new_types
        summary_parts.append(f"eventType={old!r} -> eventTypes={new_types}")

    # Now re-evaluate passive inference and tag AUTOMATIC if applicable.
    if is_passive_talent_or_potential(data):
        types = props.get("eventTypes") or []
        if "AUTOMATIC" not in types:
            types.append("AUTOMATIC")
            props["eventTypes"] = types
            summary_parts.append("+AUTOMATIC")

    # Reorder properties: id first (if present), then everything else, then
    # eventTypes / eventCategoryType near where they used to live.
    reordered: dict = {}
    for k in ("id", "name"):
        if k in props:
            reordered[k] = props[k]
    for k, v in props.items():
        if k in reordered:
            continue
        reordered[k] = v
    data["properties"] = reordered

    if not summary_parts:
        return False, "no-op"

    if not dry_run:
        save_json(path, data)
    return True, "; ".join(summary_parts)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--root", type=Path, default=GAME_DATA_ROOT,
                    help="Root directory to walk (defaults to game-data)")
    args = ap.parse_args()

    if not args.root.exists():
        print(f"error: {args.root} does not exist", file=sys.stderr)
        return 1

    files = sorted(args.root.rglob("*.json"))
    changed = 0
    automatic = 0
    pot_event = 0
    errors: list[str] = []

    for path in files:
        try:
            did, summary = migrate_file(path, args.dry_run)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{path}: {e}")
            continue
        if did:
            changed += 1
            if "+AUTOMATIC" in summary:
                automatic += 1
            if "POTENTIAL_EVENT" in summary:
                pot_event += 1
            print(f"  {path.relative_to(REPO_ROOT)}: {summary}")

    print()
    print(f"scanned: {len(files)} files")
    print(f"changed: {changed}")
    print(f"+AUTOMATIC: {automatic}")
    print(f"POTENTIAL_EVENT migrated: {pot_event}")
    if errors:
        print(f"errors: {len(errors)}")
        for e in errors:
            print(f"  ! {e}")
        return 1
    if args.dry_run:
        print("(dry run — no files written)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
