import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";

import {
  BACKUP_FORMAT,
  BACKUP_STORE_NAMES,
  backupFilename,
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  summarizeBackup,
  validateBackup
} from "../public/js/backup.js";
import { add, getAll, resetDatabase } from "../public/js/db.js";
import { createDiaryEntry } from "../public/js/diary.js";
import { createFood } from "../public/js/foods.js";
import { createRecipe } from "../public/js/recipes.js";
import { createUserWithInitialWeighIn } from "../public/js/users.js";

async function createDataset() {
  const { user } = await createUserWithInitialWeighIn({
    name: "Backup User",
    sex: "male",
    dateOfBirth: "1970-01-01",
    heightCm: 180,
    currentWeightKg: 90,
    targetWeightKg: 80,
    dailyMinimum: 26,
    weeklyAllowance: 49,
    weighInDate: "2026-08-10"
  }, { userId: "user-backup", weighInId: "weigh-in-backup", timestamp: "2026-08-10T01:00:00Z" });
  const food = await createFood({
    name: "Backup food",
    nutritionPer100g: { protein: 10, carbohydrate: 20, fat: 5, fibre: 3 },
    servings: [{ id: "serving-backup", description: "portion", grams: 100 }],
    defaultServingId: "serving-backup"
  }, { foodId: "food-backup", timestamp: "2026-08-10T01:00:00Z" });
  await add("foodAliases", { id: "alias-backup", foodId: food.id, alias: "Backup alias", normalizedAlias: "backup alias" });
  const recipe = await createRecipe({
    name: "Backup recipe",
    servings: 2,
    ingredients: [{ id: "ingredient-backup", foodId: food.id, quantity: 100, unit: "g" }]
  }, { recipeId: "recipe-backup", timestamp: "2026-08-10T01:00:00Z" });
  await createDiaryEntry({
    userId: user.id,
    date: "2026-08-10",
    meal: "dinner",
    itemType: "recipe",
    recipeId: recipe.id,
    quantity: 1.5
  }, { entryId: "diary-backup", timestamp: "2026-08-10T01:00:00Z" });
}

test("export, clear, restore reproduces the complete dataset", async () => {
  await resetDatabase();
  await createDataset();
  const backup = await createBackup({ exportedAt: "2026-08-10T02:00:00Z" });
  const originalData = structuredClone(backup.data);
  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backupFilename("2026-08-10"), "points-tracker-backup-2026-08-10.json");

  await resetDatabase();
  await restoreBackup(parseBackup(serializeBackup(backup)));
  const restoredData = Object.fromEntries(await Promise.all(BACKUP_STORE_NAMES.map(async (storeName) => [storeName, await getAll(storeName)])));
  assert.deepEqual(restoredData, originalData);
});

test("backup summary reports each store before confirmation", async () => {
  const backup = await createBackup({ exportedAt: "2026-08-10T02:00:00Z" });
  assert.deepEqual(summarizeBackup(backup), {
    users: 1,
    weighIns: 1,
    foods: 1,
    foodAliases: 1,
    recipes: 1,
    diaryEntries: 1,
    settings: 1
  });
});

test("invalid format, versions, structures, and references are rejected", async () => {
  const backup = await createBackup({ exportedAt: "2026-08-10T02:00:00Z" });
  assert.throws(() => validateBackup({ ...backup, format: "other" }), /not a Points Tracker backup/);
  assert.throws(() => validateBackup({ ...backup, version: 2 }), /not supported/);
  assert.throws(() => validateBackup({ ...backup, data: { ...backup.data, foods: {} } }), /must be an array/);
  const missingFood = structuredClone(backup);
  missingFood.data.foods = [];
  assert.throws(() => validateBackup(missingFood), /missing food/);
  assert.throws(() => parseBackup("not json"), /not valid JSON/);
});

test("failed validation leaves the existing database unchanged", async () => {
  const before = await createBackup({ exportedAt: "2026-08-10T02:00:00Z" });
  const invalid = structuredClone(before);
  invalid.data.users = [];
  await assert.rejects(() => restoreBackup(invalid), /missing user|no weigh-in/);
  const after = await createBackup({ exportedAt: "2026-08-10T03:00:00Z" });
  assert.deepEqual(after.data, before.data);
});
