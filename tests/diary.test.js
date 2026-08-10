import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";

import { resetDatabase } from "../public/js/db.js";
import {
  createDiaryEntry,
  dailyBudgetForDate,
  deleteDiaryEntry,
  duplicateDiaryEntry,
  getDiaryEntry,
  getDiarySummary,
  listDiaryEntries,
  summarizeDay,
  updateDiaryEntry,
  weekRange
} from "../public/js/diary.js";
import { createFood, updateFood } from "../public/js/foods.js";
import { createUserWithInitialWeighIn } from "../public/js/users.js";

const profile = {
  name: "John",
  sex: "male",
  dateOfBirth: "1956-01-01",
  heightCm: 180,
  currentWeightKg: 91.8,
  targetWeightKg: 84,
  dailyMinimum: 26,
  weeklyAllowance: 49,
  weighInDate: "2026-08-10"
};

const onePointFood = {
  name: "Test food",
  brand: "Test Brand",
  nutritionPer100g: {
    protein: 10.9375,
    carbohydrate: 0,
    fat: 0,
    fibre: 0
  },
  servings: [
    { id: "serving-100g", description: "1 portion", grams: 100 },
    { id: "serving-50g", description: "half portion", grams: 50 }
  ],
  defaultServingId: "serving-100g"
};

async function setup() {
  const { user } = await createUserWithInitialWeighIn(profile, {
    userId: "user-john",
    weighInId: "weigh-in-john"
  });
  const food = await createFood(onePointFood, { foodId: "food-test" });
  return { user, food };
}

test("diary entries snapshot food, serving, quantity, and points", async () => {
  await resetDatabase();
  const { user, food } = await setup();
  const entry = await createDiaryEntry({
    userId: user.id,
    date: "2026-08-10",
    meal: "breakfast",
    foodId: food.id,
    servingId: "serving-50g",
    quantity: 3
  }, { entryId: "diary-1", timestamp: "2026-08-10T08:00:00Z" });

  assert.equal(entry.description, "Test food · Test Brand");
  assert.equal(entry.grams, 150);
  assert.equal(entry.rawPoints, 1.5);
  assert.equal(entry.displayPoints, 2);
  assert.deepEqual(await listDiaryEntries(user.id, "2026-08-10"), [entry]);

  await updateFood(food.id, {
    ...onePointFood,
    nutritionPer100g: { ...onePointFood.nutritionPer100g, protein: 21.875 }
  });
  assert.equal((await getDiaryEntry(entry.id)).rawPoints, 1.5);
});

test("entries can be edited, duplicated without recalculation, and deleted", async () => {
  await resetDatabase();
  const { user, food } = await setup();
  const original = await createDiaryEntry({
    userId: user.id,
    date: "2026-08-10",
    meal: "lunch",
    foodId: food.id,
    grams: 200
  }, { entryId: "diary-original", timestamp: "2026-08-10T12:00:00Z" });
  const edited = await updateDiaryEntry(original.id, {
    userId: user.id,
    date: "2026-08-10",
    meal: "dinner",
    foodId: food.id,
    grams: 300
  }, { timestamp: "2026-08-10T18:00:00Z" });
  assert.equal(edited.rawPoints, 3);
  assert.equal(edited.createdAt, original.createdAt);

  await updateFood(food.id, {
    ...onePointFood,
    nutritionPer100g: { ...onePointFood.nutritionPer100g, protein: 21.875 }
  });
  const duplicate = await duplicateDiaryEntry(edited.id, { meal: "snack" }, {
    entryId: "diary-copy",
    timestamp: "2026-08-10T19:00:00Z"
  });
  assert.equal(duplicate.rawPoints, 3);
  assert.equal(duplicate.meal, "snack");

  await deleteDiaryEntry(edited.id);
  assert.equal(await getDiaryEntry(edited.id), undefined);
  assert.deepEqual(await listDiaryEntries(user.id, "2026-08-10"), [duplicate]);
});

test("daily summaries retain negative remaining points and calculate excess", () => {
  assert.deepEqual(summarizeDay([{ rawPoints: 20 }, { rawPoints: 17.5 }], 34), {
    dailyBudget: 34,
    usedPoints: 37.5,
    remainingPoints: -3.5,
    dailyExcess: 3.5
  });
});

test("weekly extras sum daily excess without rolling unused points forward", async () => {
  await resetDatabase();
  const { user, food } = await setup();
  await createDiaryEntry({ userId: user.id, date: "2026-08-10", meal: "other", foodId: food.id, grams: 4000 });
  await createDiaryEntry({ userId: user.id, date: "2026-08-11", meal: "other", foodId: food.id, grams: 3500 });
  await createDiaryEntry({ userId: user.id, date: "2026-08-12", meal: "other", foodId: food.id, grams: 100 });

  const summary = await getDiarySummary(user.id, "2026-08-10");
  assert.equal(summary.dailyBudget, 34);
  assert.equal(summary.usedPoints, 40);
  assert.equal(summary.remainingPoints, -6);
  assert.equal(summary.weeklyExtrasUsed, 7);
  assert.equal(summary.weeklyExtrasRemaining, 42);
});

test("diaries are isolated by user while foods remain shared", async () => {
  await resetDatabase();
  const { user, food } = await setup();
  const { user: secondUser } = await createUserWithInitialWeighIn({ ...profile, name: "Jane" }, {
    userId: "user-jane",
    weighInId: "weigh-in-jane"
  });
  await createDiaryEntry({ userId: user.id, date: "2026-08-10", meal: "breakfast", foodId: food.id, grams: 100 });

  assert.equal((await listDiaryEntries(user.id, "2026-08-10")).length, 1);
  assert.equal((await listDiaryEntries(secondUser.id, "2026-08-10")).length, 0);
});

test("Monday-Sunday week ranges and historical budgets are deterministic", () => {
  assert.deepEqual(weekRange("2026-08-10"), { start: "2026-08-10", end: "2026-08-16" });
  assert.deepEqual(weekRange("2026-08-16"), { start: "2026-08-10", end: "2026-08-16" });
  assert.deepEqual(weekRange("2026-08-17"), { start: "2026-08-17", end: "2026-08-23" });
  assert.equal(dailyBudgetForDate([
    { date: "2026-08-01", dailyBudget: 35 },
    { date: "2026-08-12", dailyBudget: 32 }
  ], "2026-08-11"), 35);
  assert.equal(dailyBudgetForDate([
    { date: "2026-08-01", dailyBudget: 35 },
    { date: "2026-08-12", dailyBudget: 32 }
  ], "2026-08-12"), 32);
});

test("invalid meals, dates, and quantities are rejected", async () => {
  await resetDatabase();
  const { user, food } = await setup();
  await assert.rejects(
    createDiaryEntry({ userId: user.id, date: "2026-08-10", meal: "brunch", foodId: food.id, grams: 100 }),
    /meal must be one of/
  );
  await assert.rejects(
    createDiaryEntry({ userId: user.id, date: "2026-02-30", meal: "other", foodId: food.id, grams: 100 }),
    /valid calendar date/
  );
  await assert.rejects(
    createDiaryEntry({ userId: user.id, date: "2026-08-10", meal: "other", foodId: food.id, grams: 0 }),
    /greater than zero/
  );
});
