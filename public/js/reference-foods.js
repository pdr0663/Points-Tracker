import { createFood, findFoodBySource, normalizeFoodName } from "./foods.js";

export const REFERENCE_CATALOGUE_URL = new URL("../data/afcd-reference.json", import.meta.url);
let cataloguePromise;

function requireNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a non-negative number.`);
  return value;
}

export function validateReferenceCatalogue(catalogue) {
  if (!catalogue || typeof catalogue !== "object" || Array.isArray(catalogue)) throw new TypeError("AFCD catalogue must be an object.");
  if (catalogue.schemaVersion !== 1) throw new RangeError("Unsupported AFCD catalogue version.");
  if (typeof catalogue.release !== "string" || !catalogue.release.trim()) throw new TypeError("AFCD release is required.");
  if (!Array.isArray(catalogue.foods) || catalogue.foods.length !== catalogue.recordCount) throw new TypeError("AFCD record count does not match the catalogue.");
  const ids = new Set();
  for (const food of catalogue.foods) {
    if (!food || typeof food !== "object" || !/^F\d{6}$/.test(food.id)) throw new TypeError("AFCD food identifier is invalid.");
    if (ids.has(food.id)) throw new TypeError(`Duplicate AFCD food identifier: ${food.id}.`);
    ids.add(food.id);
    if (typeof food.name !== "string" || !food.name.trim()) throw new TypeError(`${food.id} has no name.`);
    if (typeof food.description !== "string" || typeof food.searchText !== "string" || !/^\d{5}$/.test(food.classification)) {
      throw new TypeError(`${food.id} has invalid descriptive data.`);
    }
    for (const nutrient of ["protein", "carbohydrate", "fat", "fibre"]) {
      requireNumber(food.nutritionPer100g?.[nutrient], `${food.id} ${nutrient}`);
    }
    if (typeof food.zeroPointCandidate !== "boolean") throw new TypeError(`${food.id} has invalid zero-point metadata.`);
  }
  return catalogue;
}

export async function loadReferenceCatalogue(options = {}) {
  if (options.catalogue) return validateReferenceCatalogue(options.catalogue);
  if (!cataloguePromise || options.fetchImpl) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new TypeError("Fetch is unavailable for the AFCD catalogue.");
    const request = (async () => {
      const response = await fetchImpl(options.url ?? REFERENCE_CATALOGUE_URL);
      if (!response.ok) throw new Error(`AFCD catalogue could not be loaded (${response.status}).`);
      return validateReferenceCatalogue(await response.json());
    })();
    if (options.fetchImpl) return request;
    cataloguePromise = request.catch((error) => {
      cataloguePromise = undefined;
      throw error;
    });
  }
  return cataloguePromise;
}

export function searchReferenceFoods(catalogue, query, options = {}) {
  const normalized = normalizeFoodName(query);
  if (!normalized) return [];
  const terms = normalized.split(" ");
  const limit = options.limit ?? 50;
  return catalogue.foods
    .filter((food) => terms.every((term) => food.searchText.includes(term)))
    .sort((left, right) => {
      const leftName = normalizeFoodName(left.name);
      const rightName = normalizeFoodName(right.name);
      const leftExact = leftName === normalized ? 0 : leftName.startsWith(normalized) ? 1 : 2;
      const rightExact = rightName === normalized ? 0 : rightName.startsWith(normalized) ? 1 : 2;
      return leftExact - rightExact || leftName.localeCompare(rightName) || left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

export function getReferenceFood(catalogue, foodId) {
  return catalogue.foods.find((food) => food.id === foodId);
}

export async function importReferenceFood(reference, catalogue, options = {}) {
  if (!reference || !catalogue.foods.includes(reference)) throw new RangeError("AFCD food does not belong to the loaded catalogue.");
  const existing = await findFoodBySource("afcd", reference.id);
  if (existing) return { food: existing, created: false };
  const servingId = options.servingId ?? `serving-afcd-${reference.id.toLowerCase()}`;
  const food = await createFood({
    name: reference.name,
    brand: "",
    nutritionPer100g: { ...reference.nutritionPer100g },
    servings: [{ id: servingId, description: "100 g", grams: 100 }],
    defaultServingId: servingId,
    isZeroPoint: options.isZeroPoint ?? reference.zeroPointCandidate,
    source: {
      kind: "afcd",
      referenceId: reference.id,
      referenceRelease: catalogue.release
    }
  }, options.foodOptions);
  return { food, created: true };
}

