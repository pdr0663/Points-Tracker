# ProPoints Tracker — Software Implementation Specification

## 1. Purpose

Build a lightweight, mobile-first web application for two household users to track food intake using the historical Weight Watchers ProPoints methodology.

The application must support:

* daily and weekly ProPoints budgeting
* food logging
* food database management
* recipes
* weight tracking
* progress toward a target weight
* AI-assisted entry using text, voice, and nutrition-label images
* local-first operation
* secure use of the OpenAI API
* backup and restore

The application is intended for personal household use, not commercial distribution.

The design priority is extremely low-friction food entry.

The core principle is:

**AI interprets; deterministic code calculates; the user confirms.**

AI must never be the authoritative calculator for ProPoints.

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
* daily ProPoints budget
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

## 3.3 AI backend

The OpenAI API key must never be embedded in browser JavaScript.

Provide a small backend API or serverless function which:

1. accepts text, image, or audio input from the application
2. calls the OpenAI API
3. requests structured JSON output
4. returns validated structured data to the browser

The backend must read the OpenAI API key from an environment variable.

Recommended environment variable:

`OPENAI_API_KEY`

The architecture should make it possible to deploy the backend using a low-cost or free serverless platform.

---

# 4. Core ProPoints Calculation

## 4.1 Food ProPoints formula

For a food containing:

* protein `P` grams
* carbohydrate `C` grams
* fat `F` grams
* fibre `Fi` grams

