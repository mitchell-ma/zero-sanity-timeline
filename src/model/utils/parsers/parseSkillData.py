"""
Parses SkillData dump + Warfarin API to generate skeleton skill JSON configs.

Usage:
  python3 src/model/utils/parsers/parseSkillData.py \
    --warfarin <warfarin_json_path_or_slug> \
    --skilldata <skilldata_directory> \
    --prefix <char_prefix>  (e.g. chr_0016_laevat) \
    --operator <OPERATOR_ID> (e.g. LAEVATAIN) \
    [--compare <existing_skills_dir>]

Example:
  python3 src/model/utils/parsers/parseSkillData.py \
    --warfarin /tmp/laev_warfarin.json \
    --skilldata .claude-adhoc/SkillData \
    --prefix chr_0016_laevat \
    --operator LAEVATAIN \
    --compare src/model/game-data/operators/laevatain/skills
"""

import json
import os
import sys
import argparse
from dataclasses import dataclass, field
from typing import Optional


# ── Warfarin infliction type → our element enum ────────────────────────────

INFLICTION_TO_ELEMENT = {
    "Fire": "HEAT",
    "Ice": "FROST",
    "Lightning": "VOLT",
    "Poison": "BANE",
    "Physical": "PHYSICAL",
}

# ── SkillData action type detection ────────────────────────────────────────

def get_short_type(full_type: str) -> str:
    """Extract short class name from C# $type string."""
    if "+" in full_type:
        return full_type.split("+")[0].split(".")[-1]
    return full_type.split(".")[-1].split(",")[0]


# ── Data classes ───────────────────────────────────────────────────────────

@dataclass
class DamageFrame:
    """A single damage-dealing frame extracted from SkillData."""
    start_frame: int
    end_frame: int
    delivery: str  # DIRECT, CHANNELING, PROJECTILE, ENTITY
    infliction_type: Optional[str] = None  # e.g. "Fire"
    max_count_per_target: Optional[int] = None
    reference_skill_id: Optional[str] = None  # for PROJECTILE/ENTITY
    has_infliction: bool = False


@dataclass
class SegmentData:
    """A segment extracted from a single SkillData skill file."""
    skill_id: str
    duration_frames: int
    exclusive_frames: int
    offset_record_frame: int
    allow_next_skill_start: Optional[int] = None
    damage_frames: list = field(default_factory=list)  # list[DamageFrame]
    blackboard: dict = field(default_factory=dict)
    # Entity sub-timeline data (if SpawnAbilityEntity found)
    entity_skill_id: Optional[str] = None
    entity_spawn_frame: Optional[int] = None
    entity_damage_frames: list = field(default_factory=list)  # list[DamageFrame]
    # Advisories: notable actions that may affect frame count or timing.
    # These are NOT auto-resolved — they flag things a human should verify.
    advisories: list = field(default_factory=list)  # list[str]


@dataclass
class WarfarinSkill:
    """Level-scaling data from Warfarin skillPatchTable."""
    skill_id: str
    levels: int
    labels: list  # [(name, display_value), ...]
    blackboard_by_level: list  # [dict, dict, ...] per level
    # Convenience: extracted level arrays for common keys
    atk_scale: list = field(default_factory=list)
    display_atk_scale: list = field(default_factory=list)
    atk_scale_2: list = field(default_factory=list)
    atk_scale_3: list = field(default_factory=list)
    poise: list = field(default_factory=list)
    poise_extra: list = field(default_factory=list)
    cost_type: int = 0
    cost_value: int = 0
    cooldown: int = 0
    # Additional blackboard fields
    count: int = 0              # MF stack threshold for empowered
    duration: float = 0         # effect duration (combustion, buff, etc.)
    extra_usp: float = 0        # ultimate energy gain (additional attack)
    usp_display: list = field(default_factory=list)  # [(enemy_count, ue_value), ...]


# ── SkillData parsing ─────────────────────────────────────────────────────

def parse_skilldata_file(filepath: str) -> SegmentData:
    """Parse a single SkillData JSON file into a SegmentData."""
    with open(filepath) as f:
        data = json.load(f)

    bb = {}
    for e in data.get("blackboard", []):
        if isinstance(e, dict):
            bb[e["key"]] = e.get("valueDouble", e.get("value", 0))

    seg = SegmentData(
        skill_id=data["skillId"],
        duration_frames=data["durationFrame"],
        exclusive_frames=data["exclusiveFrame"],
        offset_record_frame=data.get("offsetRecordFrame", 0),
        blackboard=bb,
    )

    tl = data["actionGroupData"]["timelineActions"]
    for entry in tl:
        sf = entry["_startFrame"]
        ef = entry["_endFrame"]
        for ad in entry["_sequenceActionData"]["actionData"]:
            t = ad.get("$type", "")
            short = get_short_type(t)

            if short == "AllowNextSkillAction" and seg.allow_next_skill_start is None:
                seg.allow_next_skill_start = sf

            elif short == "DamageAction":
                seg.damage_frames.append(DamageFrame(
                    start_frame=sf, end_frame=ef, delivery="DIRECT"
                ))

            elif short == "LaunchProjectile":
                seg.damage_frames.append(DamageFrame(
                    start_frame=sf, end_frame=ef, delivery="PROJECTILE",
                    reference_skill_id=ad.get("projectileSkillId"),
                ))

            elif short == "SpawnAbilityEntity":
                seg.entity_skill_id = ad.get("abilityEntitySkillId")
                seg.entity_spawn_frame = sf

            elif short == "ChannelingAction":
                # Check actionOnTick for DamageAction and SpellInfliction
                tick_actions = ad.get("actionOnTick", {}).get("actionData", [])
                has_damage = False
                infliction_type = None
                for ta in tick_actions:
                    ta_short = get_short_type(ta.get("$type", ""))
                    if ta_short == "DamageAction":
                        has_damage = True
                    elif ta_short == "SpellInfliction":
                        infliction_type = ta.get("inflictionType")
                if has_damage:
                    seg.damage_frames.append(DamageFrame(
                        start_frame=sf, end_frame=ef, delivery="CHANNELING",
                        max_count_per_target=ad.get("maxCountPerTarget"),
                        infliction_type=infliction_type,
                        has_infliction=infliction_type is not None,
                    ))

            # ── Advisories: notable actions that need human attention ──

            elif short == "JumpToAction":
                dest = ad.get("destFrame", "?")
                seg.advisories.append(
                    f"[f{sf}-{ef}] JumpToAction → f{dest} "
                    f"(skips {dest - sf} frames, may shorten entity lifetime)")

            elif short == "FinishOwnerAction":
                ctx = ad.get("owner", {}).get("targetGroupKey", "")
                target = f" context='{ctx}'" if ctx else ""
                seg.advisories.append(
                    f"[f{sf}-{ef}] FinishOwnerAction{target} "
                    f"(kills spawned entity — may truncate entity frames)")

            elif short == "FinishBuffAction":
                seg.advisories.append(
                    f"[f{sf}-{ef}] FinishBuffAction (consumes buff stacks)")

            elif short in ("CheckBuffStackNumAdvanced", "CheckBuffStackNum"):
                buff_settings = ad.get("buffSettings", {})
                buff_ids = buff_settings.get("buffIdList", [])
                compare = ad.get("compareType", "?")
                value = ad.get("value", {}).get("value", "?")
                seg.advisories.append(
                    f"[f{sf}-{ef}] {short} "
                    f"(buff={buff_ids}, {compare} {value} — conditional branch)")

            elif short == "CreateBuffAction":
                seg.advisories.append(
                    f"[f{sf}-{ef}] CreateBuffAction (applies buff/status)")

            elif short == "ModifyDynamicBlackboard":
                key = ad.get("key", "?")
                op = ad.get("operation", "?")
                seg.advisories.append(
                    f"[f{sf}-{ef}] ModifyDynamicBlackboard "
                    f"(key={key}, op={op} — runtime multiplier adjustment)")

    return seg


