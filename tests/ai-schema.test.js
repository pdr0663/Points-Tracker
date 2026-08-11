import assert from "node:assert/strict";
import test from "node:test";
import {
  validateFoodInterpretation,
  validateFoodLabel,
  validateFoodRequest,
  validateMeal,
  validateRecipe,
  validateTextRequest
} from "../server/validation.js";

test("meal validation accepts the canonical response", () => {
  const meal = {
    type: "meal-entry",
    items: [{ description: "Toast", quantity: 2, unit: "slices", notes: null }]
  };
  assert.equal(validateMeal(meal), meal);
});

test("meal validation rejects model-added Points", () => {
  assert.throws(() => validateMeal({
    type: "meal-entry",
    items: [{ description: "Toast", quantity: 2, unit: "slices", notes: null, points: 4 }]
  }), { code: "AI_INVALID_RESPONSE" });
});

test("recipe validation rejects missing or non-positive quantities", () => {
  assert.throws(() => validateRecipe({
    type: "recipe",
    name: "Toast",
    servings: 1,
    ingredients: [{ description: "Bread", quantity: 0, unit: "slices" }]
  }), { code: "AI_INVALID_RESPONSE" });
});

test("label validation preserves unknown nutrients as null", () => {
  const food = {
    type: "food",
    name: "Yoghurt",
    brand: null,
    serving: { description: "1 tub", grams: 170 },
    nutritionPer100g: { protein: 9.5, carbohydrate: 6.2, fat: 2.8, fibre: null }
  };
  assert.equal(validateFoodLabel(food), food);
});

test("label validation rejects negative nutrients and extra fields", () => {
  assert.throws(() => validateFoodLabel({
    type: "food",
    name: "Yoghurt",
    brand: null,
    serving: null,
    nutritionPer100g: { protein: -1, carbohydrate: 6.2, fat: 2.8, fibre: null }
  }), { code: "AI_INVALID_RESPONSE" });
});

test("food interpretation distinguishes incomplete extraction from complete estimates", () => {
  const extraction = {
    type: "food",
    name: "Yoghurt",
    brand: null,
    servings: [],
    nutrition: {
      basis: "per-serving",
      servingGrams: null,
      protein: 9.5,
      carbohydrate: null,
      fat: null,
      fibre: null
    }
  };
  assert.equal(validateFoodInterpretation(extraction, { mode: "extract" }), extraction);
  assert.throws(() => validateFoodInterpretation(extraction, { mode: "estimate" }), { code: "AI_INVALID_RESPONSE" });

  const estimate = {
    type: "food",
    name: "Brown onion",
    brand: null,
    servings: [{ description: "1 medium onion", grams: 110 }],
    nutrition: {
      basis: "per-100g",
      servingGrams: null,
      protein: 1.1,
      carbohydrate: 9.3,
      fat: 0.1,
      fibre: 1.7
    }
  };
  assert.equal(validateFoodInterpretation(estimate, { mode: "estimate" }), estimate);
  assert.throws(() => validateFoodInterpretation({ ...estimate, points: 1 }), { code: "AI_INVALID_RESPONSE" });
});

test("text requests contain only the text needed by the AI task", () => {
  assert.equal(validateTextRequest({ text: "  two slices of toast  " }), "two slices of toast");
  assert.throws(() => validateTextRequest({ text: "toast", userName: "Person" }), { code: "VALIDATION_ERROR" });
  assert.throws(() => validateTextRequest({ text: "   " }), { code: "VALIDATION_ERROR" });
});

test("food requests require an explicit extraction or estimate mode", () => {
  assert.deepEqual(validateFoodRequest({ text: "  brown onion  ", mode: "estimate" }), { text: "brown onion", mode: "estimate" });
  assert.throws(() => validateFoodRequest({ text: "brown onion" }), { code: "VALIDATION_ERROR" });
  assert.throws(() => validateFoodRequest({ text: "brown onion", mode: "guess" }), { code: "VALIDATION_ERROR" });
});
