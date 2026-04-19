#!/usr/bin/env python3
"""
Patch `properties.descriptionParams` on every operator's skill and talent
files from the Warfarin API.

Source keys:
  - Skills  : `skillPatchTable[skillId].SkillPatchDataBundle[-1].blackboard`
              (max-level bundle). Keys like `poise`, `atk_scale`, `atb`, and
              skill-specific values (`trigger_hp_ratio`, `attack_poise`, ...).
  - Talents : `potentialTalentEffectTable[talentEffectId].dataList[]` —
              combines `attachBuff.blackboard`, `skillBbModifier` (short +
              full key form, `talent_N_` prefix stripped), and expression
              variants (`1-X`, `-X`, `X-1`) so templates interpolate.

Narrow: does NOT touch operator base JSONs or locale bundles. Idempotent —
existing `descriptionParams` are merged, never clobbered.

Usage:
  python3 scripts/patch_skill_talent_params.py            # all operators
  python3 scripts/patch_skill_talent_params.py da-pan     # single slug
"""
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OPERATORS_DIR = ROOT / 'src/model/game-data/operators'
API_BASE = 'https://api.warfarin.wiki/v1/en/operators'

BB_PREFIX_RE = re.compile(r'^(?:potential|talent)_\d+_')


def fetch(slug: str) -> dict:
    req = urllib.request.Request(
        f'{API_BASE}/{slug}',
        headers={'User-Agent': 'zero-sanity-timeline/patch-skill-talent-params'},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def add_expression_params(params: dict[str, float]) -> None:
    """Pre-compute `1-X`, `-X`, `X-1` variants so Warfarin-style expression
    tokens like `{1-costValue:0%}` have a direct numeric entry."""
    for key in list(params.keys()):
        val = params[key]
        if not isinstance(val, (int, float)):
            continue
        params.setdefault(f'1-{key}', 1 - val)
        params.setdefault(f'-{key}', -val)
        params.setdefault(f'{key}-1', val - 1)


# ── Skill params ────────────────────────────────────────────────────────────

# Warfarin skill-id suffixes → skill patch key we care about. Display-only
# bb keys are filtered out (they duplicate values we don't render).
DISPLAY_ONLY_BB_KEYS = {'display_atk_scale', 'display_atk_scale_pull', 'atk_scale_display_ex'}


def extract_skill_params(raw: dict) -> dict[str, dict[str, float]]:
    """Returns {warfarinSkillId: {param: value}} keyed by the raw Warfarin
    skill id (char prefix + suffix) — the caller resolves our canonical id
    via the skillIds map."""
    out: dict[str, dict[str, float]] = {}
    patch_table = raw['data'].get('skillPatchTable', {})
    for warfarin_sid, bundle_obj in patch_table.items():
        bundles = bundle_obj.get('SkillPatchDataBundle', [])
        if not bundles:
            continue
        # Last bundle = max level. Description placeholders show max-level
        # values (aligns with player-facing skill reference wikis).
        last = bundles[-1]
        params: dict[str, float] = {}
        for entry in last.get('blackboard', []):
            key = entry.get('key')
            if not key or key in DISPLAY_ONLY_BB_KEYS:
                continue
            params[key] = entry['value']
        if params:
            add_expression_params(params)
            out[warfarin_sid] = params
    return out


def skill_id_for_warfarin_id(raw: dict, warfarin_sid: str) -> str | None:
    """Resolve our canonical skill id from a Warfarin skill id via the
    parser's skillIds map (already stored in the operator JSON). Warfarin's
    `{charId}_attackN` suffixes collapse to a single BA id — consumers walk
    the suffix→category → skillIds[category]."""
    # Defer to a caller-provided mapping built off `buildSkillIds` output.
    raise NotImplementedError


# Warfarin skill-suffix → our skill category (mirrors the
# `classifyWarfarinSkillId` logic in parseWarfarinOperator.ts).
def classify_suffix(warfarin_sid: str) -> str | None:
    parts = warfarin_sid.split('_')
    if len(parts) < 4:
        return None
    suffix = '_'.join(parts[3:])
    m = re.match(r'^attack\d', suffix)
    if m:
        return 'BASIC_ATTACK'
    m = re.match(r'^ult_attack\d', suffix)
    if m:
        return 'ENHANCED_BASIC_ATTACK'
    if suffix == 'ult_attack_end':
        return 'ENHANCED_BASIC_ATTACK_END'
    if suffix == 'normal_skill':
        return 'BATTLE'
    if suffix == 'normal_skill_during_ult':
        return 'ENHANCED_BATTLE_SKILL'
    if suffix == 'combo_skill':
        return 'COMBO'
    if suffix == 'ultimate_skill':
        return 'ULTIMATE'
    if suffix == 'dash_attack':
        return 'DASH_ATTACK'
    if suffix == 'plunging_attack_end':
        return 'DIVE'
    if suffix in ('power_attack', 'power_attack2'):
        return 'FINISHER'
    return None


# ── Talent params ───────────────────────────────────────────────────────────

def extract_talent_params(raw: dict) -> dict[int, dict[str, float]]:
    """Returns {talentIndex: {param: value}} where talentIndex is 0 (slot
    "one") or 1 (slot "two"). Highest-level passive node wins."""
    out: dict[int, dict[str, float]] = {}
    seen_level: dict[int, int] = {}
    talents = raw['data']['charGrowthTable'].get('talentNodeMap', {})
    effects = raw['data'].get('potentialTalentEffectTable', {})
    for node in talents.values():
        if node.get('nodeType') != 4:
            continue
        ps = node.get('passiveSkillNodeInfo') or {}
        idx = ps.get('index')
        level = ps.get('level', 0)
        eid = ps.get('talentEffectId')
        if idx is None or not eid:
            continue
        if seen_level.get(idx, -1) >= level:
            continue
        effect = effects.get(eid)
        if not effect:
            continue
        params: dict[str, float] = {}
        for d in effect.get('dataList', []):
            # Three blackboard sources — Warfarin's template can reference any
            # key from any of them. `attachBuff` for buff params, `attachSkill`
            # for auxiliary skill params (Ember's "Pay the Ferric Price"
            # attack/duration live here), and `skillBbModifier` for scalar
            # tweaks to the trigger skill itself.
            for section in ('attachBuff', 'attachSkill'):
                bb = (d.get(section) or {}).get('blackboard') or []
                for entry in bb:
                    if entry.get('key'):
                        params[entry['key']] = entry['value']
            sbb = d.get('skillBbModifier') or {}
            bbkey = sbb.get('bbKey')
            if bbkey:
                short = BB_PREFIX_RE.sub('', bbkey)
                params[short] = sbb.get('floatValue', 0)
                params[bbkey] = sbb.get('floatValue', 0)
            am = d.get('attrModifier') or {}
            # (No attrType→name mapping needed for talents in current kit.)
            _ = am
        if params:
            add_expression_params(params)
            out[idx] = params
            seen_level[idx] = level
    return out


# ── File merge ──────────────────────────────────────────────────────────────

def merge_description_params(file_path: Path, new_params: dict[str, float]) -> bool:
    if not new_params:
        return False
    doc = json.loads(file_path.read_text())
    props = doc.get('properties') or {}
    existing = props.get('descriptionParams') or {}
    merged = {**existing, **new_params}
    next_props: dict = {}
    inserted = False
    for k, v in props.items():
        if k == 'descriptionParams':
            continue
        next_props[k] = v
        # Insert after `id` (skill/talent files don't have a `level` key like
        # potentials do — `id` is the stable anchor).
        if k == 'id' and not inserted:
            next_props['descriptionParams'] = merged
            inserted = True
    if not inserted:
        next_props['descriptionParams'] = merged
    doc['properties'] = next_props
    file_path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + '\n')
    return True