calculate raw ProPoints as:

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
function calculateProPoints({
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

Do not allow AI responses to provide an authoritative ProPoints value.

If AI supplies a point value, ignore it and recalculate locally.

## 4.2 Rounding

Store raw ProPoints internally as a decimal.

The display rounding rule must be configurable.

Default:

```javascript
Math.round(rawPoints)
```

However, preserve the raw value so that a later change in rounding rules does not require changing source nutritional data.

---

# 5. Daily ProPoints Allowance

Use the reconstructed historical ProPoints/PointsPlus allowance calculation.

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
26 ProPoints/day
```

Also support:

```text
29 ProPoints/day
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
49 ProPoints/week
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
  "defaultServing": {
    "description": "1 tub",
    "grams": 170
  },
  "source": "nutrition-label",
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
* daily ProPoints allowance
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

1. calculate ProPoints for every ingredient
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

# 15. AI Design Principle

All AI functionality must follow this sequence:

```text
unstructured user input
        ↓
OpenAI interpretation
        ↓
structured JSON
        ↓
schema validation
        ↓
database matching
        ↓
deterministic calculations
        ↓
human review
        ↓
save
```

The application must never save AI-generated food or diary data without presenting the interpreted result to the user first.

---

# 16. AI Text Food Entry

The user may enter natural language such as:

```text
Two weetbix with 150 ml milk and half a banana
```

The AI should return structured items such as:

```json
{
  "type": "meal-entry",
  "items": [
    {
      "description": "Weet-Bix",
      "quantity": 2,
      "unit": "each"
    },
    {
      "description": "milk",
      "quantity": 150,
      "unit": "ml"
    },
    {
      "description": "banana",
      "quantity": 0.5,
      "unit": "each"
    }
  ]
}
```

The app must then attempt to match each item against its own food database.

Show matches to the user before saving.

Example:

```text
2 × Weet-Bix                 3.4 PP
150 ml full cream milk       2.8 PP
½ banana                     0.0 PP

Total                        6.2 PP

[ Correct ]        [ Add to breakfast ]
```

---

# 17. Voice Input

The application must support push-to-record voice entry.

The intended workflow is:

```text
tap microphone
    ↓
record
    ↓
tap stop
    ↓
send audio to backend
    ↓
OpenAI transcription
    ↓
structured interpretation
    ↓
review
    ↓
save
```

Do not implement always-listening voice behaviour.

Primary voice use cases:

## 17.1 Meal entry

Example:

```text
Lunch: two slices of sourdough with ten grams of butter,
two eggs and a small banana.
```

## 17.2 Recipe entry

Example:

```text
Recipe: five hundred grams chicken thighs,
one onion, two tablespoons olive oil,
a four hundred gram tin of tomatoes,
two hundred grams mushrooms,
serves four.
```

The system should handle natural corrections where possible.

Example:

```text
Two slices of toast with butter —
actually make that ten grams of butter —
and a poached egg.
```

The UI must display both:

* transcript
* interpreted structured result

before confirmation.

---

# 18. Nutrition Label Image Import

The user must be able to photograph or upload a nutrition label.

The image should be sent to the AI backend.

AI should extract only factual label information.

Target structured output:

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
    "fibre": 0
  }
}
```

If the nutrition panel only provides values per serving, preserve that fact and derive per-100-g values only when sufficient serving weight information exists.

Do not invent missing fibre or other fields.

Missing values should be represented as `null` or otherwise explicitly marked unknown.

The app must show the extracted values for confirmation.

---

# 19. AI Recipe Import

Allow recipes to be supplied through:

* typed text
* pasted recipe text
* voice

AI should extract:

* recipe name if available
* servings
* ingredients
* quantities
* units

Example:

```json
{
  "type": "recipe",
  "name": "Chicken tomato casserole",
  "servings": 4,
  "ingredients": [
    {
      "name": "chicken thighs",
      "quantity": 500,
      "unit": "g"
    },
    {
      "name": "onion",
      "quantity": 1,
      "unit": "each"
    }
  ]
}
```

The application must attempt to match each ingredient with an existing food record.

Display match status:

```text
Chicken thighs       ✓ matched
Olive oil            ✓ matched
Onion                 ? unresolved
Mushrooms             ? unresolved
```

The user must resolve or approve unresolved ingredients before the recipe is considered complete.

---

# 20. Food Matching

Food matching must favour the user's own local food database.

Matching priority:

1. exact saved food
2. known alias
3. probable saved-food match
4. unresolved

AI must not silently replace a saved food with a generic nutritional estimate.

Provide a mechanism to assign aliases.

Example:

```text
"weetbix"
"Weet-Bix"
"2 weet bix"
```

may all map to one saved food record.

---

# 21. Unknown Foods

If an interpreted meal contains a food that is not in the database:

1. mark it unresolved
2. offer to create a food
3. allow:

   * nutrition-label scanning
   * manual nutrition entry
   * AI-assisted generic estimate if deliberately enabled

Generic estimates must be visibly labelled as estimates.

The system should favour confirmed nutrition information.

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

# 25. AI Confirmation UI

Every AI operation must end with a review screen.

The review screen should show:

```text
You said:

"two slices toast with ten grams butter and a poached egg"

Interpreted as:

Sourdough bread      2 slices
Butter               10 g
Egg                  1

Calculated points:   7.3 PP

[ Edit ]      [ Confirm ]
```

If confidence is low, flag the affected row.

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
propoints-backup-YYYY-MM-DD.json
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
```

Generate UUIDs for persistent objects.

---

# 32. AI API Endpoints

Suggested backend interface:

## 32.1 Transcribe audio

```text
POST /api/transcribe
```

Input:

* audio file

Output:

```json
{
  "transcript": "..."
}
```

## 32.2 Interpret meal

```text
POST /api/interpret-meal
```

Input:

```json
{
  "text": "two weetbix and 150 ml milk"
}
```

Output:

structured meal JSON.

## 32.3 Interpret recipe

```text
POST /api/interpret-recipe
```

Input:

```json
{
  "text": "..."
}
```

Output:

structured recipe JSON.

## 32.4 Scan nutrition label

```text
POST /api/scan-label
```

Input:

* image

Output:

structured food JSON.

The exact route design may be adjusted, but responsibilities should remain separated.

---

# 33. Structured AI Output

Use JSON-schema-backed structured outputs wherever practical.

Never attempt to recover important application state by parsing free-form AI prose.

