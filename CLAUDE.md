# zero-sanity-timeline
Arknights: Endfield timeline and rotation calculator

React 19+. Typescript. PixiJS v8 (canvas rendering layer).

PixiJS:
- API docs: fetch https://pixijs.com/llms.txt
- Display object updates MUST happen inside `app.ticker.add()` callbacks, NOT in React useEffect. The ticker runs callbacks first, then auto-renders. Modifying display objects outside the ticker callback will not produce visible output.
- Use `app.renderer.events.autoPreventDefault = false` to prevent PixiJS from blocking native scroll events.

Project structure:
- Views/Components: src/view
- Pages: src/app
- Data models: src/model
- Controllers: src/controller
- Utility: src/utils
- Notes: docs/notes/

Architecture:
- All business logic belongs in the controller layer. The view layer is presentation-only — it receives pre-computed values from controllers and should not process or derive logic itself.
- **Models are the single source of truth.** All domain knowledge — valid field combinations, allowable values, visibility rules, verb-object mappings, property definitions — MUST live in the model/consts layer (e.g. `semantics.ts`, `enums.ts`, `viewTypes.ts`). Controllers consume models. Views consume controllers. **NEVER derive, hardcode, or duplicate domain rules in the view or controller layers.** If a view needs to know "which properties does this verb+object support?" or "which verbs are valid for this subject?", that answer must come from a model function or const — not from a Set/Map defined in the component file. This is non-negotiable; violating it causes misalignment between layers.

Event engine (`src/controller/timeline/`):
- **No batch bulk pre-processing or post-processing.** All event processing happens through DerivedEventController registration and the priority queue. Never add passes that iterate all events before or after the queue to transform them in bulk.
- A chain-of-action search is fine — some frames need to resolve to the source frame responsible for the chain that caused them. Tracing causality through events is expected; bulk-transforming all events is not.
- See `src/controller/timeline/engineSpec.md` for the full engine architecture.

Naming convention:
- directory: kebab-case
- file: camelCase
- component: PascalCase
- asset: snake_case

Commands:
- `npm start` — start localhost dev server (CRA only; no Worker/API routes)
- `npm run preview` — build + run the Cloudflare Worker locally at http://localhost:8787 (reads `.dev.vars` for secrets)
- `npm run deploy` — build and deploy the **preview** Worker (`wrangler deploy` — worker name `zero-sanity-timeline-preview`)
- `npm run deploy:prod` — build and deploy the **production** Worker (`wrangler deploy --env production` — worker name `zero-sanity-timeline`)
- `npx wrangler tail` / `npx wrangler tail --env production` — stream live logs from preview / prod Worker
- `npx wrangler secret list` / `npx wrangler secret put <NAME>` — manage preview secrets; append `--env production` for prod (secrets are per-environment, do NOT inherit from top level)
- `npx eslint src/` — run linter

Deployment:
- Runtime is a Cloudflare Worker (`worker/index.ts`) that serves the built SPA from the `ASSETS` binding and handles `POST /api/feedback` (Resend) and `GET /api/turn-credentials` (Cloudflare Realtime TURN).
- Two environments in `wrangler.jsonc`: top-level is **preview** (`zero-sanity-timeline-preview`), `env.production` is **prod** (`zero-sanity-timeline`). `main` branch deploys preview; `prod` branch deploys production. The only branch divergence should be intentional — both branches share the same `wrangler.jsonc`.
- Required secrets (for BOTH environments — set once without `--env` for preview, then once with `--env production` for prod): `RESEND_API_KEY`, `FEEDBACK_TO_EMAIL`, `FEEDBACK_FROM_EMAIL`, `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`. See README.md for the full table + per-secret source.
- Local API testing uses a gitignored `.dev.vars` file at repo root with the same `KEY=value` pairs.