def parse_entity_file(filepath: str) -> list:
    """Parse an ability entity file, returning its DamageFrame list."""
    with open(filepath) as f:
        data = json.load(f)

    frames = []
    tl = data["actionGroupData"]["timelineActions"]
    for entry in tl:
        sf = entry["_startFrame"]
        ef = entry["_endFrame"]
        for ad in entry["_sequenceActionData"]["actionData"]:
            t = ad.get("$type", "")
            if "DamageAction" in t:
                frames.append(DamageFrame(
                    start_frame=sf, end_frame=ef, delivery="ENTITY_HIT"
                ))
    return frames


# ── Warfarin parsing ──────────────────────────────────────────────────────

def parse_warfarin(filepath: str) -> dict:
    """Parse Warfarin JSON, returning dict of skill_id → WarfarinSkill."""
    with open(filepath) as f:
        data = json.load(f)

    spt = data["data"]["skillPatchTable"]
    result = {}

    for skill_id, skill_data in spt.items():
        bundle = skill_data["SkillPatchDataBundle"]
        l1 = bundle[0]

        labels = []
        for i, name in enumerate(l1.get("subDescNameList", [])):
            if name:
                val = l1["subDescList"][i] if i < len(l1.get("subDescList", [])) else "?"
                labels.append((name, val))

        def extract_key(key):
            return [bb["value"] for ld in bundle
                    for bb in ld.get("blackboard", []) if bb["key"] == key]

        l1_bb = {bb["key"]: bb["value"] for bb in l1.get("blackboard", [])}

        # Extract UE gain per enemy count (usp_N_display keys)
        usp_display = []
        for n in range(1, 10):
            key = f"usp_{n}_display"
            if key in l1_bb and l1_bb[key]:
                usp_display.append((n, l1_bb[key]))

        ws = WarfarinSkill(
            skill_id=skill_id,
            levels=len(bundle),
            labels=labels,
            blackboard_by_level=[
                {bb["key"]: bb["value"] for bb in ld.get("blackboard", [])}
                for ld in bundle
            ],
            atk_scale=extract_key("atk_scale"),
            display_atk_scale=extract_key("display_atk_scale"),
            atk_scale_2=extract_key("atk_scale_2"),
            atk_scale_3=extract_key("atk_scale_3"),
            poise=extract_key("poise"),
            poise_extra=extract_key("poise_extra"),
            cost_type=l1.get("costType", 0),
            cost_value=l1.get("costValue", 0),
            cooldown=l1.get("coolDown", 0),
            count=int(l1_bb.get("count", 0)),
            duration=l1_bb.get("duration", 0),
            extra_usp=l1_bb.get("extra_usp", 0),
            usp_display=usp_display,
        )
        result[skill_id] = ws

    return result


# ── Skill grouping ────────────────────────────────────────────────────────

def classify_skill_files(sd_dir: str, prefix: str) -> dict:
    """
    Group SkillData files by skill type.
    Returns dict of category → list of (filename, warfarin_id).
    """
    files = sorted([
        f for f in os.listdir(sd_dir)
        if f.startswith(prefix) and f.endswith('.json')
        and not f.endswith('Zone.Identifier')
    ])

    # Filter out secondary files (projhit, abilityentity, etc.)
    secondary_suffixes = ['_projhit', '_abilityentity', '_projhit_blocked']
    main_files = []
    secondary_files = []
    for f in files:
        stem = f[:-5]  # strip .json
        is_secondary = any(stem.endswith(s) or '_projhit_' in stem or '_abilityentity' in stem
                          for s in secondary_suffixes)
        if is_secondary:
            secondary_files.append(f)
        else:
            main_files.append(f)

    groups = {
        "basic_attack": [],
        "enhanced_basic_attack": [],
        "dive_attack": [],
        "plunging_attack": [],
        "finisher": [],
        "battle_skill": [],
        "enhanced_battle_skill": [],
        "combo_skill": [],
        "ultimate": [],
        "other": [],
    }

    for f in main_files:
        stem = f[:-5]
        name = stem[len(prefix) + 1:]  # strip prefix + underscore

        if name.startswith("attack") and name[6:].isdigit():
            groups["basic_attack"].append(f)
        elif name.startswith("ult_attack") and name[10:].isdigit():
            groups["enhanced_basic_attack"].append(f)
        elif name == "dash_attack":
            groups["dive_attack"].append(f)
        elif name.startswith("plunging_attack"):
            groups["plunging_attack"].append(f)
        elif name == "power_attack":
            groups["finisher"].append(f)
        elif name == "normal_skill":
            groups["battle_skill"].append(f)
        elif name == "normal_skill_during_ult":
            groups["enhanced_battle_skill"].append(f)
        elif name.startswith("combo") and "skill" in name:
            groups["combo_skill"].append(f)
        elif name == "ultimate_skill":
            groups["ultimate"].append(f)
        else:
            groups["other"].append(f)

    return groups, secondary_files


