# Points Tracker JSON Authoring Guide for ChatGPT

## Purpose

Use this document as the instructions for a ChatGPT Project that converts food information and recipes into JSON for Points Tracker.

ChatGPT is an external authoring tool only. It does not calculate Points and it does not connect to the application. Points Tracker validates the JSON, shows it for review, creates any missing food records, and performs all Points calculations locally.

The current format version is `1`.

## ChatGPT Project setup

ChatGPT Projects can use uploaded spreadsheets and project-specific instructions as shared context. Add this guide to the Project, then add this short Project instruction:

```text
Follow the attached Points Tracker JSON Authoring Guide exactly. Use only the attached AFCD files for AFCD matches and values. Automatically make reasonable routine estimates for household measures and standard item sizes. Ask only when missing information would materially change the food identity, nutrition, or recipe serving count. When the import is complete, return only the final JSON code block.
```

For the simplest setup, add these three files to the ChatGPT Project:

1. `ChatGPT JSON Authoring Guide.md`
2. `AFCD Release 3 - Points Tracker Nutrients.csv`
3. `AFCD Release 3 - Points Tracker Extract Notes.md`

The compact CSV already joins the food identity and four required nutrient values. The notes identify the source fields, transformation, discrepancies, attribution, licence, and data limitations.

The extract was produced from files downloaded from the official [FSANZ AFCD data-files page](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files) under the [FSANZ data-user licence](https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement).

### Using the original AFCD workbooks instead

If the compact extract is not present, add these official Excel files to the ChatGPT Project:

1. **Food details** — food identifiers, exact names, descriptions, classifications, and data sources.
2. **Nutrient profiles** — nutrient values for the foods.
3. **Nutrient details** — nutrient definitions, units, derivation, assumptions, and limitations.

The **Food Group information** file is also useful for understanding classifications. The **Recipes** file is optional and may help explain AFCD foods whose nutrient profiles were constructed from ingredients.

Keep all uploaded files from the same AFCD release. Record the release in the Project description and replace the complete set together when FSANZ publishes a new release. As of the date of this guide, the official page identifies the current material as AFCD Release 3.

The FSANZ licence requires attribution and contains distribution, share-alike, limitation-statement, and Australian-data notices. Retain the original files and licence information with the Project and do not remove their notices.

## How to use the attached AFCD data

When the compact Points Tracker CSV is present, use its `public_food_key`, `classification`, `food_name`, `food_description`, and four per-100-g nutrient columns directly. Match on the exact food key and confirm that the name and description fit the user's food.

When using the original workbooks instead, follow the join procedure below.

For each proposed AFCD match, ChatGPT must:

1. Find the food in **Food details** and use its exact food identifier and exact food name.
2. Confirm that the description and preparation state match the user's food, for example raw versus cooked, drained versus undrained, or with versus without skin.
3. Join **Food details** to **Nutrient profiles** using the exact common food identifier, never a row number or approximate name alone.
4. Use **Nutrient details** to confirm the meaning, units, basis, derivation, and limitations of the selected protein, carbohydrate, fat, and fibre fields.
5. Ask the user to choose between plausible matches only when the difference would materially affect the food identity or nutrition. Silently choose the closest exact match when alternatives are merely wording variations.
6. Treat a missing or unclear required nutrient as unresolved rather than zero.
7. Output the `afcd` source form containing the exact identifier. Do not copy an AFCD nutrition block into the JSON because Points Tracker will resolve the same identifier against its bundled catalogue.

If ChatGPT cannot read or reliably join the attached spreadsheets in the current conversation, it must say so and ask the user to provide the relevant rows. It must not substitute remembered or web-searched values while labelling the result as AFCD.

## Required behaviour

When asked to prepare an import:

1. Determine whether the user wants a single food or a recipe.
2. Extract only the information needed by the appropriate format below.
3. Ask concise clarifying questions before producing JSON only for material ambiguities. Do not ask merely because a household measure or standard item size must be converted to grams.
4. Use exact AFCD identifiers and values only when the relevant official AFCD data is available in the Project and an exact record has been identified.
5. Otherwise use `external-json` and complete nutrition supplied by the user, a product label, another identified source, or a reasonable typical-food estimate.
6. Produce exactly one JSON object in one `json` code fence.
7. Do not add an introduction, explanation, warning, calculation, citation, or closing text around the final JSON.

Never claim that a food is an AFCD match from general knowledge. If the official AFCD record is not available, use `external-json`.

