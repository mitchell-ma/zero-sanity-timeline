#!/usr/bin/env python3
"""
Extract user-facing strings (name, description) from every game-data JSON
file into per-area locale bundles under src/locales/game-data/en-US/, and
strip the extracted fields from the source JSONs.

Key shape matches src/locales/gameDataLocale.ts::LocaleKey:
  op.<ID>.event.name|description
  op.<ID>.skill.<SKILL_ID>.event.name|description
  op.<ID>.skill.<SKILL_ID>.segment.<i>.name
  op.<ID>.skill.<SKILL_ID>.segment.<i>.frame.<j>.name
  op.<ID>.talent.<TALENT_ID>.event.{name,description}
  op.<ID>.status.<STATUS_ID>.event.{name,description}
  op.<ID>.potential.<level>.event.{name,description}
  weapon.<WEAPON_ID>.event.{name,description}
  weapon.<WEAPON_ID>.segment.<i>.name
  weapon.<WEAPON_ID>.skill.<SKILL_ID>.event.{name,description}
  weapon.<WEAPON_ID>.status.<STATUS_ID>.event.{name,description}
  gear.<GEAR_SET_ID>.event.{name,description}
  gear.<GEAR_SET_ID>.piece.<PIECE_ID>.event.{name,description}
  gear.<GEAR_SET_ID>.status.<STATUS_ID>.event.{name,description}
  consumable.<ID>.event.{name,description}
  status.<ID>.event.{name,description}  (generic statuses and generic operator statuses)

Idempotent — re-running on already-migrated files is a no-op.
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME_DATA = ROOT / 'src/model/game-data'
LOCALE_OUT = ROOT / 'src/locales/game-data/en-US'
DATA_STATUS = 'RECONCILED'


def load(p: Path) -> dict:
    with p.open() as f:
        return json.load(f)


def dump(p: Path, data: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open('w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')


class LocaleBundle:
    """Accumulates {key: {text, dataStatus}} entries and writes to a file."""

    def __init__(self):
        self.entries: dict[str, dict] = {}

    def add(self, key: str, text: str | None) -> None:
        if text is None or text == '':
            return
        self.entries[key] = {'text': text, 'dataStatus': DATA_STATUS}

    def write(self, path: Path, merge: bool = True) -> None:
        existing = {}
        if merge and path.exists():
            existing = load(path)
        merged = {**existing, **self.entries}
        # Sort keys for stable output
        merged = dict(sorted(merged.items()))
        dump(path, merged)

    def __len__(self) -> int:
        return len(self.entries)


def strip_user_strings(data: dict) -> bool:
    """Strip `name`, `description` from `properties` and segments/frames. Returns True if any change."""
    changed = False

    # Top-level operator file has `name` at root (operator base file only)
    if 'name' in data and 'properties' not in data and isinstance(data.get('id'), str):
        del data['name']
        changed = True

    props = data.get('properties')
    if isinstance(props, dict):
        for key in ('name', 'description'):
            if key in props:
                del props[key]
                changed = True

    for seg in (data.get('segments') or []):
        sprops = (seg or {}).get('properties')
        if isinstance(sprops, dict) and 'name' in sprops:
            del sprops['name']
            changed = True
        for frame in (seg.get('frames') or []):
            fprops = (frame or {}).get('properties')
            if isinstance(fprops, dict) and 'name' in fprops:
                del fprops['name']
                changed = True

    return changed


def extract_entity(data: dict, prefix: str, bundle: LocaleBundle) -> None:
    """Extract properties.name/description + segment/frame names under a given prefix."""
    props = data.get('properties') or {}
    bundle.add(f'{prefix}.event.name', props.get('name'))
    bundle.add(f'{prefix}.event.description', props.get('description'))

    for si, seg in enumerate(data.get('segments') or []):
        sprops = (seg or {}).get('properties') or {}
        bundle.add(f'{prefix}.segment.{si}.name', sprops.get('name'))
        for fi, frame in enumerate((seg or {}).get('frames') or []):
            fprops = (frame or {}).get('properties') or {}
            bundle.add(f'{prefix}.segment.{si}.frame.{fi}.name', fprops.get('name'))


# ── Operators ───────────────────────────────────────────────────────────────

def migrate_operator(op_dir: Path) -> int:
    slug = op_dir.name
    bundle = LocaleBundle()
    files_touched = 0

    # Top-level operator file
    base_file = op_dir / f'{slug}.json'
    if base_file.exists():
        data = load(base_file)
        op_id = data.get('id')
        if op_id:
            bundle.add(f'op.{op_id}.event.name', data.get('name'))
            if strip_user_strings(data):
                dump(base_file, data)
                files_touched += 1

    op_id = data.get('id') if base_file.exists() else None
    if not op_id:
        return 0

    import re as _re

    def potential_key(path: Path, data: dict) -> int | None:
        """Potentials key on `properties.level`; fall back to the number in the
        filename (`potential-3-*.json`) when the file omits the level."""
        lvl = (data.get('properties') or {}).get('level')
        if isinstance(lvl, int):
            return lvl
        m = _re.match(r'potential-(\d+)-', path.name)
        return int(m.group(1)) if m else None

    # Sub-entities
    for kind, prefix_tail, id_source in [
        ('skills', 'skill', lambda p, d: (d.get('properties') or {}).get('id')),
        ('talents', 'talent', lambda p, d: (d.get('properties') or {}).get('id')),
        ('statuses', 'status', lambda p, d: (d.get('properties') or {}).get('id')),
        ('potentials', 'potential', potential_key),
    ]:
        sub_dir = op_dir / kind
        if not sub_dir.exists():
            continue
        for p in sorted(sub_dir.glob('*.json')):
            d = load(p)
            sub_id = id_source(p, d)
            if sub_id is None or sub_id == '':
                continue
            prefix = f'op.{op_id}.{prefix_tail}.{sub_id}'
            extract_entity(d, prefix, bundle)
            if strip_user_strings(d):
                dump(p, d)
                files_touched += 1

    bundle.write(LOCALE_OUT / 'operators' / f'{slug}.json')
    return files_touched


def migrate_all_operators() -> tuple[int, int]:
    files_touched = 0
    ops_done = 0
    ops_root = GAME_DATA / 'operators'
    for op_dir in sorted(d for d in ops_root.iterdir() if d.is_dir() and d.name != 'generic'):
        files_touched += migrate_operator(op_dir)
        ops_done += 1
    return ops_done, files_touched


# ── Generic operator statuses ───────────────────────────────────────────────

def migrate_generic_operator_statuses() -> int:
    """Generic operator statuses (forged, keen-mind, etc.) → gd-generic bundle."""
    bundle = LocaleBundle()
    files_touched = 0
    gen_dir = GAME_DATA / 'operators' / 'generic'
    if not gen_dir.exists():
        return 0
    for p in sorted(gen_dir.glob('*.json')):
        d = load(p)
        sid = (d.get('properties') or {}).get('id')
        if not sid:
            continue
        extract_entity(d, f'status.{sid}', bundle)
        if strip_user_strings(d):
            dump(p, d)
            files_touched += 1
    bundle.write(LOCALE_OUT / 'generic.json')
    return files_touched


# ── Generic statuses ───────────────────────────────────────────────────────

def migrate_generic_statuses() -> int:
    bundle = LocaleBundle()
    files_touched = 0
    gen_dir = GAME_DATA / 'generic' / 'statuses'
    if not gen_dir.exists():
        return 0
    for p in sorted(gen_dir.glob('*.json')):
        d = load(p)
        sid = (d.get('properties') or {}).get('id')
        if not sid:
            continue
        extract_entity(d, f'status.{sid}', bundle)
        if strip_user_strings(d):
            dump(p, d)
            files_touched += 1
    # Merge into the same generic.json as generic operator statuses
    bundle.write(LOCALE_OUT / 'generic.json')
    return files_touched


# ── Weapons ────────────────────────────────────────────────────────────────

def migrate_weapon(weapon_dir: Path) -> int:
    slug = weapon_dir.name
    bundle = LocaleBundle()
    files_touched = 0

    base_file = weapon_dir / f'{slug}.json'
    if not base_file.exists():
        return 0
    data = load(base_file)
    weapon_id = (data.get('properties') or {}).get('id')
    if not weapon_id:
        return 0

    extract_entity(data, f'weapon.{weapon_id}', bundle)
    if strip_user_strings(data):
        dump(base_file, data)
        files_touched += 1

    # Weapon-specific skills / statuses (nested dirs)
    for kind, prefix_tail in [('skills', 'skill'), ('statuses', 'status')]:
        sub_dir = weapon_dir / kind
        if not sub_dir.exists():
            continue
        for p in sorted(sub_dir.glob('*.json')):
            d = load(p)
            sub_id = (d.get('properties') or {}).get('id')
            if not sub_id:
                continue
            extract_entity(d, f'weapon.{weapon_id}.{prefix_tail}.{sub_id}', bundle)
            if strip_user_strings(d):
                dump(p, d)
                files_touched += 1

    bundle.write(LOCALE_OUT / 'weapons' / f'{slug}.json')
    return files_touched


def migrate_all_weapons() -> tuple[int, int]:
    files_touched = 0
    weapons_done = 0
    weapons_root = GAME_DATA / 'weapons'
    for wdir in sorted(d for d in weapons_root.iterdir() if d.is_dir() and d.name != 'generic'):
        c = migrate_weapon(wdir)
        if c > 0 or (wdir / f'{wdir.name}.json').exists():
            weapons_done += 1
        files_touched += c
    return weapons_done, files_touched


def migrate_generic_weapon_skills() -> int:
    """Generic weapon skills (STRENGTH_BOOST_S, etc.) → weapons-generic bundle."""
    bundle = LocaleBundle()
    files_touched = 0
    gen_dir = GAME_DATA / 'weapons' / 'generic'
    if not gen_dir.exists():
        return 0
    for p in sorted(gen_dir.glob('*.json')):
        d = load(p)
        sid = (d.get('properties') or {}).get('id')
        if not sid:
            continue
        # Generic weapon skills are not scoped under any specific weapon — key
        # them as weapon-skill globals under a reserved WEAPON_GENERIC namespace.
        extract_entity(d, f'weapon.GENERIC.skill.{sid}', bundle)
        if strip_user_strings(d):
            dump(p, d)
            files_touched += 1
    bundle.write(LOCALE_OUT / 'weapons-generic.json')
    return files_touched


# ── Gears ───────────────────────────────────────────────────────────────────

def migrate_gear(gear_dir: Path) -> int:
    slug = gear_dir.name
    bundle = LocaleBundle()
    files_touched = 0

    base_file = gear_dir / f'{slug}.json'
    if not base_file.exists():
        return 0
    data = load(base_file)
    gear_id = (data.get('properties') or {}).get('id')
    if not gear_id:
        return 0

    extract_entity(data, f'gear.{gear_id}', bundle)
    if strip_user_strings(data):
        dump(base_file, data)
        files_touched += 1

    for kind, prefix_tail in [('pieces', 'piece'), ('statuses', 'status')]:
        sub_dir = gear_dir / kind
        if not sub_dir.exists():
            continue
        for p in sorted(sub_dir.glob('*.json')):
            d = load(p)
            sub_id = (d.get('properties') or {}).get('id')
            if not sub_id:
                continue
            extract_entity(d, f'gear.{gear_id}.{prefix_tail}.{sub_id}', bundle)
            if strip_user_strings(d):
                dump(p, d)
                files_touched += 1

    bundle.write(LOCALE_OUT / 'gears' / f'{slug}.json')
    return files_touched


def migrate_all_gears() -> tuple[int, int]:
    files_touched = 0
    gears_done = 0
    gears_root = GAME_DATA / 'gears'
    for gdir in sorted(d for d in gears_root.iterdir() if d.is_dir()):
        c = migrate_gear(gdir)
        if c > 0 or (gdir / f'{gdir.name}.json').exists():
            gears_done += 1
        files_touched += c
    return gears_done, files_touched


# ── Consumables ─────────────────────────────────────────────────────────────

def migrate_consumables() -> int:
    bundle = LocaleBundle()
    files_touched = 0
    for sub in ('consumables', 'tacticals'):
        sub_dir = GAME_DATA / 'consumables' / sub
        if not sub_dir.exists():
            continue
        for p in sorted(sub_dir.glob('*.json')):
            d = load(p)
            cid = (d.get('properties') or {}).get('id')
            if not cid:
                continue
            extract_entity(d, f'consumable.{cid}', bundle)
            if strip_user_strings(d):
                dump(p, d)
                files_touched += 1
    bundle.write(LOCALE_OUT / 'consumables.json')
    return files_touched


# ── Entry point ────────────────────────────────────────────────────────────

def main():
    ops, op_files = migrate_all_operators()
    print(f'Operators:           {ops:3d} processed, {op_files:4d} JSON files stripped')

    gen_op_files = migrate_generic_operator_statuses()
    print(f'Operators/generic:   {gen_op_files:4d} JSON files stripped')

    weapons, w_files = migrate_all_weapons()
    print(f'Weapons:             {weapons:3d} processed, {w_files:4d} JSON files stripped')

    gw_files = migrate_generic_weapon_skills()
    print(f'Weapons/generic:     {gw_files:4d} JSON files stripped')

    gears, g_files = migrate_all_gears()
    print(f'Gears:               {gears:3d} processed, {g_files:4d} JSON files stripped')

    cons_files = migrate_consumables()
    print(f'Consumables:         {cons_files:4d} JSON files stripped')

    gen_files = migrate_generic_statuses()
    print(f'Generic statuses:    {gen_files:4d} JSON files stripped')


if __name__ == '__main__':
    main()
