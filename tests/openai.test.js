import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIService } from "../server/openai.js";

const config = Object.freeze({
  apiKey: "test-key-never-log",
  textModel: "test-text-model",
  visionModel: "test-vision-model",
  transcriptionModel: "test-transcription-model"
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("meal interpretation uses Responses structured output and validates it", async () => {
  let captured;
  const service = createOpenAIService(config, {
    fetchImpl: async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return jsonResponse({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({
          type: "meal-entry",
          items: [{ description: "Toast", quantity: 2, unit: "slices", notes: null }]
        }) }] }]
      });
    }
  });

  const result = await service.interpretMeal("two slices of toast");
  assert.equal(result.items[0].quantity, 2);
  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.equal(captured.init.headers.Authorization, "Bearer test-key-never-log");
  assert.equal(captured.body.model, "test-text-model");
  assert.equal(captured.body.store, false);
  assert.equal(captured.body.text.format.type, "json_schema");
  assert.equal(captured.body.text.format.strict, true);
  assert.equal(captured.body.input[0].content[0].text, "two slices of toast");
});

test("invalid structured model output is rejected", async () => {
  const service = createOpenAIService(config, {
    fetchImpl: async () => jsonResponse({ output_text: JSON.stringify({
      type: "meal-entry",
      items: [{ description: "Toast", quantity: 2, unit: "slices", notes: null, points: 4 }]
    }) })
  });
  await assert.rejects(service.interpretMeal("toast"), { code: "AI_INVALID_RESPONSE", status: 502 });
});

test("food estimates use strict structured output and receive server-owned provenance", async () => {
  let body;
  const service = createOpenAIService(config, {
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse({ output_text: JSON.stringify({
        type: "food",
        name: "Brown onion",
        brand: null,
        servings: [{ description: "1 medium onion", grams: 110 }],
        nutrition: { basis: "per-100g", servingGrams: null, protein: 1.1, carbohydrate: 9.3, fat: 0.1, fibre: 1.7 }
      }) });
    }
  });
  const result = await service.interpretFood("brown onion", "estimate");
  assert.equal(result.provenance, "ai-estimate");
  assert.equal(body.text.format.name, "food_interpretation");
  assert.equal(body.text.format.strict, true);
  assert.match(body.instructions, /estimates for human review/iu);
  assert.doesNotMatch(JSON.stringify(body.text.format.schema), /points/iu);
});

test("label scanning sends an image data URL and preserves null fibre", async () => {
  let body;
  const service = createOpenAIService(config, {
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse({ output_text: JSON.stringify({
        type: "food",
        name: "Yoghurt",
        brand: null,
        serving: null,
        nutritionPer100g: { protein: 9.5, carbohydrate: 6.2, fat: 2.8, fibre: null }
      }) });
    }
  });
  const result = await service.scanLabel(Buffer.from("image"), "image/png");
  assert.equal(result.nutritionPer100g.fibre, null);
  assert.equal(body.model, "test-vision-model");
  assert.match(body.input[0].content[1].image_url, /^data:image\/png;base64,/u);
});

test("transcription sends a server-side multipart request", async () => {
  let captured;
  const service = createOpenAIService(config, {
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return jsonResponse({ text: "two eggs" });
    }
  });
  const result = await service.transcribe(Buffer.from("audio"), "audio/webm");
  assert.deepEqual(result, { transcript: "two eggs" });
  assert.equal(captured.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(captured.init.body.get("model"), "test-transcription-model");
  assert.equal(captured.init.body.get("file").type, "audio/webm");
});

test("an absent API key fails without making a network request", async () => {
  let called = false;
  const service = createOpenAIService({ ...config, apiKey: "" }, { fetchImpl: async () => { called = true; } });
  await assert.rejects(service.interpretMeal("toast"), { code: "AI_REQUEST_FAILED", status: 503 });
  assert.equal(called, false);
});