Rules:
- **NEVER run destructive git commands:** `git reset --hard`, `git checkout .`, `git checkout -- <file>`, `git restore .`, `git restore <file>`, `git clean -f`, `git stash` (without explicit user request). Multiple agents may be working on the repo concurrently — destructive git operations will silently destroy other agents' in-progress work. If you encounter merge conflicts, unexpected state, or failing tests due to other changes, stop and ask the user rather than resetting.
- **Concurrent agent coordination:** Before starting work, read the current state of files you plan to modify — don't assume they match what you last saw. Before running tests or type-checking, pull in the latest worktree state with `git diff` to understand what other agents may have changed. If a file you need to edit has unexpected changes from another agent, work with those changes rather than reverting them.
- **Only stage your own files.** Never use `git add .`, `git add -A`, or `git add -u`. Always stage files by explicit path, and only files you personally modified in this session.
- **Scope lint and type-checks to your own changes.** Run `npx tsc --noEmit` and `npx eslint` only on files you changed — not the entire `src/` tree. If you see errors in files you didn't touch, ignore them — another agent is likely mid-edit. Use `npx eslint <file1> <file2> ...` and `npx tsc --noEmit` with awareness that global errors may not be yours.
- **Never run `npm install` or modify `package.json`** without explicit user approval — concurrent installs corrupt `node_modules`.
- **If a file you need to edit has been modified since you last read it**, re-read it before editing. If the changes conflict with your task, stop and ask the user how to proceed rather than overwriting the other agent's work.
- Never write temporary files (screenshots, debug images, logs) to the project root. Use `.claude-temp/` for all throwaway files.
- Always run `npx eslint src/` after making code changes and fix any warnings before finishing.
- After completing any task, run `npx tsc --noEmit` and fix all compilation errors in changed files before reporting done.
- Avoid explicit TypeScript typing unless absolutely necessary. Prefer type inference; only add annotations when the compiler cannot infer correctly or when a public API requires clarity.
- Never mock game-data configs (`*-operator.json`, `*-skills.json`, `*-talents.json`, `*-statuses.json`) in tests. Tests should use the real JSON data via `operatorJsonLoader`. Mock `require.context` if needed, but load the actual JSON files.
- **ZERO TOLERANCE for magic numbers or string literals.** This is the single most important code quality rule. All values — verbs, nouns, types, modes, discriminators, column IDs, targets, units — MUST use predefined enums or exported constants. NEVER write `'APPLY'`, `'STATUS'`, `'TEAM'`, `'mini-timeline'`, `'folder'`, `'SECOND'`, etc. as string literals in comparisons, assignments, or object keys. Use `VerbType.APPLY`, `NounType.STATUS`, `NounType.TEAM`, `ColumnType.MINI_TIMELINE`, `LoadoutNodeType.FOLDER`, `UnitType.SECOND`, etc.
  - **DSL grammar enums** live in `src/dsl/semantics.ts`: `VerbType`, `NounType`, `DeterminerType`, `AdjectiveType`, `ClauseEvaluationType`, `PhysicalStatusType`
  - **Domain enums** live in `src/consts/enums.ts`: `CombatSkillType`, `EventCategoryType`, `SegmentType`, `UnitType`, `BasicAttackType`, `ColumnType`, `MicroColumnAssignment`, `HeaderVariant`, `InfoPaneMode`, `SidebarMode`, `LoadoutNodeType`, `StatusType`, `ElementType`, etc.
  - If a comparison target doesn't have an enum or constant, **create one in `src/consts/enums.ts` or `src/dsl/semantics.ts`** — don't use a string literal.
  - **This includes type definitions.** Never write `type: 'FOO' | 'BAR'` or `status: 'active' | 'inactive'` on interfaces — define an enum and use it as the type. String literal unions in type definitions are just as bad as string literals in code.
  - This applies everywhere: controllers, views, tests, parsers, type definitions, object keys, template literals. No exceptions.
- **No hardcoded registries for game mechanics.** Status consumption, trigger routing, effect resolution, and any operator/skill-specific behavior MUST be derived from the JSON game data configs — never from hardcoded maps or switch statements that enumerate specific status/skill IDs. If a new operator or status requires a code change to work, the architecture is wrong.
- **Expected values in operator damage calculation tests MUST NEVER be changed.** These values are verified against in-game results. If a code change causes a damage calc test to fail, the code is wrong — fix the code, not the test.
- **NEVER change intended behavior or revert user-requested changes without asking.** If a user-requested feature (enum value, DSL construct, config value) isn't supported by the engine, add support for it — don't silently revert the change. If adding support is non-trivial, ask before proceeding.
- **JSON config values MUST use proper ValueNodes.** Constant values use `{ "verb": "IS", "value": N }`. Only use `VARY_BY` when values actually differ across levels. NEVER write `VARY_BY` with an array of identical values like `[5, 5, 5, ...]`.
- **Column IDs MUST use enum values or exported constants — NEVER string literals.** Use `PhysicalStatusType.BREACH`, `REACTION_COLUMNS.COMBUSTION`, `SKILL_COLUMNS.BASIC`, `StatusType.FOCUS`, etc. Never write `'breach'`, `'combustion'`, `'basic'`, `'lift'` as column IDs. This applies everywhere: channel mappings, column builders, condition evaluators, status derivation engine resolvers, event interpretor lookups, tests, and any code that references a column. String literals silently break when column IDs change to enum values.
- **All identity comparisons MUST use UIDs, IDs, or enum constants — NEVER string literals.** Compare events, statuses, operators, and skills by their `uid`, `id`, or typed enum values. Never compare against hardcoded display names or raw strings like `'Cooldown'`, `'Animation'`, `'Finisher'`. If a comparison target doesn't have an enum or constant, create one.

