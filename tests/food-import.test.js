import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "fake-indexeddb/auto";

import { resetDatabase } from "../public/js/db.js";
import { confirmFoodImport, resolveFoodImport } from "../public/js/food-import.js";
import { createFood, listFoods } from "../public/js/foods.js";
import { validateReferenceCatalogue } from "../public/js/reference-foods.js";

const catalogue = validateReferenceCatalogue(JSON.parse(
  await readFile(new URL("../public/data/afcd-reference.json", import.meta.url), "utf8")
));

const externalDocument = {
  schemaVersion: 1,
  type: "food-import",
  food: {
    name: "Greek yoghurt",
    brand: "Example Brand",
    source: { kind: "external-json" },
    nutritionPer100g: { protein: 9.5, carbohydrate: 6.2, fat: 2.8, fibre: 0 },
    servings: [{ description: "1 tub", grams: 170 }]
  }
};

test("food import cancellation leaves the ordinary food database unchanged", async () => {
  await resetDatabase();
  const resolution = resolveFoodImport(externalDocument, catalogue, []);
  assert.equal(resolution.candidate.name, "Greek yoghurt");
  assert.deepEqual(await listFoods(), []);
});

test("confirming an external JSON import creates one ordinary editable food", async () => {
  await resetDatabase();
  const resolution = resolveFoodImport(externalDocument, catalogue, []);
  const result = await confirmFoodImport(resolution, {
    ...resolution.candidate,
    isZeroPoint: false
  }, {
    foodOptions: {
      foodId: "food-import-yoghurt",
      servingIdFactory: () => "serving-import-yoghurt",
      timestamp: "2026-08-11T00:00:00Z"
    }
  });

  assert.equal(result.created, true);
  assert.equal(result.food.type, "food");
  assert.deepEqual(result.food.source, { kind: "external-json", referenceId: null, referenceRelease: null });
  assert.equal((await listFoods()).length, 1);
});

test("an exact saved food is detected and explicitly reused without another write", async () => {
  await resetDatabase();
  const saved = await createFood({
    ...externalDocument.food,
    isZeroPoint: false
  }, {
    foodId: "food-existing-yoghurt",
    servingIdFactory: () => "serving-existing-yoghurt",
    timestamp: "2026-08-11T00:00:00Z"
  });
  const resolution = resolveFoodImport(externalDocument, catalogue, await listFoods());
  const result = await confirmFoodImport(resolution, undefined, { reuseExisting: true });

  assert.equal(resolution.existing.id, saved.id);
  assert.equal(result.created, false);
  assert.equal(result.food.id, saved.id);
  assert.equal((await listFoods()).length, 1);
});

test("AFCD imports resolve and save official catalogue nutrition and reject unknown identifiers", async () => {
  await resetDatabase();
  const document = structuredClone(externalDocument);
  document.food.name = "Banana serving";
  document.food.brand = null;
  document.food.source = { kind: "afcd", foodId: "F000262" };
  document.food.nutritionPer100g = { protein: 999, carbohydrate: 999, fat: 999, fibre: 999 };

  const resolution = resolveFoodImport(document, catalogue, []);
  const reference = catalogue.foods.find((food) => food.id === "F000262");
  assert.deepEqual(resolution.candidate.nutritionPer100g, reference.nutritionPer100g);
  assert.notDeepEqual(resolution.candidate.nutritionPer100g, document.food.nutritionPer100g);
  assert.equal(resolution.candidate.source.referenceRelease, "AFCD Release 3");
  assert.equal(resolution.zeroPointSuggested, true);
  const confirmed = await confirmFoodImport(resolution, resolution.candidate, {
    foodOptions: {
      foodId: "food-import-afcd-banana",
      servingIdFactory: () => "serving-import-afcd-banana",
      timestamp: "2026-08-11T00:00:00Z"
    }
  });
  assert.equal(confirmed.created, true);
  assert.deepEqual(confirmed.food.nutritionPer100g, reference.nutritionPer100g);
  assert.deepEqual(confirmed.food.source, {
    kind: "afcd",
    referenceId: "F000262",
    referenceRelease: "AFCD Release 3"
  });

  document.food.source.foodId = "F999999";
  assert.throws(() => resolveFoodImport(document, catalogue, []), { code: "AFCD_NOT_FOUND" });
});