# ── Frame offset computation ──────────────────────────────────────────────

FPS = 30

def frame_to_sec(f: int) -> float:
    """Convert frame number to seconds, rounded to 3 decimal places."""
    return round(f / FPS, 3)


def compute_segment_duration(seg: SegmentData) -> float:
    """Compute segment duration from AllowNextSkill or exclusive frame."""
    if seg.allow_next_skill_start is not None:
        # Add 1 frame to match End-Axis convention
        return frame_to_sec(seg.allow_next_skill_start + 1)
    return frame_to_sec(seg.exclusive_frames)


def compute_frame_offsets(seg: SegmentData, sd_dir: str) -> list:
    """
    Compute frame offsets in seconds for all damage events in a segment.
    Returns list of (offset_sec, delivery_type, infliction_type).
    """
    offsets = []

    for df in seg.damage_frames:
        offset = frame_to_sec(df.start_frame)
        offsets.append({
            "offset": offset,
            "delivery": df.delivery,
            "infliction": df.infliction_type,
            "reference": df.reference_skill_id,
        })

    # If entity spawned, resolve entity hits
    if seg.entity_skill_id:
        entity_file = os.path.join(sd_dir, seg.entity_skill_id + ".json")
        if os.path.exists(entity_file):
            entity_frames = parse_entity_file(entity_file)
            spawn = seg.entity_spawn_frame or 0
            for ef in entity_frames:
                abs_frame = spawn + ef.start_frame
                offsets.append({
                    "offset": frame_to_sec(abs_frame),
                    "delivery": "ENTITY",
                    "infliction": None,
                    "reference": seg.entity_skill_id,
                })

    offsets.sort(key=lambda x: x["offset"])
    return offsets


# ── Skeleton JSON generation ──────────────────────────────────────────────

def build_value_node(segment_levels: list, ratio: float):
    """
    Build a multiplier value node.

    When ratio == 1.0 (single-hit segment), emits a plain VARY_BY.
    Otherwise emits MULT(segment_level_table, ratio) so the segment-level
    multiplier and per-frame weighting are both preserved.
    """
    segment_vary = {
        "verb": "VARY_BY",
        "object": "SKILL_LEVEL",
        "value": segment_levels,
        "ofDeterminer": "THIS",
        "of": "OPERATOR",
    }
    if abs(ratio - 1.0) < 1e-9:
        return segment_vary
    return {
        "operation": "MULT",
        "left": segment_vary,
        "right": {
            "verb": "IS",
            "value": round(ratio, 6),
        },
    }


def build_damage_clause(element: str, segment_levels: list, ratio: float,
                        poise: int = 0, atb: int = 0):
    """Build a DEAL DAMAGE clause with optional DEAL STAGGER and RECOVER SP."""
    effects = []

    if atb:
        effects.append({
            "verb": "RECOVER",
            "object": "SKILL_POINT",
            "with": {"value": {"verb": "IS", "value": atb}},
        })

    if poise:
        effects.append({
            "verb": "DEAL",
            "object": "STAGGER",
            "to": "ENEMY",
            "with": {"value": {"verb": "IS", "value": poise}},
        })

    effects.append({
        "verb": "DEAL",
        "objectQualifier": element,
        "object": "DAMAGE",
        "to": "ENEMY",
        "with": {
            "value": build_value_node(segment_levels, ratio),
            "mainStat": {
                "verb": "IS",
                "object": "STAT",
                "objectId": "ATTACK",
                "ofDeterminer": "THIS",
                "of": "OPERATOR",
            },
        },
    })
    return {
        "conditions": [],
        "effects": effects,
    }


def build_frame(offset_sec: float, element: str, segment_levels: list,
                ratio: float, auxiliary_info: dict = None,
                poise: int = 0, atb: int = 0):
    """Build a single frame entry with MULT(segment_table, ratio)."""
    frame = {
        "metadata": {
            "eventComponentType": "FRAME",
            "dataSources": ["SKILL_DATA", "WARFARIN"],
        },
        "properties": {
            "offset": {
                "value": offset_sec,
                "unit": "SECOND",
            },
        },
        "clause": [build_damage_clause(element, segment_levels, ratio,
                                       poise=poise, atb=atb)],
        "clauseType": "ALL",
    }
    if auxiliary_info:
        frame["properties"]["auxiliaryInfo"] = auxiliary_info
    return frame


def build_segment(duration_sec: float, element: str, frames: list):
    """Build a single segment entry."""
    return {
        "metadata": {
            "eventComponentType": "SEGMENT",
            "dataSources": ["SKILL_DATA", "WARFARIN"],
        },
        "properties": {
            "duration": {
                "value": {"verb": "IS", "value": duration_sec},
                "unit": "SECOND",
            },
            "element": element,
        },
        "frames": frames,
    }


def compute_segment_multiplier_and_ratios(ws: WarfarinSkill, hit_count: int):
    """
    Compute the segment-level multiplier table and per-frame ratios.

    Returns (segment_levels, ratios) where:
      - segment_levels: 12-element list (the display_atk_scale or atk_scale)
      - ratios: list of per-frame ratios that multiply against segment_levels
                to produce the resolved per-frame multiplier.

    For uniform hits:  segment = display, ratio = atk_scale[0] / display[0]
    For single hit:    segment = atk_scale, ratio = [1.0]
    """
    if ws.display_atk_scale and hit_count > 1:
        segment_levels = ws.display_atk_scale
        # Each frame's ratio: per-hit value / segment total
        per_hit_ratio = ws.atk_scale[0] / ws.display_atk_scale[0]
        ratios = [per_hit_ratio] * hit_count
    else:
        segment_levels = ws.atk_scale
        ratios = [1.0]
    return segment_levels, ratios