# ── Patch operator ──────────────────────────────────────────────────────────

def patch_operator(slug: str) -> tuple[int, int, int, int]:
    """Returns (skill_patched, skill_total, talent_patched, talent_total)."""
    op_dir = OPERATORS_DIR / slug
    if not op_dir.is_dir():
        return (0, 0, 0, 0)

    raw = fetch(slug)
    # Build Warfarin-skill-id → canonical-skill-id map from buildSkillIds-style
    # logic — the base JSON stores it in `skillPatchTable` via the parser, but
    # since we run after a locale migration the base JSON may no longer carry
    # it. Recompute from the raw response here.
    # The canonical id lives in `SkillPatchDataBundle[*].skillName` on Warfarin
    # — that's the in-game display name, not our id. But the blackboard keys
    # are stable across levels, so we key by category.
    skill_params_by_warfarin = extract_skill_params(raw)
    # Collapse Warfarin attackN variants — they target a single basic-attack
    # file. MERGE blackboards across variants (not overwrite) so keys that
    # only appear on the final strike (e.g. `poise` on attack4) survive
    # alongside keys from earlier variants.
    params_by_category: dict[str, dict[str, float]] = {}
    for wsid, params in skill_params_by_warfarin.items():
        cat = classify_suffix(wsid)
        if not cat:
            continue
        if cat not in params_by_category:
            params_by_category[cat] = {}
        params_by_category[cat].update(params)

    # Skills: iterate files in `skills/` and map category → file by filename.
    skill_patched = skill_total = 0
    skills_dir = op_dir / 'skills'
    if skills_dir.is_dir():
        for fname in sorted(os.listdir(skills_dir)):
            if not fname.endswith('.json'):
                continue
            skill_total += 1
            # Filenames encode category. Examples:
            #   basic-attack-batk-* (BASIC_ATTACK final strike carries poise)
            #   basic-attack-finisher-*, basic-attack-dive-*
            #   battle-skill-*, combo-skill-*, ultimate-*
            cat = None
            if fname.startswith('basic-attack-batk'):
                cat = 'BASIC_ATTACK'
            elif fname.startswith('basic-attack-finisher'):
                cat = 'FINISHER'
            elif fname.startswith('basic-attack-dive'):
                cat = 'DIVE'
            elif fname.startswith('battle-skill'):
                cat = 'BATTLE'
            elif fname.startswith('combo-skill'):
                cat = 'COMBO'
            elif fname.startswith('ultimate-'):
                cat = 'ULTIMATE'
            if not cat:
                continue
            params = params_by_category.get(cat)
            if not params:
                continue
            if merge_description_params(skills_dir / fname, params):
                skill_patched += 1

    # Talents: slot "one" → talent file at talents/talent-*.json index 0,
    # slot "two" → talent file at talents/talent-*.json index 1. Filename
    # order is stable alphabetical; mapping filename → slot uses the
    # operator JSON's `talents.{one,two}` (already resolved to talent ids).
    op_base_path = op_dir / f'{slug}.json'
    talent_id_by_slot: dict[int, str] = {}
    if op_base_path.exists():
        base = json.loads(op_base_path.read_text())
        talents = base.get('talents') or {}
        if isinstance(talents.get('one'), str):
            talent_id_by_slot[0] = talents['one']
        if isinstance(talents.get('two'), str):
            talent_id_by_slot[1] = talents['two']

    talent_params_by_slot = extract_talent_params(raw)
    talent_patched = talent_total = 0
    talents_dir = op_dir / 'talents'
    if talents_dir.is_dir():
        # Read each talent file and match its id → slot.
        for fname in sorted(os.listdir(talents_dir)):
            if not fname.endswith('.json'):
                continue
            talent_total += 1
            path = talents_dir / fname
            doc = json.loads(path.read_text())
            tid = (doc.get('properties') or {}).get('id')
            if not tid:
                continue
            slot = next((s for s, sid in talent_id_by_slot.items() if sid == tid), None)
            if slot is None:
                continue
            params = talent_params_by_slot.get(slot)
            if not params:
                continue
            if merge_description_params(path, params):
                talent_patched += 1

    return (skill_patched, skill_total, talent_patched, talent_total)


def main():
    slugs = sys.argv[1:] or sorted(
        d.name for d in OPERATORS_DIR.iterdir()
        if d.is_dir() and d.name != 'generic'
    )
    tot = [0, 0, 0, 0]
    for slug in slugs:
        try:
            r = patch_operator(slug)
        except Exception as e:
            print(f'  {slug}: ERROR {e}')
            continue
        for i, v in enumerate(r):
            tot[i] += v
        print(f'  {slug}: skills {r[0]}/{r[1]}  talents {r[2]}/{r[3]}')
    print(f'\nTotal: skills {tot[0]}/{tot[1]}  talents {tot[2]}/{tot[3]}')


if __name__ == '__main__':
    main()
