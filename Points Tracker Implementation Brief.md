# Points Tracker — Codex Implementation Brief

## 1. Objective

Implement the Points Tracker described in the functional specification as a small, maintainable, mobile-first web application.

The application must:

* work locally for all tracking and import functions
* use IndexedDB for persistence
* use vanilla HTML, CSS, and JavaScript
* support two or more household users
* support foods, recipes, diary entries, weigh-ins, goals, and progress
* provide a bundled AFCD reference-food catalogue
* support validated food and recipe input from pasted JSON
* keep all Points calculations deterministic and local
* require human confirmation before saving imported information

The guiding architecture is:

```text
Bundled AFCD catalogue ----+
                           v
Pasted JSON ----------> Browser validation and review
                           |
                           v
                    IndexedDB records
                           |
                           v
              Deterministic Points calculations
```

The production application remains a static GitHub Pages site. It has no integrated AI service, runtime backend, or secret credential.

---

# 2. Development Strategy

Implement incrementally.

Do not attempt to build all functionality in one pass.

Each milestone must leave the application in a usable and testable state.

The implementation sequence is:

```text
M0  Project shell
M1  Data layer
M2  Points engine
M3  Users and weigh-ins
M4  Foods
M5  Diary and Today screen
M6  Weekly tracking
M7  Recipes
M8  Progress
M9  Backup and restore
M10-M14 Completed historical AI implementation, now superseded
M15 Remove integrated AI and establish JSON import foundation
M16 AFCD reference catalogue and combined food search
M17 Food JSON import
M18 Recipe bundle JSON import
M19 PWA/offline completion
M20 Final QA and documentation
```

Do not begin a later milestone until the previous milestone's acceptance tests pass.

---

# 3. Repository Structure

Use the following structure unless there is a strong implementation reason to change it:

```text
points-tracker/
│
├── README.md
├── package.json
├── .gitignore
├── public/
│   ├── index.html
│   ├── manifest.json
│   ├── service-worker.js
│   │
│   ├── css/
│   │   └── app.css
│   │
│   ├── js/
│   │   ├── app.js
│   │   ├── router.js
│   │   ├── db.js
│   │   ├── schema.js
│   │   ├── points.js
│   │   ├── users.js
│   │   ├── foods.js
│   │   ├── diary.js
│   │   ├── recipes.js
│   │   ├── progress.js
│   │   ├── backup.js
│   │   ├── reference-foods.js
│   │   ├── json-import.js
│   │   └── ui.js
│   │
│   ├── data/
│   │   └── afcd-reference.json
│   │
│   ├── schemas/
│   │   ├── food-import-v1.schema.json
│   │   └── recipe-import-v1.schema.json
│   │
│   └── icons/
│
├── tools/
│   └── build-afcd-catalogue.js
│
└── tests/
    ├── points.test.js
    ├── allowance.test.js
    ├── recipes.test.js
    ├── backup.test.js
    ├── reference-foods.test.js
    └── json-import.test.js
```

Do not introduce a frontend framework unless implementation complexity clearly justifies it.

---

# 4. Coding Rules

Use ES modules.

Prefer:

```javascript
import { calculatePoints } from "./points.js";
```

rather than globals.

Use:

* `const` by default
* `let` where mutation is required
* `async/await`
* UUIDs for persistent record IDs
* ISO-8601 strings for stored dates
* metric units internally

Avoid:

* inline JavaScript handlers
* duplicated calculation logic
* direct IndexedDB access from UI components
* hidden global state
* business logic inside HTML
* imported Points calculations

Business logic and presentation logic must remain separate.

---

# 5. Domain Model

Use the following canonical objects.

## User

```javascript
{
    id,
    name,
    sex,
    dateOfBirth,
    heightCm,
    startWeightKg,
    targetWeightKg,
    dailyMinimum,
    weeklyAllowance,
    createdAt,
    updatedAt
}
```

`sex` initially supports:

```text
male
female
```

This reflects the historical allowance formula being implemented rather than a broader demographic model.

---

## WeighIn

```javascript
{
    id,
    userId,
    date,
    weightKg,
    dailyBudget,
    createdAt
}
```

`dailyBudget` is frozen at weigh-in time.

---

## Food

```javascript
{
    id,
    name,
    normalizedName,
    brand,
    nutritionPer100g: {
        protein,
        carbohydrate,
        fat,
        fibre
    },
    servings: [
        {
            id,
            description,
            grams
        }
    ],
    isZeroPoint,
    source: {
        kind,
        referenceId,
        referenceRelease
    },
    createdAt,
    updatedAt
}
```

`source.kind` is initially `manual`, `afcd`, or `external-json`. Reference fields are required for `afcd` and otherwise `null`.

Nutrition properties may be `null` if unknown.

