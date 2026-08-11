import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULTS = Object.freeze({
  port: 3000,
  textModel: "gpt-5-mini",
  visionModel: "gpt-5-mini",
  transcriptionModel: "gpt-4o-mini-transcribe",
  jsonLimit: 64 * 1024,
  imageLimit: 8 * 1024 * 1024,
  audioLimit: 20 * 1024 * 1024
});

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseAllowedOrigin(value) {
  const origin = value?.trim() || "";
  if (!origin) return "";
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error("APP_ORIGIN must be an absolute HTTP or HTTPS origin.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
    throw new Error("APP_ORIGIN must be an exact HTTP or HTTPS origin without a path or trailing slash.");
  }
  return origin;
}

export function loadLocalEnv(filePath = path.resolve(".env"), environment = process.env) {
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return environment;
    throw error;
  }

  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || environment[key] !== undefined) continue;
    environment[key] = unquote(trimmed.slice(separator + 1));
  }
  return environment;
}

export function createConfig(environment = process.env) {
  const port = parsePositiveInteger(environment.PORT, DEFAULTS.port, "PORT");
  if (port > 65535) throw new Error("PORT must be between 1 and 65535.");

  return Object.freeze({
    port,
    apiKey: environment.OPENAI_API_KEY?.trim() || "",
    textModel: environment.OPENAI_TEXT_MODEL?.trim() || DEFAULTS.textModel,
    visionModel: environment.OPENAI_VISION_MODEL?.trim() || DEFAULTS.visionModel,
    transcriptionModel: environment.OPENAI_TRANSCRIPTION_MODEL?.trim() || DEFAULTS.transcriptionModel,
    allowedOrigin: parseAllowedOrigin(environment.APP_ORIGIN),
    limits: Object.freeze({
      json: parsePositiveInteger(environment.AI_JSON_LIMIT_BYTES, DEFAULTS.jsonLimit, "AI_JSON_LIMIT_BYTES"),
      image: parsePositiveInteger(environment.AI_IMAGE_LIMIT_BYTES, DEFAULTS.imageLimit, "AI_IMAGE_LIMIT_BYTES"),
      audio: parsePositiveInteger(environment.AI_AUDIO_LIMIT_BYTES, DEFAULTS.audioLimit, "AI_AUDIO_LIMIT_BYTES")
    })
  });
}

export { DEFAULTS };