def generate_basic_attack_skeleton(
    segments: list,  # list[SegmentData]
    warfarin_skills: dict,  # warfarin_id → WarfarinSkill
    sd_dir: str,
    prefix: str,
    operator_id: str,
    element: str,
    skill_name: str,
    skill_id: str,
    category: str,  # BASIC_ATTACK, etc.
):
    """Generate a basic attack skeleton with multiple segments."""
    out_segments = []

    for i, seg in enumerate(segments):
        warf_id = seg.skill_id
        ws = warfarin_skills.get(warf_id)
        if not ws:
            print(f"  WARNING: No Warfarin data for {warf_id}", file=sys.stderr)
            continue

        duration = compute_segment_duration(seg)
        offsets = compute_frame_offsets(seg, sd_dir)
        hit_count = round(ws.display_atk_scale[0] / ws.atk_scale[0]) if ws.display_atk_scale else 1
        segment_levels, ratios = compute_segment_multiplier_and_ratios(ws, hit_count)

        # poise and atb go on the LAST frame of the segment (finisher hit)
        w_poise = int(ws.poise[0]) if ws.poise else 0
        w_atb = int(ws.blackboard_by_level[0].get("atb", 0)) if ws.blackboard_by_level else 0

        frames = []
        for j, off_info in enumerate(offsets):
            ratio = ratios[j] if j < len(ratios) else ratios[-1]
            is_last = (j == len(offsets) - 1) or (j == hit_count - 1)
            aux = {
                "damageDelivery": off_info["delivery"],
                "sourceFrame": int(off_info["offset"] * FPS),
            }
            if off_info["infliction"]:
                aux["inflictionType"] = off_info["infliction"]
                aux["element"] = INFLICTION_TO_ELEMENT.get(off_info["infliction"],
                                                           off_info["infliction"])
            if off_info["reference"]:
                aux["referenceSkillId"] = off_info["reference"]

            frames.append(build_frame(
                off_info["offset"], element, segment_levels, ratio, aux,
                poise=w_poise if is_last else 0,
                atb=w_atb if is_last else 0,
            ))

        # If we got fewer frames from SkillData than Warfarin says, fill with placeholders
        if len(frames) < hit_count:
            ratio = ratios[-1] if ratios else 1.0
            for _ in range(hit_count - len(frames)):
                frames.append(build_frame(0, element, segment_levels, ratio,
                                          {"damageDelivery": "UNKNOWN", "note": "offset not resolved"}))

        out_segments.append(build_segment(duration, element, frames))

    result = {
        "segments": out_segments,
        "properties": {
            "name": skill_name,
            "eventTypes": ["SKILL"],
            "eventCategoryType": category,
            "element": element,
            "id": skill_id,
        },
        "metadata": {
            "originId": operator_id,
        },
    }
    return result


def generate_battle_skill_skeleton(
    seg: SegmentData,
    ws: WarfarinSkill,
    sd_dir: str,
    operator_id: str,
    element: str,
    skill_name: str,
    skill_id: str,
):
    """Generate battle skill skeleton (entity-based or channeling-based)."""
    offsets = compute_frame_offsets(seg, sd_dir)

    # Battle skill has explicitly named multiplier tiers from Warfarin:
    #   atk_scale   = base explosion (first hit)     — own level table
    #   atk_scale_2 = DoT per tick (subsequent hits)  — own level table
    #   atk_scale_3 = additional attack (empowered)   — own level table, separate config
    # Each tier is individually listed on the wiki with its own scaling.
    # These are NOT uniform hits of a single segment pool — use each tier's
    # level table directly as a plain VARY_BY, no MULT wrapping.

    w_poise = int(ws.poise[0]) if ws.poise else 0

    frames = []
    for i, off_info in enumerate(offsets):
        # First frame = base explosion (atk_scale), rest = DoT ticks (atk_scale_2)
        if i == 0:
            mult_levels = ws.atk_scale
        else:
            mult_levels = ws.atk_scale_2 if ws.atk_scale_2 else ws.atk_scale

        aux = {"damageDelivery": off_info["delivery"], "sourceFrame": int(off_info["offset"] * FPS)}
        if off_info["infliction"]:
            aux["inflictionType"] = off_info["infliction"]
        if off_info["reference"]:
            aux["referenceSkillId"] = off_info["reference"]
        # ratio=1.0 → plain VARY_BY, each frame owns its own multiplier table
        # poise on first frame (base explosion)
        frames.append(build_frame(off_info["offset"], element, mult_levels, 1.0, aux,
                                  poise=w_poise if i == 0 else 0))

    # Compute duration: either from entity timeline or AllowNextSkill
    if offsets:
        last_offset = offsets[-1]["offset"]
        duration = round(last_offset + 0.133, 3)
    else:
        duration = compute_segment_duration(seg)

    result = {
        "properties": {
            "name": skill_name,
            "eventTypes": ["SKILL"],
            "eventCategoryType": "BATTLE_SKILL",
            "element": element,
            "id": skill_id,
        },
        "metadata": {"originId": operator_id},
        "segments": [build_segment(duration, element, frames)],
    }
    cost = build_cost_clause(ws)
    if cost:
        result["clause"] = cost

    # Empowered variant data: atk_scale_3, poise_extra, duration, extra_usp, count
    if ws.atk_scale_3:
        # Detect reaction type from labels
        reaction_type = None
        for label_name, _ in ws.labels:
            lower = label_name.lower()
            if "combustion" in lower:
                reaction_type = "COMBUSTION"
            elif "corrosion" in lower:
                reaction_type = "CORROSION"
            elif "superconduct" in lower:
                reaction_type = "SUPERCONDUCT"

        empowered_effects = []

        # CONSUME STATUS (MF stacks)
        if ws.count:
            empowered_effects.append({
                "verb": "CONSUME",
                "object": "STATUS",
                "objectId": "MELTING_FLAME",
                "toDeterminer": "THIS",
                "to": "OPERATOR",
                "with": {"stacks": {"verb": "IS", "value": ws.count}},
            })

        # DEAL STAGGER (poise_extra for additional attack)
        w_poise_extra = int(ws.poise_extra[0]) if ws.poise_extra else 0
        if w_poise_extra:
            empowered_effects.append({
                "verb": "DEAL",
                "object": "STAGGER",
                "to": "ENEMY",
                "with": {"value": {"verb": "IS", "value": w_poise_extra}},
            })

        # APPLY REACTION (combustion/corrosion from label detection)
        if reaction_type and ws.duration:
            empowered_effects.append({
                "verb": "APPLY",
                "object": "REACTION",
                "objectId": reaction_type,
                "to": "ENEMY",
                "with": {"duration": {"verb": "IS", "value": ws.duration, "unit": "SECOND"}},
            })

        # RECOVER ULTIMATE_ENERGY
        if ws.extra_usp:
            empowered_effects.append({
                "verb": "RECOVER",
                "object": "ULTIMATE_ENERGY",
                "with": {"value": {"verb": "IS", "value": ws.extra_usp}},
            })

        # DEAL DAMAGE (atk_scale_3)
        empowered_effects.append({
            "verb": "DEAL",
            "objectQualifier": element,
            "object": "DAMAGE",
            "to": "ENEMY",
            "with": {
                "value": {
                    "verb": "VARY_BY",
                    "object": "SKILL_LEVEL",
                    "value": ws.atk_scale_3,
                    "ofDeterminer": "THIS",
                    "of": "OPERATOR",
                },
                "mainStat": {
                    "verb": "IS",
                    "object": "STAT",
                    "objectId": "ATTACK",
                    "ofDeterminer": "THIS",
                    "of": "OPERATOR",
                },
            },
        })

        result["_empowered_additional_attack"] = {
            "description": "Additional attack frame for empowered variant. "
                           "Activation: CONSUME count MF stacks → triggers this hit. "
                           "Timing from SkillData JumpToAction/FinishOwnerAction flow.",
            "activation_threshold": ws.count,
            "clause": [{"conditions": [], "effects": empowered_effects}],
        }

    return result


