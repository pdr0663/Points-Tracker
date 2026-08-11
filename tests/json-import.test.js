import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  JsonImportError,
  MAX_IMPORT_BYTES,
  parseImportText,
  unwrapJsonFence,
  validateImportDocument
} from "../public/js/json-import.js";

const validFood = {
  schemaVersion: 1,
  type: "food-import",
  food: {
    name: "Greek yoghurt",
    brand: "Example Brand",
    source: { kind: "external-json" },
    nutritionPer100g: { protein: 9.5, carbohydrate: 6.2, fat: 2.8, fibre: 0 },
    servings: [{ description: "1 tub", grams: 170 }]
  }
};

const validRecipe = {
  schemaVersion: 1,
  type: "recipe-import",
  foods: [{
    importKey: "greek-yoghurt",
    ...validFood.food
  }],
  recipe: {
    name: "Yoghurt bowl",
    servings: 1,
    ingredients: [{ foodImportKey: "greek-yoghurt", quantity: 170, unit: "g" }]
  }
};

test("parses bare JSON and one Markdown json fence", () => {
  assert.deepEqual(parseImportText(JSON.stringify(validFood), { expectedType: "food-import" }).document, validFood);
  const fenced = `\n\`\`\`json\n${JSON.stringify(validRecipe)}\n\`\`\`\n`;
  assert.deepEqual(parseImportText(fenced, { expectedType: "recipe-import" }).document, validRecipe);
  assert.equal(unwrapJsonFence("  {\"ok\":true}  "), "{\"ok\":true}");
});

test("rejects malformed JSON and surrounding prose without losing error details", () => {
  assert.throws(() => parseImportText("{not json}"), (error) => {
    assert.ok(error instanceof JsonImportError);
    assert.equal(error.code, "JSON_PARSE_ERROR");
    return true;
  });
  assert.throws(() => parseImportText("Here it is:\n```json\n{}\n```"), { code: "JSON_PARSE_ERROR" });
});

test("dispatches by version and type", () => {
  assert.throws(() => parseImportText(JSON.stringify({ ...validFood, schemaVersion: 2 })), { code: "IMPORT_SCHEMA_UNSUPPORTED" });
  assert.throws(() => parseImportText(JSON.stringify(validFood), { expectedType: "recipe-import" }), { code: "IMPORT_SCHEMA_UNSUPPORTED" });
});

test("returns field-specific issues and rejects unknown or Points fields", () => {
  const invalid = structuredClone(validFood);
  invalid.food.nutritionPer100g.fibre = null;
  invalid.food.points = 4;
  const issues = validateImportDocument(invalid);
  assert.ok(issues.some((item) => item.path === "food.nutritionPer100g.fibre"));
  assert.ok(issues.some((item) => item.path === "food.points" && item.message === "Unexpected property."));
});

test("validates recipe keys, references, units, and positive quantities", () => {
  const invalid = structuredClone(validRecipe);
  invalid.foods.push({ ...structuredClone(validRecipe.foods[0]) });
  invalid.recipe.ingredients[0] = { foodImportKey: "missing", quantity: 0, unit: "cup" };
  const issues = validateImportDocument(invalid);
  assert.ok(issues.some((item) => item.code === "IMPORT_DUPLICATE_KEY"));
  assert.ok(issues.some((item) => item.path.endsWith("foodImportKey")));
  assert.ok(issues.some((item) => item.path.endsWith("quantity")));
  assert.ok(issues.some((item) => item.path.endsWith("unit")));
});

test("accepts syntactically valid AFCD references and validates but does not trust pasted nutrition", () => {
  const afcd = structuredClone(validFood);
  afcd.food.source = { kind: "afcd", foodId: "F000001" };
  delete afcd.food.nutritionPer100g;
  assert.deepEqual(validateImportDocument(afcd), []);
  afcd.food.nutritionPer100g = validFood.food.nutritionPer100g;
  assert.deepEqual(validateImportDocument(afcd), []);
  afcd.food.nutritionPer100g.points = 4;
  assert.ok(validateImportDocument(afcd).some((item) => item.path === "food.nutritionPer100g.points"));
});

test("enforces the pasted-document byte limit", () => {
  assert.throws(() => parseImportText("x".repeat(MAX_IMPORT_BYTES + 1)), { code: "IMPORT_INVALID" });
});

test("requires at least one valid serving", () => {
  const invalid = structuredClone(validFood);
  invalid.food.servings = [];
  assert.ok(validateImportDocument(invalid).some((item) => item.path === "food.servings"));
});

test("published Version 1 examples pass the runtime validator", async () => {
  const foodExample = await readFile(new URL("../public/examples/food-import-v1.json", import.meta.url), "utf8");
  const recipeExample = await readFile(new URL("../public/examples/recipe-import-v1.json", import.meta.url), "utf8");
  assert.equal(parseImportText(foodExample).document.type, "food-import");
  assert.equal(parseImportText(recipeExample).document.type, "recipe-import");
});
