const nonEmptyString = { type: "string", minLength: 1, maxLength: 300 };
const positiveNumber = { type: "number", exclusiveMinimum: 0 };
const nullableNutrient = { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] };

export const mealSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["type", "items"],
  properties: {
    type: { type: "string", enum: ["meal-entry"] },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quantity", "unit", "notes"],
        properties: {
          description: nonEmptyString,
          quantity: positiveNumber,
          unit: nonEmptyString,
          notes: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] }
        }
      }
    }
  }
});

export const recipeSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["type", "name", "servings", "ingredients"],
  properties: {
    type: { type: "string", enum: ["recipe"] },
    name: nonEmptyString,
    servings: positiveNumber,
    ingredients: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quantity", "unit"],
        properties: {
          description: nonEmptyString,
          quantity: positiveNumber,
          unit: nonEmptyString
        }
      }
    }
  }
});

export const foodLabelSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["type", "name", "brand", "serving", "nutritionPer100g"],
  properties: {
    type: { type: "string", enum: ["food"] },
    name: { anyOf: [nonEmptyString, { type: "null" }] },
    brand: { anyOf: [nonEmptyString, { type: "null" }] },
    serving: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["description", "grams"],
          properties: {
            description: nonEmptyString,
            grams: { anyOf: [positiveNumber, { type: "null" }] }
          }
        },
        { type: "null" }
      ]
    },
    nutritionPer100g: {
      type: "object",
      additionalProperties: false,
      required: ["protein", "carbohydrate", "fat", "fibre"],
      properties: {
        protein: nullableNutrient,
        carbohydrate: nullableNutrient,
        fat: nullableNutrient,
        fibre: nullableNutrient
      }
    }
  }
});
