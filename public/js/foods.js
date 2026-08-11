import { add, get, getAll, put, queryIndex, runTransaction } from "./db.js";
import { calculateRawPoints } from "./points.js";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function createId(prefix) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required.`);
  }
  return value.trim().replace(/\s+/g, " ");
}

function optionalText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function requireNumber(value, name, { exclusiveMinimum = false } = {}) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a number.`);
  }
  if (exclusiveMinimum ? value <= 0 : value < 0) {
    throw new RangeError(`${name} must be ${exclusiveMinimum ? "greater than zero" : "at least zero"}.`);
  }
  return value;
}

function requireBoolean(value, name) {
  if (typeof value !== "boolean") throw new TypeError(`${name} must be true or false.`);
  return value;
}

function normalizeSource(source) {
  if (typeof source === "string") return source;
  if (source === undefined || source === null) {
    return { kind: "manual", referenceId: null, referenceRelease: null };
  }
  if (typeof source !== "object" || Array.isArray(source)) throw new TypeError("source must be an object.");
  if (!["manual", "afcd", "external-json"].includes(source.kind)) throw new RangeError("source kind is not supported.");
  if (source.kind === "afcd") {
    return {
      kind: "afcd",
      referenceId: requireText(source.referenceId, "AFCD reference ID"),
      referenceRelease: requireText(source.referenceRelease, "AFCD reference release")
    };
  }
  return { kind: source.kind, referenceId: null, referenceRelease: null };
}

export function normalizeFoodName(name) {
  if (typeof name !== "string") return "";
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("en-AU")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeServings(input, servingIdFactory) {
  const source = Array.isArray(input.servings)
    ? input.servings
    : input.defaultServing
      ? [input.defaultServing]
      : [];

  if (!source.length) {
    throw new TypeError("At least one serving is required.");
  }

  const servings = source.map((serving, index) => ({
    id: serving.id || servingIdFactory(index),
    description: requireText(serving.description, `serving ${index + 1} description`),
    grams: requireNumber(serving.grams, `serving ${index + 1} grams`, { exclusiveMinimum: true })
  }));
  const defaultServingId = input.defaultServingId
    ?? source.find((serving) => serving.isDefault)?.id
    ?? servings[0].id;
  const defaultServing = servings.find((serving) => serving.id === defaultServingId);

  if (!defaultServing) {
    throw new RangeError("The default serving must be one of this food's servings.");
  }

  return { servings, defaultServingId, defaultServing };
}

function validateFood(input, servingIdFactory) {
  const name = requireText(input.name, "name");
  const brand = optionalText(input.brand);
  const nutrition = input.nutritionPer100g ?? {};
  const nutritionPer100g = {
    protein: requireNumber(nutrition.protein, "protein"),
    carbohydrate: requireNumber(nutrition.carbohydrate, "carbohydrate"),
    fat: requireNumber(nutrition.fat, "fat"),
    fibre: requireNumber(nutrition.fibre, "fibre")
  };
  const servingData = normalizeServings(input, servingIdFactory);

  return {
    name,
    normalizedName: normalizeFoodName(name),
    brand,
    normalizedBrand: normalizeFoodName(brand),
    nutritionPer100g,
    isZeroPoint: requireBoolean(input.isZeroPoint ?? false, "isZeroPoint"),
    ...servingData
  };
}

export function buildFood(input, options = {}) {
  const servingIdFactory = options.servingIdFactory ?? ((index) => createId(`serving-${index + 1}`));
  const validated = validateFood(input, servingIdFactory);
  const timestamp = options.timestamp ?? new Date().toISOString();
  return {
    id: options.foodId ?? createId("food"),
    type: "food",
    ...validated,
    source: normalizeSource(input.source),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function foodPointsPer100g(food) {
  return calculateRawPoints({ ...food.nutritionPer100g, isZeroPoint: food.isZeroPoint ?? false });
}

export function foodPointsForGrams(food, grams) {
  return foodPointsPer100g(food) * requireNumber(grams, "grams") / 100;
}

export function foodPointsForDefaultServing(food) {
  return foodPointsForGrams(food, food.defaultServing.grams);
}

export async function createFood(input, options = {}) {
  const food = buildFood(input, options);
  await add("foods", food);
  return food;
}

export async function updateFood(foodId, input, options = {}) {
  const existing = await get("foods", foodId);
  if (!existing) {
    throw new RangeError("Cannot update a food that does not exist.");
  }

  const servingIdFactory = options.servingIdFactory ?? ((index) => createId(`serving-${index + 1}`));
  const validated = validateFood(input, servingIdFactory);
  const food = {
    ...existing,
    ...validated,
    source: input.source === undefined ? existing.source : normalizeSource(input.source),
    updatedAt: options.timestamp ?? new Date().toISOString()
  };

  await put("foods", food);
  return food;
}

export async function getFood(foodId) {
  return get("foods", foodId);
}

export async function listFoods() {
  const foods = await getAll("foods");
  return foods.sort((left, right) =>
    (left.normalizedName ?? normalizeFoodName(left.name)).localeCompare(right.normalizedName ?? normalizeFoodName(right.name))
    || (left.normalizedBrand ?? normalizeFoodName(left.brand)).localeCompare(right.normalizedBrand ?? normalizeFoodName(right.brand))
  );
}

export async function listFoodAliases() {
  return getAll("foodAliases");
}

export async function searchFoods(query) {
  const normalizedQuery = normalizeFoodName(query);
  const foods = await listFoods();
  if (!normalizedQuery) return foods;
  return foods.filter((food) =>
    (food.normalizedName ?? normalizeFoodName(food.name)).includes(normalizedQuery)
    || (food.normalizedBrand ?? normalizeFoodName(food.brand)).includes(normalizedQuery)
  );
}

export async function findFoodBySource(kind, referenceId) {
  if (typeof kind !== "string" || typeof referenceId !== "string") return undefined;
  const matches = await queryIndex("foods", "sourceReference", [kind, referenceId]);
  return matches[0];
}

function recipeReferencesFood(recipe, foodId) {
  return Array.isArray(recipe.ingredients)
    && recipe.ingredients.some((ingredient) => ingredient.foodId === foodId || ingredient.itemId === foodId);
}

export async function deleteFood(foodId) {
  const existing = await get("foods", foodId);
  if (!existing) {
    throw new RangeError("Cannot delete a food that does not exist.");
  }

  await runTransaction(["foods", "foodAliases", "diaryEntries", "recipes"], "readwrite", async (stores) => {
    const [diaryEntries, recipes, aliases] = await Promise.all([
      requestResult(stores.diaryEntries.getAll()),
      requestResult(stores.recipes.getAll()),
      requestResult(stores.foodAliases.index("foodId").getAll(foodId))
    ]);
    const diaryReference = diaryEntries.some((entry) => entry.foodId === foodId || entry.itemId === foodId);
    const recipeReference = recipes.some((recipe) => recipeReferencesFood(recipe, foodId));

    if (diaryReference || recipeReference) {
      throw new RangeError("This food is used by a diary entry or recipe and cannot be deleted.");
    }

    await Promise.all([
      ...aliases.map((alias) => requestResult(stores.foodAliases.delete(alias.id))),
      requestResult(stores.foods.delete(foodId))
    ]);
  });
}
