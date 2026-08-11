import assert from "node:assert/strict";
import test from "node:test";
import {
  AiRequestError,
  calculateAiResolution,
  createAiClient,
  createAiResolutions,
  foodDraftFromInterpretation,
  foodDraftFromLabel,
  matchFood,
  validateFoodLabel,
  validateFoodInterpretation,
  validateMealInterpretation,
  validateRecipeInterpretation,
  validateTranscription
} from "../public/js/ai.js";

const foods = [
  {
    id: "food-bread",
    name: "Sourdough bread",
    normalizedName: "sourdough bread",
    brand: "Local",
    nutritionPer100g: { protein: 8, carbohydrate: 45, fat: 2, fibre: 3 },
    servings: [{ id: "serving-slice", description: "1 slice", grams: 38 }],
    defaultServingId: "serving-slice"
  },
  {
    id: "food-butter",
    name: "Butter",
    normalizedName: "butter",
    brand: "",
    nutritionPer100g: { protein: 1, carbohydrate: 1, fat: 81, fibre: 0 },
    servings: [{ id: "serving-teaspoon", description: "1 teaspoon", grams: 5 }],
    defaultServingId: "serving-teaspoon"
  }
];

test("client validates canonical meal and recipe responses again", () => {
  assert.equal(validateMealInterpretation({
    type: "meal-entry",
    items: [{ description: "bread", quantity: 2, unit: "slices", notes: null }]
  }).type, "meal-entry");
  assert.equal(validateRecipeInterpretation({
    type: "recipe",
    name: "Toast",
    servings: 2,
    ingredients: [{ description: "bread", quantity: 2, unit: "slices" }]
  }).type, "recipe");
  assert.throws(() => validateMealInterpretation({
    type: "meal-entry",
    items: [{ description: "bread", quantity: 2, unit: "slices", notes: null, points: 4 }]
  }), { code: "AI_INVALID_RESPONSE" });
});

test("AI client sends only original text and preserves server errors", async () => {
  let request;
  const client = createAiClient({
    baseUrl: "https://api.example.test/",
    fetchImpl: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ error: { code: "AI_REQUEST_FAILED", message: "Try again later." } }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  await assert.rejects(client.interpretMeal("two slices of bread"), (error) => {
    assert.equal(error.code, "AI_REQUEST_FAILED");
    assert.equal(error.message, "Try again later.");
    return true;
  });
  assert.equal(request.url, "https://api.example.test/api/interpret-meal");
  assert.deepEqual(request.body, { text: "two slices of bread" });
});

test("network errors become a user-safe error without losing input in application state", async () => {
  const client = createAiClient({ fetchImpl: async () => { throw new Error("offline"); } });
  await assert.rejects(client.interpretRecipe("recipe text"), (error) => {
    assert.ok(error instanceof AiRequestError);
    assert.equal(error.code, "NETWORK_ERROR");
    assert.match(error.message, /original text has been kept/iu);
    return true;
  });
});

test("AI client uploads one raw recording and validates the transcript", async () => {
  let request;
  const client = createAiClient({
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ transcript: "two eggs and toast" }), {
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  const audio = new Blob(["recorded audio"], { type: "audio/webm" });
  assert.deepEqual(await client.transcribe(audio), { transcript: "two eggs and toast" });
  assert.equal(request.url, "/api/transcribe");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers["Content-Type"], "audio/webm");
  assert.equal(request.init.body, audio);
  assert.throws(() => validateTranscription({ transcript: "two eggs", extra: true }), { code: "AI_INVALID_RESPONSE" });
  await assert.rejects(client.transcribe(new Blob([])), TypeError);
});

test("AI client uploads a bounded label image and preserves unknown values", async () => {
  let request;
  const response = {
    type: "food",
    name: "Greek yoghurt",
    brand: "Example",
    serving: { description: "1 tub", grams: 170 },
    nutritionPer100g: { protein: 9.5, carbohydrate: 6.2, fat: 2.8, fibre: null }
  };
  const client = createAiClient({
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } });
    }
  });
  const image = new Blob(["image bytes"], { type: "image/jpeg" });
  assert.equal((await client.scanLabel(image)).nutritionPer100g.fibre, null);
  assert.equal(request.url, "/api/scan-label");
  assert.equal(request.init.headers["Content-Type"], "image/jpeg");
  assert.equal(request.init.body, image);
  assert.deepEqual(foodDraftFromLabel(response), {
    name: "Greek yoghurt",
    brand: "Example",
    nutritionPer100g: { protein: 9.5, carbohydrate: 6.2, fat: 2.8, fibre: null },
    servings: [{ description: "1 tub", grams: 170 }],
    source: "nutrition-label"
  });
  assert.throws(() => validateFoodLabel({ ...response, points: 4 }), { code: "AI_INVALID_RESPONSE" });
});

