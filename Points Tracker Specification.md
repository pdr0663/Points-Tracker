# Points Tracker — Software Implementation Specification

## 1. Purpose

Build a lightweight, mobile-first web application for two household users to track food intake using the historical Weight Watchers Points methodology.

The application must support:

* daily and weekly Points budgeting
* food logging
* food database management
* recipes
* weight tracking
* progress toward a target weight
* selection from an Australian reference-food catalogue
* validated food and recipe import from pasted JSON
* local-first operation
* backup and restore

The application is intended for personal household use, not commercial distribution.

The design priority is extremely low-friction food entry.

The core principle is:

**Reference data and imported JSON describe food; deterministic code calculates; the user confirms.**

The application must not depend on an integrated AI service, remote API, or secret credential.

---

# 2. Scope

## 2.1 Initial users

The application must support at least two named household users.

For the initial implementation, full user authentication is not required.

The UI should provide a simple profile switcher such as:

* User 1
* User 2

The currently selected user should persist across sessions.

Each user has independent:

* personal details
* current weight
* target weight
* daily Points budget
* food diary
* weigh-ins
* progress history

The food and recipe databases should normally be shared between household users.

---

# 3. Technology

## 3.1 Front end

Use:

* HTML5
* CSS
* vanilla JavaScript

Avoid React or other large frameworks unless there is a compelling implementation reason.

The application must be responsive and designed primarily for use on a mobile phone.

It should also work well on:

* tablet
* laptop
* desktop browser

## 3.2 Client-side database

Use IndexedDB for persistent local application data.

Do not use `localStorage` for substantive application data.

`localStorage` may be used only for simple preferences such as:

* current user
* current screen
* display settings

## 3.3 Reference data and imports

The production application must remain a static browser application suitable for GitHub Pages.

Provide a compact, read-only catalogue derived from the Australian Food Composition Database (AFCD). The catalogue must be generated during development and published as static data; normal food searches must not require a runtime API call.

Food and recipe JSON must be parsed and validated entirely in the browser. Imported content is data only and must never be executed.

No OpenAI API key, hosted Node service, user authentication service, or other secret credential is required for Version 1.

---

# 4. Core Points Calculation

## 4.1 Food Points formula

For a food containing:

* protein `P` grams
* carbohydrate `C` grams
* fat `F` grams
* fibre `Fi` grams

calculate raw Points as:

```text
rawPoints =
    (16 * P +
     19 * C +
     45 * F +
      5 * Fi) / 175
```

Implement this calculation centrally.

Example JavaScript API:

```javascript
function calculatePoints({
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

Do not accept imported Points values as authoritative.

If imported JSON contains a Points value, reject that field and recalculate locally from validated nutrition.

## 4.2 Rounding

Store raw Points internally as a decimal.

The display rounding rule must be configurable.

Default:

```javascript
Math.round(rawPoints)
```

However, preserve the raw value so that a later change in rounding rules does not require changing source nutritional data.

---

# 5. Daily Points Allowance

Use the reconstructed historical Points/PointsPlus allowance calculation.

Convert internally:

```text
heightInches = heightCm / 2.54
weightPounds = weightKg * 2.2046226218
```

## 5.1 Male allowance

```text
allowance =
    (heightInches - 48) / 2.25
    + weightPounds * 0.1834
    - (age - 17) / 4
```

## 5.2 Female allowance

```text
allowance =
    (heightInches - 48) / 2
    + weightPounds * 0.1461
    - (age - 21) / 5
    - 5
```

Round to the nearest integer.

The minimum allowance must be configurable.

Default:

```text
26 Points/day
```

Also support:

```text
29 Points/day
```

for users wishing to emulate the earlier version of the system.

Do not hard-code the minimum deeply into the calculation.

Suggested configuration:

```json
{
  "dailyMinimum": 26,
  "weeklyAllowance": 49
}
```

---

# 6. Weekly Allowance

Each user receives a weekly discretionary allowance.

Default:

```text
49 Points/week
```

This should remain separate from the normal daily budget.

Do not automatically merge daily points and weekly points into a single total.

The UI should distinguish:

* normal daily allowance
* weekly extra allowance

---

# 7. User Profile

Each user record must contain at least:

```json
{
  "id": "uuid",
  "name": "John",
  "sex": "male",
  "dateOfBirth": "1956-01-01",
  "heightCm": 180,
  "targetWeightKg": 84,
  "startWeightKg": 96,
  "dailyMinimum": 26,
  "weeklyAllowance": 49
}
```

Prefer storing date of birth rather than static age.

Calculate age from the date of birth at the relevant date.

---

# 8. Weight Tracking

The user must be able to record weigh-ins.

Each weigh-in must store:

```json
{
  "id": "uuid",
  "userId": "uuid",
  "date": "2026-08-10",
  "weightKg": 91.8,
  "dailyBudget": 31
}
```

The calculated daily budget at the time of the weigh-in must be saved permanently with that weigh-in.

Historical budgets must not be recalculated using later weights.

A weigh-in begins a new tracking period.

The normal period is therefore the interval between consecutive weigh-ins.

---

# 9. Weight Goal

Each user may specify:

* starting weight
* target weight

Calculate progress toward target as:

```text
progress =
    (startWeight - currentWeight)
    /
    (startWeight - targetWeight)