def generate_combo_skeleton(
    seg: SegmentData,
    ws: WarfarinSkill,
    sd_dir: str,
    operator_id: str,
    element: str,
    skill_name: str,
    skill_id: str,
):
    """Generate combo skill skeleton."""
    # Animation segment (from exclusive frame)
    anim_dur = frame_to_sec(seg.exclusive_frames)

    offsets = compute_frame_offsets(seg, sd_dir)

    hit_count = len(offsets) or 1
    w_poise = int(ws.poise[0]) if ws.poise else 0
    hit_frames = []
    for off_info in offsets:
        aux = {"damageDelivery": off_info["delivery"], "sourceFrame": int(off_info["offset"] * FPS)}
        if off_info["reference"]:
            aux["referenceSkillId"] = off_info["reference"]
        # Combo is always single-hit per segment, ratio = 1.0
        hit_frames.append(build_frame(off_info["offset"], element, ws.atk_scale, 1.0, aux,
                                      poise=w_poise))

    # Cooldown from blackboard
    cd = seg.blackboard.get("duration", 0) or ws.cooldown

    segments = [
        {
            "metadata": {"eventComponentType": "SEGMENT"},
            "properties": {
                "segmentTypes": ["ANIMATION"],
                "name": "Animation",
                "duration": {"value": {"verb": "IS", "value": anim_dur}, "unit": "SECOND"},
                "timeDependency": "REAL_TIME",
                "timeInteractionType": "TIME_STOP",
            },
            "frames": [],
        },
        build_segment(
            round(max(off["offset"] for off in offsets) + 0.8, 1) if offsets else 2.0,
            element,
            hit_frames,
        ),
    ]

    if cd:
        segments.append({
            "metadata": {"eventComponentType": "SEGMENT"},
            "properties": {
                "segmentTypes": ["COOLDOWN", "IMMEDIATE_COOLDOWN"],
                "name": "Cooldown",
                "duration": {"value": {"verb": "IS", "value": cd}, "unit": "SECOND"},
                "timeDependency": "REAL_TIME",
            },
            "frames": [],
        })

    result = {
        "properties": {
            "name": skill_name,
            "eventTypes": ["SKILL"],
            "eventCategoryType": "COMBO_SKILL",
            "element": element,
            "id": skill_id,
        },
        "metadata": {"originId": operator_id},
        "segments": segments,
    }

    # UE gain from Warfarin usp_display (per-enemy-count scaling)
    if ws.usp_display:
        # Use the single-enemy value as the base clause
        base_ue = ws.usp_display[0][1] if ws.usp_display else 0
        if base_ue:
            result["clause"] = [{
                "conditions": [],
                "effects": [{
                    "verb": "RECOVER",
                    "object": "ULTIMATE_ENERGY",
                    "to": "OPERATOR",
                    "toDeterminer": "THIS",
                    "with": {"value": {"verb": "IS", "value": int(base_ue)}},
                }],
            }]
        # Note the per-enemy scaling for manual reference
        if len(ws.usp_display) > 1:
            result["_note_ue_scaling"] = {
                "description": "UE gain scales by enemy count hit",
                "values": {f"{n}_enemy": int(v) for n, v in ws.usp_display},
            }

    return result


def build_cost_clause(ws: WarfarinSkill):
    """Build the cost clause from Warfarin costType/costValue."""
    if not ws.cost_value:
        return None
    # costType 0 = ULTIMATE_ENERGY, 1 = SKILL_POINT
    cost_object = "ULTIMATE_ENERGY" if ws.cost_type == 0 else "SKILL_POINT"
    return [{
        "conditions": [],
        "effects": [{
            "verb": "CONSUME",
            "object": cost_object,
            "with": {"value": {"verb": "IS", "value": ws.cost_value}},
        }],
    }]


def generate_ultimate_skeleton(
    seg: SegmentData,
    ws: WarfarinSkill,
    operator_id: str,
    skill_name: str,
    skill_id: str,
):
    """Generate ultimate skill skeleton."""
    anim_dur = frame_to_sec(seg.exclusive_frames)
    active_dur = ws.blackboard_by_level[0].get("duration", 15)

    result = {
        "properties": {
            "name": skill_name,
            "eventTypes": ["SKILL"],
            "eventCategoryType": "ULTIMATE_SKILL",
            "id": skill_id,
        },
        "metadata": {"originId": operator_id},
        "segments": [
            {
                "metadata": {"eventComponentType": "SEGMENT"},
                "properties": {
                    "segmentTypes": ["ANIMATION"],
                    "name": "Animation",
                    "duration": {"value": {"verb": "IS", "value": anim_dur}, "unit": "SECOND"},
                    "timeDependency": "REAL_TIME",
                    "timeInteractionType": "TIME_STOP",
                },
                # ENABLE/DISABLE clauses must be added manually per operator using objectId targeting
                # e.g. {"verb": "ENABLE", "objectId": "SKILL_ENHANCED", "object": "BATK", ...}
                "clause": [{"conditions": [], "effects": []}],
                "frames": [],
                "clauseType": "ALL",
            },
            {
                "metadata": {"eventComponentType": "SEGMENT"},
                "properties": {
                    "segmentTypes": ["ACTIVE"],
                    "name": skill_name,
                    "duration": {"value": {"verb": "IS", "value": active_dur}, "unit": "SECOND"},
                },
                "clause": [{"conditions": [], "effects": []}],
                "frames": [],
                "clauseType": "ALL",
            },
        ],
    }

    cost = build_cost_clause(ws)
    if cost:
        result["clause"] = cost

    return result


