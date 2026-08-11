import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Pages entry point uses repository-subpath-safe asset URLs", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /href="\.\/css\/app\.css"/);
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.match(html, /href="\.\/icons\/icon\.svg"/);
  assert.match(html, /src="\.\/js\/app\.js"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:css|icons|js)\//);
  assert.doesNotMatch(html, /points-tracker-api-base/);
});

test("production UI exposes JSON import without integrated AI controls", async () => {
  const app = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");

  assert.match(app, /Paste food JSON/);
  assert.match(app, /Paste recipe JSON/);
  assert.doesNotMatch(app, /Add food with AI|Create with AI|Record recipe|Record meal|Scan nutrition label/);
  assert.doesNotMatch(app, /\.\/ai\.js|\.\/voice\.js|points-tracker-api-base/);
});

test("food and recipe JSON imports enable reviewed confirmation", async () => {
  const app = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");
  assert.match(app, /resolveFoodImport/);
  assert.match(app, /Review imported food/);
  assert.match(app, /Reuse saved food/);
  assert.match(app, /Confirm food/);
  assert.match(app, /resolveRecipeImport/);
  assert.match(app, /Review recipe import/);
  assert.match(app, /Confirm recipe bundle/);
  assert.match(app, /Resolve match/);
  assert.match(app, /Importing foods and recipe/);
  assert.doesNotMatch(app, /Recipe saving is introduced in M18/);
});

test("food UI exposes saved-first AFCD search, review, and import controls", async () => {
  const app = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");

  assert.match(app, /Search saved foods and AFCD/);
  assert.match(app, /Saved foods/);
  assert.match(app, /reference foods/);
  assert.match(app, /Review and import/);
  assert.match(app, /Confirm import/);
  assert.match(app, /already saved/);
  assert.match(app, /Treat as zero-point fruit/);
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

test("Version 1 release metadata and documentation are complete", async () => {
  const packageDocument = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const worker = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const qa = await readFile(new URL("../VERSION_1_QA.md", import.meta.url), "utf8");

  assert.equal(packageDocument.version, "1.0.0");
  assert.match(worker, /CACHE_PREFIX = "points-tracker-"/);
  assert.match(worker, /CACHE_NAME = .*v1\.0\.0/);
  for (const heading of ["Running locally", "Architecture", "AFCD source material", "JSON authoring and import", "Licence and attribution", "Troubleshooting"]) {
    assert.match(readme, new RegExp(`## ${heading}`));
  }
  assert.match(readme, /does not require an OpenAI account, API key, environment file, Node server, or runtime API/i);
  assert.match(qa, /320 px/);
  assert.match(qa, /375 px/);
  assert.match(qa, /430 px/);
  assert.match(qa, /768 px/);
});

test("both production themes allow a 320 px viewport without forcing horizontal overflow", async () => {
  for (const stylesheet of ["app.css", "app-muted.css"]) {
    const css = await readFile(new URL(`../public/css/${stylesheet}`, import.meta.url), "utf8");
    assert.doesNotMatch(css, /html\s*\{[^}]*min-width:\s*320px/s);
  }
});
