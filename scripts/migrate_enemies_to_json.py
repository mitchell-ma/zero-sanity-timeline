#!/usr/bin/env python3
"""
Convert TS enemy classes under src/model/enemies/{aggeloi,landbreakers,wildlife,cangzei-pirates}
into JSON configs under src/model/game-data/enemies/<slug>/<slug>.json, plus locale
bundles under src/locales/game-data/<locale>/enemies/<slug>.json.

Reads current hand-written name/slug pairs from src/utils/enemies.ts.
"""

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENEMIES_DIR = ROOT / "src" / "model" / "enemies"
GAME_DATA_DIR = ROOT / "src" / "model" / "game-data" / "enemies"
LOCALE_EN = ROOT / "src" / "locales" / "game-data" / "en-US" / "enemies"
LOCALE_FR = ROOT / "src" / "locales" / "game-data" / "fr-FR" / "enemies"

GAME_DATA_DIR.mkdir(parents=True, exist_ok=True)
LOCALE_EN.mkdir(parents=True, exist_ok=True)
LOCALE_FR.mkdir(parents=True, exist_ok=True)


def read_utils_enemies_slugs():
    """Parse src/utils/enemies.ts for (slug, name) pairs from the e(...) entries."""
    path = ROOT / "src" / "utils" / "enemies.ts"
    text = path.read_text()
    # e('slug', 'Name', 'Tier', sprite)
    entries = re.findall(
        r"e\(\s*'([^']+)'\s*,\s*'([^']+)'",
        text,
    )
    return dict(entries)


def parse_stats_block(text):
    """Parse `{ [StatType.X]: 123, [StatType.Y]: 4.5 }` into {'X': 123, 'Y': 4.5}."""
    result = {}
    for match in re.finditer(r"\[StatType\.([A-Z_]+)\]\s*:\s*([-\d.]+)", text):
        key = match.group(1)
        val = match.group(2)
        result[key] = float(val) if "." in val else int(val)
    return result


def parse_stats_by_level(text):
    """Parse STATS_BY_LEVEL record into {level: {stat: value}}."""
    result = {}
    # Find the block between `{` after STATS_BY_LEVEL and the matching `};`
    m = re.search(r"STATS_BY_LEVEL[^=]*=\s*(\{.*?\n\})\s*;", text, re.DOTALL)
    if not m:
        return result
    block = m.group(1)
    # Each level entry looks like `  42: { [StatType.X]: 123, ... },`
    # Match level number then brace block
    entry_re = re.compile(r"(\d+)\s*:\s*\{([^{}]*)\}")
    for em in entry_re.finditer(block):
        level = int(em.group(1))
        stats = parse_stats_block(em.group(2))
        result[level] = stats
    return result


def parse_ts_enemy(path: Path):
    """Return a dict of fields extracted from an enemy TS class file."""
    text = path.read_text()

    def find(pattern, default=None, flags=0):
        m = re.search(pattern, text, flags)
        return m.group(1) if m else default

    enemy_type = find(r"enemyType:\s*EnemyType\.([A-Z_]+)")
    name = find(r"name:\s*\"([^\"]*)\"")
    tier = find(r"tier:\s*EnemyTierType\.([A-Z_]+)")
    race = find(r"race:\s*RaceType\.([A-Z_]+)")
    location = find(r"location:\s*EnemyLocationType\.([A-Z_]+)")
    attack_element = find(r"attackElement:\s*ElementType\.([A-Z_]+)")
    stagger_nodes = find(r"staggerNodes:\s*(\d+)")
    stagger_node_recovery = find(r"staggerNodeRecoverySeconds:\s*([\d.]+)")
    is_boss = "extends BossEnemy" in text

    # baseStats block
    base_stats = {}
    m = re.search(r"baseStats:\s*\{([^{}]*)\}", text)
    if m:
        base_stats = parse_stats_block(m.group(1))

    stats_by_level = parse_stats_by_level(text)

    return {
        "enemyType": enemy_type,
        "name": name,
        "tier": tier,
        "race": race,
        "location": location,
        "attackElement": attack_element,
        "isBoss": is_boss,
        "staggerNodes": int(stagger_nodes) if stagger_nodes else None,
        "staggerNodeRecoverySeconds": float(stagger_node_recovery) if stagger_node_recovery else None,
        "baseStats": base_stats,
        "statsByLevel": stats_by_level,
    }


def enemy_type_to_slug(parsed, slugs_from_utils, ts_file: Path):
    """Map parsed enemyType to view-layer slug by searching enemies.ts registry."""
    enemy_type = parsed["enemyType"]
    # utils/enemies.ts slug is lowercased form of enemyType. Try exact match.
    candidate = enemy_type.lower() if enemy_type else None
    if candidate and candidate in slugs_from_utils:
        return candidate
    # Fall back to matching by name.
    for slug, name in slugs_from_utils.items():
        if name == parsed["name"]:
            return slug
    # Last resort: derive from TS filename.
    return ts_file.stem.replace("Enemy", "").replace("_", "-").lower()


def build_json_config(parsed):
    """Build the final JSON config for <slug>.json."""
    out = {
        "id": parsed["enemyType"],
        "tier": parsed["tier"],
        "race": parsed["race"],
        "location": parsed["location"],
        "attackElement": parsed["attackElement"],
    }
    if parsed["isBoss"]:
        out["staggerNodes"] = parsed["staggerNodes"] or 0
        out["staggerNodeRecoverySeconds"] = parsed["staggerNodeRecoverySeconds"] or 0
    # Stable key order for baseStats + statsByLevel.
    if parsed["baseStats"]:
        out["baseStats"] = parsed["baseStats"]
    stats_by_level = [
        {"level": lvl, "attributes": parsed["statsByLevel"][lvl]}
        for lvl in sorted(parsed["statsByLevel"].keys())
    ]
    out["statsByLevel"] = stats_by_level
    return out


def main():
    slugs_from_utils = read_utils_enemies_slugs()

    ts_files = sorted([p for p in ENEMIES_DIR.rglob("*.ts")
                        if p.name not in {"enemy.ts", "bossEnemy.ts"}])
    print(f"Found {len(ts_files)} enemy TS files")

    for ts_file in ts_files:
        try:
            parsed = parse_ts_enemy(ts_file)
        except Exception as e:
            print(f"FAIL parse {ts_file}: {e}")
            continue
        if not parsed["enemyType"]:
            print(f"SKIP {ts_file} — no enemyType found")
            continue

        slug = enemy_type_to_slug(parsed, slugs_from_utils, ts_file)
        out_dir = GAME_DATA_DIR / slug
        out_dir.mkdir(parents=True, exist_ok=True)
        json_path = out_dir / f"{slug}.json"

        config = build_json_config(parsed)
        with json_path.open("w") as f:
            json.dump(config, f, indent=2)
            f.write("\n")

        # Locale bundles (en + fr stub mirroring en).
        name = parsed["name"]
        locale_entry = {
            f"enemy.{parsed['enemyType']}.event.name": {
                "text": name,
                "dataStatus": "RECONCILED",
            }
        }
        (LOCALE_EN / f"{slug}.json").write_text(
            json.dumps(locale_entry, indent=2) + "\n"
        )
        (LOCALE_FR / f"{slug}.json").write_text(
            json.dumps(locale_entry, indent=2) + "\n"
        )
        print(f"WROTE {slug} -> {parsed['enemyType']}")


if __name__ == "__main__":
    main()