A food should not normally be usable for deterministic calculation unless required nutrient values are known.

---

## FoodAlias

```javascript
{
    id,
    foodId,
    alias,
    normalizedAlias
}
```

---

## Recipe

```javascript
{
    id,
    name,
    servings,
    ingredients: [
        {
            id,
            foodId,
            quantity,
            unit,
            grams
        }
    ],
    createdAt,
    updatedAt
}
```

Store ingredients explicitly.

Do not store only the calculated total.

---

## DiaryEntry

```javascript
{
    id,
    userId,
    date,
    meal,
    itemType,
    itemId,
    description,
    quantity,
    unit,
    grams,
    rawPoints,
    displayPoints,
    createdAt,
    updatedAt
}
```

`itemType`:

```text
food
recipe
```

---

## Settings

```javascript
{
    key,
    value
}
```

Examples:

```text
activeUserId
pointRounding
schemaVersion
```

---

# 6. IndexedDB Schema

Database name:

```text
points-tracker
```

Currently implemented schema version:

```text
2
```

Object stores:

```text
users
weighIns
foods
foodAliases
recipes
diaryEntries
settings
```

Indexes:

```text
users:
    name

weighIns:
    userId
    date
    [userId, date]

foods:
    normalizedName
    [source.kind, source.referenceId] (added by the AFCD migration)

foodAliases:
    normalizedAlias
    foodId

recipes:
    name

diaryEntries:
    userId
    date
    [userId, date]
    itemId
```

Wrap IndexedDB operations in `db.js`.

Other application modules must not call raw IndexedDB APIs directly.

M16 must increment `DATABASE_VERSION` and add the food-source index through `upgradeneeded`. Existing records without structured source metadata remain valid and are not deleted.

Provide functions resembling:

```javascript
db.get(store, id)
db.getAll(store)
db.add(store, object)
db.put(store, object)
db.delete(store, id)
db.queryIndex(store, index, value)
db.transaction(stores, mode, callback)
```

---

# 7. Milestone M0 — Project Shell

## Implement

Create:

* base HTML page
* application CSS
* JavaScript entry point
* simple screen router
* navigation
* responsive mobile layout

Primary navigation:

```text
Today
Diary
Foods
Recipes
Progress
Settings
```

Use a mobile bottom-navigation layout where appropriate.

No substantive functionality is required yet.

## Definition of Done

* application opens without console errors
* navigation works
* layout is usable at 320 px screen width
* layout is usable on desktop
* modules load correctly
* README contains local startup instructions

---

# 8. Milestone M1 — IndexedDB Data Layer

## Implement

Create database initialisation and schema migration support.

Functions must exist for CRUD operations.

Add a developer-only database reset function.

## Required Behaviour

Database creation should be automatic on first launch.

Database upgrades must use versioned migration functions.

Example:

```javascript
const migrations = {
    1(db) {
        // create initial stores
    }
};
```

## Definition of Done

Automated or manual tests demonstrate:

* database creation
* insert
* retrieve
* update
* delete
* index lookup
* database survives page reload

---

# 9. Milestone M2 — Points Calculation Engine

Create `points.js`.

This module must have no UI or database dependencies.

## Food points

Implement:

```javascript
export function calculateRawPoints({
    protein,
    carbohydrate,
    fat,
    fibre
}) {
    return (
        16 * protein +
        19 * carbohydrate +
        45 * fat +
        5 * fibre
    ) / 175;
}
```

Implement display rounding separately:

```javascript
export function roundPoints(rawPoints, method = "nearest") {
    ...
}
```

Initially support:

```text
nearest
decimal
```

## Daily allowance

Implement:

```javascript
calculateDailyAllowance({
    sex,
    dateOfBirth,
    heightCm,
    weightKg,
    date,
    minimum
})
```

Male formula:

```text
(heightInches - 48) / 2.25
+ weightPounds * 0.1834
- (age - 17) / 4
```

Female formula:

```text
(heightInches - 48) / 2
+ weightPounds * 0.1461
- (age - 21) / 5
- 5
```

Return:

```javascript
Math.max(minimum, Math.round(result))
```

## Definition of Done

Unit tests cover:

* food formula
* metric conversion
* male allowance
* female allowance
* minimum 26
* minimum 29
* birthday age boundary
* rounding

No duplicated formula exists elsewhere in the repository.

---

# 10. Milestone M3 — Users and Weigh-Ins

## Implement

First-run setup screen.

Collect:

```text
Name
Sex
Date of birth
Height
Current weight
Target weight
Minimum daily PP
Weekly allowance
```

Default:

```text
minimum = 26
weeklyAllowance = 49
```

Create:

* user
* initial weigh-in
* calculated daily budget

Support adding another household user.

Implement user switcher.

## Weigh-In Entry

Allow:

