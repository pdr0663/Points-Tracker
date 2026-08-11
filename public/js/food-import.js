import { createFood, normalizeFoodName } from "./foods.js";
import { JsonImportError } from "./json-import.js";
import { getReferenceFood } from "./reference-foods.js";

function exactSavedFood(savedFoods, candidate) {
  const name = normalizeFoodName(candidate.name);
  const brand = normalizeFoodName(candidate.brand);
  return savedFoods.find((food) =>
    (food.normalizedName ?? normalizeFoodName(food.name)) === name
    && (food.normalizedBrand ?? normalizeFoodName(food.brand)) === brand
  );
}

export function resolveFoodImport(document, catalogue, savedFoods = []) {
  if (document?.type !== "food-import") {
    throw new JsonImportError("IMPORT_INVALID", "A Version 1 food-import document is required.");
  }

  const imported = document.food;
  let candidate;
  let existing;
  let zeroPointSuggested = false;

  if (imported.source.kind === "afcd") {
    const reference = catalogue && getReferenceFood(catalogue, imported.source.foodId);
    if (!reference) {
      throw new JsonImportError("AFCD_NOT_FOUND", `AFCD food '${imported.source.foodId}' was not found in the bundled catalogue.`, {
        foodId: imported.source.foodId
      });
    }
    candidate = {
      name: imported.name,
      brand: imported.brand ?? "",
      nutritionPer100g: { ...reference.nutritionPer100g },
      servings: imported.servings.map((serving) => ({ ...serving })),
      isZeroPoint: reference.zeroPointCandidate,
      source: {
        kind: "afcd",
        referenceId: reference.id,
        referenceRelease: catalogue.release
      }
    };
    zeroPointSuggested = reference.zeroPointCandidate;
    existing = savedFoods.find((food) => food.source?.kind === "afcd" && food.source.referenceId === reference.id);
  } else {
    candidate = {
      name: imported.name,
      brand: imported.brand ?? "",
      nutritionPer100g: { ...imported.nutritionPer100g },
      servings: imported.servings.map((serving) => ({ ...serving })),
      isZeroPoint: false,
      source: { kind: "external-json" }
    };
    existing = exactSavedFood(savedFoods, candidate);
  }

  return { candidate, existing, zeroPointSuggested };
}

export async function confirmFoodImport(resolution, reviewedFood, options = {}) {
  if (options.reuseExisting) {
    if (!resolution.existing) throw new JsonImportError("IMPORT_INVALID", "There is no matching saved food to reuse.");
    return { food: resolution.existing, created: false };
  }
  const food = await createFood({
    ...reviewedFood,
    source: resolution.candidate.source
  }, options.foodOptions);
  return { food, created: true };
}
