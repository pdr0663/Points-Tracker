import { getAll, runTransaction } from "./db.js";

export const BACKUP_FORMAT = "points-tracker-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const BACKUP_STORE_NAMES = Object.freeze([
  "users",
  "weighIns",
  "foods",
  "foodAliases",
  "recipes",
  "diaryEntries",
  "settings"
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MEALS = new Set(["breakfast", "lunch", "dinner", "snack", "other"]);
const INGREDIENT_UNITS = new Set(["g", "ml", "each", "serving"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, path) {
  if (!isRecord(value)) throw new TypeError(`${path} must be an object.`);
  return value;
}

function requireString(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be a non-empty string.`);
  return value;
}

function requireNumber(value, path, { positive = false, nonNegative = false } = {}) {
  if (!Number.isFinite(value)) throw new TypeError(`${path} must be a finite number.`);
  if (positive && value <= 0) throw new RangeError(`${path} must be greater than zero.`);
  if (nonNegative && value < 0) throw new RangeError(`${path} must be at least zero.`);
  return value;
}

function requireDate(value, path) {
  requireString(value, path);
  if (!DATE_PATTERN.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${path} must be a valid YYYY-MM-DD date.`);
  }
}

function validateUnique(records, key, path) {
  const seen = new Set();
  records.forEach((record, index) => {
    const value = typeof key === "function" ? key(record) : record[key];
    requireString(value, `${path}[${index}].${typeof key === "string" ? key : "key"}`);
    if (seen.has(value)) throw new RangeError(`${path} contains duplicate key ${value}.`);
    seen.add(value);
  });
}

function validateUser(user, index) {
  const path = `data.users[${index}]`;
  requireRecord(user, path);
  requireString(user.id, `${path}.id`);
  requireString(user.name, `${path}.name`);
  if (!new Set(["male", "female"]).has(user.sex)) throw new RangeError(`${path}.sex is not supported.`);
  requireDate(user.dateOfBirth, `${path}.dateOfBirth`);
  requireNumber(user.heightCm, `${path}.heightCm`, { positive: true });
  requireNumber(user.targetWeightKg, `${path}.targetWeightKg`, { positive: true });
  requireNumber(user.startWeightKg, `${path}.startWeightKg`, { positive: true });
  requireNumber(user.dailyMinimum, `${path}.dailyMinimum`, { nonNegative: true });
  requireNumber(user.weeklyAllowance, `${path}.weeklyAllowance`, { nonNegative: true });
}

function validateWeighIn(weighIn, index) {
  const path = `data.weighIns[${index}]`;
  requireRecord(weighIn, path);
  requireString(weighIn.id, `${path}.id`);
  requireString(weighIn.userId, `${path}.userId`);
  requireDate(weighIn.date, `${path}.date`);
  requireNumber(weighIn.weightKg, `${path}.weightKg`, { positive: true });
  requireNumber(weighIn.dailyBudget, `${path}.dailyBudget`, { nonNegative: true });
}

function validateFood(food, index) {
  const path = `data.foods[${index}]`;
  requireRecord(food, path);
  requireString(food.id, `${path}.id`);
  requireString(food.name, `${path}.name`);
  const nutrition = requireRecord(food.nutritionPer100g, `${path}.nutritionPer100g`);
  ["protein", "carbohydrate", "fat", "fibre"].forEach((name) => requireNumber(nutrition[name], `${path}.nutritionPer100g.${name}`, { nonNegative: true }));
  if (!Array.isArray(food.servings) || !food.servings.length) throw new TypeError(`${path}.servings must be a non-empty array.`);
  validateUnique(food.servings, "id", `${path}.servings`);
  food.servings.forEach((serving, servingIndex) => {
    const servingPath = `${path}.servings[${servingIndex}]`;
    requireRecord(serving, servingPath);
    requireString(serving.id, `${servingPath}.id`);
    requireString(serving.description, `${servingPath}.description`);
    requireNumber(serving.grams, `${servingPath}.grams`, { positive: true });
  });
  requireString(food.defaultServingId, `${path}.defaultServingId`);
  if (!food.servings.some((serving) => serving.id === food.defaultServingId)) throw new RangeError(`${path}.defaultServingId does not reference a serving.`);
}

