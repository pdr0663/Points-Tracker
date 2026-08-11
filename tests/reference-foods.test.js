import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "fake-indexeddb/auto";

import { resetDatabase } from "../public/js/db.js";
import { findFoodBySource, foodPointsPer100g } from "../public/js/foods.js";
import {
  getReferenceFood,
  importReferenceFood,
  searchReferenceFoods,
  validateReferenceCatalogue
} from "../public/js/reference-foods.js";

const catalogueText = await readFile(new URL("../public/data/afcd-reference.json", import.meta.url), "utf8");
const sourceText = await readFile(new URL("../AFCD Release 3 - Points Tracker Nutrients.csv", import.meta.url), "utf8");
const attributesText = await readFile(new URL("../.gitattributes", import.meta.url), "utf8");
const catalogue = validateReferenceCatalogue(JSON.parse(catalogueText));

test("generated AFCD Release 3 catalogue matches its checked-in source extract", () => {
  assert.equal(catalogue.release, "AFCD Release 3");
  assert.equal(catalogue.recordCount, 1588);
  assert.equal(catalogue.foods.length, 1588);
  assert.equal(catalogue.sourceSha256, createHash("sha256").update(sourceText).digest("hex"));
  assert.deepEqual(catalogue.foods.map((food) => food.id), [...catalogue.foods].map((food) => food.id).sort());
});

test("the AFCD source byte hash is portable across Git checkouts", () => {
  assert.match(attributesText, /^"AFCD Release 3 - Points Tracker Nutrients\.csv" text eol=crlf\s*$/m);
  assert.equal(sourceText.includes("\r\n"), true);
});

test("reference search is deterministic and supports names, descriptions, and identifiers", () => {
  const banana = searchReferenceFoods(catalogue, "cavendish banana");
  assert.equal(banana[0].id, "F000262");
  assert.equal(searchReferenceFoods(catalogue, "F000262")[0].name, "Banana, cavendish, peeled, raw");
  assert.ok(searchReferenceFoods(catalogue, "purchased frozen blueberry").some((food) => food.name.includes("Blueberry")));
  assert.deepEqual(searchReferenceFoods(catalogue, ""), []);
});

test("curated fruit mapping proposes fresh banana but not dried banana chips", () => {
  assert.equal(getReferenceFood(catalogue, "F000262").zeroPointCandidate, true);
  assert.equal(getReferenceFood(catalogue, "F000257").zeroPointCandidate, false);
});

test("AFCD copy-on-use snapshots nutrition and reuses the source identifier", async () => {
  await resetDatabase();
  const reference = getReferenceFood(catalogue, "F000262");
  const first = await importReferenceFood(reference, catalogue, {
    isZeroPoint: true,
    foodOptions: { foodId: "food-afcd-banana", timestamp: "2026-08-11T00:00:00Z" }
  });
  const second = await importReferenceFood(reference, catalogue);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.food.id, first.food.id);
  assert.deepEqual(first.food.nutritionPer100g, reference.nutritionPer100g);
  assert.deepEqual(first.food.source, {
    kind: "afcd",
    referenceId: "F000262",
    referenceRelease: "AFCD Release 3"
  });
  assert.equal(first.food.isZeroPoint, true);
  assert.equal(foodPointsPer100g(first.food), 0);
  assert.equal((await findFoodBySource("afcd", "F000262")).id, first.food.id);
});
