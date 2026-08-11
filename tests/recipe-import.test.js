import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "fake-indexeddb/auto";

import { add, getAll, resetDatabase } from "../public/js/db.js";
import { createFood } from "../public/js/foods.js";
import {
  canConfirmRecipeImport,
  confirmRecipeImport,
  resolveRecipeImport,
  selectRecipeImportResolution
} from "../public/js/recipe-import.js";
import { validateReferenceCatalogue } from "../public/js/reference-foods.js";

const catalogue = validateReferenceCatalogue(JSON.parse(
  await readFile(new URL("../public/data/afcd-reference.json", import.meta.url), "utf8")
));

function externalFood(importKey, name, brand = null) {
  return {
    importKey,
    name,
    brand,
    source: { kind: "external-json" },
    nutritionPer100g: { protein: 10, carbohydrate: 20, fat: 5, fibre: 3 },
    servings: [{ description: "100 g", grams: 100 }]
  };
}

function bundle(foods, ingredients = foods.map((food) => ({ foodImportKey: food.importKey, quantity: 100, unit: "g" }))) {
  return {
    schemaVersion: 1,
    type: "recipe-import",
    foods,
    recipe: { name: "Imported bowl", servings: 2, ingredients }
  };
}

async function savedFood(id, name, brand = "") {
  return createFood({
    name,
    brand,
    nutritionPer100g: { protein: 5, carbohydrate: 10, fat: 2, fibre: 1 },
    servings: [{ description: "100 g", grams: 100 }],
    isZeroPoint: false
  }, {
    foodId: id,
    servingIdFactory: () => `serving-${id}`,
    timestamp: "2026-08-11T00:00:00Z"
  });
}

test("recipe bundle resolves saved, alias, AFCD, and external foods in order and confirms atomically", async () => {
  await resetDatabase();
  const oats = await savedFood("food-oats", "Rolled oats", "Pantry");
  const milk = await savedFood("food-milk", "Whole milk");
  await add("foodAliases", { id: "alias-dairy", foodId: milk.id, alias: "Dairy", normalizedAlias: "dairy" });
  const foods = [
    externalFood("oats", "Rolled oats", "Pantry"),
    externalFood("milk", "Dairy"),
    {
      importKey: "banana",
      name: "Banana, cavendish, peeled, raw",
      brand: null,
      source: { kind: "afcd", foodId: "F000262" },
      nutritionPer100g: { protein: 999, carbohydrate: 999, fat: 999, fibre: 999 },
      servings: [{ description: "1 medium banana", grams: 118 }]
    },
    externalFood("cinnamon", "Ground cinnamon")
  ];
  const savedFoods = await getAll("foods");
  const aliases = await getAll("foodAliases");
  const resolution = resolveRecipeImport(bundle(foods), { savedFoods, aliases, catalogue });

  assert.deepEqual(resolution.entries.map((entry) => [entry.importKey, entry.status, entry.reason]), [
    ["oats", "reuse", "exact saved food"],
    ["milk", "reuse", "saved food alias"],
    ["banana", "create", "exact AFCD reference"],
    ["cinnamon", "create", "new external food"]
  ]);
  assert.equal(canConfirmRecipeImport(resolution), true);

  const result = await confirmRecipeImport(resolution, {
    savedFoods,
    foodIdFactory: (key) => `food-import-${key}`,
    servingIdFactory: (key, index) => `serving-${key}-${index}`,
    recipeId: "recipe-imported-bowl",
    ingredientIdFactory: (index) => `ingredient-${index}`,
    timestamp: "2026-08-11T01:00:00Z"
  });

  assert.equal(result.foodsCreated.length, 2);
  assert.equal(result.foodsReused.length, 2);
  assert.equal((await getAll("foods")).length, 4);
  assert.equal((await getAll("recipes")).length, 1);
  assert.deepEqual(result.foodsCreated.find((food) => food.id === "food-import-banana").nutritionPer100g,
    catalogue.foods.find((food) => food.id === "F000262").nutritionPer100g);
  assert.ok(result.recipe.ingredients.every((ingredient) => ingredient.foodId && !Object.hasOwn(ingredient, "foodImportKey")));
  assert.deepEqual(result.recipe.ingredients.map((ingredient) => ingredient.foodId), [
    oats.id,
    milk.id,
    "food-import-banana",
    "food-import-cinnamon"
  ]);
});

test("cancellation and unresolved possible matches write nothing", async () => {
  await resetDatabase();
  const existing = await savedFood("food-yoghurt-a", "Greek yoghurt", "Brand A");
  const savedFoods = [existing];
  const resolution = resolveRecipeImport(bundle([externalFood("yoghurt", "Greek yoghurt", "Brand B")]), {
    savedFoods,
    catalogue
  });

  assert.equal(resolution.entries[0].status, "ambiguous");
  assert.equal(canConfirmRecipeImport(resolution), false);
  await assert.rejects(() => confirmRecipeImport(resolution, { savedFoods }), { code: "RECIPE_UNRESOLVED" });
  assert.equal((await getAll("foods")).length, 1);
  assert.equal((await getAll("recipes")).length, 0);

  selectRecipeImportResolution(resolution, "yoghurt", { action: "create" });
  assert.equal(canConfirmRecipeImport(resolution), true);
  assert.equal((await getAll("foods")).length, 1);
});

test("a forced failure after food inserts rolls back both foods and recipe", async () => {
  await resetDatabase();
  const resolution = resolveRecipeImport(bundle([externalFood("new-food", "New food")]), { catalogue });
  await assert.rejects(() => confirmRecipeImport(resolution, {
    foodIdFactory: () => "food-rolled-back",
    servingIdFactory: () => "serving-rolled-back",
    recipeId: "recipe-rolled-back",
    beforeRecipeWrite: () => { throw new Error("Forced database failure"); }
  }), /Forced database failure/);

  assert.deepEqual(await getAll("foods"), []);
  assert.deepEqual(await getAll("recipes"), []);
});

test("unknown AFCD identifiers are rejected before any write", async () => {
  const afcd = {
    importKey: "missing-afcd",
    name: "Missing AFCD",
    brand: null,
    source: { kind: "afcd", foodId: "F999999" },
    servings: [{ description: "100 g", grams: 100 }]
  };
  assert.throws(() => resolveRecipeImport(bundle([afcd]), { catalogue }), { code: "AFCD_NOT_FOUND" });
  assert.throws(() => resolveRecipeImport(bundle([afcd]), {
    catalogue,
    savedFoods: [{ id: "bad-saved-reference", source: { kind: "afcd", referenceId: "F999999" } }]
  }), { code: "AFCD_NOT_FOUND" });
});