def generate_single_hit_skeleton(
    seg: SegmentData,
    ws: WarfarinSkill,
    sd_dir: str,
    operator_id: str,
    element: str,
    skill_name: str,
    skill_id: str,
    category: str,
):
    """Generate skeleton for dive/finisher (single-segment, simple)."""
    offsets = compute_frame_offsets(seg, sd_dir)
    hit_count = round(ws.display_atk_scale[0] / ws.atk_scale[0]) if ws.display_atk_scale else 1
    segment_levels, ratios = compute_segment_multiplier_and_ratios(ws, hit_count)
    duration = compute_segment_duration(seg)

    frames = []
    for j, off_info in enumerate(offsets):
        ratio = ratios[j] if j < len(ratios) else ratios[-1]
        aux = {"damageDelivery": off_info["delivery"], "sourceFrame": int(off_info["offset"] * FPS)}
        frames.append(build_frame(off_info["offset"], element, segment_levels, ratio, aux))

    if len(frames) < hit_count:
        ratio = ratios[-1] if ratios else 1.0
        for _ in range(hit_count - len(frames)):
            frames.append(build_frame(0, element, segment_levels, ratio,
                                      {"damageDelivery": "UNKNOWN", "note": "offset not resolved"}))

    result = {
        "properties": {
            "name": skill_name,
            "eventTypes": ["SKILL"],
            "eventCategoryType": category,
            "element": element,
            "id": skill_id,
        },
        "metadata": {"originId": operator_id},
        "segments": [build_segment(duration, element, frames)],
    }
    return result


# ── Comparison ────────────────────────────────────────────────────────────

def compare_skeleton_to_existing(skeleton: dict, existing_path: str, label: str):
    """Compare a generated skeleton against an existing config file."""
    if not os.path.exists(existing_path):
        print(f"  [{label}] No existing file to compare: {existing_path}")
        return

    with open(existing_path) as f:
        existing = json.load(f)

    issues = []
    matches = []

    # Compare segment count
    skel_segs = skeleton.get("segments", [])
    exist_segs = existing.get("segments", [])
    if len(skel_segs) == len(exist_segs):
        matches.append(f"segment count: {len(skel_segs)}")
    else:
        issues.append(f"segment count: skeleton={len(skel_segs)} existing={len(exist_segs)}")

    # Compare per-segment
    for i in range(min(len(skel_segs), len(exist_segs))):
        ss = skel_segs[i]
        es = exist_segs[i]

        # Duration
        sd = ss.get("properties", {}).get("duration", {}).get("value", {})
        sd_val = sd.get("value", sd) if isinstance(sd, dict) else sd
        ed = es.get("properties", {}).get("duration", {}).get("value", {})
        ed_val = ed.get("value", ed) if isinstance(ed, dict) else ed
        if isinstance(sd_val, (int, float)) and isinstance(ed_val, (int, float)):
            delta = abs(sd_val - ed_val)
            if delta < 0.05:
                matches.append(f"seg[{i}] duration: {sd_val}s ≈ {ed_val}s (Δ{delta:.3f})")
            else:
                issues.append(f"seg[{i}] duration: skeleton={sd_val}s existing={ed_val}s")

        # Frame count
        sf = ss.get("frames", [])
        ef = es.get("frames", [])
        if len(sf) == len(ef):
            matches.append(f"seg[{i}] frames: {len(sf)}")
        else:
            issues.append(f"seg[{i}] frames: skeleton={len(sf)} existing={len(ef)}")

        # Frame offsets
        s_offsets = [fr.get("properties", {}).get("offset", {}).get("value", 0) for fr in sf]
        e_offsets = [fr.get("properties", {}).get("offset", {}).get("value", 0) for fr in ef]
        if s_offsets and e_offsets:
            offset_match = all(abs(a - b) < 0.05 for a, b in zip(s_offsets, e_offsets))
            if offset_match and len(s_offsets) == len(e_offsets):
                matches.append(f"seg[{i}] offsets match")
            else:
                issues.append(f"seg[{i}] offsets: skeleton={s_offsets} existing={e_offsets}")

        # First frame multiplier (L1)
        def get_first_mult(seg_data):
            for fr in seg_data.get("frames", []):
                for cl in fr.get("clause", []):
                    for eff in cl.get("effects", []):
                        if eff.get("verb") == "DEAL" and eff.get("object") == "DAMAGE":
                            v = eff.get("with", {}).get("value", {})
                            if isinstance(v, dict):
                                if "value" in v and isinstance(v["value"], list):
                                    return v["value"][0]
                                if "left" in v and isinstance(v["left"], dict):
                                    lv = v["left"].get("value")
                                    if isinstance(lv, list):
                                        return lv[0]
            return None

        sm = get_first_mult(ss)
        em = get_first_mult(es)
        if sm is not None and em is not None:
            if abs(sm - em) < 0.01:
                matches.append(f"seg[{i}] L1 mult: {sm}")
            else:
                issues.append(f"seg[{i}] L1 mult: skeleton={sm} existing={em}")

    print(f"  [{label}]")
    for m in matches:
        print(f"    ✅ {m}")
    for iss in issues:
        print(f"    ❌ {iss}")
    if not issues:
        print(f"    → ALL CHECKS PASSED")


# ── Advisory helpers ───────────────────────────────────────────────────────

