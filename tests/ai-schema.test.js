import assert from "node:assert/strict";
import test from "node:test";
import { validateFoodLabel, validateMeal, validateRecipe, validateTextRequest } from "../server/validation.js";

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

test("text requests contain only the text needed by the AI task", () => {
  assert.equal(validateTextRequest({ text: "  two slices of toast  " }), "two slices of toast");
  assert.throws(() => validateTextRequest({ text: "toast", userName: "Person" }), { code: "VALIDATION_ERROR" });
  assert.throws(() => validateTextRequest({ text: "   " }), { code: "VALIDATION_ERROR" });
});
