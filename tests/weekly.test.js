import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";

import { resetDatabase } from "../public/js/db.js";
import { calculateWeeklyUsage, createDiaryEntry, getWeeklySummary, shiftLocalDate, weekRange } from "../public/js/diary.js";
import { createFood } from "../public/js/foods.js";
import { createUserWithInitialWeighIn } from "../public/js/users.js";

const weighIns = [{ date: "2026-08-10", dailyBudget: 34 }];

function entry(date, rawPoints) {
  return { date, rawPoints };
}

test("weekly usage separates ordinary points from daily excess", () => {
  const summary = calculateWeeklyUsage({
    entries: [entry("2026-08-10", 40), entry("2026-08-11", 35), entry("2026-08-12", 1)],
    weighIns,
    weeklyAllowance: 49,
    anchorDate: "2026-08-12",
    asOfDate: "2026-08-12"
  });

  assert.equal(summary.ordinaryBudgetAvailable, 238);
  assert.equal(summary.ordinaryPointsConsumed, 69);
  assert.equal(summary.weeklyExtrasConsumed, 7);
  assert.equal(summary.weeklyExtrasRemaining, 42);
  assert.equal(summary.averagePointsPerDay, 76 / 3);
  assert.equal(summary.daysUnderBudget, 1);
  assert.equal(summary.daysOverBudget, 2);
  assert.equal(summary.daysAtBudget, 0);
});

test("Monday and Sunday resolve to the same week", () => {
  assert.deepEqual(weekRange("2026-08-10"), { start: "2026-08-10", end: "2026-08-16" });
  assert.deepEqual(weekRange("2026-08-16"), { start: "2026-08-10", end: "2026-08-16" });
});

test("week boundaries remain correct across month and year changes", () => {
  assert.deepEqual(weekRange("2026-08-31"), { start: "2026-08-31", end: "2026-09-06" });
  assert.deepEqual(weekRange("2027-01-01"), { start: "2026-12-28", end: "2027-01-03" });
  assert.equal(shiftLocalDate("2026-12-28", 7), "2027-01-04");
  assert.equal(shiftLocalDate("2026-03-02", -7), "2026-02-23");
});

test("historical weeks average all seven days while current weeks use elapsed days", () => {
  const entries = [entry("2026-08-10", 14), entry("2026-08-11", 7)];
  const current = calculateWeeklyUsage({
    entries,
    weighIns,
    weeklyAllowance: 49,
    anchorDate: "2026-08-11",
    asOfDate: "2026-08-11"
  });
  const historical = calculateWeeklyUsage({
    entries,
    weighIns,
    weeklyAllowance: 49,
    anchorDate: "2026-08-10",
    asOfDate: "2026-08-16"
  });

  assert.equal(current.averagePointsPerDay, 10.5);
  assert.equal(historical.averagePointsPerDay, 3);
  assert.equal(current.daysUnderBudget, 2);
  assert.equal(historical.daysUnderBudget, 7);
});

test("allowance starts on the first weigh-in when a profile begins midweek", () => {
  const summary = calculateWeeklyUsage({
    entries: [],
    weighIns: [{ date: "2026-08-12", dailyBudget: 30 }],
    weeklyAllowance: 49,
    anchorDate: "2026-08-12",
    asOfDate: "2026-08-16"
  });

  assert.equal(summary.ordinaryBudgetAvailable, 150);
  assert.equal(summary.daysUnderBudget, 5);
  assert.equal(summary.days[0].isActive, false);
  assert.equal(summary.days[2].isActive, true);
});

test("weekly extras reset at the next Monday boundary", async () => {
  await resetDatabase();
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
  const food = await createFood({
    name: "One point food",
    nutritionPer100g: { protein: 10.9375, carbohydrate: 0, fat: 0, fibre: 0 },
    servings: [{ id: "serving-100", description: "portion", grams: 100 }],
    defaultServingId: "serving-100"
  }, { foodId: "food-one-point" });
  await createDiaryEntry({
    userId: user.id,
    date: "2026-08-16",
    meal: "other",
    foodId: food.id,
    grams: 4000
  });

  const sunday = await getWeeklySummary(user.id, "2026-08-16", { asOfDate: "2026-08-16" });
  const monday = await getWeeklySummary(user.id, "2026-08-17", { asOfDate: "2026-08-17" });
  assert.equal(sunday.weeklyExtrasConsumed, 6);
  assert.equal(monday.weeklyExtrasConsumed, 0);
  assert.equal(monday.weeklyExtrasRemaining, 49);
});
