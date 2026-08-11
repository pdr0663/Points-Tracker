import { runTransaction } from "./db.js";
import { buildFood, normalizeFoodName } from "./foods.js";
import { JsonImportError } from "./json-import.js";
import { buildRecipe, calculateRecipe } from "./recipes.js";
import { getReferenceFood } from "./reference-foods.js";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function foodIdentity(food) {
  return `${normalizeFoodName(food.name)}\u0000${normalizeFoodName(food.brand)}`;
}

function importedCandidate(imported, catalogue) {
  if (imported.source.kind === "afcd") {
    const reference = catalogue && getReferenceFood(catalogue, imported.source.foodId);
    if (!reference) {
      throw new JsonImportError("AFCD_NOT_FOUND", `AFCD food '${imported.source.foodId}' was not found in the bundled catalogue.`, {
        foodId: imported.source.foodId,
        importKey: imported.importKey
      });
    }
    return {
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
  }
  return {
    name: imported.name,
    brand: imported.brand ?? "",
    nutritionPer100g: { ...imported.nutritionPer100g },
    servings: imported.servings.map((serving) => ({ ...serving })),
    isZeroPoint: false,
    source: { kind: "external-json" }
  };
}

function matchingSavedFoods(savedFoods, imported) {
  const identity = foodIdentity(imported);
  return savedFoods.filter((food) => foodIdentity(food) === identity);
}

function aliasMatches(savedFoods, aliases, imported) {
  const normalizedName = normalizeFoodName(imported.name);
  const foodIds = new Set(aliases
    .filter((alias) => (alias.normalizedAlias ?? normalizeFoodName(alias.alias)) === normalizedName)
    .map((alias) => alias.foodId));
  return savedFoods.filter((food) => foodIds.has(food.id));
}

function possibleMatches(savedFoods, imported) {
  const name = normalizeFoodName(imported.name);
  if (name.length < 4) return [];
  return savedFoods.filter((food) => {
    const savedName = food.normalizedName ?? normalizeFoodName(food.name);
    return savedName === name || savedName.includes(name) || name.includes(savedName);
  }).slice(0, 10);
}

function ambiguousEntry(imported, candidate, matches, reason) {
  return {
    importKey: imported.importKey,
    imported,
    candidate,
    status: "ambiguous",
    reason,
    matches,
    selection: undefined
  };
}

export function resolveRecipeImport(document, { savedFoods = [], aliases = [], catalogue } = {}) {
  if (document?.type !== "recipe-import") {
    throw new JsonImportError("IMPORT_INVALID", "A Version 1 recipe-import document is required.");
  }

  const entries = [];
  for (const imported of document.foods) {
    const candidate = importedCandidate(imported, catalogue);
    if (imported.source.kind === "afcd") {
      const sourceMatches = savedFoods.filter((food) =>
        food.source?.kind === "afcd" && food.source.referenceId === imported.source.foodId
      );
      if (sourceMatches.length === 1) {
        entries.push({ importKey: imported.importKey, imported, status: "reuse", reason: "same AFCD source identifier", food: sourceMatches[0] });
        continue;
      }
      if (sourceMatches.length > 1) {
        entries.push(ambiguousEntry(imported, candidate, sourceMatches, "multiple foods share this AFCD source identifier"));
        continue;
      }
    }

    const exactMatches = matchingSavedFoods(savedFoods, imported);
    if (exactMatches.length === 1) {
      entries.push({ importKey: imported.importKey, imported, candidate, status: "reuse", reason: "exact saved food", food: exactMatches[0] });
      continue;
    }
    if (exactMatches.length > 1) {
      entries.push(ambiguousEntry(imported, candidate, exactMatches, "multiple exact saved foods"));
      continue;
    }

    const aliasesForFood = aliasMatches(savedFoods, aliases, imported);
    if (aliasesForFood.length === 1) {
      entries.push({ importKey: imported.importKey, imported, candidate, status: "reuse", reason: "saved food alias", food: aliasesForFood[0] });
      continue;
    }
    if (aliasesForFood.length > 1) {
      entries.push(ambiguousEntry(imported, candidate, aliasesForFood, "alias matches more than one saved food"));
      continue;
    }

    const earlier = entries.find((entry) => {
      if (imported.source.kind === "afcd") {
        return entry.imported.source.kind === "afcd" && entry.imported.source.foodId === imported.source.foodId;
      }
      return entry.imported.source.kind === "external-json" && foodIdentity(entry.imported) === foodIdentity(imported);
    });
    if (earlier) {
      entries.push({ importKey: imported.importKey, imported, candidate, status: "bundle-reuse", reason: "same food already declared in this bundle", targetImportKey: earlier.importKey });
      continue;
    }

    if (imported.source.kind === "afcd") {
      entries.push({ importKey: imported.importKey, imported, candidate, status: "create", reason: "exact AFCD reference" });
      continue;
    }

    const possible = possibleMatches(savedFoods, imported);
    if (possible.length) {
      entries.push(ambiguousEntry(imported, candidate, possible, "possible saved food match"));
    } else {
      entries.push({ importKey: imported.importKey, imported, candidate, status: "create", reason: "new external food" });
    }
  }

  return { document, entries };
}

export function selectRecipeImportResolution(resolution, importKey, selection) {
  const entry = resolution.entries.find((candidate) => candidate.importKey === importKey);
  if (!entry || entry.status !== "ambiguous") {
    throw new JsonImportError("IMPORT_INVALID", `Food '${importKey}' does not require a resolution choice.`);
  }
  if (selection.action === "create") {
    entry.selection = { action: "create" };
    return entry;
  }
  const food = entry.matches.find((candidate) => candidate.id === selection.foodId);
  if (!food) throw new JsonImportError("IMPORT_INVALID", "The selected saved food is not one of the proposed matches.");
  entry.selection = { action: "reuse", food };
  return entry;
}

export function canConfirmRecipeImport(resolution) {
  return resolution.entries.every((entry) =>
    ["reuse", "create", "bundle-reuse"].includes(entry.status)
    || (entry.status === "ambiguous" && entry.selection)
  );
}

function selectedAction(entry) {
  if (entry.status === "reuse") return { action: "reuse", food: entry.food };
  if (entry.status === "create") return { action: "create" };
  if (entry.status === "ambiguous") return entry.selection;
  if (entry.status === "bundle-reuse") return { action: "bundle-reuse", targetImportKey: entry.targetImportKey };
  return undefined;
}

export function previewRecipeImport(resolution) {
  if (!canConfirmRecipeImport(resolution)) return undefined;
  const foodByImportKey = new Map();
  const foods = [];
  resolution.entries.forEach((entry, index) => {
    const action = selectedAction(entry);
    if (action.action === "bundle-reuse") {
      foodByImportKey.set(entry.importKey, foodByImportKey.get(action.targetImportKey));
      return;
    }
    const food = action.action === "reuse"
      ? action.food
      : buildFood(entry.candidate, {
        foodId: `preview-food-${index}`,
        servingIdFactory: (servingIndex) => `preview-serving-${index}-${servingIndex}`,
        timestamp: "2000-01-01T00:00:00.000Z"
      });
    foodByImportKey.set(entry.importKey, food);
    if (!foods.some((candidate) => candidate.id === food.id)) foods.push(food);
  });
  return calculateRecipe({
    name: resolution.document.recipe.name,
    servings: resolution.document.recipe.servings,
    ingredients: resolution.document.recipe.ingredients.map((ingredient) => ({
      foodId: foodByImportKey.get(ingredient.foodImportKey)?.id,
      quantity: ingredient.quantity,
      unit: ingredient.unit
    }))
  }, foods, { ingredientIdFactory: (index) => `preview-ingredient-${index}` });
}

export async function confirmRecipeImport(resolution, options = {}) {
  if (!canConfirmRecipeImport(resolution)) {
    throw new JsonImportError("RECIPE_UNRESOLVED", "Resolve every food conflict before confirming this recipe.");
  }

  const foodByImportKey = new Map();
  const foodsToCreate = [];
  const allFoods = [...(options.savedFoods ?? [])];
  const timestamp = options.timestamp ?? new Date().toISOString();

  resolution.entries.forEach((entry, index) => {
    const action = selectedAction(entry);
    if (action.action === "reuse") {
      foodByImportKey.set(entry.importKey, action.food);
      if (!allFoods.some((food) => food.id === action.food.id)) allFoods.push(action.food);
      return;
    }
    if (action.action === "bundle-reuse") {
      const food = foodByImportKey.get(action.targetImportKey);
      if (!food) throw new JsonImportError("RECIPE_UNRESOLVED", `Bundled food '${action.targetImportKey}' was not resolved.`);
      foodByImportKey.set(entry.importKey, food);
      return;
    }
    const reviewed = options.foodOverrides?.[entry.importKey] ?? entry.candidate;
    const food = buildFood({ ...reviewed, source: entry.candidate.source }, {
      foodId: options.foodIdFactory?.(entry.importKey, index),
      servingIdFactory: options.servingIdFactory
        ? (servingIndex) => options.servingIdFactory(entry.importKey, servingIndex)
        : undefined,
      timestamp
    });
    foodsToCreate.push(food);
    allFoods.push(food);
    foodByImportKey.set(entry.importKey, food);
  });

  const recipeInput = {
    name: resolution.document.recipe.name,
    servings: resolution.document.recipe.servings,
    ingredients: resolution.document.recipe.ingredients.map((ingredient) => ({
      foodId: foodByImportKey.get(ingredient.foodImportKey)?.id,
      quantity: ingredient.quantity,
      unit: ingredient.unit
    }))
  };
  const recipe = buildRecipe(recipeInput, allFoods, {
    recipeId: options.recipeId,
    ingredientIdFactory: options.ingredientIdFactory,
    timestamp
  });

  const transactionRunner = options.transactionRunner ?? runTransaction;
  await transactionRunner(["foods", "recipes"], "readwrite", async (stores) => {
    for (const food of foodsToCreate) await requestResult(stores.foods.add(food));
    await options.beforeRecipeWrite?.({ foodsToCreate, recipe, stores });
    await requestResult(stores.recipes.add(recipe));
  });

  return {
    recipe,
    foodsCreated: foodsToCreate,
    foodsReused: [...new Map(
      [...foodByImportKey.values()].filter((food) => !foodsToCreate.includes(food)).map((food) => [food.id, food])
    ).values()]
  };
}
