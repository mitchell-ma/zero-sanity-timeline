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
- Always run `npx eslint src/` after making code changes and fix any warnings before finishing.
- After completing any task, run `npx tsc --noEmit` and fix all compilation errors in changed files before reporting done.
- Avoid explicit TypeScript typing unless absolutely necessary. Prefer type inference; only add annotations when the compiler cannot infer correctly or when a public API requires clarity.
- Never mock game-data configs (`*-operator.json`, `*-skills.json`, `*-talents.json`, `*-statuses.json`) in tests. Tests should use the real JSON data via `operatorJsonLoader`. Mock `require.context` if needed, but load the actual JSON files.
- No magic numbers or strings. All values must use predefined consts or enums.
- **Expected values in operator damage calculation tests MUST NEVER be changed.** These values are verified against in-game results. If a code change causes a damage calc test to fail, the code is wrong — fix the code, not the test.
- **Column IDs MUST use enum values or exported constants — NEVER string literals.** Use `PhysicalStatusType.BREACH`, `REACTION_COLUMNS.COMBUSTION`, `SKILL_COLUMNS.BASIC`, `StatusType.FOCUS`, etc. Never write `'breach'`, `'combustion'`, `'basic'`, `'lift'` as column IDs. This applies everywhere: channel mappings, column builders, condition evaluators, status derivation engine resolvers, event interpretor lookups, tests, and any code that references a column. String literals silently break when column IDs change to enum values.

Game data:
- All skill data (frames, multipliers, effects, properties, animation timings) lives in `src/model/game-data/operator-skills/*-skills.json`. Operator JSONs (`src/model/game-data/operators/*-operator.json`) store only operator-level data (stats, potentials, talents, metadata) — never skill frames or overrides.
- When debugging missing/wrong skill data in the UI, always check the skills JSON first — that is the single source of truth. There is no override mechanism in operator JSONs.
- When showing JSON configs to the user, always show the full raw JSON — never abbreviate or summarize into pseudo-JSON.

Processes:
- **"summarize and sync"** — Write a concise git commit message with a descriptive summary in the body, then run `gitsync <DETAILS>` with the summary details.
- **"look at screenshot"** / **"ss"** — Read the latest image file from the `.claude-adhoc/` folder.
- **"auto screenshot and re-iterate"** — Use the Playwright MCP `browser_take_screenshot` tool to capture the app, then inspect the screenshot visually. Identify visual issues, make fixes, and repeat until the UI looks correct.
- **"add to todo"** — Append future work items to `docs/todo.md`.
- **New feature implementation** — When implementing new features that involve core controller logic:
  1. Review the input-output expectations of the new controller functions.
  2. Come up with a test plan covering key scenarios, edge cases, and integration points.
  3. Implement tests in `src/tests/` after the feature is working, validating the controller logic in isolation.
- **"wrap up"** — End-of-session process:
  1. Summarize all changes done today (including earlier commits) and the current file changes; this will be the git commit message body.
  2. Update the devlog (`public/devlog.md`) for today's local date. **Devlog must be written for players, not developers.** Describe what changed for the user — new features, UI changes, behavior improvements. Never mention code structure, class names, refactors, file names, internal systems, or architecture. If a change is purely internal, either omit it or describe only its user-facing benefit.
  3. Commit all changes and push to `main`.
- **"push to prod"** — Rebase `prod` onto `main` to pick up all new changes, then push `prod` to remote.