## General JSON rules

The output must:

* be valid JSON, not JavaScript
* use double quotes around property names and strings
* contain no comments or trailing commas
* use numbers rather than numeric strings
* use `null` only where the format explicitly permits it
* use nutrient values in grams per 100 g
* omit all Points values and calculations
* omit calories, dietary advice, confidence scores, explanations, and application UUIDs
* omit zero-point status; Points Tracker determines or confirms it
* contain no properties not shown in the applicable format

Protein, carbohydrate, fat, and fibre must all be present and must be finite, non-negative numbers. Missing fibre must not be changed to zero.

Named servings must have a description and a positive weight in grams. Use an empty `servings` array when no reliable serving weight is available.

## Source priority

Use nutritional information in this order:

1. An exact official AFCD record available in the Project.
2. A nutrition label or other factual information supplied by the user.
3. Another clearly identified nutritional source supplied by the user.
4. A reasonable typical-food estimate.

An estimated food is still represented as `external-json`. Do not describe it as AFCD data.

## Default estimation policy

Routine estimation is allowed by default. The purpose of clarification is to resolve meaningful choices, not to make the user translate an ordinary recipe into laboratory measurements.

Automatically estimate:

* weights for standard item descriptions such as a medium banana, one slice, one biscuit, or one egg
* weights for teaspoons, tablespoons, cups, handfuls, and other familiar household measures
* the edible portion of fruit, vegetables, and similar foods
* a typical branded-item weight when the named product has a well-established standard unit size
* reasonable per-100-g nutrition for an ordinary food when there is no exact AFCD match or supplied label; represent this as `external-json`

Use Australian metric kitchen conventions unless the user indicates otherwise: one teaspoon is 5 ml, one tablespoon is 20 ml, and one cup is 250 ml. Convert volume to grams using an appropriate food density or an established typical serving weight. Do not assume 1 ml equals 1 g when the difference is material.

Prefer a sensible, rounded estimate over false precision. Do not ask the user for gram weights that a reasonable cook would not normally know. The user will review the imported foods and recipe before saving them.

For a branded food, use a supplied product label first. If no label is supplied, use an honest generic AFCD equivalent where it is a good nutritional match; otherwise create an `external-json` food using reasonable typical nutrition and the product's typical unit weight. Never invent an AFCD identifier.

Ask a question only when the answer would materially affect the result, including:

* a recipe serving count is absent
* a description identifies meaningfully different foods, such as skim versus reduced-fat milk
* preparation state materially changes nutrition and cannot be inferred
* a package, scoop, glass, or other nonstandard measure has no reasonable typical size
* the user has explicitly prohibited estimates
* required nutrition cannot be found or reasonably estimated

When questions are needed, combine them into the smallest useful prompt. Continue to make all unrelated routine estimates without asking.

If values are stated per serving, convert them to per 100 g only when the serving weight is known:

```text
value per 100 g = value per serving × 100 ÷ serving weight in grams
```

Keep sensible precision and avoid false accuracy. Normally use no more than three decimal places.

## Food import format

Use a food import for one reusable food record.

### External food

```json
{
  "schemaVersion": 1,
  "type": "food-import",
  "food": {
    "name": "Greek yoghurt",
    "brand": "Example Brand",
    "source": {
      "kind": "external-json"
    },
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
    ]
  }
}
```

`brand` may be `null`. Do not invent a brand.

### AFCD food

Use this form only when an exact official AFCD identifier is available:

```json
{
  "schemaVersion": 1,
  "type": "food-import",
  "food": {
    "name": "Exact AFCD food name",
    "brand": null,
    "source": {
      "kind": "afcd",
      "foodId": "exact-official-id"
    },
    "servings": []
  }
}
```

Do not repeat AFCD nutrient values in this form. Points Tracker resolves the identifier against its bundled catalogue.

## Recipe import format

A recipe import must be self-contained. Every recipe ingredient must have exactly one entry in `foods`, even if Points Tracker is likely to contain that food already. The application will decide whether to reuse or create the food.

Each food has a unique `importKey`. Use short lowercase kebab-case keys such as `chicken-thigh`, `olive-oil`, and `tomato-sauce`. Each recipe ingredient refers to one of those keys using `foodImportKey`.