```

Clamp display values to a sensible range, normally 0–100%.

Display at least:

* starting weight
* current weight
* target weight
* kilograms lost
* kilograms remaining
* percentage progress

Also show useful milestone weights.

Example:

```text
✓ 95 kg
✓ 92 kg
○ 90 kg
○ 87.5 kg
○ 85 kg
○ 84 kg — Goal
```

Milestones may initially be generated automatically.

---

# 10. Food Database

Foods are shared between household users.

Each food should support nutritional values expressed per 100 g where possible.

Example:

```json
{
  "id": "uuid",
  "type": "food",
  "name": "Greek yoghurt",
  "brand": "Example Brand",
  "nutritionPer100g": {
    "protein": 9.5,
    "carbohydrate": 6.2,
    "fat": 2.8,
    "fibre": 0
  },
  "servings": [
    {
      "description": "1 tub",
      "grams": 170
    }
  ],
  "isZeroPoint": false,
  "source": {
    "kind": "manual",
    "referenceId": null,
    "referenceRelease": null
  },
  "createdAt": "2026-08-10T03:00:00Z",
  "updatedAt": "2026-08-10T03:00:00Z"
}
```

## 10.1 Serving support

A food may have one or more named serving sizes.

Examples:

```text
1 slice = 38 g
1 egg = 55 g
1 tub = 170 g
1 tablespoon = 15 g
```

A diary entry may specify either:

* grams
* millilitres where appropriate
* a named serving
* number of units

The underlying quantity should be normalised wherever practical.

---

# 11. Diary

Each diary entry must include:

```json
{
  "id": "uuid",
  "userId": "uuid",
  "date": "2026-08-10",
  "meal": "breakfast",
  "foodId": "uuid",
  "quantity": 2,
  "unit": "slice",
  "grams": 76,
  "rawPoints": 4.32,
  "displayPoints": 4
}
```

Supported meal categories initially:

* breakfast
* lunch
* dinner
* snack
* other

The stored points for an entry should represent the calculation at the time the entry was made.

The app should still retain the source food and quantity.

---

# 12. Today Screen

The Today screen is the primary application screen.

It must display:

* active user
* current date
* current weight
* target weight summary
* daily Points allowance
* points consumed today
* points remaining today
* weekly extra points used
* weekly extra points remaining

Example layout:

```text
JOHN                         10 AUG

91.8 kg                  Goal 84.0 kg
█████████░░░░░░░░░░░░░
4.2 kg lost • 7.8 kg to go

TODAY

18 / 31 PP
██████████████░░░░░░░░

13 PP remaining

[ 🎤 Tell me what I ate ]
[ + Add food ]

THIS WEEK

Daily budget       122 / 217
Weekly extras        8 / 49

