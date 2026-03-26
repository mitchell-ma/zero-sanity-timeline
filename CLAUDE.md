# zero-sanity-timeline
Arknights: Endfield timeline and rotation calculator

React 19+. Typescript.

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
- `npm start` — start localhost dev server
- `npm run deploy` — build and deploy to GitHub Pages
- `npx eslint src/` — run linter

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
- No magic numbers or strings. All values must use predefined consts or enums.
- **No hardcoded registries for game mechanics.** Status consumption, trigger routing, effect resolution, and any operator/skill-specific behavior MUST be derived from the JSON game data configs — never from hardcoded maps or switch statements that enumerate specific status/skill IDs. If a new operator or status requires a code change to work, the architecture is wrong.
- **Expected values in operator damage calculation tests MUST NEVER be changed.** These values are verified against in-game results. If a code change causes a damage calc test to fail, the code is wrong — fix the code, not the test.
- **Column IDs MUST use enum values or exported constants — NEVER string literals.** Use `PhysicalStatusType.BREACH`, `REACTION_COLUMNS.COMBUSTION`, `SKILL_COLUMNS.BASIC`, `StatusType.FOCUS`, etc. Never write `'breach'`, `'combustion'`, `'basic'`, `'lift'` as column IDs. This applies everywhere: channel mappings, column builders, condition evaluators, status derivation engine resolvers, event interpretor lookups, tests, and any code that references a column. String literals silently break when column IDs change to enum values.

Game data:
- **Terminology: "DSL" vs "JSON config".** The DSL is the grammar defined in `src/dsl/semantics.ts` — NounTypes, VerbTypes, AdjectiveTypes, ValueNode types, NOUN_QUALIFIER_MAPPING, NOUN_UNITS, etc. The JSON config files (`operators/*/skills/*.json`, `statuses/*.json`, `talents/*.json`) are data that conforms to the DSL grammar. When asked to "show the DSL", describe the grammar/schema. When asked to "show the config", show the raw JSON data.
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