```text
date
weight
```

Calculate allowance automatically and save it with the weigh-in.

## Definition of Done

* two users can exist
* switching users works
* current user persists
* weigh-in creates correct allowance
* previous weigh-ins retain historical budget
* target weight can be edited

---

# 11. Milestone M4 — Food Database

## Implement

Food list.

Food search.

Food creation.

Food editing.

Food deletion with reference protection.

Food fields:

```text
Name
Brand
Protein /100g
Carbohydrate /100g
Fat /100g
Fibre /100g
Serving descriptions
```

Show automatically calculated Points per:

```text
100 g
default serving
```

## Food Normalisation

Implement:

```javascript
normalizeFoodName(name)
```

At minimum:

* lowercase
* trim
* collapse whitespace
* normalise punctuation

Do not make destructive spelling corrections.

## Definition of Done

* create food
* edit food
* add serving
* search food
* calculated PP displayed correctly
* food remains after reload

---

# 12. Milestone M5 — Diary and Today Screen

## Diary

Implement daily diary grouped by:

```text
Breakfast
Lunch
Dinner
Snack
Other
```

Food-entry workflow:

```text
select meal
search food
select serving or quantity
review calculated PP
save
```

Support:

* add
* edit
* delete
* duplicate

## Today Screen

Display:

```text
current user
date
current weight
goal weight
daily budget
used points
remaining points
weekly extras used
weekly extras remaining
```

Provide prominent actions:

```text
Add food
Search foods
```

## Daily Point Handling

Calculate:

```text
daily excess = max(0, daily used - daily budget)
```

Weekly extras consumed should equal cumulative excess for the defined week.

Do not subtract unused normal daily points from later days unless explicitly added as a future feature.

## Definition of Done

* food entry updates Today immediately
* user switching shows independent diary data
* daily total correct
* daily remaining correct
* weekly extras correct

---

# 13. Milestone M6 — Weekly Tracking

Define week boundaries consistently.

Default:

```text
Monday 00:00
through
Sunday 23:59
```

Make this configurable later if necessary.

Display:

```text
ordinary budget available
ordinary points consumed
weekly extras consumed
weekly extras remaining
average PP/day
days under daily budget
days over daily budget
```

Use neutral language.

## Definition of Done

Boundary tests cover:

* Monday
* Sunday
* month changes
* year changes

Weekly allowance resets correctly.

---

# 14. Milestone M7 — Recipe System

## Recipe Editor

Allow creation of:

```text
recipe name
serving count
ingredients
```

Ingredient entry must search saved foods.

Ingredient quantities may use:

```text
g
ml
named serving
each
```

Normalise to grams when possible.

## Recipe Calculation

Calculate:

```text
ingredient PP
recipe total PP
PP per serving
```

Support diary quantities such as:

```text
0.5 serving
1 serving
1.5 servings
2 servings
```

## Editing

Changing:

```text
ingredient
quantity
servings
```

must recalculate immediately.

## Definition of Done

Automated test:

A recipe worth 24 PP with 4 servings produces:

```text
6 PP/serving
```

and:

```text
1.5 servings = 9 PP
```

---

# 15. Milestone M8 — Progress

Create Progress screen.

## Goal Summary

Display:

```text
starting weight
current weight
goal weight
weight lost
weight remaining
percent complete
```

Progress formula:

```javascript
(startWeight - currentWeight)
/
(startWeight - targetWeight)
```

Clamp visual progress to:

```text
0–100%
```

Keep actual numerical data unchanged.

## Milestones

Generate sensible milestones between start and target.

They may be based on:

* 2.5 kg intervals
* 5 kg intervals
* target weight

Do not generate excessive milestones.

## Period History

A period extends from one weigh-in to the next.

For completed periods calculate:

```text
start weight
end weight
weight change
average PP/day
daily allowance
weekly extras consumed
```

## Weight Chart

Implement simple responsive SVG or canvas chart.

Display:

* weigh-in points
* connecting line
* target weight reference

Avoid external chart libraries unless substantially simpler.

## Definition of Done

* chart responds to narrow display
* progress updates after weigh-in
* historical periods remain stable
* no predictive goal date

---

# 16. Milestone M9 — Backup and Restore

## Export

Export one JSON object:

```json
{
  "format": "points-tracker-backup",
  "version": 1,
  "exportedAt": "...",
  "data": {
    "users": [],
    "weighIns": [],
    "foods": [],
    "foodAliases": [],
    "recipes": [],
    "diaryEntries": [],
    "settings": []
  }
}
```

Filename:

```text
points-tracker-backup-YYYY-MM-DD.json
```

## Import

Before import:

1. parse JSON
2. validate format
3. validate version
4. validate object structures
5. show summary
6. require explicit confirmation

Restore should be transactional where possible.

