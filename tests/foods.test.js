import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";

import { add, get, openDatabase, resetDatabase } from "../public/js/db.js";
import {
  createFood,
  deleteFood,
  foodPointsForDefaultServing,
  foodPointsPer100g,
  getFood,
  normalizeFoodName,
  searchFoods,
  updateFood
} from "../public/js/foods.js";

const greekYoghurt = {
  name: "Greek yoghurt",
  brand: "Example Brand",
  nutritionPer100g: {
    protein: 9.5,
    carbohydrate: 6.2,
    fat: 2.8,
    fibre: 0
  },
  servings: [
    { id: "serving-tub", description: "1 tub", grams: 170 }
  ],
  defaultServingId: "serving-tub"
};

test("food names are safely normalized without spelling correction", () => {
  assert.equal(normalizeFoodName("  Greek—YOGHURT...  "), "greek yoghurt");
  assert.equal(normalizeFoodName("Rock   Melon"), "rock melon");
  assert.equal(normalizeFoodName("yoghurt"), "yoghurt");
  assert.notEqual(normalizeFoodName("yoghurt"), normalizeFoodName("yogurt"));
});

test("foods persist with calculated points and can be found by name or brand", async () => {
  await resetDatabase();
  const food = await createFood(greekYoghurt, {
    foodId: "food-yoghurt",
    timestamp: "2026-08-10T03:00:00Z"
  });

  assert.equal(food.normalizedName, "greek yoghurt");
  assert.ok(Math.abs(foodPointsPer100g(food) - 2.2617142857142856) < 1e-12);
  assert.ok(Math.abs(foodPointsForDefaultServing(food) - 3.8449142857142857) < 1e-12);
  assert.deepEqual(await searchFoods("YOGHURT"), [food]);
  assert.deepEqual(await searchFoods("example"), [food]);

  await openDatabase();
  assert.deepEqual(await getFood(food.id), food);
});

test("a food can be edited and given another default serving", async () => {
  await resetDatabase();
  const original = await createFood(greekYoghurt, { foodId: "food-yoghurt" });
  const updated = await updateFood(original.id, {
    ...greekYoghurt,
    brand: "Updated Brand",
    servings: [
      ...greekYoghurt.servings,
      { id: "serving-spoon", description: "1 tablespoon", grams: 15 }
    ],
    defaultServingId: "serving-spoon"
  }, { timestamp: "2026-08-11T03:00:00Z" });

  assert.equal(updated.createdAt, original.createdAt);
  assert.equal(updated.updatedAt, "2026-08-11T03:00:00Z");
  assert.equal(updated.servings.length, 2);
  assert.deepEqual(updated.defaultServing, {
    id: "serving-spoon",
    description: "1 tablespoon",
    grams: 15
  });
});

test("unreferenced foods and their aliases can be deleted", async () => {
  await resetDatabase();
  const food = await createFood(greekYoghurt, { foodId: "food-yoghurt" });
  await add("foodAliases", {
    id: "alias-yogurt",
    foodId: food.id,
    alias: "Greek yogurt",
    normalizedAlias: "greek yogurt"
  });

  await deleteFood(food.id);
  assert.equal(await get("foods", food.id), undefined);
  assert.equal(await get("foodAliases", "alias-yogurt"), undefined);
});

test("foods referenced by diary entries or recipes cannot be deleted", async () => {
  await resetDatabase();
  const food = await createFood(greekYoghurt, { foodId: "food-yoghurt" });
  await add("diaryEntries", {
    id: "diary-1",
    foodId: food.id,
    userId: "user-1",
    date: "2026-08-10"
  });

  await assert.rejects(deleteFood(food.id), /cannot be deleted/);
  assert.deepEqual(await getFood(food.id), food);

  await resetDatabase();
  const recipeFood = await createFood(greekYoghurt, { foodId: "food-recipe" });
  await add("recipes", {
    id: "recipe-1",
    name: "Breakfast bowl",
    ingredients: [{ foodId: recipeFood.id, grams: 170 }]
  });
  await assert.rejects(deleteFood(recipeFood.id), /cannot be deleted/);
});

test("invalid nutrient and serving values are rejected", async () => {
  await resetDatabase();
  await assert.rejects(
    createFood({ ...greekYoghurt, nutritionPer100g: { ...greekYoghurt.nutritionPer100g, fat: -1 } }),
    /fat must be at least zero/
  );
  await assert.rejects(
    createFood({ ...greekYoghurt, servings: [] }),
    /At least one serving/
  );
});
