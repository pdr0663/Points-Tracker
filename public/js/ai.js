import { foodPointsForGrams, normalizeFoodName } from "./foods.js";

export class AiRequestError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "AiRequestError";
    this.code = code;
  }
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AiRequestError("AI_INVALID_RESPONSE", `${label} is invalid.`);
  }
  return value;
}

function requireExactKeys(value, keys, label) {
  requireRecord(value, label);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new AiRequestError("AI_INVALID_RESPONSE", `${label} contains unexpected or missing fields.`);
  }
}

function requireText(value, label, maxLength = 300) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new AiRequestError("AI_INVALID_RESPONSE", `${label} is missing or too long.`);
  }
}

function requirePositiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new AiRequestError("AI_INVALID_RESPONSE", `${label} must be greater than zero.`);
  }
}

function requireNullableText(value, label) {
  if (value !== null) requireText(value, label);
}

function requireNullablePositiveNumber(value, label) {
  if (value !== null) requirePositiveNumber(value, label);
}

function requireNutrient(value, label) {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    throw new AiRequestError("AI_INVALID_RESPONSE", `${label} must be zero, a positive number, or unknown.`);
  }
}

export function validateMealInterpretation(value) {
  requireExactKeys(value, ["type", "items"], "Meal interpretation");
  if (value.type !== "meal-entry" || !Array.isArray(value.items) || !value.items.length || value.items.length > 50) {
    throw new AiRequestError("AI_INVALID_RESPONSE", "Meal interpretation is invalid.");
  }
  value.items.forEach((item, index) => {
    requireExactKeys(item, ["description", "quantity", "unit", "notes"], `Meal item ${index + 1}`);
    requireText(item.description, `Meal item ${index + 1} description`);
    requirePositiveNumber(item.quantity, `Meal item ${index + 1} quantity`);
    requireText(item.unit, `Meal item ${index + 1} unit`);
    if (item.notes !== null && (typeof item.notes !== "string" || item.notes.length > 500)) throw new AiRequestError("AI_INVALID_RESPONSE", `Meal item ${index + 1} notes are invalid.`);
  });
  return value;
}

export function validateRecipeInterpretation(value) {
  requireExactKeys(value, ["type", "name", "servings", "ingredients"], "Recipe interpretation");
  if (value.type !== "recipe") throw new AiRequestError("AI_INVALID_RESPONSE", "Recipe interpretation has the wrong type.");
  requireText(value.name, "Recipe name");
  requirePositiveNumber(value.servings, "Recipe servings");
  if (!Array.isArray(value.ingredients) || !value.ingredients.length || value.ingredients.length > 100) {
    throw new AiRequestError("AI_INVALID_RESPONSE", "Recipe ingredients are invalid.");
  }
  value.ingredients.forEach((ingredient, index) => {
    requireExactKeys(ingredient, ["description", "quantity", "unit"], `Recipe ingredient ${index + 1}`);
    requireText(ingredient.description, `Recipe ingredient ${index + 1} description`);
    requirePositiveNumber(ingredient.quantity, `Recipe ingredient ${index + 1} quantity`);
    requireText(ingredient.unit, `Recipe ingredient ${index + 1} unit`);
  });
  return value;
}

export function validateFoodInterpretation(value) {
  requireExactKeys(value, ["type", "name", "brand", "servings", "nutrition", "provenance"], "Food interpretation");
  if (value.type !== "food") throw new AiRequestError("AI_INVALID_RESPONSE", "Food interpretation has the wrong type.");
  requireNullableText(value.name, "Food name");
  requireNullableText(value.brand, "Food brand");
  if (!Array.isArray(value.servings) || value.servings.length > 20) {
    throw new AiRequestError("AI_INVALID_RESPONSE", "Food servings are invalid.");
  }
  value.servings.forEach((serving, index) => {
    requireExactKeys(serving, ["description", "grams"], `Food serving ${index + 1}`);
    requireNullableText(serving.description, `Food serving ${index + 1} description`);
    requireNullablePositiveNumber(serving.grams, `Food serving ${index + 1} grams`);
  });
  requireExactKeys(value.nutrition, ["basis", "servingGrams", "protein", "carbohydrate", "fat", "fibre"], "Food nutrition");
  if (!["per-100g", "per-serving"].includes(value.nutrition.basis)) {
    throw new AiRequestError("AI_INVALID_RESPONSE", "Food nutrition basis is invalid.");
  }
  requireNullablePositiveNumber(value.nutrition.servingGrams, "Food nutrition serving grams");
  for (const nutrient of ["protein", "carbohydrate", "fat", "fibre"]) {
    requireNutrient(value.nutrition[nutrient], nutrient);
  }
  if (!["ai-text", "ai-estimate"].includes(value.provenance)) {
    throw new AiRequestError("AI_INVALID_RESPONSE", "Food provenance is invalid.");
  }
  if (value.provenance === "ai-estimate") {
    requireText(value.name, "Estimated food name");
    if (!value.servings.length || value.servings.some((serving) => serving.description === null || serving.grams === null)) {
      throw new AiRequestError("AI_INVALID_RESPONSE", "Estimated food servings are incomplete.");
    }
    for (const nutrient of ["protein", "carbohydrate", "fat", "fibre"]) {
      if (value.nutrition[nutrient] === null) throw new AiRequestError("AI_INVALID_RESPONSE", `Estimated ${nutrient} is missing.`);
    }
    if (value.nutrition.basis === "per-serving" && value.nutrition.servingGrams === null) {
      throw new AiRequestError("AI_INVALID_RESPONSE", "Estimated per-serving nutrition is missing its serving weight.");
    }
  }
  return value;
}