function validateRecipe(recipe, index) {
  const path = `data.recipes[${index}]`;
  requireRecord(recipe, path);
  requireString(recipe.id, `${path}.id`);
  requireString(recipe.name, `${path}.name`);
  requireNumber(recipe.servings, `${path}.servings`, { positive: true });
  requireNumber(recipe.rawTotalPoints, `${path}.rawTotalPoints`, { nonNegative: true });
  requireNumber(recipe.rawPointsPerServing, `${path}.rawPointsPerServing`, { nonNegative: true });
  if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length) throw new TypeError(`${path}.ingredients must be a non-empty array.`);
  validateUnique(recipe.ingredients, "id", `${path}.ingredients`);
  recipe.ingredients.forEach((ingredient, ingredientIndex) => {
    const ingredientPath = `${path}.ingredients[${ingredientIndex}]`;
    requireRecord(ingredient, ingredientPath);
    requireString(ingredient.id, `${ingredientPath}.id`);
    requireString(ingredient.foodId, `${ingredientPath}.foodId`);
    requireNumber(ingredient.quantity, `${ingredientPath}.quantity`, { positive: true });
    if (!INGREDIENT_UNITS.has(ingredient.unit)) throw new RangeError(`${ingredientPath}.unit is not supported.`);
    requireNumber(ingredient.grams, `${ingredientPath}.grams`, { positive: true });
    requireNumber(ingredient.rawPoints, `${ingredientPath}.rawPoints`, { nonNegative: true });
  });
}

function validateDiaryEntry(entry, index) {
  const path = `data.diaryEntries[${index}]`;
  requireRecord(entry, path);
  requireString(entry.id, `${path}.id`);
  requireString(entry.userId, `${path}.userId`);
  requireDate(entry.date, `${path}.date`);
  if (!MEALS.has(entry.meal)) throw new RangeError(`${path}.meal is not supported.`);
  if (!new Set(["food", "recipe"]).has(entry.itemType)) throw new RangeError(`${path}.itemType is not supported.`);
  requireString(entry.itemId, `${path}.itemId`);
  requireString(entry.description, `${path}.description`);
  requireNumber(entry.quantity, `${path}.quantity`, { positive: true });
  requireNumber(entry.rawPoints, `${path}.rawPoints`, { nonNegative: true });
  requireNumber(entry.displayPoints, `${path}.displayPoints`, { nonNegative: true });
}

function validateAlias(alias, index) {
  const path = `data.foodAliases[${index}]`;
  requireRecord(alias, path);
  requireString(alias.id, `${path}.id`);
  requireString(alias.foodId, `${path}.foodId`);
  if (alias.alias !== undefined) requireString(alias.alias, `${path}.alias`);
  if (alias.normalizedAlias !== undefined) requireString(alias.normalizedAlias, `${path}.normalizedAlias`);
}

function validateReferences(data) {
  const userIds = new Set(data.users.map((user) => user.id));
  const foodIds = new Set(data.foods.map((food) => food.id));
  const recipeIds = new Set(data.recipes.map((recipe) => recipe.id));
  data.weighIns.forEach((weighIn) => {
    if (!userIds.has(weighIn.userId)) throw new RangeError(`Weigh-in ${weighIn.id} references a missing user.`);
  });
  data.users.forEach((user) => {
    if (!data.weighIns.some((weighIn) => weighIn.userId === user.id)) throw new RangeError(`User ${user.id} has no weigh-in.`);
  });
  data.foodAliases.forEach((alias) => {
    if (!foodIds.has(alias.foodId)) throw new RangeError(`Food alias ${alias.id} references a missing food.`);
  });
  data.recipes.forEach((recipe) => recipe.ingredients.forEach((ingredient) => {
    if (!foodIds.has(ingredient.foodId)) throw new RangeError(`Recipe ${recipe.id} references a missing food.`);
  }));
  data.diaryEntries.forEach((entry) => {
    if (!userIds.has(entry.userId)) throw new RangeError(`Diary entry ${entry.id} references a missing user.`);
    const itemExists = entry.itemType === "food" ? foodIds.has(entry.itemId) : recipeIds.has(entry.itemId);
    if (!itemExists) throw new RangeError(`Diary entry ${entry.id} references a missing ${entry.itemType}.`);
  });
  const selectedUser = data.settings.find((setting) => setting.key === "currentUserId")?.value;
  if (selectedUser !== undefined && !userIds.has(selectedUser)) throw new RangeError("The selected user setting references a missing user.");
}