Do not leave a half-restored database.

## Definition of Done

Test:

```text
create data
export
clear database
restore
compare restored data
```

Datasets must be equivalent.

---

# 17. Milestone M10 — AI Backend [COMPLETED, SUPERSEDED]

> Historical record only: M10 through M14 describe the integrated AI implementation completed at commit `68ba5f3`. They are no longer active product requirements. M15 removes these features and their runtime server; do not extend or repair them.

Create a minimal Node.js backend.

Use environment variable:

```text
OPENAI_API_KEY
```

Never return API credentials to the browser.

Create:

```text
GET /api/health
POST /api/interpret-meal
POST /api/interpret-recipe
POST /api/transcribe
POST /api/scan-label
```

Add request-size limits.

Add consistent error response:

```json
{
  "error": {
    "code": "AI_REQUEST_FAILED",
    "message": "..."
  }
}
```

## OpenAI Module

All OpenAI-specific code belongs in:

```text
server/openai.js
```

Do not scatter model calls through route files.

Model names should be configurable.

Example environment variables:

```text
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=
OPENAI_VISION_MODEL=
OPENAI_TRANSCRIPTION_MODEL=
```

Provide sensible defaults in code.

---

# 18. Milestone M11 — AI Meal and Recipe Input [COMPLETED, SUPERSEDED]

## Meal Schema

Canonical AI response:

```json
{
  "type": "meal-entry",
  "items": [
    {
      "description": "Weet-Bix",
      "quantity": 2,
      "unit": "each",
      "notes": null
    }
  ]
}
```

The AI must not be asked to calculate Points.

## Recipe Schema

```json
{
  "type": "recipe",
  "name": "Chicken casserole",
  "servings": 4,
  "ingredients": [
    {
      "description": "chicken thighs",
      "quantity": 500,
      "unit": "g"
    }
  ]
}
```

## Validation

Validate responses against strict schemas before returning them to the browser.

Reject malformed output.

## Matching

Client matching order:

```text
exact normalized name
alias
close candidate
unresolved
```

Probable matches must still be reviewable.

## Missing Recipe Foods

After deterministic matching, each unresolved recipe ingredient must offer:

```text
Add food with AI
```

This opens the ordinary AI-assisted Add Food workflow with the ingredient name
prefilled and generic nutritional suggestion mode selected. Do not request new
nutrition for ingredients already matched to saved foods.

The suggested nutrition must be labelled `AI estimate`, remain fully editable,
and pass the ordinary food validator. After the user confirms the food, save it
to the shared food database, return to the recipe review, and automatically
match the ingredient to the new food. Cancelling Add Food returns to the recipe
with the ingredient still unresolved.

The recipe itself cannot be confirmed until every ingredient references a saved
food. If the user later cancels the recipe, any food they explicitly reviewed
and confirmed remains as an ordinary reusable food record.

## AI Review Screen

Always display:

```text
original text
interpreted items
matched foods
quantities
calculated PP
unresolved entries
```

Buttons:

```text
Edit
Confirm
Cancel
```

No AI-derived diary item may be saved before Confirm.

## Definition of Done

Typing:

```text
two slices of bread with ten grams of butter
```

produces a review screen.

Confirming creates correct deterministic diary entries.

Cancelling creates nothing.

For a recipe containing an unknown ingredient, `Add food with AI` offers
editable AI-estimated nutrition in the ordinary food form. Confirming the food
returns to the recipe and resolves the ingredient; cancelling leaves it
unresolved. The completed recipe references the saved food record.

---

# 19. Milestone M12 — AI Food Input [COMPLETED, SUPERSEDED]

Add an AI-assisted option to the ordinary food-creation screen.

The user may type or paste a description containing food identity, nutrition,
and serving information, for example:

```text
Example Brand Greek yoghurt. Per 100 g: protein 9.5 g,
carbohydrate 6.2 g, fat 2.8 g, fibre 0 g. One tub is 170 g.
```

Send the text and explicit operation to:

```text
POST /api/interpret-food
```

```json
{
  "text": "Greek yoghurt, protein 9.5 g per 100 g...",
  "mode": "extract"
}
```

`mode` must be `extract` or `estimate`. Recipe Add Food uses `estimate` with
only the unresolved ingredient description. The backend assigns the response
provenance from this mode.

## Canonical Food Schema

```json
{
  "type": "food",
  "name": "Greek yoghurt",
  "brand": "Example Brand",
  "servings": [
    {
      "description": "1 tub",
      "grams": 170
    }
  ],
  "nutrition": {
    "basis": "per-100g",
    "servingGrams": null,
    "protein": 9.5,
    "carbohydrate": 6.2,
    "fat": 2.8,
    "fibre": 0
  }
}
```

