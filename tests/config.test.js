import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createConfig, loadLocalEnv } from "../server/config.js";

test("AI configuration has sensible models and bounded request defaults", () => {
  const config = createConfig({});
  assert.equal(config.apiKey, "");
  assert.equal(config.textModel, "gpt-5-mini");
  assert.equal(config.visionModel, "gpt-5-mini");
  assert.equal(config.transcriptionModel, "gpt-4o-mini-transcribe");
  assert.equal(config.limits.json, 65536);
  assert.equal(config.limits.image, 8388608);
  assert.equal(config.limits.audio, 20971520);
});

test("local env loading does not override an existing server environment value", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "points-tracker-env-"));
  const filePath = path.join(directory, ".env");
  try {
    await writeFile(filePath, "OPENAI_API_KEY=file-key\nOPENAI_TEXT_MODEL='file-model'\n", "utf8");
    const environment = { OPENAI_API_KEY: "existing-key" };
    loadLocalEnv(filePath, environment);
    assert.deepEqual(environment, { OPENAI_API_KEY: "existing-key", OPENAI_TEXT_MODEL: "file-model" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cross-origin configuration accepts only an exact HTTP origin", () => {
  assert.equal(createConfig({ APP_ORIGIN: "https://example.github.io" }).allowedOrigin, "https://example.github.io");
  assert.throws(() => createConfig({ APP_ORIGIN: "*" }), /APP_ORIGIN/u);
  assert.throws(() => createConfig({ APP_ORIGIN: "https://example.github.io/path" }), /APP_ORIGIN/u);
});