def collect_warfarin_advisories(ws: WarfarinSkill) -> list:
    """Generate advisories from Warfarin data about multiplier structure."""
    advisories = []

    # Multiple atk_scale tiers → weighted frames and possible variants
    tiers = []
    if ws.atk_scale:
        tiers.append(("atk_scale", ws.atk_scale[0]))
    if ws.atk_scale_2:
        tiers.append(("atk_scale_2", ws.atk_scale_2[0]))
    if ws.atk_scale_3:
        tiers.append(("atk_scale_3", ws.atk_scale_3[0]))

    if len(tiers) > 1:
        tier_str = ", ".join(f"{name}={val}" for name, val in tiers)
        advisories.append(
            f"Multiple multiplier tiers: {tier_str} — "
            f"frames within this segment have different weights")

    if ws.atk_scale_3:
        extras = []
        if ws.poise_extra:
            extras.append(f"poise_extra={int(ws.poise_extra[0])}")
        if ws.extra_usp:
            extras.append(f"extra_usp={int(ws.extra_usp)}")
        if ws.duration:
            extras.append(f"duration={ws.duration}s")
        if ws.count:
            extras.append(f"count(threshold)={ws.count}")
        advisories.append(
            f"atk_scale_3={ws.atk_scale_3[0]} → EMPOWERED variant "
            f"(additional attack: {', '.join(extras)})")

    if ws.atk_scale_2 and ws.atk_scale:
        if ws.atk_scale_2[0] != ws.atk_scale[0]:
            advisories.append(
                f"atk_scale ({ws.atk_scale[0]}) ≠ atk_scale_2 ({ws.atk_scale_2[0]}) — "
                f"ENHANCED variant or multi-sequence skill with different per-hit damage")

    if ws.usp_display:
        advisories.append(
            f"UE gain per enemy count: {', '.join(f'{n}e={int(v)}' for n, v in ws.usp_display)}")

    # display_atk_scale exists → uniform multi-hit
    if ws.display_atk_scale:
        hit_count = round(ws.display_atk_scale[0] / ws.atk_scale[0])
        advisories.append(
            f"Uniform {hit_count}-hit segment: display={ws.display_atk_scale[0]} "
            f"/ per-hit={ws.atk_scale[0]}")

    # Non-zero poise
    if ws.poise and ws.poise[0]:
        advisories.append(f"Stagger: poise={ws.poise[0]}")

    # SP recovery (atb)
    if ws.blackboard_by_level:
        l1_bb = ws.blackboard_by_level[0]
        atb_val = l1_bb.get("atb", 0)
        if atb_val:
            advisories.append(f"SP recovery on hit: atb={atb_val}")

    return advisories


