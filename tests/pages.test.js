import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Pages entry point uses repository-subpath-safe asset URLs", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /href="\.\/css\/app\.css"/);
  assert.match(html, /src="\.\/js\/app\.js"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:css|js)\//);
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
