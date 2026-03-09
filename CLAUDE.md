# zero-sanity-timeline
Arknights: Endfield timeline and rotation calculator

React 19+. Typescript.

Project structure:
- Views/Components: src/view
- Pages: src/app
- Data models: src/model
- Controllers: src/controller
- Utility: src/utils

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
- **"look at screenshot"** — Read the latest image file from the `.claude-adhoc/` folder.
- **"auto screenshot and re-iterate"** — Run `python3 .claude-adhoc/desktop_screenshot.py "Endfield"` to capture the browser window, then read `.claude-adhoc/screenshot.png` to inspect the app. Identify visual issues, make fixes, and repeat until the UI looks correct.
