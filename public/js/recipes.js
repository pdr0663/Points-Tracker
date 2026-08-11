import { add, get, getAll, put, queryIndex, remove } from "./db.js";
import { foodPointsForGrams, normalizeFoodName } from "./foods.js";

export const DEFAULT_GRAMS_PER_MILLILITRE = 1;
const SUPPORTED_UNITS = new Set(["g", "ml", "each", "serving"]);

function createId(prefix) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required.`);
  return value.trim().replace(/\s+/g, " ");
}

function requirePositiveNumber(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a number.`);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero.`);
  return value;
}

function normalizeIngredient(ingredient, index, food, options) {
  if (!food) throw new RangeError(`ingredient ${index + 1} references a food that does not exist.`);
  if (!SUPPORTED_UNITS.has(ingredient.unit)) {
    throw new RangeError("ingredient unit must be g, ml, each, or serving.");
  }
  const quantity = requirePositiveNumber(ingredient.quantity, `ingredient ${index + 1} quantity`);
  let grams;
  let servingId;
  let unitDescription;

  if (ingredient.unit === "g") {
    grams = quantity;
    unitDescription = "g";
  } else if (ingredient.unit === "ml") {
    const gramsPerMillilitre = requirePositiveNumber(
      options.gramsPerMillilitre ?? DEFAULT_GRAMS_PER_MILLILITRE,
      "gramsPerMillilitre"
    );
    grams = quantity * gramsPerMillilitre;
    unitDescription = "ml";
  } else {
    servingId = ingredient.unit === "each" ? food.defaultServingId : ingredient.servingId;
    const serving = food.servings?.find((candidate) => candidate.id === servingId);
    if (!serving) throw new RangeError(`ingredient ${index + 1} requires a valid food serving.`);
    grams = quantity * serving.grams;
    unitDescription = ingredient.unit === "each" ? "each" : serving.description;
  }

  return {
    id: ingredient.id ?? options.ingredientIdFactory(index),
    foodId: food.id,
    quantity,
    unit: ingredient.unit,
    unitDescription,
    servingId,
    grams,
    rawPoints: foodPointsForGrams(food, grams)
  };
}

export function calculateRecipe(input, foods, options = {}) {
  const servings = requirePositiveNumber(input.servings, "servings");
  if (!Array.isArray(input.ingredients) || !input.ingredients.length) {
    throw new TypeError("At least one recipe ingredient is required.");
  }
  const foodById = new Map(foods.map((food) => [food.id, food]));
  const calculationOptions = {
    gramsPerMillilitre: options.gramsPerMillilitre,
    ingredientIdFactory: options.ingredientIdFactory ?? ((index) => createId(`ingredient-${index + 1}`))
  };
  const ingredients = input.ingredients.map((ingredient, index) =>
    normalizeIngredient(ingredient, index, foodById.get(ingredient.foodId), calculationOptions)
  );
  const rawTotalPoints = ingredients.reduce((total, ingredient) => total + ingredient.rawPoints, 0);
  return {
    servings,
    ingredients,
    rawTotalPoints,
    rawPointsPerServing: rawTotalPoints / servings
  };
}

export function recipePointsForServings(recipe, servings) {
  return recipe.rawPointsPerServing * requirePositiveNumber(servings, "servings");
}

export function buildRecipe(input, foods, options = {}) {
  const calculation = calculateRecipe(input, foods, options);
  const timestamp = options.timestamp ?? new Date().toISOString();
  const name = requireText(input.name, "name");
  return {
    id: options.recipeId ?? createId("recipe"),
    type: "recipe",
    name,
    normalizedName: normalizeFoodName(name),
    ...calculation,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export async function createRecipe(input, options = {}) {
  const foods = await getAll("foods");
  const recipe = buildRecipe(input, foods, options);
  await add("recipes", recipe);
  return recipe;
}

export async function updateRecipe(recipeId, input, options = {}) {
  const existing = await get("recipes", recipeId);
  if (!existing) throw new RangeError("Cannot update a recipe that does not exist.");
  const foods = await getAll("foods");
  const calculation = calculateRecipe(input, foods, options);
  const name = requireText(input.name, "name");
  const recipe = {
    ...existing,
    name,
    normalizedName: normalizeFoodName(name),
    ...calculation,
    updatedAt: options.timestamp ?? new Date().toISOString()
  };
  await put("recipes", recipe);
  return recipe;
}

export async function getRecipe(recipeId) {
  return get("recipes", recipeId);
}

export async function listRecipes() {
  const recipes = await getAll("recipes");
  return recipes.sort((left, right) =>
    (left.normalizedName ?? normalizeFoodName(left.name)).localeCompare(right.normalizedName ?? normalizeFoodName(right.name))
  );
}

export async function searchRecipes(query) {
  const normalized = normalizeFoodName(query);
  const recipes = await listRecipes();
  return normalized
    ? recipes.filter((recipe) => (recipe.normalizedName ?? normalizeFoodName(recipe.name)).includes(normalized))
    : recipes;
}

export async function deleteRecipe(recipeId) {
  const recipe = await get("recipes", recipeId);
  if (!recipe) throw new RangeError("Cannot delete a recipe that does not exist.");
  const references = await queryIndex("diaryEntries", "itemId", recipeId);
  if (references.length) {
    throw new RangeError("This recipe is used by a diary entry and cannot be deleted.");
  }
  await remove("recipes", recipeId);
}