`name`, `brand`, serving fields, and nutrient values may be `null` when the
input does not state them. Unknown values must remain unknown. The model must
not be asked to calculate Points.

`nutrition.basis` must be `per-100g` or `per-serving`. When the source values
are per serving, `nutrition.servingGrams` records the explicitly stated serving
weight. Browser code performs the conversion to per-100-g values. Confirmation
is blocked if the conversion lacks sufficient information.

M12 supports two explicitly distinct operations:

```text
extract stated nutrition from user-supplied text
suggest generic nutrition for a missing food
```

The second operation is used deliberately by standalone food creation or by
the unresolved-ingredient recipe workflow. The application and backend assign
the `AI estimate` provenance from the operation requested; they must not trust
the model to describe its own output as stated or estimated.

## Review and Confirmation

Reuse the ordinary food editor rather than creating a separate AI-food form or
database. Always display:

```text
original text
name and brand
nutrition per 100 g
all named servings and gram weights
stated extraction or AI-estimate source status
locally calculated PP per 100 g and default serving
missing or invalid fields
possible duplicate saved foods
```

The ordinary food form starts in an editable state. Confirmation remains disabled until
the existing deterministic food validator can create a complete valid food.
Potential duplicates require an explicit choice to edit the existing food or
create a new food.

Buttons:

```text
Confirm and create food
Cancel
```

No interpreted food may be written before Confirm. Confirmation must call the
ordinary `createFood` or `updateFood` service and set the source to `ai-text`
or `ai-estimate` as determined by the initiating operation.

## Implementation Plan

1. Add a strict food structured-output schema and server-side validator.
2. Add `interpretFood(text, mode)` to the isolated OpenAI service and expose
   `POST /api/interpret-food` using the existing request limits and errors.
3. Add browser response revalidation and `interpretFood` to `public/js/ai.js`.
4. Add a "Create with AI" action to Foods and preserve the original text on
   errors or cancellation.
5. Map the response into the ordinary food editor, including multiple servings,
   deterministic per-serving to per-100-g conversion, missing-field highlighting,
   duplicate detection, and deterministic PP preview.
6. Add `Add food with AI` to unresolved recipe rows. Preserve the pending recipe
   workflow while the shared food form runs, then return and match the newly
   created food automatically.
7. Add schema, route, client, estimate-labelling, duplicate, cancellation,
   workflow-resume, validation, and confirmation tests, then perform 320 px and
   desktop browser checks.

## Definition of Done

Typing the example above produces an editable review with 9.5 g protein,
6.2 g carbohydrate, 2.8 g fat, 0 g fibre, a 170 g tub, and deterministic PP.

Confirm creates one ordinary shared food record. Cancel creates nothing.
Missing required nutrition blocks confirmation, and no API-supplied Points value
is accepted.

An AI recipe with a missing food offers `Add food with AI`. Confirming its
editable nutritional estimate creates one ordinary food, returns to the recipe,
and resolves that ingredient. Confirming the recipe then creates a recipe whose
ingredients all reference saved foods.

---

# 20. Milestone M13 — Voice Input [COMPLETED, SUPERSEDED]

Use browser `MediaRecorder`.

Do not use always-on listening.

Workflow:

```text
press microphone
start recording
press stop
upload audio
receive transcript
interpret transcript
show review
confirm
```

## UI States

Support:

```text
idle
recording
uploading
transcribing
interpreting
review
error
```

The user must always be able to cancel.

The transcript must remain visible during review.

## Definition of Done

Voice input successfully produces the same review structure as typed meal entry.

A failed transcription must not lose the user's existing diary state.

---

# 21. Milestone M14 — Nutrition Label Scanning [COMPLETED, SUPERSEDED]

Support:

```text
camera capture
image file upload
```

Send the image to:

```text
POST /api/scan-label
```

Canonical response:

```json
{
  "type": "food",
  "name": "Greek yoghurt",
  "brand": "Example Brand",
  "serving": {
    "description": "1 tub",
    "grams": 170
  },
  "nutritionPer100g": {
    "protein": 9.5,
    "carbohydrate": 6.2,
    "fat": 2.8,
    "fibre": null
  }
}
```

Unknown values must remain `null`.

Never silently replace unknown fibre with zero.

## Review

Show extracted label values.

Require confirmation before creating the food.

Highlight missing values.

If deterministic PP cannot be calculated because required values are missing, state that clearly.

## Definition of Done

Food created from label scanning enters the same ordinary food database as manually entered food.

There must not be a separate AI-food database.

---

# 22. Milestone M15 — Remove Integrated AI and Establish JSON Import Foundation

Remove all integrated AI features from the production application:

* meal and recipe natural-language controls
* AI-assisted food controls
* microphone recording and transcription controls
* nutrition-label image scanning controls
* browser AI client modules
* Node/OpenAI server code and schemas
* `.env` and OpenAI setup instructions
* AI-specific tests, styles, errors, and configuration

