# zero-sanity-timeline
Arknights: Endfield timeline and rotation calculator

React 19+. Typescript.

Project structure:
- Views/Components: src/view
- Pages: src/app
- Data models: src/model
- Controllers: src/controller
- Utility: src/utils

Architecture:
- All business logic belongs in the controller layer. The view layer is presentation-only — it receives pre-computed values from controllers and should not process or derive logic itself.

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

Game data:
- All skill data (frames, multipliers, effects, properties, animation timings) lives in `src/model/game-data/operator-skills/*-skills.json`. Operator JSONs (`src/model/game-data/operators/*-operator.json`) store only operator-level data (stats, potentials, talents, metadata) — never skill frames or overrides.
- When debugging missing/wrong skill data in the UI, always check the skills JSON first — that is the single source of truth. There is no override mechanism in operator JSONs.

Processes:
- **"summarize and sync"** — Write a concise git commit message with a descriptive summary in the body, then run `gitsync <DETAILS>` with the summary details.
- **"look at screenshot"** / **"ss"** — Read the latest image file from the `.claude-adhoc/` folder.
- **"auto screenshot and re-iterate"** — Run `python3 .claude-adhoc/desktop_screenshot.py "Endfield"` to capture the browser window, then read `.claude-adhoc/screenshot.png` to inspect the app. Identify visual issues, make fixes, and repeat until the UI looks correct.
- **"add to todo"** — Append future work items to `docs/todo.md`.
- **New feature implementation** — When implementing new features that involve core controller logic:
  1. Review the input-output expectations of the new controller functions.
  2. Come up with a test plan covering key scenarios, edge cases, and integration points.
  3. Implement tests in `src/tests/` after the feature is working, validating the controller logic in isolation.
- **"wrap up"** — End-of-session process:
  1. Summarize all changes done today (including earlier commits) and the current file changes; this will be the git commit message body.
  2. Summarize the above in very high-level and layman's terms and update the devlog (`public/devlog.md`) for today's local date.
  3. Commit all changes and push to `main`.
- **"push to prod"** — Rebase `prod` onto `main` to pick up all new changes, then push `prod` to remote.