[ View diary ]
```

Food entry from this screen should require as few interactions as practical.

---

# 13. Weekly Tracking

Track the user's normal daily budget separately from weekly extras.

For each week display:

* total ordinary daily allowance available
* ordinary points consumed
* weekly extras consumed
* weekly extras remaining
* average daily intake
* number of days below daily budget
* number of days above daily budget

Avoid judgemental labels such as:

* failure
* bad day
* cheating

Use neutral language.

---

# 14. Recipes

Recipes are a first-class application feature.

Each recipe contains:

```json
{
  "id": "uuid",
  "type": "recipe",
  "name": "Chicken casserole",
  "servings": 4,
  "ingredients": [
    {
      "foodId": "uuid",
      "quantity": 500,
      "unit": "g"
    }
  ]
}
```

The recipe engine must:

1. calculate Points for every ingredient
2. sum ingredient points
3. calculate total recipe points
4. divide by number of servings
5. support fractional servings in the diary

Display:

```text
Recipe total: 24.8 PP
Per serving:   6.2 PP
```

The user must be able to edit:

* ingredients
* quantities
* servings

and see points recalculate immediately.

---

# 15. Reference Food Catalogue

The application must include a read-only catalogue derived from the Australian Food Composition Database (AFCD).

The published catalogue should contain only the fields needed by the application, including:

* AFCD food identifier
* food name and useful search terms
* classification information needed for deterministic zero-point handling
* protein, carbohydrate, fat, and fibre per 100 g
* source release and attribution metadata

The generated catalogue must be versioned, reproducible from the official source files, and accompanied by the required FSANZ attribution, licence, and limitation notice.

The reference catalogue is not directly editable. Selecting an AFCD food copies a nutritional snapshot into the ordinary shared food database. Existing diary entries and recipes must never change merely because the bundled AFCD release is later updated.

---

# 16. Combined Food Selection

Food selection must search both:

1. the user's shared food database
2. the bundled AFCD reference catalogue

Saved foods should appear first. AFCD results must be visibly identified as reference foods.

When the user selects an AFCD item, show its name, nutritional values, source, locally calculated Points, and any available or user-defined serving information. Confirmation imports it as one ordinary food record and continues the initiating diary or recipe workflow.

An AFCD food already imported must be reused by source identifier rather than duplicated. The user may create aliases and serving sizes without changing the read-only reference catalogue.

---

# 17. External JSON Import

The Foods and Recipes screens must provide explicit actions:

```text
Paste food JSON
Paste recipe JSON
```

The application may accept bare JSON or a single Markdown `json` code fence for convenient copying from an external authoring tool. It must not accept explanatory prose surrounding the JSON.

Every import document must contain:

```text
schemaVersion
type
```

Supported Version 1 document types are:

```text
food-import
recipe-import
```

The schema files, authoring instructions, and worked examples must be stored in the repository so any external tool can generate compatible data. Use of ChatGPT or any other authoring tool remains optional and occurs entirely outside the application.

---

# 18. Food JSON Import

A food import creates one reusable food record. It may identify an AFCD reference food or provide a complete custom food definition.

Example custom food document:

```json
{
  "schemaVersion": 1,
  "type": "food-import",
  "food": {
    "name": "Greek yoghurt",
    "brand": "Example Brand",
    "source": { "kind": "external-json" },
    "nutritionPer100g": {
      "protein": 9.5,
      "carbohydrate": 6.2,
      "fat": 2.8,
      "fibre": 0
    },
    "servings": [
      { "description": "1 tub", "grams": 170 }
    ]
  }
}
```

An AFCD import may instead use:

```json
"source": { "kind": "afcd", "foodId": "official-id" }
```

For an AFCD source, the application must resolve the identifier against its bundled catalogue and use the catalogue nutrition rather than trusting duplicated nutritional values in the pasted document.

Imported JSON must never provide an authoritative Points value. Unknown required nutritional values must not silently become zero.

---

# 19. Recipe JSON Import

A recipe import is a self-contained bundle containing a recipe plus the food definitions or AFCD references needed to resolve its ingredients.

Example shape:

```json
{
  "schemaVersion": 1,
  "type": "recipe-import",
  "foods": [
    {
      "importKey": "chicken",
      "name": "Chicken thigh, cooked",
      "source": { "kind": "afcd", "foodId": "official-id" }
    },
    {
      "importKey": "sauce",
      "name": "Example tomato sauce",
      "source": { "kind": "external-json" },
      "nutritionPer100g": {
        "protein": 1.5,
        "carbohydrate": 7.0,
        "fat": 0.5,
        "fibre": 1.2
      },
      "servings": []
    }
  ],
  "recipe": {
    "name": "Chicken tomato casserole",
    "servings": 4,
    "ingredients": [
      { "foodImportKey": "chicken", "quantity": 500, "unit": "g" },
      { "foodImportKey": "sauce", "quantity": 400, "unit": "g" }
    ]
  }
}
```

Each `foodImportKey` is local to the import document. It must resolve to exactly one food definition. The application then matches or creates ordinary food records and replaces import keys with persistent food IDs.

The recipe cannot be confirmed until every ingredient resolves to a saved food record.

---

# 20. Import Review and Transaction Behaviour

Before writing anything, show:

* the parsed food or recipe
* AFCD references and their resolved names
* existing saved-food matches
* foods that would be created
* possible duplicates or conflicts
* missing or invalid fields
* locally calculated Points

All imported values must be editable through the ordinary food or recipe editors before confirmation.

A food import is written only after explicit confirmation. A recipe bundle must insert all confirmed missing foods and the recipe in one IndexedDB transaction so a failure cannot leave a partially imported recipe. Cancelling the preview writes nothing.

---

# 21. Food Matching and Unknown Foods

Matching priority is:

1. existing food with the same AFCD source identifier
2. exact saved-food name
3. known alias
4. exact AFCD reference
5. possible saved-food or AFCD candidate requiring user confirmation
6. unresolved

Never silently replace or overwrite an existing saved food.

If a food is not present in the saved database or AFCD, allow manual food creation or a validated `external-json` food definition. A complete nutrition record and explicit confirmation are required before it can be used in a recipe.

---

# 22. Progress Screen

Provide a dedicated progress screen.

It must support three views.

## 22.1 Current period

Display:

* current period start date
* current weight
* current daily allowance
* points consumed
* weekly extras consumed

Example:

```text
CURRENT PERIOD

