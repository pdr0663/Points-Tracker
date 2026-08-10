# ProPoints Tracker — Codex Implementation Brief

## 1. Objective

Implement the ProPoints Tracker described in the functional specification as a small, maintainable, mobile-first web application.

The application must:

* work locally without AI for all core tracking functions
* use IndexedDB for persistence
* use vanilla HTML, CSS, and JavaScript
* support two or more household users
* support foods, recipes, diary entries, weigh-ins, goals, and progress
* provide AI-assisted meal, recipe, voice, and nutrition-label input
* use a server-side OpenAI integration
* never expose the OpenAI API key to browser code
* keep all ProPoints calculations deterministic and local
* require human confirmation before saving AI-interpreted information

The guiding architecture is:

```text
Browser application
        |
        | optional AI requests
        v
Small backend/API
        |
        v
OpenAI API
```

The core browser application must remain usable if the backend or OpenAI API is unavailable.

---

# 2. Development Strategy

Implement incrementally.

Do not attempt to build all functionality in one pass.

Each milestone must leave the application in a usable and testable state.

The implementation sequence is:

```text
M0  Project shell
M1  Data layer
M2  ProPoints engine
M3  Users and weigh-ins
M4  Foods
M5  Diary and Today screen
M6  Weekly tracking
M7  Recipes
M8  Progress
M9  Backup and restore
M10 AI backend
M11 AI meal and recipe entry
M12 Voice input
M13 Nutrition-label image input
M14 PWA/offline polish
M15 Final test and cleanup
```

Do not begin a later milestone until the previous milestone's acceptance tests pass.

---

# 3. Repository Structure

Use the following structure unless there is a strong implementation reason to change it:

```text
propoints/
│
├── README.md
├── package.json
├── .gitignore
├── .env.example
│
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
│   │   ├── ai.js
│   │   ├── audio.js
│   │   └── ui.js
│   │
│   └── icons/
│
├── server/
│   ├── index.js
│   ├── openai.js
│   ├── validation.js
│   ├── schemas.js
│   └── routes/
│       ├── meal.js
│       ├── recipe.js
│       ├── transcribe.js
│       └── label.js
│
└── tests/
    ├── points.test.js
    ├── allowance.test.js
    ├── recipes.test.js
    ├── backup.test.js
    └── ai-schema.test.js
```

Do not introduce a frontend framework unless implementation complexity clearly justifies it.

---

# 4. Coding Rules

Use ES modules.

Prefer:

```javascript
import { calculateProPoints } from "./points.js";
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
* AI-generated ProPoints calculations

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
    source,
    createdAt,
    updatedAt
}
```

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
propoints
```

Initial schema version:

```text
1
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

# 9. Milestone M2 — ProPoints Calculation Engine

Create `points.js`.

This module must have no UI or database dependencies.

## Food points

Implement:

```javascript
export function calculateRawProPoints({
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
export function roundProPoints(rawPoints, method = "nearest") {
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

Show automatically calculated ProPoints per:

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
Tell me what I ate
Add food
```

AI action may initially be disabled.

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
  "format": "propoints-backup",
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
propoints-backup-YYYY-MM-DD.json
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

# 17. Milestone M10 — AI Backend

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

# 18. Milestone M11 — AI Meal and Recipe Input

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

The AI must not be asked to calculate ProPoints.

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

---

# 19. Milestone M12 — Voice Input

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

# 20. Milestone M13 — Nutrition Label Scanning

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

# 21. Milestone M14 — Offline/PWA Support

Implement application manifest.

Implement service worker.

Cache:

* application shell
* CSS
* JavaScript
* icons

Do not cache AI API responses unless specifically justified.

Offline mode must support:

```text
Today
Diary
Foods
Recipes
Weigh-ins
Progress
Backup
```

AI controls should clearly show:

```text
Internet connection required
```

rather than failing mysteriously.

---

# 22. Milestone M15 — Final QA

Test on:

```text
Chrome desktop
Safari desktop where available
Chrome Android
Safari iPhone/iPad
```

At minimum emulate small mobile dimensions if physical devices are unavailable.

Test widths:

```text
320 px
375 px
430 px
768 px
desktop
```

---

# 23. API Schemas

Use strict structured-output schemas.

## Meal Item

```text
description: string, required
quantity: number, required
unit: string, required
notes: string|null
```

Do not include:

```text
calories
points
weight-loss advice
```

unless specifically requested by a later feature.

---

# 24. Error Handling Contract

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
AI_REQUEST_FAILED
AI_INVALID_RESPONSE
AUDIO_ERROR
IMAGE_ERROR
BACKUP_INVALID
FOOD_INCOMPLETE
RECIPE_UNRESOLVED
```

Do not expose stack traces to normal users.

Log useful development information to the console.

---

# 25. Food Matching Design

Implement deterministic matching before asking AI.

Example:

```javascript
matchFood("weet bix")
```

should check:

```text
normalized food name
known aliases
```

Do not perform overly aggressive fuzzy matching.

A weak match should be presented as:

```text
Possible match
```

rather than silently accepted.

---

# 26. Calculation Rules

All calculations must ultimately flow through central functions.

Required functions should include:

```javascript
calculateRawProPoints()
roundProPoints()
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

