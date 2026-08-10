import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";

import { add, resetDatabase } from "../public/js/db.js";
import { createDiaryEntry, getDiaryEntry } from "../public/js/diary.js";
import { createFood } from "../public/js/foods.js";
import {
  calculateRecipe,
  createRecipe,
  deleteRecipe,
  getRecipe,
  recipePointsForServings,
  searchRecipes,
  updateRecipe
} from "../public/js/recipes.js";
import { createUserWithInitialWeighIn } from "../public/js/users.js";

const onePointFood = {
  name: "One point food",
  nutritionPer100g: { protein: 10.9375, carbohydrate: 0, fat: 0, fibre: 0 },
  servings: [
    { id: "one-default", description: "1 unit", grams: 100 },
    { id: "one-half", description: "half unit", grams: 50 }
  ],
  defaultServingId: "one-default"
};

const twoPointFood = {
  name: "Two point food",
  nutritionPer100g: { protein: 21.875, carbohydrate: 0, fat: 0, fibre: 0 },
  servings: [{ id: "two-default", description: "1 unit", grams: 100 }],
  defaultServingId: "two-default"
};

async function setupFoods() {
  const first = await createFood(onePointFood, { foodId: "food-one" });
  const second = await createFood(twoPointFood, { foodId: "food-two" });
  return { first, second };
}

test("a 24 PP recipe with four servings produces 6 PP per serving and 9 PP for 1.5 servings", async () => {
  await resetDatabase();
  const { first, second } = await setupFoods();
  const recipe = await createRecipe({
    name: "Exact test recipe",
    servings: 4,
    ingredients: [
      { id: "ingredient-one", foodId: first.id, quantity: 1200, unit: "g" },
      { id: "ingredient-two", foodId: second.id, quantity: 600, unit: "g" }
    ]
  }, { recipeId: "recipe-exact", timestamp: "2026-08-10T10:00:00Z" });

  assert.equal(recipe.rawTotalPoints, 24);
  assert.equal(recipe.rawPointsPerServing, 6);
  assert.equal(recipePointsForServings(recipe, 1.5), 9);
  assert.deepEqual(await getRecipe(recipe.id), recipe);
});

test("grams, millilitres, each, and named servings normalize to grams", async () => {
  await resetDatabase();
  const { first } = await setupFoods();
  const calculated = calculateRecipe({
    servings: 1,
    ingredients: [
      { id: "grams", foodId: first.id, quantity: 75, unit: "g" },
      { id: "millilitres", foodId: first.id, quantity: 80, unit: "ml" },
      { id: "each", foodId: first.id, quantity: 2, unit: "each" },
      { id: "named", foodId: first.id, quantity: 3, unit: "serving", servingId: "one-half" }
    ]
  }, [first]);

  assert.deepEqual(calculated.ingredients.map((ingredient) => ingredient.grams), [75, 80, 200, 150]);
  assert.deepEqual(calculated.ingredients.map((ingredient) => ingredient.rawPoints), [0.75, 0.8, 2, 1.5]);
});

test("editing ingredients and serving count recalculates recipe totals", async () => {
  await resetDatabase();
  const { first, second } = await setupFoods();
  const original = await createRecipe({
    name: "Changing recipe",
    servings: 2,
    ingredients: [{ id: "ingredient-one", foodId: first.id, quantity: 200, unit: "g" }]
  }, { recipeId: "recipe-changing", timestamp: "2026-08-10T10:00:00Z" });
  const updated = await updateRecipe(original.id, {
    name: "Changed recipe",
    servings: 4,
    ingredients: [{ id: "ingredient-two", foodId: second.id, quantity: 800, unit: "g" }]
  }, { timestamp: "2026-08-11T10:00:00Z" });

  assert.equal(updated.rawTotalPoints, 16);
  assert.equal(updated.rawPointsPerServing, 4);
  assert.equal(updated.createdAt, original.createdAt);
  assert.deepEqual(await searchRecipes("CHANGED!!!"), [updated]);
});

test("fractional recipe servings create frozen diary point snapshots", async () => {
  await resetDatabase();
  const { first, second } = await setupFoods();
  const { user } = await createUserWithInitialWeighIn({
    name: "John",
    sex: "male",
    dateOfBirth: "1956-01-01",
    heightCm: 180,
    currentWeightKg: 91.8,
    targetWeightKg: 84,
    dailyMinimum: 26,
    weeklyAllowance: 49,
    weighInDate: "2026-08-10"
  }, { userId: "user-john", weighInId: "weigh-in-john" });
  const recipe = await createRecipe({
    name: "Diary recipe",
    servings: 4,
    ingredients: [
      { id: "ingredient-one", foodId: first.id, quantity: 1200, unit: "g" },
      { id: "ingredient-two", foodId: second.id, quantity: 600, unit: "g" }
    ]
  }, { recipeId: "recipe-diary" });
  const entry = await createDiaryEntry({
    userId: user.id,
    date: "2026-08-10",
    meal: "dinner",
    itemType: "recipe",
    recipeId: recipe.id,
    quantity: 1.5
  }, { entryId: "diary-recipe" });
  assert.equal(entry.rawPoints, 9);
  assert.equal(entry.unit, "serving");

  await updateRecipe(recipe.id, {
    name: "Diary recipe",
    servings: 2,
    ingredients: recipe.ingredients
  });
  assert.equal((await getDiaryEntry(entry.id)).rawPoints, 9);
});

test("unreferenced recipes can be deleted but diary references protect them", async () => {
  await resetDatabase();
  const { first } = await setupFoods();
  const recipe = await createRecipe({
    name: "Protected recipe",
    servings: 1,
    ingredients: [{ foodId: first.id, quantity: 100, unit: "g" }]
  }, { recipeId: "recipe-protected", ingredientIdFactory: () => "ingredient-1" });
  await add("diaryEntries", {
    id: "diary-recipe",
    itemType: "recipe",
    itemId: recipe.id,
    userId: "user-test",
    date: "2026-08-10"
  });
  await assert.rejects(deleteRecipe(recipe.id), /cannot be deleted/);

  const disposable = await createRecipe({
    name: "Disposable recipe",
    servings: 1,
    ingredients: [{ foodId: first.id, quantity: 100, unit: "g" }]
  }, { recipeId: "recipe-disposable", ingredientIdFactory: () => "ingredient-2" });
  await deleteRecipe(disposable.id);
  assert.equal(await getRecipe(disposable.id), undefined);
});

test("invalid recipes and unresolved ingredient conversions are rejected", async () => {
  await resetDatabase();
  const { first } = await setupFoods();
  assert.throws(() => calculateRecipe({ servings: 0, ingredients: [] }, [first]), /servings must be greater/);
  assert.throws(() => calculateRecipe({ servings: 1, ingredients: [] }, [first]), /At least one/);
  assert.throws(() => calculateRecipe({
    servings: 1,
    ingredients: [{ foodId: first.id, quantity: 1, unit: "serving", servingId: "missing" }]
  }, [first]), /valid food serving/);
});