Preserve ordinary food, recipe, diary, and backup behaviour. Existing IndexedDB data must remain compatible; food records with historical AI source strings may remain readable and may be normalised by a versioned migration if needed.

Add the shared JSON-import foundation:

1. paste modal or screen used by both Foods and Recipes
2. trimming and optional single Markdown `json` fence removal
3. strict `JSON.parse` handling with a pasted-document size limit
4. dispatch by `schemaVersion` and `type`
5. reusable field-specific validation results
6. preview, Edit, Confirm, and Cancel states
7. checked-in schema and authoring-guide locations

## Definition of Done

The deployed application contains no AI, voice, image-scan, backend-status, or API-key controls. It still passes all unaffected tests. Valid sample import documents reach a non-writing preview; malformed or unsupported documents preserve the pasted input and change no data.

---

# 23. Milestone M16 — AFCD Reference Catalogue

1. Obtain the approved AFCD release under its FSANZ licence.
2. Add a reproducible development tool that reads the official source files.
3. Generate a compact static catalogue containing identifiers, names, search terms, classifications, required nutrients, release metadata, and attribution.
4. Validate every generated record and produce deterministic output.
5. Search saved foods and AFCD foods together, showing saved foods first and identifying sources clearly.
6. Preview an AFCD item and import a nutritional snapshot through the ordinary food service.
7. Reuse an already imported AFCD record by source identifier.
8. Apply deterministic zero-point rules from curated classification mapping, with user review.

## Definition of Done

Food search works without a runtime API. Selecting an AFCD item shows official nutrition and locally calculated Points. Confirmation creates one ordinary food with AFCD release metadata; repeat selection does not create a duplicate.

---

# 24. Milestone M17 — Food JSON Import

Implement the Version 1 `food-import` schema and UI.

Support:

* complete `external-json` food definitions
* AFCD references resolved from the bundled catalogue
* bare JSON and one complete Markdown JSON fence
* ordinary food-editor review
* duplicate detection
* serving validation
* explicit zero-point review
* deterministic Points preview

Reject Points fields, unknown properties, missing required nutrition, non-finite values, unsupported schema versions, and unknown AFCD identifiers.

## Definition of Done

Cancel writes nothing. Confirm creates or explicitly reuses one ordinary shared food. AFCD imports use bundled reference nutrition rather than pasted duplicates.

---

# 25. Milestone M18 — Recipe Bundle JSON Import

Implement the Version 1 `recipe-import` schema.

The bundle contains local `importKey` food definitions and recipe ingredients that reference those keys. Resolve foods in this order:

```text
same AFCD source identifier
exact saved food
alias
exact AFCD reference
possible match requiring confirmation
unresolved
```

Show existing foods to reuse, AFCD foods to import, custom foods to create, and all conflicts. Confirmation must create all missing foods and the recipe in one IndexedDB transaction, then replace import keys with persistent food IDs.

Preserve the AFCD source CSV's byte representation across Windows and Linux checkouts so its documented source SHA-256 passes both local and GitHub Actions verification.

## Definition of Done

No unresolved ingredient can be confirmed. Cancellation and validation failures write nothing. A forced database failure leaves neither partial food inserts nor a partial recipe.

---

# 26. Milestone M19 — Offline/PWA Completion

Implement or complete the manifest and service worker. Cache the application shell, CSS, JavaScript, schemas, icons, and AFCD catalogue.

After first successful load, all Version 1 tracking, reference search, food import, recipe import, progress, and backup features must work offline.

---

# 27. Milestone M20 — Final QA and Documentation

Test Chrome desktop, Safari desktop where available, Chrome Android, and Safari on iPhone/iPad where available. At minimum test widths of 320, 375, 430, and 768 pixels plus desktop.

Run all automated tests and manually verify AFCD attribution, upgrade compatibility, bare and fenced JSON imports, invalid-input recovery, atomic recipe imports, backup/restore, GitHub Pages deployment, and offline operation.

Update README setup, architecture, data-source, import-authoring, licence, and troubleshooting sections. No OpenAI account, environment file, Node server, or runtime API should be required.

---

# 28. Import Schemas

Store Version 1 schemas in the repository and publish them with the static application.

## Food import

Require:

```text
schemaVersion: 1
type: "food-import"
food.name: bounded non-empty string
food.brand: bounded string|null
food.source: AFCD reference or external-json marker
food.nutritionPer100g: complete non-negative protein, carbohydrate, fat, fibre for external-json
food.servings: bounded array of description and positive grams
```

An AFCD reference requires a valid `foodId` and must not override catalogue nutrition.

## Recipe import

Require:

