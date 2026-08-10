import { add, get, queryIndex, put, remove } from "./db.js";
import { foodPointsForGrams } from "./foods.js";
import { roundProPoints } from "./points.js";
import { listWeighIns } from "./users.js";

export const MEALS = Object.freeze(["breakfast", "lunch", "dinner", "snack", "other"]);
const POINT_EPSILON = 1e-9;

function createId(prefix) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required.`);
  }
  return value.trim();
}

function requirePositiveNumber(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a number.`);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero.`);
  return value;
}

function parseDate(value, name = "date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${name} must use YYYY-MM-DD format.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError(`${name} must be a valid calendar date.`);
  }
  return date;
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

export function shiftLocalDate(date, days) {
  const parsed = parseDate(date);
  if (!Number.isInteger(days)) throw new TypeError("days must be an integer.");
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return dateString(parsed);
}

function requireMeal(meal) {
  if (!MEALS.includes(meal)) {
    throw new RangeError(`meal must be one of: ${MEALS.join(", ")}.`);
  }
  return meal;
}

function resolveQuantity(food, input) {
  if (input.servingId) {
    const serving = food.servings?.find((candidate) => candidate.id === input.servingId);
    if (!serving) throw new RangeError("The selected serving does not exist for this food.");
    const quantity = requirePositiveNumber(input.quantity, "quantity");
    return {
      quantity,
      unit: serving.description,
      servingId: serving.id,
      grams: serving.grams * quantity
    };
  }

  const grams = requirePositiveNumber(input.grams, "grams");
  return { quantity: grams, unit: "g", servingId: undefined, grams };
}

async function buildEntry(input, existing, options) {
  const user = await get("users", input.userId);
  if (!user) throw new RangeError("Cannot add a diary entry for a user that does not exist.");

  const food = await get("foods", input.foodId);
  if (!food) throw new RangeError("Cannot add a diary entry for a food that does not exist.");

  const date = requireText(input.date, "date");
  parseDate(date);
  const meal = requireMeal(input.meal);
  const quantity = resolveQuantity(food, input);
  const rawPoints = foodPointsForGrams(food, quantity.grams);
  const timestamp = options.timestamp ?? new Date().toISOString();

  return {
    id: existing?.id ?? options.entryId ?? createId("diary"),
    userId: user.id,
    date,
    meal,
    itemType: "food",
    itemId: food.id,
    foodId: food.id,
    description: food.brand ? `${food.name} · ${food.brand}` : food.name,
    ...quantity,
    rawPoints,
    displayPoints: roundProPoints(rawPoints),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

export async function createDiaryEntry(input, options = {}) {
  const entry = await buildEntry(input, undefined, options);
  await add("diaryEntries", entry);
  return entry;
}

export async function updateDiaryEntry(entryId, input, options = {}) {
  const existing = await get("diaryEntries", entryId);
  if (!existing) throw new RangeError("Cannot update a diary entry that does not exist.");
  const entry = await buildEntry(input, existing, options);
  await put("diaryEntries", entry);
  return entry;
}

export async function duplicateDiaryEntry(entryId, overrides = {}, options = {}) {
  const existing = await get("diaryEntries", entryId);
  if (!existing) throw new RangeError("Cannot duplicate a diary entry that does not exist.");
  const timestamp = options.timestamp ?? new Date().toISOString();
  const duplicate = {
    ...existing,
    id: options.entryId ?? createId("diary"),
    date: overrides.date ?? existing.date,
    meal: overrides.meal ? requireMeal(overrides.meal) : existing.meal,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  parseDate(duplicate.date);
  await add("diaryEntries", duplicate);
  return duplicate;
}

export async function deleteDiaryEntry(entryId) {
  const existing = await get("diaryEntries", entryId);
  if (!existing) throw new RangeError("Cannot delete a diary entry that does not exist.");
  await remove("diaryEntries", entryId);
}

export async function getDiaryEntry(entryId) {
  return get("diaryEntries", entryId);
}

export async function listDiaryEntries(userId, date) {
  parseDate(date);
  const entries = await queryIndex("diaryEntries", "userIdDate", [userId, date]);
  return entries.sort((left, right) =>
    MEALS.indexOf(left.meal) - MEALS.indexOf(right.meal)
    || left.createdAt.localeCompare(right.createdAt)
  );
}

export function weekRange(date) {
  const parsed = parseDate(date);
  const day = parsed.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(parsed);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: dateString(start), end: dateString(end) };
}

export function dailyBudgetForDate(weighIns, date) {
  parseDate(date);
  const applicable = [...weighIns]
    .filter((weighIn) => weighIn.date <= date)
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1);
  if (!applicable) throw new RangeError("No weigh-in budget exists on or before this date.");
  return applicable.dailyBudget;
}

export function summarizeDay(entries, dailyBudget) {
  const usedPoints = sumRawPoints(entries);
  return {
    dailyBudget,
    usedPoints,
    remainingPoints: dailyBudget - usedPoints,
    dailyExcess: Math.max(0, usedPoints - dailyBudget)
  };
}

export function sumRawPoints(entries) {
  return entries.reduce((total, entry) => total + entry.rawPoints, 0);
}

function datesInRange(start, end) {
  const dates = [];
  const cursor = parseDate(start, "start");
  const finalDate = parseDate(end, "end");
  while (cursor <= finalDate) {
    dates.push(dateString(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function calculateWeeklyUsage({ entries, weighIns, weeklyAllowance, anchorDate, asOfDate = anchorDate }) {
  if (!Number.isFinite(weeklyAllowance) || weeklyAllowance < 0) {
    throw new RangeError("weeklyAllowance must be at least zero.");
  }
  parseDate(asOfDate, "asOfDate");
  const range = weekRange(anchorDate);
  const weekDates = datesInRange(range.start, range.end);
  const firstBudgetDate = [...weighIns].sort((left, right) => left.date.localeCompare(right.date))[0]?.date;
  const effectiveAsOfDate = asOfDate < range.start
    ? range.start
    : asOfDate > range.end
      ? range.end
      : asOfDate;

  const days = weekDates.map((date) => {
    const dateEntries = entries.filter((entry) => entry.date === date);
    const usedPoints = sumRawPoints(dateEntries);
    const hasBudget = Boolean(firstBudgetDate && date >= firstBudgetDate);
    const dailyBudget = hasBudget ? dailyBudgetForDate(weighIns, date) : 0;
    const budgetDifference = usedPoints - dailyBudget;
    const budgetStatus = !hasBudget
      ? "inactive"
      : budgetDifference > POINT_EPSILON
        ? "over"
        : budgetDifference < -POINT_EPSILON
          ? "under"
          : "at";
    return {
      date,
      dailyBudget,
      usedPoints,
      ordinaryPointsConsumed: Math.min(usedPoints, dailyBudget),
      weeklyExtrasConsumed: budgetDifference > POINT_EPSILON ? budgetDifference : 0,
      remainingPoints: dailyBudget - usedPoints,
      budgetStatus,
      isActive: hasBudget,
      isElapsed: hasBudget && date <= effectiveAsOfDate,
      entryCount: dateEntries.length
    };
  });
  const activeDays = days.filter((day) => day.isActive);
  const elapsedDays = days.filter((day) => day.isElapsed);
  const ordinaryBudgetAvailable = activeDays.reduce((total, day) => total + day.dailyBudget, 0);
  const ordinaryPointsConsumed = activeDays.reduce((total, day) => total + day.ordinaryPointsConsumed, 0);
  const weeklyExtrasConsumed = activeDays.reduce((total, day) => total + day.weeklyExtrasConsumed, 0);
  const elapsedPoints = elapsedDays.reduce((total, day) => total + day.usedPoints, 0);

  return {
    weekStart: range.start,
    weekEnd: range.end,
    asOfDate: effectiveAsOfDate,
    ordinaryBudgetAvailable,
    ordinaryPointsConsumed,
    weeklyExtrasConsumed,
    weeklyExtrasRemaining: weeklyAllowance - weeklyExtrasConsumed,
    averagePointsPerDay: elapsedDays.length ? elapsedPoints / elapsedDays.length : 0,
    daysUnderBudget: elapsedDays.filter((day) => day.budgetStatus === "under").length,
    daysOverBudget: elapsedDays.filter((day) => day.budgetStatus === "over").length,
    daysAtBudget: elapsedDays.filter((day) => day.budgetStatus === "at").length,
    days
  };
}

export async function getWeeklySummary(userId, anchorDate, options = {}) {
  const user = await get("users", userId);
  if (!user) throw new RangeError("Cannot summarize a user that does not exist.");
  const weighIns = await listWeighIns(userId);
  const range = weekRange(anchorDate);
  const userEntries = await queryIndex("diaryEntries", "userId", userId);
  const entries = userEntries.filter((entry) => entry.date >= range.start && entry.date <= range.end);
  return calculateWeeklyUsage({
    entries,
    weighIns,
    weeklyAllowance: user.weeklyAllowance,
    anchorDate,
    asOfDate: options.asOfDate ?? anchorDate
  });
}

export async function getDiarySummary(userId, date) {
  const user = await get("users", userId);
  if (!user) throw new RangeError("Cannot summarize a user that does not exist.");
  const weighIns = await listWeighIns(userId);
  const dailyBudget = dailyBudgetForDate(weighIns, date);
  const entries = await listDiaryEntries(userId, date);
  const userEntries = await queryIndex("diaryEntries", "userId", userId);
  const weekly = calculateWeeklyUsage({
    entries: userEntries,
    weighIns,
    weeklyAllowance: user.weeklyAllowance,
    anchorDate: date,
    asOfDate: date
  });

  return {
    date,
    entries,
    mealTotals: Object.fromEntries(MEALS.map((meal) => [
      meal,
      sumRawPoints(entries.filter((entry) => entry.meal === meal))
    ])),
    ...summarizeDay(entries, dailyBudget),
    weekStart: weekly.weekStart,
    weekEnd: weekly.weekEnd,
    weeklyExtrasUsed: weekly.weeklyExtrasConsumed,
    weeklyExtrasRemaining: weekly.weeklyExtrasRemaining
  };
}
