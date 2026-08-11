import { foodInterpretationSchema, foodLabelSchema, mealSchema, recipeSchema } from "./schemas.js";
import { AppError, validateFoodInterpretation, validateFoodLabel, validateMeal, validateRecipe, validateTranscript } from "./validation.js";

const API_BASE_URL = "https://api.openai.com/v1";
const REQUEST_TIMEOUT_MS = 60_000;

const prompts = Object.freeze({
  meal: "Interpret only the meal text supplied by the user. Preserve explicit quantities and units. Do not calculate or return Points, calories, nutrition, health advice, user details, or information not present in the text. Use null for absent notes.",
  recipe: "Extract only the recipe name, serving count, ingredients, quantities, and units from the supplied recipe text. Do not calculate or return Points, calories, nutrition, health advice, user details, or information not present in the text.",
  foodExtract: "Extract only the food identity, serving information, nutrition basis, and nutrient values stated in the supplied text. Preserve whether nutrition is per 100 g or per serving. Do not estimate or invent missing values; use null. Do not calculate or return Points, calories, health advice, or user details.",
  foodEstimate: "Suggest typical generic nutrition for the named food. Return complete protein, carbohydrate, fat, and fibre values per 100 g plus at least one practical serving with its gram weight. Use a generic food name and null brand unless the user supplied a brand. These are estimates for human review. Do not calculate or return Points, calories, health advice, or user details.",
  label: "Extract factual information visible on this nutrition label. Do not estimate or invent missing values. Return null for every unknown value, including fibre. Convert to per-100-g values only when the label provides them or a valid conversion is possible from a stated serving weight. Do not calculate or return Points or health advice."
});

function unavailableError() {
  return new AppError("AI_REQUEST_FAILED", "AI assistance is not configured on this server.", 503);
}

function requestFailedError() {
  return new AppError("AI_REQUEST_FAILED", "The AI service could not complete the request. Please try again.", 502);
}

function invalidResponseError() {
  return new AppError("AI_INVALID_RESPONSE", "The AI service returned an invalid response. Please try again.", 502);
}

function findResponseText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text;
  for (const output of response.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "refusal") throw requestFailedError();
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw invalidResponseError();
}

function parseStructuredResponse(response) {
  try {
    return JSON.parse(findResponseText(response));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalidResponseError();
  }
}

function filenameFor(contentType) {
  const extension = new Map([
    ["audio/mpeg", "mp3"],
    ["audio/mp4", "m4a"],
    ["audio/ogg", "ogg"],
    ["audio/wav", "wav"],
    ["audio/webm", "webm"]
  ]).get(contentType);
  return `recording.${extension ?? "webm"}`;
}

export function createOpenAIService(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");

  async function call(endpoint, init) {
    if (!config.apiKey) throw unavailableError();
    let response;
    try {
      response = await fetchImpl(`${API_BASE_URL}${endpoint}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...init.headers
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      console.error("OpenAI request failed", error);
      throw requestFailedError();
    }
    if (!response.ok) {
      console.error(`OpenAI request returned HTTP ${response.status}.`);
      throw requestFailedError();
    }
    try {
      return await response.json();
    } catch (error) {
      console.error("OpenAI response was not JSON", error);
      throw invalidResponseError();
    }
  }

  async function structured({ model, name, schema, prompt, content, validate }) {
    const response = await call("/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        instructions: prompt,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema
          }
        }
      })
    });
    return validate(parseStructuredResponse(response));
  }

  return Object.freeze({
    configured: Boolean(config.apiKey),

    interpretMeal(text) {
      return structured({
        model: config.textModel,
        name: "meal_entry",
        schema: mealSchema,
        prompt: prompts.meal,
        content: [{ type: "input_text", text }],
        validate: validateMeal
      });
    },

    interpretRecipe(text) {
      return structured({
        model: config.textModel,
        name: "recipe",
        schema: recipeSchema,
        prompt: prompts.recipe,
        content: [{ type: "input_text", text }],
        validate: validateRecipe
      });
    },

    async interpretFood(text, mode) {
      const result = await structured({
        model: config.textModel,
        name: "food_interpretation",
        schema: foodInterpretationSchema,
        prompt: mode === "estimate" ? prompts.foodEstimate : prompts.foodExtract,
        content: [{ type: "input_text", text }],
        validate: (value) => validateFoodInterpretation(value, { mode })
      });
      return { ...result, provenance: mode === "estimate" ? "ai-estimate" : "ai-text" };
    },

    scanLabel(image, contentType) {
      return structured({
        model: config.visionModel,
        name: "nutrition_label",
        schema: foodLabelSchema,
        prompt: prompts.label,
        content: [
          { type: "input_text", text: "Extract the visible nutrition label." },
          { type: "input_image", image_url: `data:${contentType};base64,${image.toString("base64")}`, detail: "high" }
        ],
        validate: validateFoodLabel
      });
    },

    async transcribe(audio, contentType) {
      if (!config.apiKey) throw unavailableError();
      const form = new FormData();
      form.append("model", config.transcriptionModel);
      form.append("file", new Blob([audio], { type: contentType }), filenameFor(contentType));
      const response = await call("/audio/transcriptions", { method: "POST", body: form });
      return validateTranscript({ transcript: response.text });
    }
  });
}
