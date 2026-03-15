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

Processes:
- **"summarize and sync"** — Write a concise git commit message with a descriptive summary in the body, then run `gitsync <DETAILS>` with the summary details.
- **"look at screenshot"** / **"ss"** — Read the latest image file from the `.claude-adhoc/` folder.
- **"auto screenshot and re-iterate"** — Run `python3 .claude-adhoc/desktop_screenshot.py "Endfield"` to capture the browser window, then read `.claude-adhoc/screenshot.png` to inspect the app. Identify visual issues, make fixes, and repeat until the UI looks correct.
- **"wrap up"** — End-of-session process:
  1. Summarize all changes done today (including earlier commits) and the current file changes; this will be the git commit message body.
  2. Summarize the above in very high-level and layman's terms and update the devlog (`docs/devlog.md`) for today's local date. Copy `docs/devlog.md` to `public/devlog.md` so the app serves the latest version.
  3. Build GitHub Pages (`npm run deploy`).
  4. Commit all changes.
