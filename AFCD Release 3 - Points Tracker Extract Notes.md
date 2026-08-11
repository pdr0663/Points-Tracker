# AFCD Release 3 — Points Tracker Nutrient Extract

## File

`AFCD Release 3 - Points Tracker Nutrients.csv`

This compact CSV is intended as reference material for the Points Tracker ChatGPT Project.

It contains 1,588 food records and these eight columns:

```text
public_food_key
classification
food_name
food_description
protein_g_per_100g
carbohydrate_g_per_100g
fat_g_per_100g
fibre_g_per_100g
```

All four nutrient values are expressed as grams per 100 g. Every record has a value for every selected nutrient.

## Source and transformation

This is a derivative extract of the **Australian Food Composition Database Release 3**, published by Food Standards Australia New Zealand (FSANZ).

Official source page:

<https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files>

Source workbooks:

* `AFCD Release 3 - Food Details.xlsx`
* `AFCD Release 3 - Nutrient profiles.xlsx`
* `AFCD Release 3 - Nutrient details.xlsx`, used to confirm nutrient meanings

Records were joined using the exact `Public Food Key`. Names, descriptions, and classification codes came from Food Details. Nutrient values came from the `All solids & liquids per 100 g` sheet in Nutrient Profiles.

Selected source nutrients:

| Extract column | AFCD nutrient |
| --- | --- |
| `protein_g_per_100g` | Protein (g) |
| `carbohydrate_g_per_100g` | Available carbohydrate, with sugar alcohols (g) |
| `fat_g_per_100g` | Fat, total (g) |
| `fibre_g_per_100g` | Total dietary fibre (g) |

The carbohydrate value including sugar alcohols was selected because Points Tracker uses carbohydrate and fibre as separate inputs, and this is the broader AFCD available-carbohydrate measure. Column names were normalised for machine use, unused columns were removed, and Excel binary floating-point artefacts were normalised to at most six decimal places without changing meaningful source precision.

## Source discrepancy disclosure

Food keys and food names matched exactly across the Food Details and Nutrient Profiles workbooks. Two classification codes differed. This extract uses the Food Details classification in both cases:

| Public food key | Food | Food Details | Nutrient Profiles |
| --- | --- | ---: | ---: |
| `F002513` | Cherry, black, canned in syrup | 16702 | 16404 |
| `F003018` | Coffee, black, from instant coffee powder, decaffeinated | 11203 | 11201 |

## Licence and attribution

The Australian Food Composition Database is licensed by FSANZ under its Data User Licence Agreement, based on the Creative Commons Attribution-ShareAlike 3.0 Australia licence. This derivative extract is distributed under the same FSANZ Data User Licence Agreement:

<https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement>

Attribution: **Food Standards Australia New Zealand, Australian Food Composition Database Release 3.**

This extract is based on Australian data. Australian data may not be appropriate for use in other countries.

FSANZ limitation of data statement:

> There are limitations associated with food composition databases. Food composition data used in the database or databases may represent an average of the nutrient content of a particular sample of foods and ingredients, determined at a particular time. The nutrient composition of foods and ingredients can vary substantially between batches and brands because of a number of factors, including changes in season, processing practices and ingredient source, and methods of calculation.

The transformation and column selection were performed for Points Tracker. They do not imply sponsorship or endorsement by FSANZ. The FSANZ logo and Commonwealth coat of arms are not included.

## ChatGPT Project use

Upload this notes file and the CSV alongside `ChatGPT JSON Authoring Guide.md`.

For an AFCD match, ChatGPT should use the exact `public_food_key`, `food_name`, and preparation description. If multiple records are plausible, it should ask the user to choose. It must not label remembered or web-searched nutrition as AFCD data.

## Points Tracker catalogue generation

The same checked-in CSV is the reproducible source for the static application catalogue. Run:

```powershell
npm run build:afcd
```

`tools/build-afcd-catalogue.js` validates the input shape, identifiers, classification codes, nutrient values, duplicate IDs, and expected record count before writing `public/data/afcd-reference.json`. The generated metadata records the source filename and SHA-256 so source drift is detectable.

Fresh/raw fruit classifications are marked only as zero-point candidates. Canned, dried, dehydrated, preserved, salted, syrup, sweetened, juice, chip, paste, and stewed descriptions are excluded. The application always presents the resulting checkbox for user review before copying an AFCD food into the saved-food database.