Localization (i18n):
- **User-facing strings are NOT on game-data JSON.** Every operator, skill, talent, potential, status, gear, and weapon file has **no `name` or `description` field** — `checkIdAndName` in `validationUtils.ts` rejects them. Strings live in per-area locale bundles under `src/locales/game-data/<locale>/{operators,weapons,gears}/*.json`, plus `consumables.json` / `generic.json` / `weapons-generic.json`. The runtime store constructor resolves them via `LocaleKey.*` builders (see `src/locales/gameDataLocale.ts`) and `resolveEventName` / `resolveOptionalEventDescription`.
- **Key structure** (three-tier hierarchy — never collapse across tiers):
  - Event tier: `<prefix>.event.name` / `<prefix>.event.description`
  - Segment tier: `<prefix>.segment.<idx>.name`
  - Frame tier: `<prefix>.segment.<idx>.frame.<idx>.name`
- **Prefix builders** in `gameDataLocale.ts::LocaleKey`: `operator(id)`, `operatorSkill(op,sk)`, `operatorTalent(op,t)`, `operatorStatus(op,s)`, `operatorPotential(op,level)`, `weapon(id)`, `weaponSkill(wid,sid)` (use `GENERIC_WEAPON_ID` for shared stat-boost skills), `weaponStatus(wid,sid)`, `gear(id)`, `gearPiece(gid,pid)`, `gearStatus(gid,sid)`, `consumable(id)`, `genericStatus(id)`.
- **Template interpolation via `{param:format}` tokens.** `t(key, params?)` / `resolveOptionalEventDescription(prefix, params?)` supports `{name}`, `{name:0}` (integer), `{name:1}` (1 decimal), `{name:0%}` (`value * 100 + "%"`), `{name:0s}` (seconds suffix). No expression parsing — expressions like `1-costValue` must be pre-computed in `descriptionParams`.
- **`descriptionParams` live on the game-data JSON**, not in the locale. One set of numeric values serves every locale's template. Present on every potential / skill / talent file that has tokens. Extracted from Warfarin blackboards by `scripts/patch_skill_talent_params.py` and the parser's `buildPotentialDescriptionParams` — keys include `attrModifier`-derived names (`Str`, `Agi`, `PhysicalDamageIncrease`, ...), `attachBuff.blackboard` / `attachSkill.blackboard` keys (`poise`, `duration`, `dmg_up`, ...), `skillBbModifier.bbKey` (prefix `potential_N_` / `talent_N_` stripped), `skillParamModifier` paramType→key (`1: costValue`, `2: coolDown`), plus pre-computed expression variants (`1-X`, `-X`, `X-1`).
- **Locale fallback chain**: current locale → en-US → return the key itself. fr-FR bundles are Warfarin-ingested via `npx tsx src/model/utils/parsers/parseWarfarinOperator.ts <slug> --locale=fr` (string-only — never mutates structural game data).
- **`dataStatus` guards hand-curated translations.** Each locale entry is `{ text, dataStatus: 'RECONCILED' | 'VERIFIED' }`. `VERIFIED` entries are skipped by the Warfarin reconciler (see `mergeLocaleBundle` in `parseWarfarinOperator.ts`). New ingests seed as `RECONCILED`; flip to `VERIFIED` only after explicit review.
- **Asset paths are hard-wired to `id`, not `name`.** Icon / splash / banner resolution in `operatorsStore`, `weaponsStore`, `gearPiecesStore`, `consumablesStore`, `operatorRegistry` uses `id.toLowerCase()` as the asset filename base. No name-based or substring fallbacks — if an asset doesn't match, rename the file.

