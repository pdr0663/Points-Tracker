import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createAppServer } from "../server/index.js";
import { AppError } from "../server/validation.js";

const baseConfig = Object.freeze({
  port: 3000,
  apiKey: "",
  textModel: "test",
  visionModel: "test",
  transcriptionModel: "test",
  allowedOrigin: "https://example.github.io",
  limits: Object.freeze({ json: 1024, image: 1024, audio: 1024 })
});

async function withServer(ai, callback, config = baseConfig) {
  const server = createAppServer({ config, ai });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function unavailableAi() {
  const error = new AppError("AI_REQUEST_FAILED", "AI assistance is not configured on this server.", 503);
  return {
    configured: false,
    interpretMeal: async () => { throw error; },
    interpretRecipe: async () => { throw error; },
    transcribe: async () => { throw error; },
    scanLabel: async () => { throw error; }
  };
}

test("health reports AI configuration without exposing credentials", async () => {
  await withServer(unavailableAi(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), { ok: true, ai: { configured: false } });
    assert.doesNotMatch(text, /api[_-]?key|test-key/iu);
  });
});

test("an unavailable AI service returns the documented error envelope", async () => {
  await withServer(unavailableAi(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/interpret-meal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "toast" })
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: "AI_REQUEST_FAILED", message: "AI assistance is not configured on this server." }
    });
  });
});

test("meal and recipe routes pass only validated text to the AI module", async () => {
  const seen = [];
  const ai = {
    configured: true,
    interpretMeal: async (text) => { seen.push(["meal", text]); return { type: "meal-entry", items: [] }; },
    interpretRecipe: async (text) => { seen.push(["recipe", text]); return { type: "recipe", name: "Soup", servings: 2, ingredients: [] }; }
  };
  await withServer(ai, async (baseUrl) => {
    const meal = await fetch(`${baseUrl}/api/interpret-meal`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: " toast " })
    });
    const recipe = await fetch(`${baseUrl}/api/interpret-recipe`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: " soup " })
    });
    assert.equal(meal.status, 200);
    assert.equal(recipe.status, 200);
    assert.deepEqual(seen, [["meal", "toast"], ["recipe", "soup"]]);
  });
});

test("audio and image routes enforce media types and pass raw file bytes", async () => {
  const seen = [];
  const ai = {
    configured: true,
    transcribe: async (data, type) => { seen.push(["audio", data.toString(), type]); return { transcript: "eggs" }; },
    scanLabel: async (data, type) => { seen.push(["image", data.toString(), type]); return { type: "food" }; }
  };
  await withServer(ai, async (baseUrl) => {
    const audio = await fetch(`${baseUrl}/api/transcribe`, { method: "POST", headers: { "Content-Type": "audio/webm" }, body: "sound" });
    const image = await fetch(`${baseUrl}/api/scan-label`, { method: "POST", headers: { "Content-Type": "image/png" }, body: "picture" });
    const invalid = await fetch(`${baseUrl}/api/scan-label`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "picture" });
    assert.equal(audio.status, 200);
    assert.equal(image.status, 200);
    assert.equal(invalid.status, 415);
    assert.deepEqual(seen, [["audio", "sound", "audio/webm"], ["image", "picture", "image/png"]]);
  });
});

test("oversized requests return the consistent error envelope", async () => {
  await withServer(unavailableAi(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/interpret-meal`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(100) })
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: { code: "VALIDATION_ERROR", message: "Request body is too large." } });
  }, { ...baseConfig, limits: { ...baseConfig.limits, json: 32 } });
});

test("configured cross-origin clients receive a narrow CORS policy", async () => {
  await withServer(unavailableAi(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: "https://example.github.io" } });
    assert.equal(response.headers.get("access-control-allow-origin"), "https://example.github.io");
    assert.doesNotMatch(response.headers.get("access-control-allow-methods"), /DELETE/u);
  });
});
