#!/usr/bin/env python3
"""
Collapse each enemy's JSON id from the long EnemyType form
(e.g. RHODAGN_THE_BONEKRUSHING_FIST) to the slug-uppercased short form
(e.g. RHODAGN), matching the operator pattern (slug = laevatain → id = LAEVATAIN).

Rewrites:
- src/model/game-data/enemies/<slug>/<slug>.json  (id field)
- src/locales/game-data/<locale>/enemies/<slug>.json  (key prefix)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIGS = ROOT / "src" / "model" / "game-data" / "enemies"
LOCALES = [
    ROOT / "src" / "locales" / "game-data" / "en-US" / "enemies",
    ROOT / "src" / "locales" / "game-data" / "fr-FR" / "enemies",
]

# Build slug → new id mapping
mapping = {}
for slug_dir in sorted(CONFIGS.iterdir()):
    if not slug_dir.is_dir():
        continue
    slug = slug_dir.name
    new_id = slug.upper()
    json_file = slug_dir / f"{slug}.json"
    data = json.loads(json_file.read_text())
    old_id = data["id"]
    mapping[slug] = (old_id, new_id)
    data["id"] = new_id
    json_file.write_text(json.dumps(data, indent=2) + "\n")
    print(f"{slug}: {old_id} -> {new_id}")

# Rewrite locale bundles: swap the `enemy.<OLD_ID>.` prefix for `enemy.<NEW_ID>.`
for locale_dir in LOCALES:
    for bundle in sorted(locale_dir.glob("*.json")):
        slug = bundle.stem
        if slug not in mapping:
            continue
        old_id, new_id = mapping[slug]
        data = json.loads(bundle.read_text())
        new_data = {}
        for key, value in data.items():
            old_prefix = f"enemy.{old_id}."
            new_prefix = f"enemy.{new_id}."
            if key.startswith(old_prefix):
                new_data[new_prefix + key[len(old_prefix):]] = value
            else:
                new_data[key] = value
        bundle.write_text(json.dumps(new_data, indent=2) + "\n")
    print(f"Updated {locale_dir}")
