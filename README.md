# Points Tracker

A lightweight, mobile-first Points tracker for two household users. The core application stores its data locally in IndexedDB and performs all point calculations deterministically in the browser. AI assistance is optional and is not part of the current M0–M9 checkpoint.

## Requirements

- Node.js 20 or newer
- A current browser with IndexedDB support

There are currently no third-party runtime dependencies.

## Local installation

From PowerShell in this directory:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Then open <http://localhost:3000>.

The `.env` file is reserved for the later optional AI backend. Never place the OpenAI API key in files under `public/js`.

## Appearance

The active cheerful colour theme is defined in `public/css/app.css`. The earlier muted green theme is preserved in `public/css/app-muted.css`; it can be restored by changing the stylesheet reference in `public/index.html` or by copying its values back into the active stylesheet.

## Tests

Run the deterministic unit tests with:

```powershell
npm test
```

## GitHub Pages

The static browser application under `public/` is deployed to GitHub Pages by
`.github/workflows/pages.yml` after the test suite passes on `main`. Only the
contents of `public/` are published as the website; repository documentation,
tests, server code, environment files, and development tooling are excluded
from the Pages artifact.

In the repository settings, configure **Pages > Build and deployment > Source**
to **GitHub Actions**. The application uses relative asset paths so it works at
both a user site and a repository subpath such as
`https://example.github.io/points-tracker/`.

GitHub Pages hosts only the static, local-first application. The optional AI
backend cannot run on Pages and must later be deployed separately. Its URL will
be supplied to the browser through public, non-secret configuration; the
OpenAI API key must remain exclusively in the backend environment.

## Current checkpoint

Implemented milestones:

- M0: responsive application shell, hash router and primary navigation
- M1: versioned IndexedDB database, stores, indexes, CRUD wrapper, transactions and developer reset
- M2: raw food Points, fruit/confirmed zero-point handling, display rounding, age and daily allowance calculations
- M3: first-run household setup, multiple profiles, persistent profile switching, weigh-ins with historical allowance snapshots, and editable target weight
- M4: shared food creation, editing, named servings, normalized search, calculated Points, persistence, and reference-protected deletion
- M5: user-isolated daily diaries, food-entry snapshots, add/edit/delete/duplicate workflows, Today totals, and Monday–Sunday weekly-extra calculations
- M6: weekly tracking with ordinary-versus-extra point accounting, historical week navigation, daily breakdowns, averages, neutral budget comparisons, and calendar-boundary coverage
- M7: reusable recipes with explicit ingredients, gram-normalized quantities, named servings, live total/per-serving calculations, fractional diary servings, frozen diary snapshots, and reference-protected deletion
- M8: goal progress with unclamped numerical and clamped visual percentages, sensible weight milestones, current and completed weigh-in periods, and a responsive SVG weight-history chart
- M9: complete JSON export, strict import validation and review, explicit replacement confirmation, and transactional all-store restore

AI workflows intentionally remain placeholders until their assigned milestones.

## Architecture

The browser application is organized as ES modules under `public/js`. `points.js` contains pure deterministic calculations with no UI or database dependencies. `db.js` owns all raw IndexedDB interaction and versioned schema migrations. `users.js` owns profile selection, user creation, target updates and weigh-in allowance snapshots. `foods.js` owns food validation, safe name normalization, named servings, point calculations, search and protected deletion. `recipes.js` owns ingredient normalization, recipe calculations, search and protected deletion. `diary.js` owns food and recipe snapshots, user/date isolation, daily totals, historical daily budgets and weekly-extra calculations. `progress.js` owns goal, milestone, weigh-in-period and chart-data calculations. `backup.js` owns portable export, validation, summaries, filenames, and transactional restore. Screens use those modules through feature-level services as later milestones are added.

The development server in `server/index.js` currently serves the static application. Later AI routes will remain optional and will call OpenAI only from the server:

```text
Browser and IndexedDB
        |
        | optional AI request
        v
Small server-side API
        |
        v
OpenAI API
```

Normal tracking must continue working if the AI API is unavailable.

## Data storage

Normal application data is stored locally in the browser's IndexedDB database named `points-tracker`. Clearing browser site data removes it.

Use **Settings > Export backup** to download the complete local dataset as `points-tracker-backup-YYYY-MM-DD.json`. **Choose backup file** validates an export and shows record counts without changing data. Restoring requires a separate confirmation checkbox and atomically replaces all local application data. Import is also available on the first-run screen so an empty installation can be recovered directly.

The database uses explicit migrations. Future schema changes must add a migration and increase `DATABASE_VERSION`; existing databases must not be deleted as an upgrade mechanism.

For development only, `resetDatabase()` is exported by `public/js/db.js`. It permanently removes the local `points-tracker` database and should not be exposed as an ordinary production action.

## Point rules established for this project

- Calculations and stored totals retain raw decimal points.
- Rounding occurs only when a value is displayed.
- Foods explicitly confirmed as fruit/zero-point items calculate as zero.
- Missing nutrients are not silently treated as zero.
- Later edits to foods or recipes must not recalculate existing diary-entry snapshots.
- Only one weigh-in per household user and local date will be allowed; a second attempt must edit the existing weigh-in.

## Source documents

- `Points Tracker Specification.md`
- `Points Tracker Implementation Brief.md`
