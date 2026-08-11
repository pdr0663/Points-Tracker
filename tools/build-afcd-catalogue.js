import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../AFCD Release 3 - Points Tracker Nutrients.csv", import.meta.url);
const outputPath = new URL("../public/data/afcd-reference.json", import.meta.url);
const REQUIRED_COLUMNS = [
  "public_food_key",
  "classification",
  "food_name",
  "food_description",
  "protein_g_per_100g",
  "carbohydrate_g_per_100g",
  "fat_g_per_100g",
  "fibre_g_per_100g"
];

const ZERO_POINT_FRUIT_CLASSIFICATIONS = new Set([
  "16101", "16102", "16103",
  "16201",
  "16301", "16302", "16303",
  "16401", "16403",
  "16501", "16502",
  "16601"
]);
const ZERO_POINT_EXCLUSIONS = /\b(canned|dried|dehydrated|preserved|salted|syrup|sweetened|juice|chip|paste|stewed)\b/i;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("CSV ends inside a quoted field.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function normalizeSearchText(value) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-AU")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nutrient(value, foodId, column) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${foodId} has invalid ${column}.`);
  return parsed;
}

function makeRecord(values, columns) {
  const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  const id = row.public_food_key.trim();
  const classification = row.classification.trim();
  const name = row.food_name.trim();
  const description = row.food_description.trim();
  if (!/^F\d{6}$/.test(id)) throw new Error(`Invalid Public Food Key: ${id || "blank"}.`);
  if (!/^\d{5}$/.test(classification)) throw new Error(`${id} has invalid classification.`);
  if (!name || !description) throw new Error(`${id} has a blank name or description.`);
  const candidateText = `${name} ${description}`;
  return {
    id,
    name,
    description,
    classification,
    searchText: normalizeSearchText(`${id} ${name} ${description}`),
    nutritionPer100g: {
      protein: nutrient(row.protein_g_per_100g, id, "protein"),
      carbohydrate: nutrient(row.carbohydrate_g_per_100g, id, "carbohydrate"),
      fat: nutrient(row.fat_g_per_100g, id, "fat"),
      fibre: nutrient(row.fibre_g_per_100g, id, "fibre")
    },
    zeroPointCandidate: ZERO_POINT_FRUIT_CLASSIFICATIONS.has(classification) && !ZERO_POINT_EXCLUSIONS.test(candidateText)
  };
}

const source = await readFile(sourcePath, "utf8");
const csvRows = parseCsv(source.replace(/^\uFEFF/, ""));
const columns = csvRows.shift();
if (columns.length !== REQUIRED_COLUMNS.length || columns.some((column, index) => column !== REQUIRED_COLUMNS[index])) {
  throw new Error("AFCD extract columns do not match the expected Release 3 format.");
}

const foods = csvRows.filter((row) => row.some((field) => field !== "")).map((row) => {
  if (row.length !== columns.length) throw new Error(`CSV row has ${row.length} fields; expected ${columns.length}.`);
  return makeRecord(row, columns);
}).sort((left, right) => left.id.localeCompare(right.id));

const ids = new Set();
for (const food of foods) {
  if (ids.has(food.id)) throw new Error(`Duplicate AFCD food identifier: ${food.id}.`);
  ids.add(food.id);
}
if (foods.length !== 1588) throw new Error(`Expected 1,588 AFCD foods, found ${foods.length}.`);

const catalogue = {
  schemaVersion: 1,
  release: "AFCD Release 3",
  recordCount: foods.length,
  sourceFile: "AFCD Release 3 - Points Tracker Nutrients.csv",
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  attribution: "Food Standards Australia New Zealand, Australian Food Composition Database Release 3.",
  sourceUrl: "https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files",
  licenceUrl: "https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement",
  limitation: "Food composition values may represent averages and can vary between batches, brands, seasons, processing practices, ingredient sources, and calculation methods.",
  zeroPointPolicy: {
    candidateClassifications: [...ZERO_POINT_FRUIT_CLASSIFICATIONS].sort(),
    excludedDescriptionTerms: ZERO_POINT_EXCLUSIONS.source,
    requiresUserReview: true
  },
  foods
};

await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(catalogue)}\n`, "utf8");
console.log(`Wrote ${foods.length} AFCD foods to ${outputPath.pathname}.`);
