# ProPoints Tracker

A lightweight, mobile-first ProPoints tracker for two household users. The core application stores its data locally in IndexedDB and performs all point calculations deterministically in the browser. AI assistance is optional and is not part of the current M0–M4 checkpoint.

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
`https://example.github.io/propoints-tracker/`.

GitHub Pages hosts only the static, local-first application. The optional AI
backend cannot run on Pages and must later be deployed separately. Its URL will
be supplied to the browser through public, non-secret configuration; the
OpenAI API key must remain exclusively in the backend environment.

## Current checkpoint

Implemented milestones:

- M0: responsive application shell, hash router and primary navigation
- M1: versioned IndexedDB database, stores, indexes, CRUD wrapper, transactions and developer reset
- M2: raw food ProPoints, fruit/confirmed zero-point handling, display rounding, age and daily allowance calculations
- M3: first-run household setup, multiple profiles, persistent profile switching, weigh-ins with historical allowance snapshots, and editable target weight
- M4: shared food creation, editing, named servings, normalized search, calculated ProPoints, persistence, and reference-protected deletion

Diary entries, recipes, progress and AI workflows intentionally remain placeholders until their assigned milestones.

## Architecture

The browser application is organized as ES modules under `public/js`. `points.js` contains pure deterministic calculations with no UI or database dependencies. `db.js` owns all raw IndexedDB interaction and versioned schema migrations. `users.js` owns profile selection, user creation, target updates and weigh-in allowance snapshots. `foods.js` owns food validation, safe name normalization, named servings, point calculations, search and protected deletion. Screens use those modules through feature-level services as later milestones are added.

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

Normal application data is stored locally in the browser's IndexedDB database named `propoints`. Clearing browser site data removes it. Backup and restore will be added before the application is used as the authoritative household diary.

The database uses explicit migrations. Future schema changes must add a migration and increase `DATABASE_VERSION`; existing databases must not be deleted as an upgrade mechanism.

For development only, `resetDatabase()` is exported by `public/js/db.js`. It permanently removes the local `propoints` database and should not be exposed as an ordinary production action.

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
