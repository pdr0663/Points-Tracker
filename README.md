# Points Tracker

A lightweight, mobile-first Points tracker for a household. The application is entirely static, stores its data locally in IndexedDB, and performs all calculations deterministically in the browser.

The production application has no integrated AI service, backend, account requirement, or API key. Food and recipe information can be entered manually or prepared in an external tool and pasted as validated JSON.

## Running locally

Install the test dependency:

```powershell
npm install
```

Serve the `public` directory with any static web server. For example, when Python is available:

```powershell
python -m http.server 8000 --directory public
```

Then open `http://localhost:8000`.

Run the automated tests with:

```powershell
npm test
```

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the complete test suite and publishes only the `public` directory. In the repository settings, select **GitHub Actions** as the Pages source.

All application asset paths are relative, so deployment beneath a repository subpath is supported.

## Data and backups

Application data is stored in the browser's IndexedDB database. It is not uploaded or synchronized automatically.

Use **Settings > Export backup** to download the complete local dataset as `points-tracker-backup-YYYY-MM-DD.json`. A backup can be selected and reviewed without changing data. Restore requires a separate confirmation and replaces all local application data atomically.

Historical diary entries retain nutritional and Points snapshots, so later edits to a food or recipe do not rewrite the past.

## JSON authoring and import

The Foods and Recipes screens contain **Paste food JSON** and **Paste recipe JSON** actions. M15 provides:

- bare JSON or one Markdown `json` code-fence input
- a 64 KiB pasted-document limit
- strict parsing, version/type dispatch, and field-specific validation
- rejection of unknown fields, Points fields, unsafe keys, invalid numbers, and unresolved recipe import keys
- non-writing preview, Edit, Confirm, and Cancel controls

In M15, **Confirm** is deliberately disabled: valid documents reach review but do not write to IndexedDB. Food confirmation is introduced in M17 and transactional recipe-bundle confirmation in M18, after the M16 AFCD catalogue is available.

Published schemas and examples are available at:

- `public/schemas/food-import-v1.schema.json`
- `public/schemas/recipe-import-v1.schema.json`
- `public/examples/food-import-v1.json`
- `public/examples/recipe-import-v1.json`

The repository-level `ChatGPT JSON Authoring Guide.md` explains how an external ChatGPT Project can prepare compatible JSON. ChatGPT is optional and remains entirely outside the application.

## AFCD source material

The repository currently includes a compact development extract and notes derived from Australian Food Composition Database Release 3:

- `AFCD Release 3 - Points Tracker Nutrients.csv`
- `AFCD Release 3 - Points Tracker Extract Notes.md`

These files support the external authoring trial and the planned M16 reference catalogue. They are not yet loaded by the production application.

AFCD material is sourced from Food Standards Australia New Zealand. Retain its attribution, licence information, Australian-data notice, and limitation statements when redistributing derived data.

## Architecture

The browser application uses dependency-light ES modules under `public/js`:

- `points.js` — deterministic Points and allowance calculations
- `db.js` — IndexedDB access and versioned migrations
- `users.js` — profiles, targets, weigh-ins, and allowance snapshots
- `foods.js` — foods, named servings, search, validation, and protected deletion
- `recipes.js` — recipe validation, calculation, search, and protected deletion
- `diary.js` — diary snapshots, daily totals, and weekly accounting
- `progress.js` — progress periods, goals, and chart data
- `backup.js` — portable export, validation, and transactional restore
- `json-import.js` — pasted JSON normalization, dispatch, and Version 1 validation
- `app.js` — screen rendering and workflow coordination

There is no production server directory. GitHub Pages hosts the complete application.

## Current milestone

M15 removes the superseded integrated AI, voice, image-label, and Node backend implementation while preserving all ordinary tracking and existing IndexedDB data. It establishes the shared JSON import foundation without beginning AFCD integration or database-writing imports.
