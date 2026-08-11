export class AppError extends Error {
  constructor(code, message, status = 400, options = {}) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, keys, label) {
  if (!isRecord(value)) throw new AppError("AI_INVALID_RESPONSE", `${label} must be an object.`, 502);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new AppError("AI_INVALID_RESPONSE", `${label} contains unexpected or missing fields.`, 502);
  }
}

function requireString(value, label, { nullable = false, maxLength = 300 } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.trim() === "" || value.length > maxLength) {
    throw new AppError("AI_INVALID_RESPONSE", `${label} must be a non-empty string.`, 502);
  }
}

function requirePositiveNumber(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new AppError("AI_INVALID_RESPONSE", `${label} must be a positive number.`, 502);
  }
}

function requireNutrient(value, label) {
  if (value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new AppError("AI_INVALID_RESPONSE", `${label} must be zero, a positive number, or null.`, 502);
  }
}

export function validateTextRequest(value) {
  if (!isRecord(value) || Object.keys(value).length !== 1 || typeof value.text !== "string") {
    throw new AppError("VALIDATION_ERROR", "Request body must contain only a text string.");
  }
  const text = value.text.trim();
  if (!text) throw new AppError("VALIDATION_ERROR", "Text must not be empty.");
  if (text.length > 20000) throw new AppError("VALIDATION_ERROR", "Text is too long.", 413);
  return text;
}

export function validateMeal(value) {
  requireExactKeys(value, ["type", "items"], "Meal response");
  if (value.type !== "meal-entry") throw new AppError("AI_INVALID_RESPONSE", "Meal response has the wrong type.", 502);
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 50) {
    throw new AppError("AI_INVALID_RESPONSE", "Meal response must contain between 1 and 50 items.", 502);
  }
  value.items.forEach((item, index) => {
    const label = `Meal item ${index + 1}`;
    requireExactKeys(item, ["description", "quantity", "unit", "notes"], label);
    requireString(item.description, `${label} description`);
    requirePositiveNumber(item.quantity, `${label} quantity`);
    requireString(item.unit, `${label} unit`);
    if (item.notes !== null && (typeof item.notes !== "string" || item.notes.length > 500)) {
      throw new AppError("AI_INVALID_RESPONSE", `${label} notes must be a string of at most 500 characters or null.`, 502);
    }
  });
  return value;
}

export function validateRecipe(value) {
  requireExactKeys(value, ["type", "name", "servings", "ingredients"], "Recipe response");
  if (value.type !== "recipe") throw new AppError("AI_INVALID_RESPONSE", "Recipe response has the wrong type.", 502);
  requireString(value.name, "Recipe name");
  requirePositiveNumber(value.servings, "Recipe servings");
  if (!Array.isArray(value.ingredients) || value.ingredients.length < 1 || value.ingredients.length > 100) {
    throw new AppError("AI_INVALID_RESPONSE", "Recipe response must contain between 1 and 100 ingredients.", 502);
  }
  value.ingredients.forEach((ingredient, index) => {
    const label = `Recipe ingredient ${index + 1}`;
    requireExactKeys(ingredient, ["description", "quantity", "unit"], label);
    requireString(ingredient.description, `${label} description`);
    requirePositiveNumber(ingredient.quantity, `${label} quantity`);
    requireString(ingredient.unit, `${label} unit`);
  });
  return value;
}

export function validateFoodLabel(value) {
  requireExactKeys(value, ["type", "name", "brand", "serving", "nutritionPer100g"], "Food response");
  if (value.type !== "food") throw new AppError("AI_INVALID_RESPONSE", "Food response has the wrong type.", 502);
  requireString(value.name, "Food name", { nullable: true });
  requireString(value.brand, "Food brand", { nullable: true });
  if (value.serving !== null) {
    requireExactKeys(value.serving, ["description", "grams"], "Food serving");
    requireString(value.serving.description, "Food serving description");
    requirePositiveNumber(value.serving.grams, "Food serving grams", { nullable: true });
  }
  requireExactKeys(value.nutritionPer100g, ["protein", "carbohydrate", "fat", "fibre"], "Nutrition per 100 g");
  for (const nutrient of ["protein", "carbohydrate", "fat", "fibre"]) {
    requireNutrient(value.nutritionPer100g[nutrient], nutrient);
  }
  return value;
}

export function validateTranscript(value) {
  requireExactKeys(value, ["transcript"], "Transcription response");
  requireString(value.transcript, "Transcript");
  return value;
}
