export const MAX_IMPORT_BYTES = 64 * 1024;

const ROOT_KEYS = {
  "food-import": ["schemaVersion", "type", "food"],
  "recipe-import": ["schemaVersion", "type", "foods", "recipe"]
};
const FOOD_KEYS = ["name", "brand", "source", "nutritionPer100g", "servings"];
const RECIPE_FOOD_KEYS = ["importKey", ...FOOD_KEYS];
const NUTRIENTS = ["protein", "carbohydrate", "fat", "fibre"];
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const IMPORT_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class JsonImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "JsonImportError";
    this.code = code;
    this.details = details;
  }
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function unwrapJsonFence(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const match = trimmed.match(/^```json[\t ]*\r?\n([\s\S]*?)\r?\n```$/i);
  if (!match) {
    throw new JsonImportError(
      "JSON_PARSE_ERROR",
      "Paste bare JSON or one complete Markdown json code fence without surrounding text."
    );
  }
  return match[1].trim();
}

function issue(path, message, code = "IMPORT_INVALID") {
  return { path, message, code };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectUnsafeKeys(value, path, issues) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (UNSAFE_KEYS.has(key)) issues.push(issue(childPath, `Unsafe property '${key}' is not allowed.`));
    rejectUnsafeKeys(value[key], childPath, issues);
  }
}

function exactKeys(value, allowed, path, issues) {
  if (!isObject(value)) {
    issues.push(issue(path, "Must be an object."));
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(issue(`${path}.${key}`, "Unexpected property."));
  }
  return true;
}

function requiredString(value, path, issues, maximum = 160) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue(path, "Must be a non-empty string."));
  } else if (value.length > maximum) {
    issues.push(issue(path, `Must be ${maximum} characters or fewer.`));
  }
}

function nullableString(value, path, issues, maximum = 160) {
  if (value !== null && typeof value !== "string") {
    issues.push(issue(path, "Must be a string or null."));
  } else if (typeof value === "string" && value.length > maximum) {
    issues.push(issue(path, `Must be ${maximum} characters or fewer.`));
  }
}

function positiveNumber(value, path, issues) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    issues.push(issue(path, "Must be a positive finite number."));
  }
}

function nonNegativeNumber(value, path, issues) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    issues.push(issue(path, "Must be a non-negative finite number."));
  }
}

function validateSource(source, path, issues) {
  if (!isObject(source)) {
    issues.push(issue(path, "Must be an object."));
    return undefined;
  }
  if (source.kind === "external-json") {
    exactKeys(source, ["kind"], path, issues);
    return "external-json";
  }
  if (source.kind === "afcd") {
    exactKeys(source, ["kind", "foodId"], path, issues);
    requiredString(source.foodId, `${path}.foodId`, issues, 100);
    return "afcd";
  }
  issues.push(issue(`${path}.kind`, "Must be 'external-json' or 'afcd'."));
  return undefined;
}

function validateNutrition(nutrition, path, issues) {
  if (!exactKeys(nutrition, NUTRIENTS, path, issues)) return;
  for (const nutrient of NUTRIENTS) nonNegativeNumber(nutrition[nutrient], `${path}.${nutrient}`, issues);
}

function validateServings(servings, path, issues) {
  if (!Array.isArray(servings)) {
    issues.push(issue(path, "Must be an array."));
    return;
  }
  if (servings.length > 50) issues.push(issue(path, "Must contain no more than 50 servings."));
  servings.forEach((serving, index) => {
    const servingPath = `${path}[${index}]`;
    if (!exactKeys(serving, ["description", "grams"], servingPath, issues)) return;
    requiredString(serving.description, `${servingPath}.description`, issues, 100);
    positiveNumber(serving.grams, `${servingPath}.grams`, issues);
  });
}

function validateFood(food, path, issues, { recipeFood = false } = {}) {
  if (!exactKeys(food, recipeFood ? RECIPE_FOOD_KEYS : FOOD_KEYS, path, issues)) return;
  if (recipeFood) {
    requiredString(food.importKey, `${path}.importKey`, issues, 80);
    if (typeof food.importKey === "string" && !IMPORT_KEY_PATTERN.test(food.importKey)) {
      issues.push(issue(`${path}.importKey`, "Must use lowercase kebab-case."));
    }
  }
  requiredString(food.name, `${path}.name`, issues);
  nullableString(food.brand, `${path}.brand`, issues);
  const sourceKind = validateSource(food.source, `${path}.source`, issues);
  if (!Array.isArray(food.servings)) issues.push(issue(`${path}.servings`, "Must be an array."));
  else validateServings(food.servings, `${path}.servings`, issues);
  if (sourceKind === "external-json") {
    validateNutrition(food.nutritionPer100g, `${path}.nutritionPer100g`, issues);
  } else if (sourceKind === "afcd" && Object.hasOwn(food, "nutritionPer100g")) {
    issues.push(issue(`${path}.nutritionPer100g`, "AFCD imports must use catalogue nutrition and cannot supply this property."));
  }
}