def print_advisories(label: str, sd_advisories: list, warf_advisories: list):
    """Print advisories if any exist."""
    all_adv = sd_advisories + warf_advisories
    if not all_adv:
        return
    print(f"  ⚠ Advisories for {label}:")
    for adv in sd_advisories:
        print(f"    [SkillData] {adv}")
    for adv in warf_advisories:
        print(f"    [Warfarin]  {adv}")


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Parse SkillData + Warfarin into skill skeletons")
    parser.add_argument("--warfarin", required=True, help="Path to Warfarin JSON")
    parser.add_argument("--skilldata", required=True, help="Path to SkillData directory")
    parser.add_argument("--prefix", required=True, help="Character prefix (e.g. chr_0016_laevat)")
    parser.add_argument("--operator", required=True, help="Operator ID (e.g. LAEVATAIN)")
    parser.add_argument("--element", default="HEAT", help="Default element")
    parser.add_argument("--compare", default=None, help="Existing skills dir to compare against")
    parser.add_argument("--output", default=None, help="Output directory for generated JSONs")
    args = parser.parse_args()

    # Parse sources
    warfarin_skills = parse_warfarin(args.warfarin)
    groups, secondary = classify_skill_files(args.skilldata, args.prefix)

    print(f"Operator: {args.operator} ({args.prefix})")
    print(f"Warfarin skills: {len(warfarin_skills)}")
    print(f"SkillData groups: {', '.join(f'{k}={len(v)}' for k, v in groups.items() if v)}")
    print(f"Secondary files: {len(secondary)}")
    print()

    generated = {}

    # ── Basic Attack ──────────────────────────────────────────────────
    if groups["basic_attack"]:
        segs = [parse_skilldata_file(os.path.join(args.skilldata, f))
                for f in groups["basic_attack"]]
        skeleton = generate_basic_attack_skeleton(
            segs, warfarin_skills, args.skilldata, args.prefix,
            args.operator, args.element,
            skill_name="TODO_BASIC_ATTACK_NAME",
            skill_id="TODO_BASIC_ATTACK_ID",
            category="BASIC_ATTACK",
        )
        generated["basic_attack"] = skeleton
        print("=== BASIC ATTACK ===")
        print(f"  Segments: {len(skeleton['segments'])}")
        for i, seg_data in enumerate(segs):
            skel_seg = skeleton["segments"][i]
            d = skel_seg["properties"]["duration"]["value"]["value"]
            fc = len(skel_seg["frames"])
            offsets = [fr["properties"]["offset"]["value"] for fr in skel_seg["frames"]]
            print(f"  Seg {i}: dur={d}s  frames={fc}  offsets={offsets}")
            ws = warfarin_skills.get(seg_data.skill_id)
            warf_adv = collect_warfarin_advisories(ws) if ws else []
            print_advisories(f"Seg {i} ({seg_data.skill_id})", seg_data.advisories, warf_adv)
        if args.compare:
            compare_skeleton_to_existing(skeleton,
                os.path.join(args.compare, "basic-attack-batk-flaming-cinders.json"),
                "BA Normal")
        print()

    # ── Enhanced Basic Attack ─────────────────────────────────────────
    if groups["enhanced_basic_attack"]:
        segs = [parse_skilldata_file(os.path.join(args.skilldata, f))
                for f in groups["enhanced_basic_attack"]]
        skeleton = generate_basic_attack_skeleton(
            segs, warfarin_skills, args.skilldata, args.prefix,
            args.operator, args.element,
            skill_name="TODO_ENHANCED_BA_NAME",
            skill_id="TODO_ENHANCED_BA_ID",
            category="BASIC_ATTACK",
            )
        generated["enhanced_basic_attack"] = skeleton
        print("=== ENHANCED BASIC ATTACK ===")
        print(f"  Segments: {len(skeleton['segments'])}")
        for i, seg_data in enumerate(segs):
            skel_seg = skeleton["segments"][i]
            d = skel_seg["properties"]["duration"]["value"]["value"]
            fc = len(skel_seg["frames"])
            offsets = [fr["properties"]["offset"]["value"] for fr in skel_seg["frames"]]
            print(f"  Seg {i}: dur={d}s  frames={fc}  offsets={offsets}")
            ws = warfarin_skills.get(seg_data.skill_id)
            warf_adv = collect_warfarin_advisories(ws) if ws else []
            print_advisories(f"Seg {i} ({seg_data.skill_id})", seg_data.advisories, warf_adv)
        if args.compare:
            compare_skeleton_to_existing(skeleton,
                os.path.join(args.compare, "basic-attack-batk-flaming-cinders-enhanced.json"),
                "BA Enhanced")
        print()

    # ── Dive Attack ───────────────────────────────────────────────────
    # Use plunging_attack_end if available, else dash_attack
    dive_files = groups["plunging_attack"] or groups["dive_attack"]
    if dive_files:
        seg = parse_skilldata_file(os.path.join(args.skilldata, dive_files[0]))
        warf_id = seg.skill_id
        ws = warfarin_skills.get(warf_id)
        if ws:
            skeleton = generate_single_hit_skeleton(
                seg, ws, args.skilldata, args.operator, args.element,
                skill_name="TODO_DIVE_NAME", skill_id="TODO_DIVE_ID",
                category="BASIC_ATTACK", )
            generated["dive"] = skeleton
            print("=== DIVE ATTACK ===")
            s = skeleton["segments"][0]
            print(f"  Duration: {s['properties']['duration']['value']['value']}s  Frames: {len(s['frames'])}")
            if args.compare:
                compare_skeleton_to_existing(skeleton,
                    os.path.join(args.compare, "basic-attack-dive-flaming-cinders.json"),
                    "Dive")
            print()

    # ── Finisher ──────────────────────────────────────────────────────
    if groups["finisher"]:
        seg = parse_skilldata_file(os.path.join(args.skilldata, groups["finisher"][0]))
        ws = warfarin_skills.get(seg.skill_id)
        if ws:
            skeleton = generate_single_hit_skeleton(
                seg, ws, args.skilldata, args.operator, args.element,
                skill_name="TODO_FINISHER_NAME", skill_id="TODO_FINISHER_ID",
                category="BASIC_ATTACK", )
            generated["finisher"] = skeleton
            print("=== FINISHER ===")
            s = skeleton["segments"][0]
            print(f"  Duration: {s['properties']['duration']['value']['value']}s  Frames: {len(s['frames'])}")
            if args.compare:
                compare_skeleton_to_existing(skeleton,
                    os.path.join(args.compare, "basic-attack-finisher-flaming-cinders.json"),
                    "Finisher")
            print()

    # ── Battle Skill ──────────────────────────────────────────────────
    if groups["battle_skill"]:
        seg = parse_skilldata_file(os.path.join(args.skilldata, groups["battle_skill"][0]))
        ws = warfarin_skills.get(seg.skill_id)
        if ws:
            skeleton = generate_battle_skill_skeleton(
                seg, ws, args.skilldata, args.operator, args.element,
                skill_name="TODO_BS_NAME", skill_id="TODO_BS_ID",
            )
            generated["battle_skill"] = skeleton
            print("=== BATTLE SKILL ===")
            s = skeleton["segments"][0]
            print(f"  Duration: {s['properties']['duration']['value']['value']}s  Frames: {len(s['frames'])}")
            offsets = [fr["properties"]["offset"]["value"] for fr in s["frames"]]
            print(f"  Offsets: {offsets}")
            print_advisories("Battle Skill", seg.advisories, collect_warfarin_advisories(ws))
            if args.compare:
                compare_skeleton_to_existing(skeleton,
                    os.path.join(args.compare, "battle-skill-smouldering-fire.json"),
                    "BS Normal")
            print()

    # ── Enhanced Battle Skill ─────────────────────────────────────────
    if groups["enhanced_battle_skill"]:
        seg = parse_skilldata_file(os.path.join(args.skilldata, groups["enhanced_battle_skill"][0]))
        ws = warfarin_skills.get(seg.skill_id)
        if ws:
            skeleton = generate_battle_skill_skeleton(
                seg, ws, args.skilldata, args.operator, args.element,
                skill_name="TODO_EBS_NAME", skill_id="TODO_EBS_ID",
                )
            generated["enhanced_battle_skill"] = skeleton
            print("=== ENHANCED BATTLE SKILL ===")
            s = skeleton["segments"][0]
            print(f"  Duration: {s['properties']['duration']['value']['value']}s  Frames: {len(s['frames'])}")
            print_advisories("Enhanced Battle Skill", seg.advisories, collect_warfarin_advisories(ws))
            if args.compare:
                compare_skeleton_to_existing(skeleton,
                    os.path.join(args.compare, "battle-skill-smouldering-fire-enhanced.json"),
                    "BS Enhanced")
            print()

    # ── Combo Skill ───────────────────────────────────────────────────
    if groups["combo_skill"]:
        seg = parse_skilldata_file(os.path.join(args.skilldata, groups["combo_skill"][0]))
        ws = warfarin_skills.get(seg.skill_id)
        if ws:
            skeleton = generate_combo_skeleton(
                seg, ws, args.skilldata, args.operator, args.element,
                skill_name="TODO_COMBO_NAME", skill_id="TODO_COMBO_ID",
            )
            generated["combo"] = skeleton
            print("=== COMBO SKILL ===")
            for i, s in enumerate(skeleton["segments"]):
                d = s["properties"]["duration"]["value"]["value"]
                print(f"  Seg {i}: dur={d}s  frames={len(s.get('frames', []))}")
            print_advisories("Combo Skill", seg.advisories, collect_warfarin_advisories(ws))
            if args.compare:
                compare_skeleton_to_existing(skeleton,
                    os.path.join(args.compare, "combo-skill-seethe.json"),
                    "Combo")
            print()

    # ── Ultimate ──────────────────────────────────────────────────────
    if groups["ultimate"]:
        seg = parse_skilldata_file(os.path.join(args.skilldata, groups["ultimate"][0]))
        ws = warfarin_skills.get(seg.skill_id)
        if ws:
            skeleton = generate_ultimate_skeleton(
                seg, ws, args.operator,
                skill_name="TODO_ULT_NAME", skill_id="TODO_ULT_ID",
            )
            generated["ultimate"] = skeleton
            print("=== ULTIMATE ===")
            for i, s in enumerate(skeleton["segments"]):
                d = s["properties"]["duration"]["value"]["value"]
                print(f"  Seg {i}: dur={d}s")
            print_advisories("Ultimate", seg.advisories, collect_warfarin_advisories(ws))
            if args.compare:
                compare_skeleton_to_existing(skeleton,
                    os.path.join(args.compare, "ultimate-twilight.json"),
                    "Ultimate")
            print()

    # ── Other / unclassified ──────────────────────────────────────────
    if groups["other"]:
        print("=== UNCLASSIFIED ===")
        for f in groups["other"]:
            print(f"  {f}")

    # ── Write output ──────────────────────────────────────────────────
    if args.output:
        os.makedirs(args.output, exist_ok=True)
        for key, skel in generated.items():
            outpath = os.path.join(args.output, f"{key}.json")
            with open(outpath, "w") as f:
                json.dump(skel, f, indent=2)
            print(f"Wrote {outpath}")


if __name__ == "__main__":
    main()