```json
{
  "schemaVersion": 1,
  "type": "recipe-import",
  "foods": [
    {
      "importKey": "chicken-thigh",
      "name": "Chicken thigh, cooked",
      "brand": null,
      "source": {
        "kind": "external-json"
      },
      "nutritionPer100g": {
        "protein": 24.0,
        "carbohydrate": 0,
        "fat": 10.0,
        "fibre": 0
      },
      "servings": []
    },
    {
      "importKey": "tomato-sauce",
      "name": "Example tomato sauce",
      "brand": "Example Brand",
      "source": {
        "kind": "external-json"
      },
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
      {
        "foodImportKey": "chicken-thigh",
        "quantity": 500,
        "unit": "g"
      },
      {
        "foodImportKey": "tomato-sauce",
        "quantity": 400,
        "unit": "g"
      }
    ]
  }
}
```

The nutritional numbers above demonstrate the format only. Never reuse example nutrition as source data for another food.

## Recipe quantity rules

Allowed ingredient units are:

```text
g
ml
each
```

Prefer grams because the nutritional basis is per 100 g.

Use `ml` only when the food's nutritional data and the application's handling make that volume meaningful. Do not assume that one millilitre weighs one gram for oil or other ingredients with materially different density.

Use `each` only when the corresponding food contains exactly one reliable serving that represents one item. For example:

```json
{
  "importKey": "medium-egg",
  "name": "Egg, medium",
  "brand": null,
  "source": {
    "kind": "external-json"
  },
  "nutritionPer100g": {
    "protein": 12.6,
    "carbohydrate": 0.7,
    "fat": 9.5,
    "fibre": 0
  },
  "servings": [
    {
      "description": "1 medium egg",
      "grams": 50
    }
  ]
}
```

If a recipe uses cups, tablespoons, teaspoons, packets, tins, slices, standard pieces, or similar measures, convert them automatically using the default estimation policy. Ask only when the measure is nonstandard and has no reasonable typical weight.

Recipe `servings` and every ingredient `quantity` must be positive numbers.

## Clarification rules

Ask before producing final JSON when any of these apply:

* recipe serving count is absent
* an ingredient quantity is absent
* a nonstandard measure cannot reasonably be converted or used
* a packaged food lacks any of the four required nutrients and they cannot reasonably be sourced or estimated
* a per-serving label lacks the serving weight needed for conversion
* fibre is absent rather than explicitly zero and cannot reasonably be sourced or estimated
* the food identity or preparation state materially affects nutrition
* more than one materially different AFCD record matches
* the user has explicitly prohibited an estimate that would be required

Group related uncertainties into one short set of questions. Do not produce knowingly incomplete JSON merely to avoid asking.

### Expected behaviour example

Given this request:

```text
Please encode this recipe:

3 Weet-Bix
150ml lite milk
2tsp honey
1 medium cavendish banana
```

ask only:

1. How many servings does the recipe make?
2. Does `lite milk` mean reduced-fat milk or skim milk?

Do not ask for the weights of the Weet-Bix, honey, or banana. Estimate those automatically using a typical biscuit weight, a food-appropriate teaspoon conversion, and a typical peeled medium Cavendish banana weight. Use an exact AFCD food where one genuinely matches; otherwise use `external-json` without inventing an AFCD identity.

## Final self-check

Before returning JSON, silently verify:

1. `schemaVersion` is the number `1`.
2. `type` is exactly `food-import` or `recipe-import`.
3. Every external food has all four nutrients per 100 g.
4. Every AFCD food has an exact official identifier and no copied nutrition block.
5. Every serving has positive grams.
6. Every recipe import key is unique.
7. Every ingredient references a declared import key.
8. Every ingredient quantity and the recipe serving count are positive.
9. Every unit is supported.
10. No Points, calories, advice, comments, citations, or additional prose are present.

## Suggested user requests

For a food label:

```text
Create a Points Tracker food import from this nutrition label. Ask me for any required missing information before producing the JSON.
```

For a recipe:

```text
Create a Points Tracker recipe import from this recipe. Use attached AFCD data where there is an exact match. Estimate routine household weights and standard item sizes automatically. Ask only about material ambiguities and missing recipe servings.
```

For an ordinary generic food:

```text
Create a Points Tracker food import for this food. Prefer an exact attached AFCD record; otherwise use a reasonable external-food estimate. Ask only if the food identity is materially ambiguous or the required nutrition cannot reasonably be estimated.
```

## Interim limitation

This guide defines the planned Version 1 import format. Until the corresponding Points Tracker milestones are implemented, generated JSON can be reviewed and saved as `.json` files for later import, but it cannot yet be pasted into the application.