test("label scanning rejects unsupported, empty, and oversized images before upload", async () => {
  let calls = 0;
  const client = createAiClient({ fetchImpl: async () => { calls += 1; } });
  await assert.rejects(client.scanLabel(new Blob([])), TypeError);
  await assert.rejects(client.scanLabel(new Blob(["image"], { type: "image/gif" })), TypeError);
  await assert.rejects(client.scanLabel(new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: "image/png" })), RangeError);
  assert.equal(calls, 0);
});

test("AI food client sends explicit mode and validates server-owned provenance", async () => {
  let request;
  const response = {
    type: "food",
    name: "Brown onion",
    brand: null,
    servings: [{ description: "1 medium onion", grams: 110 }],
    nutrition: { basis: "per-100g", servingGrams: null, protein: 1.1, carbohydrate: 9.3, fat: 0.1, fibre: 1.7 },
    provenance: "ai-estimate"
  };
  const client = createAiClient({
    fetchImpl: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal((await client.interpretFood("brown onion", "estimate")).provenance, "ai-estimate");
  assert.equal(request.url, "/api/interpret-food");
  assert.deepEqual(request.body, { text: "brown onion", mode: "estimate" });
  assert.throws(() => validateFoodInterpretation({ ...response, provenance: "model-claimed" }), { code: "AI_INVALID_RESPONSE" });
});

test("per-serving AI nutrition is converted deterministically for the ordinary food form", () => {
  const draft = foodDraftFromInterpretation({
    type: "food",
    name: "Yoghurt",
    brand: "Example",
    servings: [{ description: "1 tub", grams: 200 }],
    nutrition: { basis: "per-serving", servingGrams: 200, protein: 20, carbohydrate: 10, fat: 4, fibre: 2 },
    provenance: "ai-text"
  });
  assert.deepEqual(draft.nutritionPer100g, { protein: 10, carbohydrate: 5, fat: 2, fibre: 1 });
  assert.equal(draft.source, "ai-text");
  assert.deepEqual(draft.servings, [{ description: "1 tub", grams: 200 }]);
});

test("food matching follows exact, alias, close-candidate, unresolved order", () => {
  const aliases = [{ foodId: "food-bread", alias: "toast loaf", normalizedAlias: "toast loaf" }];
  assert.deepEqual(matchFood("Butter", foods, aliases), { status: "exact", foodId: "food-butter" });
  assert.deepEqual(matchFood("toast loaf", foods, aliases), { status: "alias", foodId: "food-bread" });
  assert.deepEqual(matchFood("sourdough", foods, aliases), { status: "possible", foodId: "food-bread" });
  assert.deepEqual(matchFood("dragonfruit puree", foods, aliases), { status: "unresolved", foodId: "" });
});

test("AI quantities resolve through saved servings and deterministic food calculations", () => {
  const resolutions = createAiResolutions([
    { description: "Sourdough bread", quantity: 2, unit: "slices", notes: null },
    { description: "Butter", quantity: 10, unit: "grams", notes: null }
  ], foods);
  const bread = calculateAiResolution(resolutions[0], foods);
  const butter = calculateAiResolution(resolutions[1], foods);
  assert.equal(bread.resolved, true);
  assert.equal(bread.grams, 76);
  assert.deepEqual(bread.diaryInput, { foodId: "food-bread", servingId: "serving-slice", quantity: 2 });
  assert.equal(butter.resolved, true);
  assert.equal(butter.grams, 10);
  assert.deepEqual(butter.recipeIngredient, { foodId: "food-butter", quantity: 10, unit: "g" });
  assert.ok(Number.isFinite(bread.rawPoints));
  assert.ok(Number.isFinite(butter.rawPoints));
});

test("unknown units remain unresolved until the user chooses a serving", () => {
  const [resolution] = createAiResolutions([
    { description: "Butter", quantity: 1, unit: "knob", notes: null }
  ], foods);
  assert.equal(resolution.foodId, "food-butter");
  assert.equal(resolution.portionId, "");
  assert.equal(calculateAiResolution(resolution, foods).resolved, false);
});