# 27. Date Handling

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

# 28. Accessibility

Required:

* semantic buttons
* labels for all inputs
* keyboard navigation
* visible focus states
* accessible microphone status
* meaningful button text or ARIA labels
* reasonable contrast
* no colour-only status indicators

---

# 29. UI Behaviour

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

# 30. Testing Strategy

Use automated tests for deterministic code.

Prioritise:

```text
points
allowances
recipes
weekly boundaries
goal progress
backup validation
AI schema validation
```

UI testing may initially be manual.

Never rely solely on manual testing for numerical logic.

---

# 31. Required Unit Tests

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

# 32. Integration Tests

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

AI integration test:

```text
Enter natural-language meal
Receive interpretation
Resolve food matches
Confirm
Observe diary update
```

---

# 33. Sample Seed Data

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

# 34. Configuration

Provide:

```text
.env.example
```

Example:

```text
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=
OPENAI_VISION_MODEL=
OPENAI_TRANSCRIPTION_MODEL=
PORT=3000
```

Application defaults:

```text
daily minimum = 26
weekly allowance = 49
week starts Monday
weight unit = kg
height unit = cm
```

---

# 35. README Requirements

README must contain:

## Local installation

```text
git clone
npm install
copy .env.example to .env
set OPENAI_API_KEY
npm start
```

Adjust commands to actual implementation.

## Architecture

Briefly explain:

```text
browser
IndexedDB
backend
OpenAI
```

## Data storage

State clearly that normal application data is stored locally in IndexedDB.

## Backup

Explain export/restore.

## API key

State clearly:

```text
Never place the OpenAI API key in public/js files.
```

---

# 36. Security Requirements

The implementation must not:

* expose the API key
* accept arbitrary executable content
* use `eval`
* insert AI response strings using unsafe `innerHTML`
* trust imported backup content
* trust AI JSON without validation

Prefer safe DOM construction or escaped rendering.

Apply reasonable upload limits to:

```text
audio
images
backup JSON
```

---

# 37. Privacy Requirements

Do not send unnecessary personal data to OpenAI.

For meal interpretation send only:

```text
meal text
```

For recipe interpretation send only:

```text
recipe text
```

For label scanning send:

```text
label image
```

For transcription send:

```text
audio
```

Do not routinely send:

```text
name
weight
target
date of birth
diary history
```

---

# 38. Non-Functional Requirements

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

# 39. Definition of Done — Version 1

Version 1 is complete when all of the following work:

```text
✓ Create two household users
✓ Switch users
✓ Calculate daily allowance
✓ Record weigh-ins
✓ Create foods
✓ Calculate ProPoints
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
✓ Type a meal in natural language
✓ Dictate a meal
✓ Dictate a recipe
✓ Scan a nutrition label
✓ Review all AI interpretations
✓ Confirm or correct before saving
✓ Core application works offline
```

No blocking console errors should remain.

---

# 40. Codex Working Instructions

When implementing this repository:

1. Work milestone by milestone.
2. Before each milestone, inspect existing code rather than assuming structure.
3. Do not rewrite working modules unnecessarily.
4. Keep deterministic business logic independently testable.
5. Run relevant tests after each meaningful change.
6. Do not continue to a later milestone if current tests fail.
7. Preserve backward compatibility with existing IndexedDB data when changing schemas.
8. Use schema migrations rather than deleting databases.
9. Do not invent undocumented ProPoints rules.
10. If a business-rule ambiguity is encountered, isolate it behind configuration rather than hard-coding a guess.
11. Keep AI optional.
12. Never allow an AI response to become authoritative nutritional or points data without validation and confirmation.
13. Update README when setup or architecture changes.
14. Keep commits logically scoped if operating in a Git repository.

---

# 41. First Codex Task

Begin with Milestones M0–M2 only.

Specifically:

```text
1. Create the repository skeleton.
2. Implement the responsive application shell.
3. Implement navigation.
4. Implement IndexedDB creation and CRUD wrapper.
5. Implement the complete deterministic points module.
6. Write unit tests for:
   - food ProPoints
   - rounding
   - male allowance
   - female allowance
   - minimum allowance
   - date-of-birth age calculation
7. Add setup instructions to README.
```

Do not implement foods, diary, recipes, OpenAI integration, voice, or image scanning yet.

After M0–M2 are complete, run the tests and report:

```text
files created
architecture decisions
test results
remaining issues
recommended next milestone
```

That report is the checkpoint before proceeding to M3.
