import { add, get, queryIndex, put, remove } from "./db.js";
import { foodPointsForGrams } from "./foods.js";
import { roundProPoints } from "./points.js";
import { listWeighIns } from "./users.js";

export const MEALS = Object.freeze(["breakfast", "lunch", "dinner", "snack", "other"]);

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

export async function getDiarySummary(userId, date) {
  const user = await get("users", userId);
  if (!user) throw new RangeError("Cannot summarize a user that does not exist.");
  const weighIns = await listWeighIns(userId);
  const dailyBudget = dailyBudgetForDate(weighIns, date);
  const entries = await listDiaryEntries(userId, date);
  const range = weekRange(date);
  const userEntries = await queryIndex("diaryEntries", "userId", userId);
  const weeklyEntries = userEntries.filter((entry) => entry.date >= range.start && entry.date <= range.end);
  const entriesByDate = new Map();
  weeklyEntries.forEach((entry) => {
    const dateEntries = entriesByDate.get(entry.date) ?? [];
    dateEntries.push(entry);
    entriesByDate.set(entry.date, dateEntries);
  });
  let weeklyExtrasUsed = 0;
  for (const [entryDate, dateEntries] of entriesByDate) {
    const budget = dailyBudgetForDate(weighIns, entryDate);
    weeklyExtrasUsed += summarizeDay(dateEntries, budget).dailyExcess;
  }

  return {
    date,
    entries,
    mealTotals: Object.fromEntries(MEALS.map((meal) => [
      meal,
      sumRawPoints(entries.filter((entry) => entry.meal === meal))
    ])),
    ...summarizeDay(entries, dailyBudget),
    weekStart: range.start,
    weekEnd: range.end,
    weeklyExtrasUsed,
    weeklyExtrasRemaining: user.weeklyAllowance - weeklyExtrasUsed
  };
}