Game data:
- **Terminology: "DSL" vs "JSON config".** The DSL is the grammar defined in `src/dsl/semantics.ts` — NounTypes, VerbTypes, AdjectiveTypes, ValueNode types, NOUN_QUALIFIER_MAPPING, NOUN_UNITS, etc. The JSON config files (`operators/*/skills/*.json`, `statuses/*.json`, `talents/*.json`) are data that conforms to the DSL grammar. When asked to "show the DSL", describe the grammar/schema. When asked to "show the config", show the raw JSON data.
- **DSL grammar mappings (three-layer narrow).** Builder UIs and validators consume these top-down; do not hard-code any of them in views/controllers:
  - `SUBJECT_VERB_MAPPING` — subject → valid condition verbs (A-B).
  - `SUBJECT_VERB_OBJECT_MAPPING` — subject × verb → valid objects (A-B-C). Falls back to `VERB_OBJECTS[verb]` when unlisted.
  - `OBJECT_ID_QUALIFIERS` — object × objectId → valid qualifiers. Canonical STATUS narrowing: `object: STATUS, objectId: {INFLICTION | REACTION | PHYSICAL | SUSCEPTIBILITY | <custom>}, objectQualifier: <variant>`.
  - `VERB_TARGET_MAPPING` — effect verb → valid `to` targets.
  - Helpers: `verbsForSubject`, `objectsForSubjectVerb`, `qualifiersForObjectId`, `targetsForVerb`. Full table lives in `operatorDataSpec.md` "DSL Grammar & Semantics".
- **UE no-gain windows come from the `IGNORE ULTIMATE_ENERGY` clause effect only.** `SegmentType.ACTIVE` was retired — do not add it back. Segments with no UE gain must author an explicit `{verb: IGNORE, object: ULTIMATE_ENERGY, to: OPERATOR}` effect in their `clause`. Valid `SegmentType` values: `ANIMATION`, `STASIS`, `COOLDOWN`, `IMMEDIATE_COOLDOWN`.
- All skill data (frames, multipliers, effects, properties, animation timings) lives in `src/model/game-data/operator-skills/*-skills.json`. Operator JSONs (`src/model/game-data/operators/*-operator.json`) store only operator-level data (stats, potentials, talents, metadata) — never skill frames or overrides.
- When debugging missing/wrong skill data in the UI, always check the skills JSON first — that is the single source of truth. There is no override mechanism in operator JSONs.
- When showing JSON configs to the user, always show the full raw JSON — never abbreviate or summarize into pseudo-JSON.
- **SP verbs: `RECOVER` vs `RETURN` are distinct in the engine.** `RECOVER` is natural SP gain (regen, basic attack finisher) — battle skills that consume naturally-recovered SP generate ultimate energy. `RETURN` is conditional SP refund (e.g. Code of Restraint returning SP on reaction consume) — battle skills that consume returned SP do NOT generate ultimate energy. Use whichever verb the in-game description specifies.
- **`"to": "TEAM"` and `"to": "OPERATOR", "toDeterminer": "ALL"` are semantically distinct.** `"to": "TEAM"` applies one shared status to the team-status column (`COMMON_OWNER_ID`). `"to": "OPERATOR", "toDeterminer": "ALL"` applies separate status instances to each individual operator's status column. Never conflate or normalize one into the other.

Processes:
- **"summarize and sync"** — Write a concise git commit message with a descriptive summary in the body, then run `gitsync <DETAILS>` with the summary details.
- **"look at screenshot"** / **"ss"** — Read the latest image file from the `.claude-adhoc/` folder.
- **"auto screenshot and re-iterate"** — Use the Playwright MCP `browser_take_screenshot` tool to capture the app, then inspect the screenshot visually. Identify visual issues, make fixes, and repeat until the UI looks correct.
- **"add to todo"** — Append future work items to `docs/todo.md`.
- **New feature implementation** — When implementing new features that involve core controller logic:
  1. Review the input-output expectations of the new controller functions.
  2. Come up with a test plan covering key scenarios, edge cases, and integration points.
  3. Implement tests after the feature is working:
     - **Unit tests** (`src/tests/unit/`): Test individual controllers, functions, and data in isolation with mocks.
     - **Integration tests** (`src/tests/integration/`): Test the full user flow through `useApp` — add events via `handleAddEvent`, verify results via `allProcessedEvents` and view controllers. Integration tests must use `@jest-environment jsdom` and `renderHook`.
- **"wrap up"** — End-of-session process:
  1. Summarize all changes done today (including earlier commits) and the current file changes; this will be the git commit message body.
  2. Update the devlog (`public/devlog.md`) for today's local date. **Devlog must be written for players, not developers.** Describe what changed for the user — new features, UI changes, behavior improvements. Never mention code structure, class names, refactors, file names, internal systems, or architecture. If a change is purely internal, either omit it or describe only its user-facing benefit.
  3. Before committing, check for and remove any temporary files in the project root (screenshots, debug images, `.png`, `.jpg`, logs). These should never be committed — use `.claude-temp/` for throwaway files.
  4. Commit all changes and push to `main`.
- **"push to prod"** — Rebase `prod` onto `main` to pick up all new changes, then push `prod` to remote.