export function foodDraftFromInterpretation(value) {
  const interpretation = validateFoodInterpretation(value);
  const { nutrition } = interpretation;
  const canConvert = nutrition.basis === "per-100g"
    || (Number.isFinite(nutrition.servingGrams) && nutrition.servingGrams > 0);
  const factor = nutrition.basis === "per-100g" ? 1 : 100 / nutrition.servingGrams;
  const nutritionPer100g = Object.fromEntries(
    ["protein", "carbohydrate", "fat", "fibre"].map((nutrient) => [
      nutrient,
      canConvert && nutrition[nutrient] !== null ? nutrition[nutrient] * factor : null
    ])
  );
  return {
    name: interpretation.name ?? "",
    brand: interpretation.brand ?? "",
    nutritionPer100g,
    servings: interpretation.servings.map((serving) => ({
      description: serving.description ?? "",
      grams: serving.grams ?? ""
    })),
    source: interpretation.provenance,
    nutritionBasis: nutrition.basis,
    nutritionServingGrams: nutrition.servingGrams
  };
}

function normalizedBaseUrl(baseUrl) {
  return String(baseUrl ?? "").trim().replace(/\/+$/u, "");
}

export function createAiClient(options = {}) {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");

  async function request(path, init = {}) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, init);
    } catch (error) {
      throw new AiRequestError("NETWORK_ERROR", "AI assistance could not reach the server. Your original text has been kept.", { cause: error });
    }
    let body;
    try {
      body = await response.json();
    } catch (error) {
      throw new AiRequestError("AI_REQUEST_FAILED", "AI assistance is unavailable from this site. Your original text has been kept.", { cause: error });
    }
    if (!response.ok) {
      const serverError = body?.error;
      throw new AiRequestError(
        typeof serverError?.code === "string" ? serverError.code : "AI_REQUEST_FAILED",
        typeof serverError?.message === "string" ? serverError.message : "AI assistance could not complete the request."
      );
    }
    return body;
  }

  return Object.freeze({
    async health() {
      const result = await request("/api/health");
      return Boolean(result?.ok && result?.ai?.configured);
    },
    async interpretMeal(text) {
      const result = await request("/api/interpret-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      return validateMealInterpretation(result);
    },
    async interpretRecipe(text) {
      const result = await request("/api/interpret-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      return validateRecipeInterpretation(result);
    },
    async interpretFood(text, mode = "extract") {
      if (!["extract", "estimate"].includes(mode)) throw new TypeError("Food interpretation mode must be extract or estimate.");
      const result = await request("/api/interpret-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode })
      });
      return validateFoodInterpretation(result);
    }
  });
}

function singular(value) {
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (/(?:ches|shes|sses|xes|zes)$/u.test(value)) return value.slice(0, -2);
  if (value.endsWith("s") && value.length > 3) return value.slice(0, -1);
  return value;
}

function normalizedUnit(value) {
  const normalized = normalizeFoodName(value).replace(/^1\s+/u, "");
  const aliases = new Map([
    ["gram", "g"], ["grams", "g"], ["gm", "g"], ["gms", "g"],
    ["kilogram", "kg"], ["kilograms", "kg"], ["kgs", "kg"],
    ["millilitre", "ml"], ["millilitres", "ml"], ["milliliter", "ml"], ["milliliters", "ml"],
    ["item", "each"], ["items", "each"], ["piece", "each"], ["pieces", "each"],
    ["serve", "serving"], ["serves", "serving"], ["servings", "serving"], ["portion", "serving"], ["portions", "serving"]
  ]);
  return aliases.get(normalized) ?? singular(normalized);
}