```text
schemaVersion: 1
type: "recipe-import"
foods: bounded array with unique importKey values
recipe.name: bounded non-empty string
recipe.servings: positive finite number
recipe.ingredients: bounded array referencing declared foodImportKey values
```

Ingredient units are limited to those supported by the existing recipe service. Reject extra fields, application UUIDs, calories, Points, advice, executable strings, non-finite numbers, and unsafe object keys.

---

# 29. Error Handling Contract

Client errors should be represented consistently.

Example:

```javascript
{
    code: "FOOD_INCOMPLETE",
    message: "Fibre value is missing.",
    details: {}
}
```

Expected categories:

```text
DB_ERROR
VALIDATION_ERROR
NETWORK_ERROR
JSON_PARSE_ERROR
IMPORT_SCHEMA_UNSUPPORTED
IMPORT_INVALID
IMPORT_DUPLICATE_KEY
AFCD_NOT_FOUND
IMPORT_AMBIGUOUS
BACKUP_INVALID
FOOD_INCOMPLETE
RECIPE_UNRESOLVED
```

Do not expose stack traces to normal users.

Log useful development information to the console.

---

# 30. Food Matching Design

Implement deterministic matching before requiring manual resolution.

Example:

```javascript
matchFood("weet bix")
```

should check:

```text
same AFCD source identifier
normalized food name
known aliases
exact AFCD name or identifier
```

Do not perform overly aggressive fuzzy matching.

A weak match should be presented as:

```text
Possible match
```

rather than silently accepted.

---

# 31. Calculation Rules

All calculations must ultimately flow through central functions.

Required functions should include:

```javascript
calculateRawPoints()
roundPoints()
calculateFoodPoints()
calculateRecipePoints()
calculateDiaryEntryPoints()
calculateDailyAllowance()
calculateDailyUsage()
calculateWeeklyUsage()
calculateGoalProgress()
```

UI code must not reproduce these calculations manually.

---

# 32. Date Handling

Store diary dates as local calendar dates:

```text
YYYY-MM-DD
```

Do not derive diary dates by slicing UTC timestamps.

This is important because the application will normally be used in Australia and local dates must not change due to UTC conversion.

Use timestamps only for:

```text
createdAt
updatedAt
exportedAt
```

Period and diary logic must operate using local dates.

---

# 33. Accessibility

Required:

* semantic buttons
* labels for all inputs
* keyboard navigation
* visible focus states
* accessible import validation and confirmation status
* meaningful button text or ARIA labels
* reasonable contrast
* no colour-only status indicators

---

# 34. UI Behaviour

Optimise common actions.

A frequently used food should be addable in approximately:

```text
2–4 interactions
```

Provide:

```text
recent foods
favourites
frequently used foods
```

Do not require navigating through several screens for each diary item.

---

# 35. Testing Strategy

Use automated tests for deterministic code.

Prioritise:

```text
points
allowances
recipes
weekly boundaries
goal progress
backup validation
AFCD catalogue generation and validation
food and recipe JSON schema validation
atomic recipe imports
```

UI testing may initially be manual.

Never rely solely on manual testing for numerical logic.

---

# 36. Required Unit Tests

## Food formula

For arbitrary input:

```text
protein = P
carbohydrate = C
fat = F
fibre = Fi
```

verify exact implementation of:

```text
(16P + 19C + 45F + 5Fi) / 175
```

---

## Allowance

Test at least:

```text
male
female
26-point floor
29-point floor
metric conversion
birthday boundary
```

---

## Recipe

Test:

```text
four ingredients
total PP
four servings
fractional serving
```

---

## Week

Verify:

```text
Monday starts a new weekly allowance
Sunday belongs to preceding Monday
```

---

## Goal

Verify:

```text
start = 100
current = 90
goal = 80

progress = 50%
```

---

# 37. Integration Tests

At least manually verify:

```text
Create user
Create food
Add food to diary
Observe Today update
Add weigh-in
Observe allowance update
Create recipe
Add recipe to diary
Export
Reset
Import
Verify restoration
```

Reference and JSON import tests:

```text
Search for an AFCD food
Review official nutrition and locally calculated PP
Cancel and verify nothing was saved
Repeat, confirm, and verify one sourced food record was created
Select the same AFCD food again and verify that record is reused

Paste a valid food-import document
Review locally calculated PP
Cancel and verify nothing was saved
Repeat and confirm one ordinary food record was created

Paste a recipe-import bundle containing a saved food, an AFCD food, and a new external food
Review every match and proposed creation
Cancel and verify nothing was saved
Repeat and confirm the bundle
Verify missing foods and the recipe were created atomically
Verify every ingredient references a saved food ID

Paste malformed, unsupported, and ambiguous documents
Verify each is rejected without changing the database and remains editable
```

---

