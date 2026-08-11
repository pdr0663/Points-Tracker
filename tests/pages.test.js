import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Pages entry point uses repository-subpath-safe asset URLs", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /href="\.\/css\/app\.css"/);
  assert.match(html, /src="\.\/js\/app\.js"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:css|js)\//);
  assert.doesNotMatch(html, /points-tracker-api-base/);
});

test("production UI exposes JSON import without integrated AI controls", async () => {
  const app = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");

  assert.match(app, /Paste food JSON/);
  assert.match(app, /Paste recipe JSON/);
  assert.doesNotMatch(app, /Add food with AI|Create with AI|Record recipe|Record meal|Scan nutrition label/);
  assert.doesNotMatch(app, /\.\/ai\.js|\.\/voice\.js|points-tracker-api-base/);
});

test("Pages workflow publishes only the static public directory", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/pages.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /path: public/);
  assert.match(workflow, /npm test/);
  assert.doesNotMatch(workflow, /path: ['"]?\.(?:['"]|\s|$)/);
});