export function validateBackup(backup) {
  requireRecord(backup, "backup");
  if (backup.format !== BACKUP_FORMAT) throw new RangeError("This is not a Points Tracker backup.");
  if (backup.version !== BACKUP_VERSION) throw new RangeError(`Backup version ${backup.version} is not supported.`);
  if (typeof backup.exportedAt !== "string" || Number.isNaN(Date.parse(backup.exportedAt))) throw new RangeError("backup.exportedAt must be a valid timestamp.");
  const data = requireRecord(backup.data, "backup.data");
  const dataKeys = Object.keys(data).sort();
  const expectedKeys = [...BACKUP_STORE_NAMES].sort();
  if (JSON.stringify(dataKeys) !== JSON.stringify(expectedKeys)) throw new RangeError("Backup data stores do not match this application version.");
  BACKUP_STORE_NAMES.forEach((storeName) => {
    if (!Array.isArray(data[storeName])) throw new TypeError(`data.${storeName} must be an array.`);
    if (data[storeName].length > 100000) throw new RangeError(`data.${storeName} contains too many records.`);
  });
  data.users.forEach(validateUser);
  data.weighIns.forEach(validateWeighIn);
  data.foods.forEach(validateFood);
  data.foodAliases.forEach(validateAlias);
  data.recipes.forEach(validateRecipe);
  data.diaryEntries.forEach(validateDiaryEntry);
  data.settings.forEach((setting, index) => {
    requireRecord(setting, `data.settings[${index}]`);
    requireString(setting.key, `data.settings[${index}].key`);
  });
  BACKUP_STORE_NAMES.forEach((storeName) => validateUnique(data[storeName], storeName === "settings" ? "key" : "id", `data.${storeName}`));
  validateUnique(data.weighIns, (weighIn) => `${weighIn.userId}\u0000${weighIn.date}`, "data.weighIns by user and date");
  validateReferences(data);
  return backup;
}

export function parseBackup(text) {
  if (typeof text !== "string") throw new TypeError("Backup content must be text.");
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new RangeError("Backup file is larger than 10 MB.");
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new SyntaxError("Backup file is not valid JSON.");
  }
  return validateBackup(backup);
}

export async function createBackup(options = {}) {
  const data = Object.fromEntries(await Promise.all(BACKUP_STORE_NAMES.map(async (storeName) => [storeName, await getAll(storeName)])));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    data: JSON.parse(JSON.stringify(data))
  };
}

export function serializeBackup(backup) {
  validateBackup(backup);
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function backupFilename(date) {
  requireDate(date, "date");
  return `points-tracker-backup-${date}.json`;
}

export function summarizeBackup(backup) {
  validateBackup(backup);
  return Object.fromEntries(BACKUP_STORE_NAMES.map((storeName) => [storeName, backup.data[storeName].length]));
}

export async function restoreBackup(backup) {
  validateBackup(backup);
  await runTransaction(BACKUP_STORE_NAMES, "readwrite", (stores) => {
    BACKUP_STORE_NAMES.forEach((storeName) => stores[storeName].clear());
    BACKUP_STORE_NAMES.forEach((storeName) => backup.data[storeName].forEach((record) => stores[storeName].put(record)));
  });
}