# 38. Sample Seed Data

During development only, provide an optional seed script with:

```text
User A
User B
milk
bread
butter
egg
banana
chicken
olive oil
tinned tomatoes
```

Do not automatically install seed data in production mode.

---

# 39. Configuration

Application defaults:

```text
daily minimum = 26
weekly allowance = 49
week starts Monday
weight unit = kg
height unit = cm
food import schema version = 1
recipe import schema version = 1
AFCD catalogue release = generated metadata value
```

Production configuration must contain no secrets. The local development server exists only to serve static files during development.

---

# 40. README Requirements

README must contain:

## Local installation

```text
git clone
npm install
npm start
```

Adjust commands to actual implementation.

## Architecture

Briefly explain:

```text
browser
IndexedDB
bundled AFCD catalogue
versioned JSON schemas
static GitHub Pages deployment
```

## Data storage

State clearly that normal application data is stored locally in IndexedDB.

## Backup

Explain export/restore.

## Reference data and JSON authoring

Document the AFCD release, FSANZ attribution and licence obligations, catalogue regeneration process, import schemas, examples, validation behaviour, and optional use of an external authoring tool. State clearly that the application has no integrated AI service and needs no API key.

---

# 41. Security Requirements

The implementation must not:

* accept arbitrary executable content
* use `eval`
* insert imported strings using unsafe `innerHTML`
* trust imported backup content
* trust pasted JSON without validation
* accept prototype-pollution keys or unexpected schema properties

Prefer safe DOM construction or escaped rendering.

Apply reasonable size limits to:

```text
backup JSON
pasted food JSON
pasted recipe JSON
```

---

# 42. Privacy Requirements

The application must not transmit personal data, food records, recipes, diary history, weights, or pasted JSON to a remote application service.

External JSON authoring is initiated separately by the user. The checked-in authoring guide must advise users to provide only the food, label, or recipe information needed and never upload a Points Tracker backup or unrelated personal history.

---

# 43. Non-Functional Requirements

The application should:

* load quickly
* work on modest mobile hardware
* use minimal external dependencies
* remain understandable to a competent JavaScript developer
* avoid premature abstraction
* avoid unnecessary build tooling
* use descriptive names
* contain comments where business rules are non-obvious

---

# 44. Definition of Done — Version 1

Version 1 is complete when all of the following work:

```text
✓ Create two household users
✓ Switch users
✓ Calculate daily allowance
✓ Record weigh-ins
✓ Create foods
✓ Calculate Points
✓ Add foods to diary
✓ Track daily allowance
✓ Track weekly extras
✓ Create recipes
✓ Calculate recipe PP
✓ Add recipe servings to diary
✓ Display goal progress
✓ Display weight history
✓ Export backup
✓ Restore backup
✓ Search saved foods and the AFCD catalogue together
✓ Import an AFCD food as an ordinary sourced food record
✓ Paste and validate food JSON
✓ Paste and validate a recipe bundle
✓ Review every proposed match and creation
✓ Confirm or correct before saving
✓ Atomically create missing foods and an imported recipe
✓ Reject invalid JSON without changing data
✓ Core application and AFCD catalogue work offline
✓ No integrated AI service, API key, or hosted backend is required
```

No blocking console errors should remain.

---

# 45. Codex Working Instructions

When implementing this repository:

1. Work milestone by milestone.
2. Before each milestone, inspect existing code rather than assuming structure.
3. Do not rewrite working modules unnecessarily.
4. Keep deterministic business logic independently testable.
5. Run relevant tests after each meaningful change.
6. Do not continue to a later milestone if current tests fail.
7. Preserve backward compatibility with existing IndexedDB data when changing schemas.
8. Use schema migrations rather than deleting databases.
9. Do not invent undocumented Points rules.
10. If a business-rule ambiguity is encountered, isolate it behind configuration rather than hard-coding a guess.
11. Keep external authoring tools optional and outside the application.
12. Never allow imported JSON to provide authoritative Points or bypass nutritional validation and confirmation.
13. Update README when setup or architecture changes.
14. Keep commits logically scoped if operating in a Git repository.
15. Preserve AFCD attribution, licence, limitation notice, source release, and reproducible generation steps.
16. Treat M10-M14 as historical, superseded work; do not extend those features.

---

# 46. Current Next Task

M0-M18 have been implemented. The approved architecture supersedes M10-M14.

The next implementation checkpoint is M19 only:

```text
1. Complete the manifest and service worker.
2. Cache the application shell, CSS, JavaScript, schemas, icons, and AFCD catalogue.
3. Verify all Version 1 tracking, import, progress, and backup features after the first successful load without a network connection.
4. Add offline update and recovery tests, then run the complete test suite.
```

Do not begin M20 final QA until the M19 offline checkpoint has been reviewed.