AI output must pass schema validation before being used.

Invalid responses should result in a user-friendly error and the original input must not be lost.

---

# 34. Error Handling

Handle at least:

* no internet connection
* AI API unavailable
* invalid AI response
* microphone permission denied
* image upload failure
* IndexedDB unavailable
* invalid backup file
* missing nutritional values
* unresolved recipe ingredient

The core application must remain usable without AI availability.

Users must always be able to manually enter food and diary data.

---

# 35. Offline Behaviour

The local database and normal tracking functions should work offline.

Offline-capable functions include:

* view diary
* add known food
* edit diary
* calculate ProPoints
* recipes using known ingredients
* weigh-in
* progress screens

AI functionality may require an internet connection.

The UI should distinguish unavailable AI features without blocking local features.

---

# 36. Security

Requirements:

* no OpenAI API key in client JavaScript
* API key held only server-side
* validate uploaded file type and size
* validate all AI JSON
* escape user-provided text before rendering
* do not execute imported JSON as code

For a personal first release, user authentication is optional.

If the application becomes externally accessible, add authentication to the AI backend.

---

# 37. Privacy

Minimise information sent to AI.

For example, meal interpretation normally needs only the dictated meal text.

It should not require sending:

* full weight history
* target weight
* user name
* previous diary history

unless necessary for a specific feature.

Do not send the entire local database to OpenAI.

---

# 38. Accessibility and Mobile UX

Use:

* large touch targets
* readable text
* high-contrast controls
* standard HTML form elements
* explicit labels
* accessible microphone and image buttons

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
3. select ProPoints minimum:

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
* OpenAI integration status
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
│   └── ai.js
├── server/
│   ├── server.js
│   ├── openai.js
│   ├── schemas.js
│   └── routes/
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
3. ProPoints calculation
4. allowance calculation
5. foods
6. diary
7. daily dashboard
8. weekly allowance
9. weigh-ins
10. goal progress
11. backup/restore

This phase must work without AI.

## Phase 2 — recipes

Implement:

1. recipe CRUD
2. recipe ingredients
3. points per recipe
4. points per serving
5. diary integration

## Phase 3 — AI text

Implement:

1. secure backend
2. text meal interpretation
3. AI review/confirmation screen
4. recipe interpretation
5. unresolved food matching

## Phase 4 — voice

Implement:

1. microphone recording
2. transcription
3. meal interpretation
4. recipe interpretation
5. review flow

## Phase 5 — nutrition-label scanning

Implement:

1. image capture/upload
2. nutrition extraction
3. structured validation
4. food review
5. save to food database

---

# 44. Acceptance Tests

The implementation should pass at least the following tests.

## 44.1 ProPoints

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

## 44.5 AI meal

Given:

```text
two slices of bread and ten grams of butter
```

AI output is shown for review before insertion.

The application calculates points from matched foods, not from an AI-generated points number.

## 44.6 Voice

Recorded speech is transcribed and the transcript remains visible during confirmation.

No diary data is saved until confirmation.

## 44.7 Nutrition label

An image-derived food record is shown to the user before being written to the food database.

## 44.8 Backup

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
* AI-generated food aliases
* automatic weekly summaries
* installable Progressive Web App
* server-hosted PostgreSQL/Supabase database

The Version 1 architecture should not unnecessarily prevent these additions.

---

# 47. Guiding Product Principles

When implementation choices are ambiguous, prefer the option that satisfies these priorities, in order:

1. **Fast food entry**
2. **Correct deterministic point calculation**
3. **Simple review of AI interpretation**
4. **Easy correction of mistakes**
5. **Reliable local data storage**
6. **Clear progress display**
7. **Low operating cost**
8. **Simple codebase**
9. **Future portability**

The application should feel substantially faster to use than a conventional calorie-counting application.

A common meal should normally be recordable in a few seconds.

AI should reduce typing and data entry rather than add complexity.

The user remains the final authority on what was eaten.