function validateFoodImport(document, issues) {
  exactKeys(document, ROOT_KEYS["food-import"], "$", issues);
  validateFood(document.food, "food", issues);
}

function validateRecipeImport(document, issues) {
  exactKeys(document, ROOT_KEYS["recipe-import"], "$", issues);
  if (!Array.isArray(document.foods)) {
    issues.push(issue("foods", "Must be an array."));
  } else {
    if (!document.foods.length) issues.push(issue("foods", "Must contain at least one food."));
    if (document.foods.length > 100) issues.push(issue("foods", "Must contain no more than 100 foods."));
    const keys = new Set();
    document.foods.forEach((food, index) => {
      validateFood(food, `foods[${index}]`, issues, { recipeFood: true });
      if (typeof food?.importKey === "string") {
        if (keys.has(food.importKey)) issues.push(issue(`foods[${index}].importKey`, "Import keys must be unique.", "IMPORT_DUPLICATE_KEY"));
        keys.add(food.importKey);
      }
    });
    validateRecipe(document.recipe, keys, issues);
  }
}

function validateRecipe(recipe, foodKeys, issues) {
  if (!exactKeys(recipe, ["name", "servings", "ingredients"], "recipe", issues)) return;
  requiredString(recipe.name, "recipe.name", issues);
  positiveNumber(recipe.servings, "recipe.servings", issues);
  if (!Array.isArray(recipe.ingredients)) {
    issues.push(issue("recipe.ingredients", "Must be an array."));
    return;
  }
  if (!recipe.ingredients.length) issues.push(issue("recipe.ingredients", "Must contain at least one ingredient."));
  if (recipe.ingredients.length > 200) issues.push(issue("recipe.ingredients", "Must contain no more than 200 ingredients."));
  recipe.ingredients.forEach((ingredient, index) => {
    const path = `recipe.ingredients[${index}]`;
    if (!exactKeys(ingredient, ["foodImportKey", "quantity", "unit"], path, issues)) return;
    requiredString(ingredient.foodImportKey, `${path}.foodImportKey`, issues, 80);
    if (typeof ingredient.foodImportKey === "string" && !foodKeys.has(ingredient.foodImportKey)) {
      issues.push(issue(`${path}.foodImportKey`, "Must reference a declared food import key."));
    }
    positiveNumber(ingredient.quantity, `${path}.quantity`, issues);
    if (!["g", "ml", "each"].includes(ingredient.unit)) {
      issues.push(issue(`${path}.unit`, "Must be 'g', 'ml', or 'each'."));
    }
  });
}

export function validateImportDocument(document, expectedType) {
  const issues = [];
  if (!isObject(document)) return [issue("$", "Import document must be an object.")];
  rejectUnsafeKeys(document, "", issues);
  if (document.schemaVersion !== 1) {
    issues.push(issue("schemaVersion", "Only schema version 1 is supported.", "IMPORT_SCHEMA_UNSUPPORTED"));
  }
  if (!ROOT_KEYS[document.type]) {
    issues.push(issue("type", "Must be 'food-import' or 'recipe-import'.", "IMPORT_SCHEMA_UNSUPPORTED"));
    return issues;
  }
  if (expectedType && document.type !== expectedType) {
    issues.push(issue("type", `This screen accepts ${expectedType} documents.`, "IMPORT_SCHEMA_UNSUPPORTED"));
  }
  if (document.type === "food-import") validateFoodImport(document, issues);
  else validateRecipeImport(document, issues);
  return issues;
}

export function parseImportText(text, options = {}) {
  const originalText = String(text ?? "");
  if (byteLength(originalText) > (options.maxBytes ?? MAX_IMPORT_BYTES)) {
    throw new JsonImportError("IMPORT_INVALID", `Pasted JSON must be ${MAX_IMPORT_BYTES / 1024} KiB or smaller.`);
  }
  const jsonText = unwrapJsonFence(originalText);
  if (!jsonText) throw new JsonImportError("JSON_PARSE_ERROR", "Paste a JSON import document.");
  let document;
  try {
    document = JSON.parse(jsonText);
  } catch (error) {
    throw new JsonImportError("JSON_PARSE_ERROR", "The pasted text is not valid JSON.", { cause: error.message });
  }
  const issues = validateImportDocument(document, options.expectedType);
  if (issues.length) {
    const code = issues.find((item) => item.code !== "IMPORT_INVALID")?.code ?? "IMPORT_INVALID";
    throw new JsonImportError(code, "The import document contains invalid or unsupported fields.", { issues });
  }
  return { document, jsonText };
}