function editSimilarity(left, right) {
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function closeScore(description, food) {
  const foodName = food.normalizedName ?? normalizeFoodName(food.name);
  if (!description || !foodName) return 0;
  if (description.includes(foodName) || foodName.includes(description)) return 0.86;
  const descriptionTokens = new Set(description.split(" ").filter((token) => token.length > 2));
  const foodTokens = new Set(foodName.split(" ").filter((token) => token.length > 2));
  const common = [...descriptionTokens].filter((token) => foodTokens.has(token)).length;
  const tokenScore = common / Math.max(descriptionTokens.size, foodTokens.size, 1);
  return Math.max(tokenScore, editSimilarity(description, foodName));
}

export function matchFood(description, foods, aliases = []) {
  const normalized = normalizeFoodName(description);
  const exact = foods.filter((food) => (food.normalizedName ?? normalizeFoodName(food.name)) === normalized);
  if (exact.length === 1) return { status: "exact", foodId: exact[0].id };
  if (exact.length > 1) return { status: "possible", foodId: exact[0].id };

  const aliasFoodIds = [...new Set(aliases
    .filter((alias) => (alias.normalizedAlias ?? normalizeFoodName(alias.alias)) === normalized)
    .map((alias) => alias.foodId))];
  if (aliasFoodIds.length === 1 && foods.some((food) => food.id === aliasFoodIds[0])) {
    return { status: "alias", foodId: aliasFoodIds[0] };
  }

  const ranked = foods
    .map((food) => ({ food, score: closeScore(normalized, food) }))
    .sort((left, right) => right.score - left.score);
  if (ranked[0]?.score >= 0.72 && (!ranked[1] || ranked[0].score - ranked[1].score >= 0.08)) {
    return { status: "possible", foodId: ranked[0].food.id };
  }
  return { status: "unresolved", foodId: "" };
}

function servingUnit(serving) {
  return normalizedUnit(serving.description);
}

export function suggestAiPortion(item, food) {
  let quantity = item.quantity;
  let portionId = "";
  const unit = normalizedUnit(item.unit);
  if (unit === "g") portionId = "__grams__";
  else if (unit === "kg") {
    quantity *= 1000;
    portionId = "__grams__";
  } else if (unit === "ml") portionId = "__millilitres__";
  else {
    const matchingServings = food.servings.filter((serving) => servingUnit(serving) === unit);
    if (matchingServings.length === 1) portionId = matchingServings[0].id;
    else if (["each", "serving"].includes(unit)) portionId = food.defaultServingId;
  }
  return { quantity, portionId };
}

export function initialAiResolution(item, foods, aliases = []) {
  const match = matchFood(item.description, foods, aliases);
  const food = foods.find((candidate) => candidate.id === match.foodId);
  let quantity = item.quantity;
  let portionId = "";
  if (food) {
    ({ quantity, portionId } = suggestAiPortion(item, food));
  }
  return {
    source: { ...item },
    matchStatus: match.status,
    foodId: match.foodId,
    quantity,
    portionId
  };
}

export function calculateAiResolution(resolution, foods) {
  const food = foods.find((candidate) => candidate.id === resolution.foodId);
  const quantity = Number(resolution.quantity);
  if (!food || !Number.isFinite(quantity) || quantity <= 0 || !resolution.portionId) {
    return { resolved: false, food };
  }
  if (resolution.portionId === "__grams__" || resolution.portionId === "__millilitres__") {
    const grams = quantity;
    return {
      resolved: true,
      food,
      grams,
      rawPoints: foodPointsForGrams(food, grams),
      quantityText: `${quantity} ${resolution.portionId === "__millilitres__" ? "ml (1 ml = 1 g)" : "g"}`,
      diaryInput: { foodId: food.id, grams },
      recipeIngredient: { foodId: food.id, quantity, unit: resolution.portionId === "__millilitres__" ? "ml" : "g" }
    };
  }
  const serving = food.servings.find((candidate) => candidate.id === resolution.portionId);
  if (!serving) return { resolved: false, food };
  const grams = serving.grams * quantity;
  return {
    resolved: true,
    food,
    grams,
    rawPoints: foodPointsForGrams(food, grams),
    quantityText: `${quantity} × ${serving.description}`,
    diaryInput: { foodId: food.id, servingId: serving.id, quantity },
    recipeIngredient: { foodId: food.id, quantity, unit: "serving", servingId: serving.id }
  };
}

export function createAiResolutions(items, foods, aliases = []) {
  return items.map((item) => initialAiResolution(item, foods, aliases));
}
