# Points Tracker

A lightweight, mobile-first Points tracker for a household. Version 1 is entirely static, stores its data locally in IndexedDB, and performs all calculations deterministically in the browser.

The production application has no integrated AI service or backend. It does not require an OpenAI account, API key, environment file, Node server, or runtime API. Food and recipe information can be entered manually or prepared in an external tool and pasted as validated JSON.

## Running locally

The production application needs only a static HTTPS host. Node.js is used for contributor tests and catalogue generation, not when running the deployed application.

For contributor work, install the test dependency:

```powershell
npm install
```

Serve the `public` directory with any static web server. For example, when Python is available:

```powershell
python -m http.server 8000 --directory public
```

Then open `http://localhost:8000`.

Use `localhost` rather than opening `index.html` directly: service workers require a secure context, which includes HTTPS deployments and local HTTP development.

Run the automated tests with:

```powershell
npm test
```

No `.env` file or service credentials are used.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the complete test suite and publishes only the `public` directory. In the repository settings, select **GitHub Actions** as the Pages source.

All application asset paths are relative, so deployment beneath a repository subpath is supported. A push to `main` must pass the complete automated suite before the static artifact is deployed.

## Offline installation and updates

After one successful online load, the service worker caches the complete application shell, all JavaScript and CSS, import schemas and examples, icons, and the AFCD catalogue. Tracking, saved/reference food search, food and recipe imports, progress, export, and restore then continue to work without a network connection; household data remains in IndexedDB.

The manifest supports installation from browsers that offer **Install app** or **Add to Home Screen**. A newly deployed service worker precaches its complete version before activation, removes older Points Tracker caches, and takes control without deleting IndexedDB data. Change its cache version whenever a cached production asset changes. If an interrupted first load prevents installation, reconnect and reload once so the complete cache can be created. Browser storage clearing removes both offline assets and local household data, so export a backup first.

Regenerate the checked-in 192 px and 512 px icons on Windows with:

```powershell
npm run build:icons
```

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

The repository-level [`ChatGPT JSON Authoring Guide.md`](./ChatGPT%20JSON%20Authoring%20Guide.md) explains how an external ChatGPT Project can prepare compatible JSON. ChatGPT is optional and remains entirely outside the application; any text editor or JSON-producing tool can author the same documents.

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

## Licence and attribution

The bundled AFCD-derived catalogue is based on Australian Food Composition Database Release 3 from Food Standards Australia New Zealand. It is distributed subject to the [FSANZ Data User Licence Agreement](https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement), which is based on the Creative Commons Attribution-ShareAlike 3.0 Australia licence. Preserve the FSANZ attribution, source-release information, Australian-data notice, share-alike requirements, and limitation statement when redistributing the catalogue or its source extract.

The full source and transformation record is in [`AFCD Release 3 - Points Tracker Extract Notes.md`](./AFCD%20Release%203%20-%20Points%20Tracker%20Extract%20Notes.md). No separate software licence is granted for the application code by this repository; obtain permission from the repository owner before redistributing it.

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
- `pwa.js` — optional service-worker registration without affecting application startup
- `reference-foods.js` — static AFCD loading, validation, search, and copy-on-use
- `app.js` — screen rendering and workflow coordination

`public/service-worker.js` owns the versioned application cache and offline request recovery. `public/manifest.webmanifest` and `public/icons` provide install metadata and maskable icons.

There is no production server directory. GitHub Pages hosts the complete application.

## Browser support and Version 1 QA

The layout is designed for 320 px, 375 px, 430 px, 768 px, and desktop viewports. The release checkpoint covers the Chrome rendering engine on desktop and responsive mobile/tablet sizes. Safari desktop and physical Android/iPhone/iPad testing should be repeated on those platforms when they are available.

The reproducible release checklist and recorded M20 results are in [`VERSION_1_QA.md`](./VERSION_1_QA.md). Automated coverage includes database upgrades, import validation and recovery, atomic recipe rollback, backup/restore, GitHub Pages paths, PWA installation, and offline responses.

## Troubleshooting

- **The app does not install or work offline:** open it once while connected over HTTPS or `localhost`, wait for the page to finish loading, then reload. Direct `file:` URLs cannot install a service worker.
- **A newly deployed version still looks old:** close other Points Tracker tabs and reload while connected. The new cache activates only after its complete asset set has downloaded; local IndexedDB records are retained.
- **AFCD results do not appear:** clear the food-search term and search again. If the first installation was interrupted, reconnect and reload so `afcd-reference.json` can be cached.
- **Pasted JSON is rejected:** use bare JSON or exactly one Markdown `json` code block, keep the document below 64 KiB, and compare it with the published schema and example. The editor retains invalid input for correction.
- **A recipe import cannot be confirmed:** resolve every possible food match in the review. Cancellation or any unresolved/failed import writes neither foods nor the recipe.
- **Restore is refused:** select a complete unedited Points Tracker backup. Validation occurs before confirmation and a failed restore leaves the existing database unchanged.
- **Local data is missing on another browser or device:** IndexedDB data is local to the exact browser profile and site origin. Export a backup on the original installation and restore it on the other installation.
- **Before clearing browser storage:** export a backup. Clearing site data removes profiles, foods, recipes, diary entries, weigh-ins, preferences, and offline assets.

## Release status

M20 completes the Version 1 implementation and release checkpoint. The static application, deterministic calculations, local database, household tracking, AFCD search, reviewed JSON imports, progress, backup/restore, GitHub Pages deployment path, and offline installation are implemented and covered by the release checklist.