10 Aug – next weigh-in

Starting weight        91.8 kg
Daily allowance           31 PP

Points so far          104 / 124
Weekly extras            8 / 49
```

## 22.2 Previous periods

For each completed weigh-in interval display:

```text
3 Aug – 10 Aug

92.4 kg → 91.8 kg

Weight change           -0.6 kg
Average points/day        29.3
Daily budget                31
Weekly extras used           12
```

## 22.3 Goal progress

Display:

```text
Start        96.0 kg
Current      91.8 kg
Goal         84.0 kg

Lost          4.2 kg
Remaining     7.8 kg
Progress        35%
```

Include a visual progress indicator.

---

# 23. Weight History

Provide a weight-history chart.

Minimum functionality:

* date on horizontal axis
* weight in kg on vertical axis
* target weight visible
* starting weight visible

Do not overcomplicate the first implementation with predictive modelling.

A future trend line may be added later.

---

# 24. Progress Interpretation

Do not treat weight change as the only measure of success.

The application should present independently:

* dietary adherence
* points consumption
* weight change
* progress toward target

Do not display large red failure indicators merely because of a short-term weight increase.

---

# 25. JSON Import Confirmation UI

Every JSON import must end with a review screen before any data is written.

The review should identify:

```text
valid document and schema version
AFCD foods resolved from the bundled catalogue
existing foods that will be reused
new foods that will be created
possible duplicates requiring a decision
recipe ingredient quantities and units
locally calculated Points
validation errors and unresolved entries
```

Provide clear `Edit`, `Confirm`, and `Cancel` actions. Confirmation must remain disabled while any required value or ingredient resolution is incomplete.

---

# 26. Navigation

Recommended primary navigation:

```text
Today
Diary
Foods
Recipes
Progress
Settings
```

On mobile, use a simple bottom navigation bar or equivalent touch-friendly design.

---

# 27. Food Search and Recent Foods

The app must make frequently used foods very easy to select.

Provide:

* search
* recent foods
* frequently used foods
* favourites

The goal is that common food entry requires only a few taps.

---

# 28. Diary Editing

The user must be able to:

* add diary entry
* edit quantity
* change meal category
* change food
* delete entry
* move entry to another date
* duplicate entry

Editing an entry must update calculated points.

---

# 29. Backup and Restore

Local data must be exportable.

Provide:

```text
Export backup
Import backup
```

Export the complete application dataset as JSON.

Suggested filename:

```text
points-tracker-backup-YYYY-MM-DD.json
```

The backup must contain:

* users
* settings
* foods
* food aliases
* recipes
* recipe ingredients
* diary
* weigh-ins

The import function must validate the file before modifying the database.

Prefer an atomic restore process.

---

# 30. Data Portability

Use simple JSON representations and avoid embedding browser-specific structures into exported data.

The data model should allow later migration from IndexedDB to a hosted database such as PostgreSQL/Supabase without redesigning the conceptual schema.

---

# 31. IndexedDB Stores

Recommended object stores:

```text
users
foods
foodAliases
recipes
diaryEntries
weighIns
settings
```

Indexes should support common queries such as:

```text
diaryEntries by userId + date
diaryEntries by foodId
weighIns by userId + date
foods by normalizedName
foods by AFCD source identifier
```

Generate UUIDs for persistent objects.

---

# 32. Versioned Import Schemas

Publish machine-readable schemas for `food-import` and `recipe-import` with human-readable authoring instructions and valid examples.

Each schema must:

* require `schemaVersion: 1`
* use an exact supported `type`
* reject unexpected properties
* bound string lengths, array lengths, and numeric values
* allow only supported recipe units
* require finite, non-negative nutritional values
* distinguish AFCD references from complete external food definitions
* exclude Points, calories, advice, executable content, and application record IDs

Schema evolution must be explicit. A future incompatible format requires a new schema version and importer path rather than silently changing Version 1 semantics.

---

# 33. JSON Parsing and Validation

Never use `eval` or attempt to recover data from explanatory prose.

The importer may remove surrounding whitespace and one complete Markdown JSON code fence, then must parse the remaining content using `JSON.parse` and validate it against the selected schema.

Validation must occur before matching, calculations, or database writes. Invalid input must produce field-specific, user-friendly errors while preserving the pasted text for correction.

---

# 34. Error Handling

Handle at least:

* invalid JSON syntax
* unsupported schema version or document type
* invalid or unexpected fields
* unknown AFCD identifier
* duplicate import keys
* ambiguous saved-food match
* IndexedDB unavailable
* invalid backup file
* missing nutritional values
* unresolved recipe ingredient

Users must always be able to manually enter food and diary data.

---

# 35. Offline Behaviour

The local database and normal tracking functions should work offline.

Offline-capable functions include:

* view diary
* add known food
* edit diary
* calculate Points
* AFCD and saved-food search
* food and recipe JSON import
* recipes using known ingredients
* weigh-in
* progress screens

After the static application and AFCD catalogue are cached, every Version 1 feature should work without a network connection.

---

# 36. Security

Requirements:

* validate pasted JSON before use
* enforce a reasonable pasted-document size limit
* reject prototype-pollution keys and unexpected properties
* escape user-provided text before rendering
* do not execute imported JSON as code

---

# 37. Privacy

The application must not transmit foods, recipes, diary records, weights, or pasted JSON to a remote service.

If the user independently chooses an external tool to create JSON, that interaction is outside the application. Repository authoring guidance should advise users to provide only the recipe, label, or food information needed for the requested import and not their application backup or personal history.

---

# 38. Accessibility and Mobile UX

Use:

* large touch targets
* readable text
* high-contrast controls
* standard HTML form elements
* explicit labels
* accessible import, edit, confirm, and cancel controls

Primary food-entry controls should be usable one-handed on a mobile phone.

---

# 39. Visual Design

The application should appear calm and functional rather than gamified.

Use neutral language.

Appropriate positive indicators include:

* remaining points
* progress bars
* milestone completion
* weight change arrows

Avoid excessive:

* confetti
* warning colours
* guilt-oriented messaging
* streak mechanics

---

# 40. First-Run Setup

On first launch:

1. create first household user
2. collect:

   * name
   * sex
   * date of birth
   * height
   * current weight
   * target weight
3. select Points minimum:

   * default 26
   * optional 29
4. create first weigh-in
5. calculate initial daily budget

Then optionally create the second household user.

---

# 41. Settings

Settings should include:

* current user
* user profile editing
* minimum daily allowance
* weekly allowance
* point display rounding
* backup
* restore
* AFCD catalogue release and attribution
* food aliases
* application version

---

# 42. Suggested File Structure

One possible implementation:

```text
/
├── index.html
├── css/
│   └── app.css
├── js/
│   ├── app.js
│   ├── db.js
│   ├── points.js
│   ├── users.js
│   ├── foods.js
│   ├── recipes.js
│   ├── diary.js
│   ├── progress.js
│   ├── backup.js
│   ├── reference-foods.js
│   └── json-import.js
├── data/
│   └── afcd-reference.json
├── schemas/
│   ├── food-import-v1.schema.json
│   └── recipe-import-v1.schema.json
├── tools/
│   └── build-afcd-catalogue.js
└── README.md
```

Do not treat this structure as mandatory if a cleaner implementation emerges.

---

# 43. Implementation Priorities

Implement in this order.

## Phase 1 — deterministic core

Implement:

1. IndexedDB
2. household users
3. Points calculation
4. allowance calculation
5. foods
6. diary
7. daily dashboard
8. weekly allowance
9. weigh-ins
10. goal progress
11. backup/restore

This phase is complete.

## Phase 2 — recipes

Implement:

1. recipe CRUD
2. recipe ingredients
3. points per recipe
4. points per serving
5. diary integration

This phase is complete.

## Phase 3 — integrated-service removal and JSON foundation

Implement:

1. remove the superseded integrated AI UI, server, configuration, and tests
2. preserve all non-AI behaviour and existing local data
3. add shared paste, parse, schema-dispatch, validation, and preview infrastructure
4. add checked-in schema locations, authoring instructions, and examples

## Phase 4 — reference food catalogue

Implement:

1. reproducible AFCD source transformation
2. compact published catalogue and attribution
3. combined saved-food and AFCD search
4. AFCD preview and copy-on-use
5. duplicate prevention by AFCD identifier

## Phase 5 — versioned JSON import

Implement:

1. paste handling for bare and fenced JSON
2. strict food import validation, preview, and confirmation
3. recipe-bundle matching and preview
4. atomic creation of missing foods and the recipe

## Phase 6 — offline completion and final QA

Implement:

1. cache the application shell and AFCD catalogue
2. verify upgrades preserve existing local data
3. test mobile and desktop import workflows
4. update user documentation and release notes

---

# 44. Acceptance Tests

The implementation should pass at least the following tests.

## 44.1 Points

Given known nutritional values, the application produces the correct value using:

```text
(16P + 19C + 45F + 5Fi) / 175
```

## 44.2 User isolation

Food diary records belonging to User A do not appear in User B's diary.

Shared foods and recipes remain available to both.

## 44.3 Allowance reduction

Changing a user's weight through a new weigh-in changes future daily allowance when the formula crosses an integer boundary.

Historical diary periods retain the previous allowance.

## 44.4 Recipe

A recipe with four servings calculates total points and one-quarter of that total for one serving.

A 1.5-serving diary entry calculates correctly.

## 44.5 AFCD food selection

Searching finds both saved foods and AFCD reference foods, with saved foods first and the source clearly identified.

Confirming an AFCD result creates one ordinary food with source metadata and calculated Points. Selecting the same AFCD item again reuses that record.

## 44.6 Food JSON

Valid bare or fenced `food-import` JSON produces an editable preview. Cancel saves nothing; invalid or incomplete nutrition blocks confirmation; Confirm creates one ordinary shared food record.

An AFCD food import resolves nutrition from the bundled catalogue rather than duplicated values in the JSON.

## 44.7 Recipe JSON

A valid `recipe-import` bundle shows existing matches, AFCD resolutions, and foods to be created. Ambiguous and unresolved ingredients block confirmation.

Confirming atomically creates missing foods and a recipe whose ingredients reference the resulting saved food IDs. A forced failure leaves neither a partial recipe nor partial food inserts.

## 44.8 Invalid import safety

Malformed JSON, unsupported versions, unexpected fields, Points fields, duplicate import keys, and unknown AFCD identifiers are rejected without database changes. The pasted text remains available for correction.

## 44.9 Backup

Export, clear local data, import the backup, and reproduce the original data.

---

# 45. Non-Goals for Version 1

Do not initially implement:

* public accounts
* social features
* commercial subscriptions
* meal plans
* calorie targets
* exercise tracking
* wearable integration
* Apple Health integration
* Google Fit integration
* automatic weight prediction
* restaurant databases
* barcode lookup
* real-time conversational voice assistant
* integrated AI, transcription, or nutrition-label image interpretation
* hosted application backend
* multi-household cloud synchronisation

These may be considered later.

---

# 46. Future Enhancements

Potential later features include:

* cloud synchronisation between phones
* barcode scanning
* recipe URL import
* weight trend smoothing
* estimated time-to-goal ranges
* activity points
* nutritional trend analysis
* frequently repeated meal detection
* externally generated food aliases supplied through a future schema version
* automatic weekly summaries
* installable Progressive Web App
* server-hosted PostgreSQL/Supabase database

The Version 1 architecture should not unnecessarily prevent these additions.

---

# 47. Guiding Product Principles

When implementation choices are ambiguous, prefer the option that satisfies these priorities, in order:

1. **Fast food entry**
2. **Correct deterministic point calculation**
3. **Simple review of reference and imported data**
4. **Easy correction of mistakes**
5. **Reliable local data storage**
6. **Clear progress display**
7. **Low operating cost**
8. **Simple codebase**
9. **Future portability**

The application should feel substantially faster to use than a conventional calorie-counting application.

A common meal should normally be recordable in a few seconds.

External authoring tools may reduce typing, but the application must remain complete and understandable without them.

The user remains the final authority on what was eaten.
