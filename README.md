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

The Foods and Recipes screens contain **Paste food JSON** and **Paste recipe JSON** actions. The shared import foundation provides:

- bare JSON or one Markdown `json` code-fence input
- a 64 KiB pasted-document limit
- strict parsing, version/type dispatch, and field-specific validation
- rejection of unknown fields, Points fields, unsafe keys, invalid numbers, and unresolved recipe import keys
- non-writing validation and review before any confirmation

M17 food imports open in the ordinary editable food form. Review the nutrition, named servings, zero-point choice, and deterministic Points preview, then either confirm creation or explicitly reuse a detected saved food. Cancelling writes nothing. AFCD references are resolved against the bundled catalogue; catalogue nutrition always wins over any pasted nutrition, and unknown identifiers are rejected while the pasted JSON remains available for correction.

M18 recipe bundles resolve each local `importKey` in order against AFCD source IDs, exact saved foods, aliases, exact AFCD references, and possible saved-food matches. The review identifies every reuse, AFCD import, custom creation, and conflict. Possible matches require an explicit create-or-reuse choice. Confirmation creates all missing foods and the recipe in one IndexedDB transaction, replacing every import key with a persistent food ID; cancellation, validation errors, unresolved conflicts, and database failures leave no partial records.

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

These files support the external authoring trial and generate the production M16 reference catalogue.

Regenerate the catalogue deterministically with:

```powershell
npm run build:afcd
```

The build validates the exact eight-column extract, all required nutrients, identifiers, classifications, duplicate IDs, and the expected 1,588-record count. It writes `public/data/afcd-reference.json`, including the source SHA-256, release, attribution, licence URL, limitation notice, normalized search text, and curated zero-point candidate metadata.

The repository attributes preserve the AFCD CSV's CRLF byte representation on every platform so its source SHA-256 is identical in Windows development and Linux GitHub Actions checkouts.

The Foods search shows saved foods first and AFCD reference foods second. Reviewing a reference shows its official nutrition and locally calculated Points. Confirmation copies a 100 g snapshot into the ordinary food database. The structured AFCD source ID and release prevent repeat imports from creating duplicates.

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
- `food-import.js` — M17 food resolution, duplicate detection, AFCD authority, and confirmation
- `recipe-import.js` — M18 ordered food resolution, conflict choices, preview, and atomic bundle confirmation
- `reference-foods.js` — static AFCD loading, validation, search, and copy-on-use
- `app.js` — screen rendering and workflow coordination

There is no production server directory. GitHub Pages hosts the complete application.

## Current milestone

M18 enables Version 1 recipe-bundle review and atomic confirmation, including saved-food and alias reuse, AFCD resolution, explicit conflict choices, deterministic Points preview, and rollback without partial records. It also makes the AFCD source hash portable across GitHub's Linux runner. M19 offline/PWA completion is next.
