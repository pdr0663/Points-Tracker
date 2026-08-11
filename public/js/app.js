import { openDatabase } from "./db.js";
import {
  backupFilename,
  createBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
  restoreBackup,
  serializeBackup,
  summarizeBackup
} from "./backup.js";
import {
  createDiaryEntry,
  deleteDiaryEntry,
  duplicateDiaryEntry,
  getDiarySummary,
  getWeeklySummary,
  MEALS,
  shiftLocalDate,
  updateDiaryEntry,
  weekRange
} from "./diary.js";
import {
  createFood,
  deleteFood,
  foodPointsForDefaultServing,
  foodPointsForGrams,
  foodPointsPer100g,
  listFoodAliases,
  normalizeFoodName,
  searchFoods,
  updateFood
} from "./foods.js";
import { confirmFoodImport, resolveFoodImport } from "./food-import.js";
import { requiredFormNumber } from "./form-values.js";
import { roundPoints } from "./points.js";
import { createWeightChartModel, getProgressSummary } from "./progress.js";
import { registerServiceWorker } from "./pwa.js";
import {
  calculateRecipe,
  createRecipe,
  deleteRecipe,
  listRecipes,
  recipePointsForServings,
  searchRecipes,
  updateRecipe
} from "./recipes.js";
import {
  canConfirmRecipeImport,
  confirmRecipeImport,
  previewRecipeImport,
  resolveRecipeImport,
  selectRecipeImportResolution
} from "./recipe-import.js";
import { createRouter } from "./router.js";
import { JsonImportError, MAX_IMPORT_BYTES, parseImportText } from "./json-import.js";
import {
  importReferenceFood,
  loadReferenceCatalogue,
  searchReferenceFoods
} from "./reference-foods.js";
import {
  addWeighIn,
  createUserWithInitialWeighIn,
  getCurrentUser,
  listUsers,
  listWeighIns,
  localDateString,
  setCurrentUser,
  updateTargetWeight
} from "./users.js";

const main = document.querySelector("#main-content");
const profileSwitcher = document.querySelector("#profile-switcher");
const addProfileButton = document.querySelector("#add-profile");

let currentRoute;
let showingUserForm = false;
let showingFoodForm = false;
let editingFoodId;
let foodSearchQuery = "";
let pendingDeleteFoodId;
let foodNotice;
let referenceFoodPreview;
let selectedDiaryDate = localDateString();
let showingDiaryForm = false;
let editingDiaryEntryId;
let pendingDeleteDiaryEntryId;
let diaryNotice;
let selectedWeekDate = localDateString();
let progressView = "overview";
let showingRecipeForm = false;
let editingRecipeId;
let pendingDeleteRecipeId;
let pendingRecipeDiaryId;
let recipeSearchQuery = "";
let recipeNotice;
let jsonImportWorkflow;
let renderSequence = 0;

function createElement(tagName, options = {}) {
  const element = document.createElement(tagName);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.attributes) {
    Object.entries(options.attributes).forEach(([name, value]) => {
      if (value !== undefined && value !== null) element.setAttribute(name, value);
    });
  }
  return element;
}

function createScreenHeader(title, description) {
  const header = createElement("header", { className: "screen-header" });
  header.append(
    createElement("h2", { text: title }),
    createElement("p", { text: description })
  );
  return header;
}

function createField({ label, name, type = "text", value, min, max, step, options, required = true, attributes = {} }) {
  const wrapper = createElement("div", { className: "form-field" });
  const id = `field-${name}`;
  const labelElement = createElement("label", { text: label, attributes: { for: id } });
  let control;

  if (options) {
    control = createElement("select", { attributes: { ...attributes, id, name, required: required ? "" : undefined } });
    options.forEach((option) => {
      const optionElement = createElement("option", {
        text: option.label,
        attributes: { value: option.value }
      });
      if (option.value === value) optionElement.selected = true;
      control.append(optionElement);
    });
  } else {
    control = createElement("input", {
      attributes: {
        ...attributes,
        id,
        name,
        type,
        value,
        min,
        max,
        step,
        required: required ? "" : undefined
      }
    });
  }

  wrapper.append(labelElement, control);
  return wrapper;
}

function createFormMessage() {
  return createElement("p", {
    className: "form-message",
    attributes: { role: "status", "aria-live": "polite" }
  });
}

function showFormMessage(messageElement, message, type = "error") {
  messageElement.textContent = message;
  messageElement.dataset.type = type;
}

function numberValue(formData, name) {
  return requiredFormNumber(formData.get(name), name);
}

async function loadUserState() {
  const users = await listUsers();
  const currentUser = await getCurrentUser();
  const weighIns = currentUser ? await listWeighIns(currentUser.id) : [];
  return { users, currentUser, weighIns };
}

function updateProfileControls({ users, currentUser }) {
  profileSwitcher.replaceChildren();

  if (!users.length) {
    profileSwitcher.append(createElement("option", { text: "Set up profile" }));
    profileSwitcher.disabled = true;
    addProfileButton.hidden = true;
    return;
  }

  users.forEach((user) => {
    const option = createElement("option", {
      text: user.name,
      attributes: { value: user.id }
    });
    option.selected = user.id === currentUser?.id;
    profileSwitcher.append(option);
  });
  profileSwitcher.disabled = false;
  addProfileButton.hidden = false;
}

function createUserForm(hasExistingUsers) {
  const card = createElement("section", { className: "card form-card" });
  const form = createElement("form", { className: "data-form" });
  const fields = createElement("div", { className: "form-grid" });
  const today = localDateString();

  fields.append(
    createField({ label: "Name", name: "name", attributes: { autocomplete: "name" } }),
    createField({
      label: "Sex used by the historical allowance formula",
      name: "sex",
      value: "male",
      options: [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" }
      ]
    }),
    createField({ label: "Date of birth", name: "dateOfBirth", type: "date", max: today }),
    createField({ label: "Height (cm)", name: "heightCm", type: "number", min: "1", step: "0.1" }),
    createField({ label: "Current weight (kg)", name: "currentWeightKg", type: "number", min: "1", step: "0.1" }),
    createField({ label: "Target weight (kg)", name: "targetWeightKg", type: "number", min: "1", step: "0.1" }),
    createField({ label: "Minimum daily PP", name: "dailyMinimum", type: "number", min: "0", step: "1", value: "26" }),
    createField({ label: "Weekly allowance", name: "weeklyAllowance", type: "number", min: "0", step: "1", value: "49" })
  );

  const note = createElement("p", {
    className: "form-note",
    text: `The initial weigh-in will be recorded for ${today}. All information stays in this browser.`
  });
  const message = createFormMessage();
  const actions = createElement("div", { className: "form-actions" });
  const submit = createElement("button", {
    className: "button button--primary",
    text: hasExistingUsers ? "Add profile" : "Create profile",
    attributes: { type: "submit" }
  });
  actions.append(submit);

  if (hasExistingUsers) {
    const cancel = createElement("button", {
      className: "button button--secondary",
      text: "Cancel",
      attributes: { type: "button" }
    });
    cancel.addEventListener("click", () => {
      showingUserForm = false;
      void renderCurrentRoute();
    });
    actions.append(cancel);
  }

  form.append(fields, note, message, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    showFormMessage(message, "Saving profile…", "progress");

    try {
      const values = new FormData(form);
      await createUserWithInitialWeighIn({
        name: values.get("name"),
        sex: values.get("sex"),
        dateOfBirth: values.get("dateOfBirth"),
        heightCm: numberValue(values, "heightCm"),
        currentWeightKg: numberValue(values, "currentWeightKg"),
        targetWeightKg: numberValue(values, "targetWeightKg"),
        dailyMinimum: numberValue(values, "dailyMinimum"),
        weeklyAllowance: numberValue(values, "weeklyAllowance"),
        weighInDate: today
      });
      showingUserForm = false;
      await renderCurrentRoute();
    } catch (error) {
      console.error("Could not create profile", error);
      showFormMessage(message, error.message);
      submit.disabled = false;
    }
  });

  card.append(form);
  return card;
}

function renderSetupScreen(state) {
  const screen = createElement("section", { className: "screen" });
  screen.append(
    createScreenHeader(
      state.users.length ? "Add household profile" : "Set up Points",
      state.users.length
        ? "Create another independent profile while keeping foods and recipes shared."
        : "Create the first household profile and initial weigh-in."
    ),
    createUserForm(state.users.length > 0),
    createBackupCard({ canExport: state.users.length > 0 })
  );
  return screen;
}

function createMetric(label, value, detail) {
  const metric = createElement("article", { className: "metric" });
  metric.append(
    createElement("p", { className: "metric__label", text: label }),
    createElement("p", { className: "metric__value", text: value })
  );
  if (detail) metric.append(createElement("p", { className: "metric__detail", text: detail }));
  return metric;
}

function renderTodayScreen(state, summary, weekly) {
  const { currentUser, weighIns } = state;
  const currentWeighIn = weighIns.at(-1);
  const screen = createElement("section", { className: "screen" });
  screen.append(createScreenHeader("Today", `${currentUser.name} · ${summary.date}`));

  const metrics = createElement("div", { className: "metrics-grid" });
  metrics.append(
    createMetric("Current weight", `${currentWeighIn.weightKg.toFixed(1)} kg`, `Recorded ${currentWeighIn.date}`),
    createMetric("Target weight", `${currentUser.targetWeightKg.toFixed(1)} kg`, `${Math.max(0, currentWeighIn.weightKg - currentUser.targetWeightKg).toFixed(1)} kg remaining`),
    createMetric("Used today", `${displayPoints(summary.usedPoints)} PP`, `${summary.dailyBudget} PP daily budget`),
    createMetric(
      summary.remainingPoints >= 0 ? "Remaining today" : "Daily excess",
      `${displayPoints(Math.abs(summary.remainingPoints))} PP`,
      summary.remainingPoints >= 0 ? "Available from today's budget" : "Counted against weekly extras"
    )
  );
  screen.append(metrics);

  const week = createElement("article", { className: "card card--accent today-week" });
  week.append(
    createElement("h3", { text: "This week" }),
    createElement("p", { text: `${summary.weekStart} to ${summary.weekEnd}` }),
    createElement("p", {
      className: "today-week__value",
      text: `${displayPoints(weekly.ordinaryPointsConsumed)} / ${displayPoints(weekly.ordinaryBudgetAvailable)} ordinary PP used`
    }),
    createElement("p", {
      text: `${displayPoints(weekly.weeklyExtrasConsumed)} / ${currentUser.weeklyAllowance} PP weekly extras used`
    }),
    createElement("p", {
      text: weekly.weeklyExtrasRemaining >= 0
        ? `${displayPoints(weekly.weeklyExtrasRemaining)} PP weekly extras remaining`
        : `${displayPoints(Math.abs(weekly.weeklyExtrasRemaining))} PP beyond weekly extras`
    })
  );

  const actions = createElement("div", { className: "today-actions" });
  const addEntry = createElement("button", { className: "button button--primary", text: "Add food", attributes: { type: "button" } });
  addEntry.addEventListener("click", () => {
    selectedDiaryDate = summary.date;
    showingDiaryForm = true;
    editingDiaryEntryId = undefined;
    window.location.hash = "diary";
  });
  const viewDiary = createElement("button", { className: "button button--secondary", text: "View diary", attributes: { type: "button" } });
  viewDiary.addEventListener("click", () => {
    selectedDiaryDate = summary.date;
    window.location.hash = "diary";
  });
  const viewWeek = createElement("button", { className: "button button--secondary", text: "View week", attributes: { type: "button" } });
  viewWeek.addEventListener("click", () => {
    selectedWeekDate = summary.date;
    progressView = "weekly";
    window.location.hash = "progress";
  });
  actions.append(addEntry, viewDiary, viewWeek);
  screen.append(week, actions);
  return screen;
}

function createWeighInForm(state) {
  const card = createElement("article", { className: "card" });
  card.append(createElement("h3", { text: "Record weigh-in" }));
  const form = createElement("form", { className: "data-form data-form--compact" });
  const fields = createElement("div", { className: "form-grid" });
  fields.append(
    createField({ label: "Date", name: "date", type: "date", value: localDateString() }),
    createField({ label: "Weight (kg)", name: "weightKg", type: "number", min: "1", step: "0.1" })
  );
  const message = createFormMessage();
  const submit = createElement("button", {
    className: "button button--primary",
    text: "Save weigh-in",
    attributes: { type: "submit" }
  });
  form.append(fields, message, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const values = new FormData(form);
      const weighIn = await addWeighIn({
        userId: state.currentUser.id,
        date: values.get("date"),
        weightKg: numberValue(values, "weightKg")
      });
      showFormMessage(message, `Saved with a ${weighIn.dailyBudget} PP daily allowance.`, "success");
      await renderCurrentRoute();
    } catch (error) {
      console.error("Could not save weigh-in", error);
      showFormMessage(message, error.message);
      submit.disabled = false;
    }
  });
  card.append(form);
  return card;
}

function createTargetForm(state) {
  const card = createElement("article", { className: "card" });
  card.append(createElement("h3", { text: "Target weight" }));
  const form = createElement("form", { className: "data-form data-form--compact" });
  const field = createField({
    label: "Target weight (kg)",
    name: "targetWeightKg",
    type: "number",
    min: "1",
    step: "0.1",
    value: String(state.currentUser.targetWeightKg)
  });
  const message = createFormMessage();
  const submit = createElement("button", {
    className: "button button--primary",
    text: "Update target",
    attributes: { type: "submit" }
  });
  form.append(field, message, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const values = new FormData(form);
      await updateTargetWeight(state.currentUser.id, numberValue(values, "targetWeightKg"));
      showFormMessage(message, "Target weight updated.", "success");
      await renderCurrentRoute();
    } catch (error) {
      console.error("Could not update target weight", error);
      showFormMessage(message, error.message);
      submit.disabled = false;
    }
  });
  card.append(form);
  return card;
}

function createWeighInHistory(weighIns) {
  const card = createElement("article", { className: "card card--wide" });
  card.append(createElement("h3", { text: "Weigh-in history" }));
  const list = createElement("ol", { className: "history-list" });
  [...weighIns].reverse().forEach((entry) => {
    const item = createElement("li");
    item.append(
      createElement("span", { text: entry.date }),
      createElement("strong", { text: `${entry.weightKg.toFixed(1)} kg` }),
      createElement("span", { text: `${entry.dailyBudget} PP/day` })
    );
    list.append(item);
  });
  card.append(list);
  return card;
}

function createBackupCard({ canExport }) {
  const card = createElement("section", { className: "card card--wide backup-card" });
  card.append(
    createElement("h3", { text: "Backup and restore" }),
    createElement("p", { text: "Export every local profile, food, recipe, diary entry, setting, and weigh-in as one JSON file." })
  );

  const actions = createElement("div", { className: "form-actions" });
  const exportButton = createElement("button", {
    className: "button button--secondary",
    text: "Export backup",
    attributes: { type: "button", disabled: canExport ? undefined : "" }
  });
  const fileLabel = createElement("label", { className: "button button--secondary backup-file-label", text: "Choose backup file" });
  const fileInput = createElement("input", {
    attributes: { type: "file", accept: ".json,application/json", "aria-label": "Import backup file" }
  });
  fileLabel.append(fileInput);
  actions.append(exportButton, fileLabel);
  card.append(actions);

  const message = createFormMessage();
  card.append(message);
  const review = createElement("section", { className: "backup-review", attributes: { "aria-live": "polite" } });
  review.hidden = true;
  const reviewHeading = createElement("h4", { text: "Review backup contents" });
  const reviewMeta = createElement("p", { className: "form-note" });
  const counts = createElement("dl", { className: "backup-counts" });
  const confirmLabel = createElement("label", { className: "backup-confirm" });
  const confirm = createElement("input", { attributes: { type: "checkbox" } });
  confirmLabel.append(confirm, createElement("span", { text: "I understand this will replace all local Points Tracker data in this browser." }));
  const restoreButton = createElement("button", {
    className: "button button--danger",
    text: "Replace local data",
    attributes: { type: "button", disabled: "" }
  });
  review.append(reviewHeading, reviewMeta, counts, confirmLabel, restoreButton);
  card.append(review);

  let pendingBackup;
  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true;
    showFormMessage(message, "Preparing backup…", "progress");
    try {
      const backup = await createBackup();
      const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const download = createElement("a", { attributes: { href: url, download: backupFilename(localDateString()) } });
      document.body.append(download);
      download.click();
      download.remove();
      URL.revokeObjectURL(url);
      showFormMessage(message, "Backup downloaded.", "success");
    } catch (error) {
      console.error("Could not export backup", error);
      showFormMessage(message, error.message);
    } finally {
      exportButton.disabled = false;
    }
  });

  fileInput.addEventListener("change", async () => {
    pendingBackup = undefined;
    confirm.checked = false;
    restoreButton.disabled = true;
    review.hidden = true;
    const [file] = fileInput.files;
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      showFormMessage(message, "Backup file is larger than 10 MB.");
      return;
    }
    showFormMessage(message, "Validating backup…", "progress");
    try {
      pendingBackup = parseBackup(await file.text());
      const summary = summarizeBackup(pendingBackup);
      const labels = {
        users: "Profiles",
        weighIns: "Weigh-ins",
        foods: "Foods",
        foodAliases: "Food aliases",
        recipes: "Recipes",
        diaryEntries: "Diary entries",
        settings: "Settings"
      };
      counts.replaceChildren();
      Object.entries(summary).forEach(([storeName, count]) => counts.append(
        createElement("dt", { text: labels[storeName] }),
        createElement("dd", { text: String(count) })
      ));
      reviewMeta.textContent = `Exported ${new Date(pendingBackup.exportedAt).toLocaleString("en-AU")}. No data has been changed yet.`;
      review.hidden = false;
      showFormMessage(message, "Backup is valid. Review the contents before confirming.", "success");
    } catch (error) {
      console.warn("Backup validation rejected the selected file", error);
      showFormMessage(message, error.message);
    }
  });

  confirm.addEventListener("change", () => {
    restoreButton.disabled = !(pendingBackup && confirm.checked);
  });
  restoreButton.addEventListener("click", async () => {
    if (!pendingBackup || !confirm.checked) return;
    restoreButton.disabled = true;
    fileInput.disabled = true;
    showFormMessage(message, "Restoring backup…", "progress");
    try {
      await restoreBackup(pendingBackup);
      showingUserForm = false;
      showingFoodForm = false;
      showingDiaryForm = false;
      showingRecipeForm = false;
      window.location.hash = "today";
      await renderCurrentRoute();
    } catch (error) {
      console.error("Could not restore backup", error);
      showFormMessage(message, error.message);
      fileInput.disabled = false;
      restoreButton.disabled = false;
    }
  });

  return card;
}

function renderSettingsScreen(state) {
  const screen = createElement("section", { className: "screen" });
  screen.append(createScreenHeader("Settings", `Profile and weigh-ins for ${state.currentUser.name}.`));
  const grid = createElement("div", { className: "card-grid card-grid--two" });
  grid.append(
    createWeighInForm(state),
    createTargetForm(state),
    createWeighInHistory(state.weighIns),
    createBackupCard({ canExport: true })
  );
  screen.append(grid);
  return screen;
}

function displayPoints(rawPoints) {
  return String(roundPoints(rawPoints));
}

function startJsonImport(expectedType) {
  jsonImportWorkflow = { expectedType, stage: "paste", text: "", error: undefined };
  void renderCurrentRoute();
}

function cancelJsonImport() {
  jsonImportWorkflow = undefined;
  void renderCurrentRoute();
}

function importTypeLabel(type) {
  return type === "food-import" ? "food" : "recipe";
}

function recipeImportStatus(entry) {
  if (entry.status === "reuse") return `Reuse saved food · ${entry.reason}`;
  if (entry.status === "create") return entry.candidate.source.kind === "afcd"
    ? `Import AFCD food · ${entry.candidate.source.referenceId}`
    : "Create new shared food";
  if (entry.status === "bundle-reuse") return `Reuse bundled food · ${entry.targetImportKey}`;
  if (entry.selection?.action === "reuse") return `Selected saved food · ${entry.selection.food.name}`;
  if (entry.selection?.action === "create") return "Confirmed as a new shared food";
  return `Needs confirmation · ${entry.reason}`;
}

function createRecipeImportResolution(entry, workflow) {
  const item = createElement("article", { className: "import-preview__food" });
  const displayFood = entry.status === "reuse" ? entry.food : entry.candidate;
  item.append(
    createElement("h4", { text: `${entry.importKey} · ${entry.imported.name}` }),
    createElement("p", { className: "import-preview__source", text: recipeImportStatus(entry) })
  );
  if (displayFood?.brand) item.append(createElement("p", { text: `Brand: ${displayFood.brand}` }));
  if (displayFood?.nutritionPer100g) {
    const nutrition = displayFood.nutritionPer100g;
    item.append(createElement("p", {
      text: `Per 100 g: protein ${nutrition.protein} g · carbohydrate ${nutrition.carbohydrate} g · fat ${nutrition.fat} g · fibre ${nutrition.fibre} g`
    }));
  }

  if (entry.status === "ambiguous") {
    const label = createElement("label", { className: "form-field" });
    label.append(createElement("span", { text: "Resolve match" }));
    const select = createElement("select", { attributes: { "aria-label": `Resolve ${entry.importKey}` } });
    select.append(createElement("option", { text: "Choose a resolution", attributes: { value: "" } }));
    select.append(createElement("option", { text: `Create new: ${entry.candidate.name}`, attributes: { value: "create" } }));
    entry.matches.forEach((food) => select.append(createElement("option", {
      text: `Reuse: ${food.name}${food.brand ? ` · ${food.brand}` : ""}`,
      attributes: { value: `reuse:${food.id}` }
    })));
    select.value = entry.selection?.action === "create" ? "create" : entry.selection?.food ? `reuse:${entry.selection.food.id}` : "";
    select.addEventListener("change", () => {
      entry.selection = undefined;
      if (select.value === "create") selectRecipeImportResolution(workflow.resolution, entry.importKey, { action: "create" });
      else if (select.value.startsWith("reuse:")) {
        selectRecipeImportResolution(workflow.resolution, entry.importKey, { action: "reuse", foodId: select.value.slice(6) });
      }
      void renderCurrentRoute();
    });
    label.append(select);
    item.append(label);
  }

  const createsFood = entry.status === "create" || entry.selection?.action === "create";
  if (createsFood) {
    const zeroLabel = createElement("label", { className: "checkbox-field" });
    const zeroPoint = createElement("input", { attributes: { type: "checkbox", checked: entry.candidate.isZeroPoint ? "" : undefined } });
    zeroPoint.addEventListener("change", () => {
      entry.candidate.isZeroPoint = zeroPoint.checked;
      void renderCurrentRoute();
    });
    zeroLabel.append(zeroPoint, createElement("span", { text: "Treat proposed food as zero-point" }));
    item.append(zeroLabel);
  }
  return item;
}

function createRecipeImportReviewCard(workflow) {
  const document = workflow.resolution.document;
  const card = createElement("section", { className: "card form-card json-import-card" });
  card.append(
    createElement("h3", { text: `Review recipe import · ${document.recipe.name}` }),
    createElement("p", { className: "notice", text: "No data has been changed. Review every reuse, new food, AFCD source, conflict, and zero-point choice before confirming." })
  );
  const overview = createElement("dl", { className: "import-preview__overview" });
  [["Recipe servings", document.recipe.servings], ["Bundled foods", workflow.resolution.entries.length], ["Ingredients", document.recipe.ingredients.length]]
    .forEach(([term, value]) => overview.append(createElement("dt", { text: term }), createElement("dd", { text: String(value) })));
  card.append(overview, createElement("h4", { text: "Food resolution" }));
  const foodList = createElement("div", { className: "import-preview__foods" });
  workflow.resolution.entries.forEach((entry) => foodList.append(createRecipeImportResolution(entry, workflow)));
  card.append(foodList);

  const ingredients = createElement("ul", { className: "import-preview__ingredients" });
  document.recipe.ingredients.forEach((ingredient) => ingredients.append(createElement("li", {
    text: `${ingredient.foodImportKey}: ${ingredient.quantity} ${ingredient.unit}`
  })));
  card.append(createElement("h4", { text: "Recipe ingredients" }), ingredients);

  const calculation = createElement("p", { className: "food-calculation", attributes: { role: "status", "aria-live": "polite" } });
  try {
    const preview = previewRecipeImport(workflow.resolution);
    calculation.textContent = preview
      ? `${displayPoints(preview.rawTotalPoints)} PP total · ${displayPoints(preview.rawPointsPerServing)} PP per serving`
      : "Resolve every possible match to calculate and confirm this recipe.";
  } catch {
    calculation.textContent = "Resolve every valid food and serving before confirming this recipe.";
  }

  const message = createFormMessage();
  const actions = createElement("div", { className: "form-actions" });
  const confirm = createElement("button", {
    className: "button button--primary",
    text: "Confirm recipe bundle",
    attributes: { type: "button", disabled: canConfirmRecipeImport(workflow.resolution) ? undefined : "" }
  });
  confirm.addEventListener("click", async () => {
    confirm.disabled = true;
    showFormMessage(message, "Importing foods and recipe…", "progress");
    try {
      const result = await confirmRecipeImport(workflow.resolution, { savedFoods: workflow.savedFoods });
      jsonImportWorkflow = undefined;
      recipeNotice = `${result.recipe.name} imported with ${result.foodsCreated.length} new and ${result.foodsReused.length} reused food${result.foodsReused.length === 1 ? "" : "s"}.`;
      await renderCurrentRoute();
    } catch (error) {
      console.error("Could not import recipe bundle", error);
      showFormMessage(message, error.message);
      confirm.disabled = !canConfirmRecipeImport(workflow.resolution);
    }
  });
  const edit = createElement("button", { className: "button button--secondary", text: "Edit JSON", attributes: { type: "button" } });
  edit.addEventListener("click", () => {
    workflow.stage = "paste";
    void renderCurrentRoute();
  });
  const cancel = createElement("button", { className: "button button--secondary", text: "Cancel", attributes: { type: "button" } });
  cancel.addEventListener("click", cancelJsonImport);
  actions.append(confirm, edit, cancel);
  card.append(calculation, message, actions);
  return card;
}

function createJsonImportCard(workflow, context = {}) {
  const label = importTypeLabel(workflow.expectedType);
  if (workflow.stage === "food-review") {
    return createFoodForm(workflow.resolution.candidate, { importWorkflow: workflow });
  }
  if (workflow.stage === "recipe-review") return createRecipeImportReviewCard(workflow);
  const card = createElement("section", { className: "card form-card json-import-card" });

  if (workflow.stage === "paste") {
    card.append(
      createElement("h3", { text: `Paste ${label} JSON` }),
      createElement("p", { text: `Paste bare JSON or one Markdown json code block. Validation is local and the limit is ${MAX_IMPORT_BYTES / 1024} KiB.` })
    );
    const form = createElement("form", { className: "data-form" });
    const field = createElement("div", { className: "form-field" });
    const textarea = createElement("textarea", {
      attributes: {
        id: `json-import-${label}`,
        name: "jsonImport",
        rows: "16",
        required: "",
        spellcheck: "false",
        "aria-describedby": "json-import-help"
      }
    });
    textarea.value = workflow.text;
    textarea.addEventListener("input", () => {
      workflow.text = textarea.value;
      workflow.error = undefined;
    });
    field.append(
      createElement("label", { text: `${label === "food" ? "Food" : "Recipe"} import JSON`, attributes: { for: textarea.id } }),
      textarea,
      createElement("p", { className: "field-help", text: "Explanatory text outside a JSON code block is not accepted.", attributes: { id: "json-import-help" } })
    );
    const message = createFormMessage();
    if (workflow.error) {
      showFormMessage(message, workflow.error.message);
      const issues = workflow.error.details?.issues;
      if (issues?.length) {
        const list = createElement("ul", { className: "import-errors" });
        issues.forEach((item) => list.append(createElement("li", { text: `${item.path}: ${item.message}` })));
        message.append(list);
      }
    }
    const actions = createElement("div", { className: "form-actions" });
    const preview = createElement("button", { className: "button button--primary", text: "Preview", attributes: { type: "submit" } });
    const cancel = createElement("button", { className: "button button--secondary", text: "Cancel", attributes: { type: "button" } });
    cancel.addEventListener("click", cancelJsonImport);
    actions.append(preview, cancel);
    form.append(field, message, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      workflow.text = textarea.value;
      try {
        workflow.parsed = parseImportText(workflow.text, { expectedType: workflow.expectedType });
        if (workflow.expectedType === "food-import") {
          workflow.resolution = resolveFoodImport(workflow.parsed.document, context.catalogue, context.foods);
          workflow.stage = "food-review";
        } else {
          workflow.resolution = resolveRecipeImport(workflow.parsed.document, {
            savedFoods: context.foods,
            aliases: context.aliases,
            catalogue: context.catalogue
          });
          workflow.savedFoods = context.foods;
          workflow.stage = "recipe-review";
        }
        workflow.error = undefined;
      } catch (error) {
        if (!(error instanceof JsonImportError)) console.error("Could not validate pasted JSON", error);
        workflow.error = error instanceof JsonImportError
          ? error
          : new JsonImportError("IMPORT_INVALID", "The import document could not be validated.");
      }
      void renderCurrentRoute();
    });
    card.append(form);
    queueMicrotask(() => textarea.focus());
    return card;
  }

  throw new Error(`Unsupported JSON import workflow stage: ${workflow.stage}.`);
}

function createServingRow(serving = {}, isDefault = false) {
  const servingId = serving.id ?? `serving-${globalThis.crypto.randomUUID()}`;
  const row = createElement("div", { className: "serving-row" });
  row.dataset.servingId = servingId;

  const defaultLabel = createElement("label", { className: "serving-default" });
  const radio = createElement("input", {
    attributes: {
      type: "radio",
      name: "defaultServingId",
      value: servingId,
      required: ""
    }
  });
  radio.checked = isDefault;
  defaultLabel.append(radio, createElement("span", { text: "Default" }));

  const description = createElement("input", {
    attributes: {
      type: "text",
      value: serving.description ?? "",
      placeholder: "e.g. 1 slice",
      "aria-label": "Serving description",
      "data-serving-description": "",
      required: ""
    }
  });
  const grams = createElement("input", {
    attributes: {
      type: "number",
      value: serving.grams,
      min: "0.1",
      step: "0.1",
      placeholder: "grams",
      "aria-label": "Serving weight in grams",
      "data-serving-grams": "",
      required: ""
    }
  });
  const remove = createElement("button", {
    className: "button button--secondary serving-remove",
    text: "Remove",
    attributes: { type: "button" }
  });
  remove.addEventListener("click", () => {
    const rows = row.parentElement;
    const wasDefault = radio.checked;
    row.remove();
    const remainingRows = [...rows.querySelectorAll(".serving-row")];
    if (wasDefault && remainingRows.length) {
      remainingRows[0].querySelector('[name="defaultServingId"]').checked = true;
    }
  });

  row.append(defaultLabel, description, grams, remove);
  return row;
}

function foodInputFromForm(form) {
  const values = new FormData(form);
  const servingRows = [...form.querySelectorAll(".serving-row")];
  return {
    name: values.get("name"),
    brand: values.get("brand"),
    nutritionPer100g: {
      protein: numberValue(values, "protein"),
      carbohydrate: numberValue(values, "carbohydrate"),
      fat: numberValue(values, "fat"),
      fibre: numberValue(values, "fibre")
    },
    isZeroPoint: values.get("isZeroPoint") === "on",
    servings: servingRows.map((row) => ({
      id: row.dataset.servingId,
      description: row.querySelector("[data-serving-description]").value,
      grams: Number(row.querySelector("[data-serving-grams]").value)
    })),
    defaultServingId: values.get("defaultServingId")
  };
}

function createFoodForm(food, options = {}) {
  const importWorkflow = options.importWorkflow;
  const isEditing = Boolean(food?.id) && !importWorkflow;
  const card = createElement("section", { className: "card form-card food-form-card" });
  card.append(createElement("h3", { text: importWorkflow ? `Review imported food` : isEditing ? `Edit ${food.name}` : "Add food" }));
  if (importWorkflow) {
    const source = food.source.kind === "afcd"
      ? `${food.source.referenceRelease} · ${food.source.referenceId}; catalogue nutrition is used`
      : "External JSON nutrition";
    card.append(createElement("p", { className: "notice", text: `${source}. Review every field, serving, zero-point setting, and Points preview before confirming.` }));
    if (importWorkflow.resolution.existing) {
      card.append(createElement("p", {
        className: "notice",
        text: `Possible duplicate: ${importWorkflow.resolution.existing.name}${importWorkflow.resolution.existing.brand ? ` · ${importWorkflow.resolution.existing.brand}` : ""} is already saved.`
      }));
    }
  }
  const form = createElement("form", { className: "data-form" });
  const fields = createElement("div", { className: "form-grid" });
  fields.append(
    createField({ label: "Name", name: "name", value: food?.name, attributes: { autocomplete: "off" } }),
    createField({ label: "Brand (optional)", name: "brand", value: food?.brand, required: false, attributes: { autocomplete: "off" } }),
    createField({ label: "Protein /100 g", name: "protein", type: "number", min: "0", step: "0.1", value: food?.nutritionPer100g?.protein ?? "" }),
    createField({ label: "Carbohydrate /100 g", name: "carbohydrate", type: "number", min: "0", step: "0.1", value: food?.nutritionPer100g?.carbohydrate ?? "" }),
    createField({ label: "Fat /100 g", name: "fat", type: "number", min: "0", step: "0.1", value: food?.nutritionPer100g?.fat ?? "" }),
    createField({ label: "Fibre /100 g", name: "fibre", type: "number", min: "0", step: "0.1", value: food?.nutritionPer100g?.fibre ?? "" })
  );
  const zeroPointLabel = createElement("label", { className: "checkbox-field" });
  zeroPointLabel.append(
    createElement("input", { attributes: { type: "checkbox", name: "isZeroPoint", checked: food?.isZeroPoint ? "" : undefined } }),
    createElement("span", { text: "Treat this food as zero-point" })
  );

  const servingSection = createElement("fieldset", { className: "serving-editor" });
  servingSection.append(createElement("legend", { text: "Named servings" }));
  const servingRows = createElement("div", { className: "serving-rows" });
  const initialServings = food?.servings?.length ? food.servings : [{}];
  initialServings.forEach((serving, index) => {
    servingRows.append(createServingRow(serving, food?.defaultServingId ? serving.id === food.defaultServingId : index === 0));
  });
  const addServing = createElement("button", { className: "button button--secondary", text: "Add serving", attributes: { type: "button" } });
  addServing.addEventListener("click", () => servingRows.append(createServingRow()));
  servingSection.append(servingRows, addServing);

  const calculation = createElement("p", {
    className: "food-calculation",
    text: "Enter nutrition and a default serving to calculate Points.",
    attributes: { role: "status", "aria-live": "polite" }
  });
  function updateCalculation() {
    try {
      const input = foodInputFromForm(form);
      const defaultServing = input.servings.find((serving) => serving.id === input.defaultServingId);
      if (!defaultServing || !defaultServing.grams) return;
      const preview = { nutritionPer100g: input.nutritionPer100g, defaultServing, isZeroPoint: input.isZeroPoint };
      calculation.textContent = `${displayPoints(foodPointsPer100g(preview))} PP per 100 g · ${displayPoints(foodPointsForDefaultServing(preview))} PP per ${defaultServing.description || "default serving"}`;
    } catch {
      calculation.textContent = "Enter nutrition and a default serving to calculate Points.";
    }
  }
  form.addEventListener("input", updateCalculation);
  form.addEventListener("change", updateCalculation);

  const message = createFormMessage();
  const actions = createElement("div", { className: "form-actions" });
  const submitText = importWorkflow
    ? importWorkflow.resolution.existing ? "Create separate food" : "Confirm food"
    : isEditing ? "Save changes" : "Create food";
  const submit = createElement("button", { className: "button button--primary", text: submitText, attributes: { type: "submit" } });
  const cancel = createElement("button", { className: "button button--secondary", text: "Cancel", attributes: { type: "button" } });
  cancel.addEventListener("click", () => {
    if (importWorkflow) {
      cancelJsonImport();
      return;
    }
    showingFoodForm = false;
    editingFoodId = undefined;
    void renderCurrentRoute();
  });
  actions.append(submit);
  if (importWorkflow?.resolution.existing) {
    const reuse = createElement("button", { className: "button button--secondary", text: "Reuse saved food", attributes: { type: "button" } });
    reuse.addEventListener("click", async () => {
      reuse.disabled = true;
      submit.disabled = true;
      showFormMessage(message, "Reusing saved food…", "progress");
      try {
        const result = await confirmFoodImport(importWorkflow.resolution, undefined, { reuseExisting: true });
        jsonImportWorkflow = undefined;
        foodNotice = `${result.food.name} was already saved and has been reused.`;
        await renderCurrentRoute();
      } catch (error) {
        console.error("Could not reuse imported food", error);
        showFormMessage(message, error.message);
        reuse.disabled = false;
        submit.disabled = false;
      }
    });
    actions.append(reuse);
  }
  if (importWorkflow) {
    const editJson = createElement("button", { className: "button button--secondary", text: "Edit JSON", attributes: { type: "button" } });
    editJson.addEventListener("click", () => {
      importWorkflow.stage = "paste";
      void renderCurrentRoute();
    });
    actions.append(editJson);
  }
  actions.append(cancel);

  form.append(fields, zeroPointLabel, servingSection, calculation, message, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    showFormMessage(message, "Saving food…", "progress");
    try {
      const input = foodInputFromForm(form);
      const result = importWorkflow
        ? await confirmFoodImport(importWorkflow.resolution, input)
        : { food: isEditing ? await updateFood(food.id, input) : await createFood(input), created: !isEditing };
      const saved = result.food;
      showingFoodForm = false;
      editingFoodId = undefined;
      if (importWorkflow) jsonImportWorkflow = undefined;
      foodNotice = importWorkflow ? `${saved.name} imported.` : `${saved.name} ${isEditing ? "updated" : "created"}.`;
      await renderCurrentRoute();
    } catch (error) {
      console.error("Could not save food", error);
      showFormMessage(message, error.message);
      submit.disabled = false;
    }
  });

  card.append(form);
  queueMicrotask(updateCalculation);
  return card;
}

function createFoodSearch() {
  const form = createElement("form", { className: "food-search", attributes: { role: "search" } });
  const label = createElement("label", { className: "visually-hidden", text: "Search foods", attributes: { for: "food-search" } });
  const input = createElement("input", {
    attributes: { id: "food-search", name: "query", type: "search", value: foodSearchQuery, placeholder: "Search saved foods and AFCD" }
  });
  const submit = createElement("button", { className: "button button--primary", text: "Search", attributes: { type: "submit" } });
  form.append(label, input, submit);
  if (foodSearchQuery) {
    const clear = createElement("button", { className: "button button--secondary", text: "Clear", attributes: { type: "button" } });
    clear.addEventListener("click", () => {
      foodSearchQuery = "";
      referenceFoodPreview = undefined;
      void renderCurrentRoute();
    });
    form.append(clear);
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    foodSearchQuery = input.value;
    referenceFoodPreview = undefined;
    void renderCurrentRoute();
  });
  return form;
}

function createFoodCard(food) {
  const card = createElement("article", { className: "card food-card" });
  const heading = createElement("div", { className: "food-card__heading" });
  const identity = createElement("div");
  identity.append(createElement("h3", { text: food.name }));
  if (food.brand) identity.append(createElement("p", { className: "food-brand", text: food.brand }));
  if (["ai-estimate", "ai-text", "nutrition-label"].includes(food.source)) {
    identity.append(createElement("span", { className: "food-source-badge", text: "Imported nutrition" }));
  } else if (food.source?.kind === "afcd") {
    identity.append(createElement("span", { className: "food-source-badge", text: food.source.referenceRelease }));
  }
  heading.append(identity, createElement("strong", { className: "food-points", text: `${displayPoints(foodPointsPer100g(food))} PP /100 g` }));

  const servingList = createElement("ul", { className: "serving-list" });
  food.servings.forEach((serving) => {
    const isDefault = serving.id === food.defaultServingId;
    const rawPoints = foodPointsForGrams(food, serving.grams);
    servingList.append(createElement("li", {
      text: `${serving.description} · ${serving.grams} g · ${displayPoints(rawPoints)} PP${isDefault ? " · default" : ""}`
    }));
  });

  const actions = createElement("div", { className: "form-actions food-card__actions" });
  const edit = createElement("button", { className: "button button--secondary", text: "Edit", attributes: { type: "button" } });
  edit.addEventListener("click", () => {
    editingFoodId = food.id;
    showingFoodForm = true;
    pendingDeleteFoodId = undefined;
    void renderCurrentRoute();
  });
  actions.append(edit);

  if (pendingDeleteFoodId === food.id) {
    actions.append(createElement("span", { className: "delete-question", text: "Delete this food?" }));
    const confirm = createElement("button", { className: "button button--danger", text: "Yes, delete", attributes: { type: "button" } });
    const cancel = createElement("button", { className: "button button--secondary", text: "Cancel", attributes: { type: "button" } });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        await deleteFood(food.id);
        pendingDeleteFoodId = undefined;
        foodNotice = `${food.name} deleted.`;
      } catch (error) {
        console.error("Could not delete food", error);
        foodNotice = error.message;
      }
      await renderCurrentRoute();
    });
    cancel.addEventListener("click", () => {
      pendingDeleteFoodId = undefined;
      void renderCurrentRoute();
    });
    actions.append(confirm, cancel);
  } else {
    const remove = createElement("button", { className: "button button--secondary", text: "Delete", attributes: { type: "button" } });
    remove.addEventListener("click", () => {
      pendingDeleteFoodId = food.id;
      void renderCurrentRoute();
    });
    actions.append(remove);
  }

  card.append(heading, servingList, actions);
  return card;
}

function createReferenceFoodCard(reference, savedFoods) {
  const card = createElement("article", { className: "card reference-food-card" });
  const existing = savedFoods.find((food) => food.source?.kind === "afcd" && food.source.referenceId === reference.id);
  card.append(
    createElement("span", { className: "food-source-badge", text: existing ? "AFCD · already saved" : "AFCD reference" }),
    createElement("h3", { text: reference.name }),
    createElement("p", { className: "food-brand", text: reference.description }),
    createElement("p", { text: `Classification ${reference.classification} · ${reference.id}` })
  );
  const review = createElement("button", { className: "button button--secondary", text: existing ? "Review saved food" : "Review and import", attributes: { type: "button" } });
  review.addEventListener("click", () => {
    if (existing) {
      showingFoodForm = true;
      editingFoodId = existing.id;
    } else referenceFoodPreview = reference;
    void renderCurrentRoute();
  });
  card.append(review);
  return card;
}

function createReferenceFoodPreview(reference, catalogue) {
  const card = createElement("section", { className: "card form-card reference-preview" });
  const nutrition = reference.nutritionPer100g;
  card.append(
    createElement("span", { className: "food-source-badge", text: catalogue.release }),
    createElement("h3", { text: reference.name }),
    createElement("p", { text: reference.description }),
    createElement("p", { text: `AFCD ID ${reference.id} · classification ${reference.classification}` }),
    createElement("p", { text: `Per 100 g: protein ${nutrition.protein} g · carbohydrate ${nutrition.carbohydrate} g · fat ${nutrition.fat} g · fibre ${nutrition.fibre} g` })
  );
  const zeroPointLabel = createElement("label", { className: "checkbox-field reference-zero-point" });
  const zeroPoint = createElement("input", { attributes: { type: "checkbox", checked: reference.zeroPointCandidate ? "" : undefined } });
  zeroPointLabel.append(
    zeroPoint,
    createElement("span", { text: reference.zeroPointCandidate ? "Treat as zero-point fruit (catalogue candidate — review before importing)" : "Treat as zero-point (off by default)" })
  );
  const points = createElement("p", { className: "food-calculation", attributes: { role: "status", "aria-live": "polite" } });
  function updatePoints() {
    points.textContent = `${displayPoints(foodPointsPer100g({ nutritionPer100g: nutrition, isZeroPoint: zeroPoint.checked }))} PP per 100 g`;
  }
  zeroPoint.addEventListener("change", updatePoints);
  updatePoints();

  const message = createFormMessage();
  const actions = createElement("div", { className: "form-actions" });
  const confirm = createElement("button", { className: "button button--primary", text: "Confirm import", attributes: { type: "button" } });
  const cancel = createElement("button", { className: "button button--secondary", text: "Cancel", attributes: { type: "button" } });
  cancel.addEventListener("click", () => {
    referenceFoodPreview = undefined;
    void renderCurrentRoute();
  });
  confirm.addEventListener("click", async () => {
    confirm.disabled = true;
    showFormMessage(message, "Importing AFCD food…", "progress");
    try {
      const result = await importReferenceFood(reference, catalogue, { isZeroPoint: zeroPoint.checked });
      referenceFoodPreview = undefined;
      foodNotice = result.created ? `${result.food.name} imported from ${catalogue.release}.` : `${result.food.name} was already saved and has been reused.`;
      await renderCurrentRoute();
    } catch (error) {
      console.error("Could not import AFCD food", error);
      showFormMessage(message, error.message);
      confirm.disabled = false;
    }
  });
  actions.append(confirm, cancel);
  card.append(zeroPointLabel, points, message, actions);
  return card;
}

function createAfcdAttribution(catalogue) {
  const notice = createElement("aside", { className: "afcd-attribution" });
  notice.append(
    createElement("strong", { text: catalogue.attribution }),
    document.createTextNode(` ${catalogue.limitation} `),
    createElement("a", { text: "Source", attributes: { href: catalogue.sourceUrl, target: "_blank", rel: "noreferrer" } }),
    document.createTextNode(" · "),
    createElement("a", { text: "Licence", attributes: { href: catalogue.licenceUrl, target: "_blank", rel: "noreferrer" } })
  );
  return notice;
}

function renderFoodsScreen(foods, referenceFoods, catalogue, referenceError) {
  const screen = createElement("section", { className: "screen" });
  const header = createScreenHeader("Foods", "Shared household foods, nutrition and named serving sizes.");
  const headerActions = createElement("div", { className: "screen-header__actions" });
  const addFood = createElement("button", { className: "button button--primary", text: "Add food", attributes: { type: "button" } });
  addFood.addEventListener("click", () => {
    jsonImportWorkflow = undefined;
    showingFoodForm = true;
    referenceFoodPreview = undefined;
    editingFoodId = undefined;
    pendingDeleteFoodId = undefined;
    void renderCurrentRoute();
  });
  const pasteJson = createElement("button", { className: "button button--secondary", text: "Paste food JSON", attributes: { type: "button" } });
  pasteJson.addEventListener("click", () => {
    showingFoodForm = false;
    editingFoodId = undefined;
    pendingDeleteFoodId = undefined;
    startJsonImport("food-import");
  });
  headerActions.append(addFood, pasteJson);
  header.append(headerActions);
  screen.append(header);

  if (foodNotice) {
    screen.append(createElement("p", { className: "notice", text: foodNotice, attributes: { role: "status" } }));
    foodNotice = undefined;
  }

  if (showingFoodForm) {
    const food = editingFoodId ? foods.find((item) => item.id === editingFoodId) : undefined;
    screen.append(createFoodForm(food));
    return screen;
  }

  if (referenceFoodPreview && catalogue) {
    screen.append(createReferenceFoodPreview(referenceFoodPreview, catalogue));
    return screen;
  }

  if (jsonImportWorkflow?.expectedType === "food-import") {
    screen.append(createJsonImportCard(jsonImportWorkflow, { foods, catalogue }));
    return screen;
  }

  screen.append(createFoodSearch());
  if (referenceError) screen.append(createElement("p", { className: "form-message", text: referenceError.message, attributes: { role: "alert" } }));
  if (foodSearchQuery) screen.append(createElement("h3", { className: "result-heading", text: "Saved foods" }));
  const list = createElement("div", { className: "food-list" });
  if (!foods.length) {
    list.append(createElement("article", {
      className: "card empty-state",
      text: foodSearchQuery ? "No foods match this search." : "No foods yet. Add the first shared household food."
    }));
  } else {
    foods.forEach((food) => list.append(createFoodCard(food)));
  }
  screen.append(list);
  if (foodSearchQuery && catalogue) {
    screen.append(createElement("h3", { className: "result-heading", text: `${catalogue.release} reference foods` }));
    const references = createElement("div", { className: "food-list reference-food-list" });
    if (!referenceFoods.length) references.append(createElement("article", { className: "card empty-state", text: "No AFCD foods match this search." }));
    else referenceFoods.forEach((reference) => references.append(createReferenceFoodCard(reference, foods)));
    screen.append(references, createAfcdAttribution(catalogue));
  }
  return screen;
}

function ingredientUnitValue(ingredient) {
  return ingredient?.unit === "serving" ? `serving:${ingredient.servingId}` : ingredient?.unit ?? "g";
}

function createRecipeIngredientRow(foods, ingredient, onChange) {
  const row = createElement("div", { className: "recipe-ingredient-row" });
  row.dataset.ingredientId = ingredient?.id ?? `ingredient-${globalThis.crypto.randomUUID()}`;
  const search = createElement("input", {
    attributes: { type: "search", placeholder: "Search saved foods", "aria-label": "Search ingredient food", autocomplete: "off" }
  });
  const foodSelect = createElement("select", { attributes: { "aria-label": "Ingredient food", "data-ingredient-food": "", required: "" } });
  const quantity = createElement("input", {
    attributes: {
      type: "number",
      value: ingredient?.quantity ?? "1",
      min: "0.1",
      step: "0.1",
      "aria-label": "Ingredient quantity",
      "data-ingredient-quantity": "",
      required: ""
    }
  });
  const unit = createElement("select", { attributes: { "aria-label": "Ingredient unit", "data-ingredient-unit": "", required: "" } });
  const points = createElement("span", { className: "recipe-ingredient-points", text: "— PP", attributes: { "data-ingredient-points": "" } });
  const remove = createElement("button", { className: "button button--small button--secondary", text: "Remove", attributes: { type: "button" } });

  function currentFood() {
    return foods.find((food) => food.id === foodSelect.value);
  }

  function populateUnits(preferredValue) {
    const food = currentFood();
    unit.replaceChildren(
      createElement("option", { text: "grams", attributes: { value: "g" } }),
      createElement("option", { text: "millilitres (1 ml = 1 g)", attributes: { value: "ml" } }),
      createElement("option", { text: "each (default serving)", attributes: { value: "each" } })
    );
    food?.servings.forEach((serving) => {
      unit.append(createElement("option", {
        text: `${serving.description} (${serving.grams} g)`,
        attributes: { value: `serving:${serving.id}` }
      }));
    });
    const wanted = preferredValue ?? "g";
    unit.value = [...unit.options].some((option) => option.value === wanted) ? wanted : "g";
  }

  function populateFoods(query, preferredFoodId) {
    const normalized = normalizeFoodName(query);
    const matching = foods.filter((food) =>
      !normalized
      || (food.normalizedName ?? normalizeFoodName(food.name)).includes(normalized)
      || (food.normalizedBrand ?? normalizeFoodName(food.brand)).includes(normalized)
    );
    const wanted = preferredFoodId ?? foodSelect.value;
    foodSelect.replaceChildren();
    matching.forEach((food) => {
      foodSelect.append(createElement("option", {
        text: food.brand ? `${food.name} · ${food.brand}` : food.name,
        attributes: { value: food.id }
      }));
    });
    if (matching.some((food) => food.id === wanted)) foodSelect.value = wanted;
    populateUnits(ingredient && foodSelect.value === ingredient.foodId ? ingredientUnitValue(ingredient) : undefined);
  }

  search.addEventListener("input", () => {
    populateFoods(search.value);
    onChange();
  });
  foodSelect.addEventListener("change", () => {
    populateUnits();
    onChange();
  });
  quantity.addEventListener("input", onChange);
  unit.addEventListener("change", onChange);
  remove.addEventListener("click", () => {
    row.remove();
    onChange();
  });
  populateFoods("", ingredient?.foodId);
  row.append(search, foodSelect, quantity, unit, points, remove);
  return row;
}

function recipeInputFromForm(form) {
  const values = new FormData(form);
  const ingredients = [...form.querySelectorAll(".recipe-ingredient-row")].map((row) => {
    const selectedUnit = row.querySelector("[data-ingredient-unit]").value;
    const isServing = selectedUnit.startsWith("serving:");
    return {
      id: row.dataset.ingredientId,
      foodId: row.querySelector("[data-ingredient-food]").value,
      quantity: Number(row.querySelector("[data-ingredient-quantity]").value),
      unit: isServing ? "serving" : selectedUnit,
      servingId: isServing ? selectedUnit.slice("serving:".length) : undefined
    };
  });
  return {
    name: values.get("recipeName"),
    servings: numberValue(values, "recipeServings"),
    ingredients
  };
}

function createRecipeForm(foods, recipe) {
  const card = createElement("section", { className: "card form-card recipe-form-card" });
  card.append(createElement("h3", { text: recipe ? `Edit ${recipe.name}` : "Create recipe" }));
  const form = createElement("form", { className: "data-form" });
  const fields = createElement("div", { className: "form-grid" });
  fields.append(
    createField({ label: "Recipe name", name: "recipeName", value: recipe?.name, attributes: { autocomplete: "off" } }),
    createField({ label: "Number of servings", name: "recipeServings", type: "number", min: "0.1", step: "0.1", value: recipe?.servings ?? "1" })
  );
  const ingredientFieldset = createElement("fieldset", { className: "recipe-ingredient-editor" });
  ingredientFieldset.append(createElement("legend", { text: "Ingredients" }));
  const ingredientRows = createElement("div", { className: "recipe-ingredient-rows" });
  const total = createElement("p", {
    className: "food-calculation",
    text: "Add ingredients to calculate recipe Points.",
    attributes: { role: "status", "aria-live": "polite" }
  });

  function updatePreview() {
    try {
      const calculated = calculateRecipe(recipeInputFromForm(form), foods);
      [...ingredientRows.children].forEach((row, index) => {
        row.querySelector("[data-ingredient-points]").textContent = `${displayPoints(calculated.ingredients[index].rawPoints)} PP`;
      });
      total.textContent = `${displayPoints(calculated.rawTotalPoints)} PP total · ${displayPoints(calculated.rawPointsPerServing)} PP per serving`;
    } catch {
      [...ingredientRows.children].forEach((row) => {
        row.querySelector("[data-ingredient-points]").textContent = "— PP";
      });
      total.textContent = "Add complete ingredient quantities to calculate recipe Points.";
    }
  }

  const initialIngredients = recipe?.ingredients?.length ? recipe.ingredients : [undefined];
  initialIngredients.forEach((ingredient) => ingredientRows.append(createRecipeIngredientRow(foods, ingredient, updatePreview)));
  const addIngredient = createElement("button", { className: "button button--secondary", text: "Add ingredient", attributes: { type: "button" } });
  addIngredient.addEventListener("click", () => {
    ingredientRows.append(createRecipeIngredientRow(foods, undefined, updatePreview));
    updatePreview();
  });
  ingredientFieldset.append(
    ingredientRows,
    createElement("p", { className: "form-note", text: "Millilitres currently use the configurable default conversion of 1 ml = 1 g." }),
    addIngredient
  );
  form.addEventListener("input", updatePreview);
  form.addEventListener("change", updatePreview);

  const message = createFormMessage();
  const actions = createElement("div", { className: "form-actions" });
  const submit = createElement("button", { className: "button button--primary", text: recipe ? "Save recipe" : "Create recipe", attributes: { type: "submit" } });
  const cancel = createElement("button", { className: "button button--secondary", text: "Cancel", attributes: { type: "button" } });
  cancel.addEventListener("click", () => {
    showingRecipeForm = false;
    editingRecipeId = undefined;
    void renderCurrentRoute();
  });
  actions.append(submit, cancel);
  form.append(fields, ingredientFieldset, total, message, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    showFormMessage(message, "Saving recipe…", "progress");
    try {
      const input = recipeInputFromForm(form);
      const saved = recipe ? await updateRecipe(recipe.id, input) : await createRecipe(input);
      showingRecipeForm = false;
      editingRecipeId = undefined;
      recipeNotice = `${saved.name} ${recipe ? "updated" : "created"}.`;
      await renderCurrentRoute();
    } catch (error) {
      console.error("Could not save recipe", error);
      showFormMessage(message, error.message);
      submit.disabled = false;
    }
  });
  card.append(form);
  queueMicrotask(updatePreview);
  return card;
}

function recipeIngredientText(ingredient, food) {
  const unit = ingredient.unit === "serving" ? ingredient.unitDescription : ingredient.unitDescription ?? ingredient.unit;
  return `${food?.name ?? "Missing food"} · ${ingredient.quantity} ${unit} · ${ingredient.grams} g`;
}

function createRecipeCard(recipe, foods) {
  const card = createElement("article", { className: "card recipe-card" });
  const heading = createElement("div", { className: "recipe-card__heading" });
  heading.append(
    createElement("div", { className: "recipe-card__identity" }),
    createElement("strong", { text: `${displayPoints(recipe.rawPointsPerServing)} PP / serving` })
  );
  heading.firstElementChild.append(
    createElement("h3", { text: recipe.name }),
    createElement("p", { text: `${recipe.servings} serving${recipe.servings === 1 ? "" : "s"} · ${displayPoints(recipe.rawTotalPoints)} PP total` })
  );
  const list = createElement("ul", { className: "recipe-ingredient-list" });
  recipe.ingredients.forEach((ingredient) => {
    list.append(createElement("li", {
      text: `${recipeIngredientText(ingredient, foods.find((food) => food.id === ingredient.foodId))} · ${displayPoints(ingredient.rawPoints)} PP`
    }));
  });
  const actions = createElement("div", { className: "form-actions" });
  const addToDiary = createElement("button", { className: "button button--primary", text: "Add to diary", attributes: { type: "button" } });
  addToDiary.addEventListener("click", () => {
    pendingRecipeDiaryId = recipe.id;
    selectedDiaryDate = localDateString();
    showingDiaryForm = true;
    editingDiaryEntryId = undefined;
    window.location.hash = "diary";
  });
  const edit = createElement("button", { className: "button button--secondary", text: "Edit", attributes: { type: "button" } });
  edit.addEventListener("click", () => {
    showingRecipeForm = true;
    editingRecipeId = recipe.id;
    pendingDeleteRecipeId = undefined;
    void renderCurrentRoute();
  });
  actions.append(addToDiary, edit);
  if (pendingDeleteRecipeId === recipe.id) {
    actions.append(createElement("span", { className: "delete-question", text: "Delete this recipe?" }));
    const confirm = createElement("button", { className: "button button--danger", text: "Yes, delete", attributes: { type: "button" } });
    const cancel = createElement("button", { className: "button button--secondary", text: "Cancel", attributes: { type: "button" } });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        await deleteRecipe(recipe.id);
        recipeNotice = `${recipe.name} deleted.`;
      } catch (error) {
        recipeNotice = error.message;
      }
      pendingDeleteRecipeId = undefined;
      await renderCurrentRoute();
    });
    cancel.addEventListener("click", () => {
      pendingDeleteRecipeId = undefined;
      void renderCurrentRoute();
    });
    actions.append(confirm, cancel);
  } else {
    const remove = createElement("button", { className: "button button--secondary", text: "Delete", attributes: { type: "button" } });
    remove.addEventListener("click", () => {
      pendingDeleteRecipeId = recipe.id;
      void renderCurrentRoute();
    });
    actions.append(remove);
  }
  card.append(heading, list, actions);
  return card;
}

function createRecipeSearch() {
  const form = createElement("form", { className: "food-search", attributes: { role: "search" } });
  const label = createElement("label", { className: "visually-hidden", text: "Search recipes", attributes: { for: "recipe-search" } });
  const input = createElement("input", { attributes: { id: "recipe-search", type: "search", value: recipeSearchQuery, placeholder: "Search recipes" } });
  const submit = createElement("button", { className: "button button--primary", text: "Search", attributes: { type: "submit" } });
  form.append(label, input, submit);
  if (recipeSearchQuery) {
    const clear = createElement("button", { className: "button button--secondary", text: "Clear", attributes: { type: "button" } });
    clear.addEventListener("click", () => {
      recipeSearchQuery = "";
      void renderCurrentRoute();
    });
    form.append(clear);
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    recipeSearchQuery = input.value;
    void renderCurrentRoute();
  });
  return form;
}

function renderRecipesScreen(recipes, foods, aliases, catalogue, catalogueError) {
  const screen = createElement("section", { className: "screen" });
  const header = createScreenHeader("Recipes", "Build reusable recipes from foods in the shared household database.");
  const headerActions = createElement("div", { className: "screen-header__actions" });
  const addRecipe = createElement("button", { className: "button button--primary", text: "Create recipe", attributes: { type: "button", disabled: foods.length ? undefined : "" } });
  addRecipe.addEventListener("click", () => {
    jsonImportWorkflow = undefined;
    showingRecipeForm = true;
    editingRecipeId = undefined;
    pendingDeleteRecipeId = undefined;
    void renderCurrentRoute();
  });
  const pasteJson = createElement("button", {
    className: "button button--secondary",
    text: "Paste recipe JSON",
    attributes: { type: "button" }
  });
  pasteJson.addEventListener("click", () => {
    showingRecipeForm = false;
    editingRecipeId = undefined;
    startJsonImport("recipe-import");
  });
  headerActions.append(addRecipe, pasteJson);
  header.append(headerActions);
  screen.append(header);
  if (recipeNotice) {
    screen.append(createElement("p", { className: "notice", text: recipeNotice, attributes: { role: "status" } }));
    recipeNotice = undefined;
  }
  if (showingRecipeForm) {
    const recipe = editingRecipeId ? recipes.find((candidate) => candidate.id === editingRecipeId) : undefined;
    screen.append(createRecipeForm(foods, recipe));
    return screen;
  }
  if (jsonImportWorkflow?.expectedType === "recipe-import") {
    screen.append(createJsonImportCard(jsonImportWorkflow, { foods, aliases, catalogue }));
    if (catalogueError) screen.append(createElement("p", { className: "form-message", text: catalogueError.message, attributes: { role: "alert" } }));
    return screen;
  }
  screen.append(createRecipeSearch());
  const list = createElement("div", { className: "recipe-list" });
  if (!foods.length) {
    list.append(createElement("article", { className: "card empty-state", text: "Add foods before creating a recipe." }));
  } else if (!recipes.length) {
    list.append(createElement("article", { className: "card empty-state", text: recipeSearchQuery ? "No recipes match this search." : "No recipes yet." }));
  } else {
    recipes.forEach((recipe) => list.append(createRecipeCard(recipe, foods)));
  }
  screen.append(list);
  return screen;
}

function mealLabel(meal) {
  return meal[0].toUpperCase() + meal.slice(1);
}

function createDiaryEntryForm(state, foods, entry) {
  const card = createElement("section", { className: "card form-card diary-form-card" });
  card.append(createElement("h3", { text: entry ? "Edit diary entry" : "Add food to diary" }));
  const form = createElement("form", { className: "data-form" });
  const topFields = createElement("div", { className: "form-grid" });
  topFields.append(createField({
    label: "Meal",
    name: "diaryMeal",
    value: entry?.meal ?? "breakfast",
    options: MEALS.map((meal) => ({ value: meal, label: mealLabel(meal) }))
  }));

  const searchField = createElement("div", { className: "form-field" });
  const searchLabel = createElement("label", { text: "Search foods", attributes: { for: "diary-food-search" } });
  const search = createElement("input", {
    attributes: { id: "diary-food-search", type: "search", placeholder: "Name or brand", autocomplete: "off" }
  });
  searchField.append(searchLabel, search);

  const foodField = createElement("div", { className: "form-field" });
  const foodLabel = createElement("label", { text: "Food", attributes: { for: "diary-food" } });
  const foodSelect = createElement("select", { attributes: { id: "diary-food", name: "foodId", required: "" } });
  foodField.append(foodLabel, foodSelect);

  const servingField = createElement("div", { className: "form-field" });
  const servingLabel = createElement("label", { text: "Serving", attributes: { for: "diary-serving" } });
  const servingSelect = createElement("select", { attributes: { id: "diary-serving", name: "servingId", required: "" } });
  servingField.append(servingLabel, servingSelect);

  const quantityField = createField({
    label: "Quantity (servings or grams)",
    name: "diaryQuantity",
    type: "number",
    min: "0.1",
    step: "0.1",
    value: entry?.quantity ?? "1"
  });
  topFields.append(searchField, foodField, servingField, quantityField);

  const preview = createElement("p", {
    className: "food-calculation",
    text: "Select a food and quantity to calculate Points.",
    attributes: { role: "status", "aria-live": "polite" }
  });
  const quantityInput = quantityField.querySelector("input");

  function selectedFood() {
    return foods.find((food) => food.id === foodSelect.value);
  }

  function updatePreview() {
    const food = selectedFood();
    const quantity = Number(quantityInput.value);
    if (!food || !Number.isFinite(quantity) || quantity <= 0) {
      preview.textContent = "Select a food and quantity to calculate Points.";
      return;
    }
    const serving = food.servings.find((candidate) => candidate.id === servingSelect.value);
    const grams = serving ? serving.grams * quantity : quantity;
    preview.textContent = `${grams.toFixed(1)} g · ${displayPoints(foodPointsForGrams(food, grams))} PP`;
  }

  function populateServings(preferredServingId) {
    const food = selectedFood();
    servingSelect.replaceChildren();
    if (!food) {
      servingSelect.append(createElement("option", { text: "Choose a food first", attributes: { value: "" } }));
      updatePreview();
      return;
    }
    food.servings.forEach((serving) => {
      servingSelect.append(createElement("option", {
        text: `${serving.description} (${serving.grams} g)`,
        attributes: { value: serving.id }
      }));
    });
    servingSelect.append(createElement("option", { text: "Custom grams", attributes: { value: "__grams__" } }));
    const wanted = preferredServingId ?? food.defaultServingId;
    servingSelect.value = [...servingSelect.options].some((option) => option.value === wanted) ? wanted : food.defaultServingId;
    updatePreview();
  }

  function populateFoods(query, preferredFoodId) {
    const normalizedQuery = normalizeFoodName(query);
    const matchingFoods = foods.filter((food) =>
      !normalizedQuery
      || (food.normalizedName ?? normalizeFoodName(food.name)).includes(normalizedQuery)
      || (food.normalizedBrand ?? normalizeFoodName(food.brand)).includes(normalizedQuery)
    );
    const previousFoodId = preferredFoodId ?? foodSelect.value;
    foodSelect.replaceChildren();
    if (!matchingFoods.length) {
      foodSelect.append(createElement("option", { text: "No matching foods", attributes: { value: "" } }));
      populateServings();
      return;
    }
    matchingFoods.forEach((food) => {
      foodSelect.append(createElement("option", {
        text: food.brand ? `${food.name} · ${food.brand}` : food.name,
        attributes: { value: food.id }
      }));
    });
    if (matchingFoods.some((food) => food.id === previousFoodId)) foodSelect.value = previousFoodId;
    populateServings(entry && foodSelect.value === entry.itemId ? entry.servingId ?? "__grams__" : undefined);
  }

  search.addEventListener("input", () => populateFoods(search.value));
  foodSelect.addEventListener("change", () => populateServings());
  servingSelect.addEventListener("change", updatePreview);
  quantityInput.addEventListener("input", updatePreview);
  populateFoods("", entry?.itemId);

  const message = createFormMessage();
  const actions = createElement("div", { className: "form-actions" });
  const submit = createElement("button", {
    className: "button button--primary",
    text: entry ? "Save changes" : "Add to diary",
    attributes: { type: "submit" }
  });
  const cancel = createElement("button", { className: "button button--secondary", text: "Cancel", attributes: { type: "button" } });
  cancel.addEventListener("click", () => {
    showingDiaryForm = false;
    editingDiaryEntryId = undefined;
    pendingRecipeDiaryId = undefined;
    void renderCurrentRoute();
  });
  actions.append(submit, cancel);

  form.append(topFields, preview, message, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    showFormMessage(message, "Saving diary entry…", "progress");
    try {
      const values = new FormData(form);
      const servingId = values.get("servingId");
      const quantity = numberValue(values, "diaryQuantity");
      const input = {
        userId: state.currentUser.id,
        date: selectedDiaryDate,
        meal: values.get("diaryMeal"),
        foodId: values.get("foodId"),
        ...(servingId === "__grams__" ? { grams: quantity } : { servingId, quantity })
      };
      await (entry ? updateDiaryEntry(entry.id, input) : createDiaryEntry(input));
      showingDiaryForm = false;
      editingDiaryEntryId = undefined;
      pendingRecipeDiaryId = undefined;
      diaryNotice = entry ? "Diary entry updated." : "Food added to diary.";
      await renderCurrentRoute();
    } catch (error) {
      console.error("Could not save diary entry", error);
      showFormMessage(message, error.message);
      submit.disabled = false;
    }
  });
  card.append(form);
  return card;
}

function createRecipeDiaryEntryForm(state, recipes, entry) {
  const card = createElement("section", { className: "card form-card diary-form-card" });
  card.append(createElement("h3", { text: entry ? "Edit recipe diary entry" : "Add recipe to diary" }));
  const form = createElement("form", { className: "data-form" });
  const fields = createElement("div", { className: "form-grid" });
  fields.append(createField({
    label: "Meal",
    name: "recipeDiaryMeal",
    value: entry?.meal ?? "dinner",
    options: MEALS.map((meal) => ({ value: meal, label: mealLabel(meal) }))
  }));
  const searchField = createElement("div", { className: "form-field" });
  const searchLabel = createElement("label", { text: "Search recipes", attributes: { for: "diary-recipe-search" } });
  const search = createElement("input", { attributes: { id: "diary-recipe-search", type: "search", placeholder: "Recipe name", autocomplete: "off" } });
  searchField.append(searchLabel, search);
  const recipeField = createElement("div", { className: "form-field" });
  const recipeLabel = createElement("label", { text: "Recipe", attributes: { for: "diary-recipe" } });
  const recipeSelect = createElement("select", { attributes: { id: "diary-recipe", name: "recipeId", required: "" } });
  recipeField.append(recipeLabel, recipeSelect);
  const quantityField = createField({
    label: "Recipe servings",
    name: "recipeDiaryQuantity",
    type: "number",
    min: "0.1",
    step: "0.1",
    value: entry?.quantity ?? "1"
  });
  fields.append(searchField, recipeField, quantityField);
  const preview = createElement("p", { className: "food-calculation", attributes: { role: "status", "aria-live": "polite" } });
  const quantityInput = quantityField.querySelector("input");

  function selectedRecipe() {
    return recipes.find((recipe) => recipe.id === recipeSelect.value);
  }

  function updatePreview() {
    try {
      const recipe = selectedRecipe();
      const quantity = Number(quantityInput.value);
      preview.textContent = `${quantity} serving${quantity === 1 ? "" : "s"} · ${displayPoints(recipePointsForServings(recipe, quantity))} PP`;
    } catch {
      preview.textContent = "Select a recipe and serving quantity to calculate Points.";
    }
  }

  function populateRecipes(query, preferredRecipeId) {
    const normalized = normalizeFoodName(query);
    const matching = recipes.filter((recipe) =>
      !normalized || (recipe.normalizedName ?? normalizeFoodName(recipe.name)).includes(normalized)
    );
    const wanted = preferredRecipeId ?? recipeSelect.value;
    recipeSelect.replaceChildren();
    matching.forEach((recipe) => {
      recipeSelect.append(createElement("option", { text: recipe.name, attributes: { value: recipe.id } }));
    });
    if (matching.some((recipe) => recipe.id === wanted)) recipeSelect.value = wanted;
    updatePreview();
  }

  search.addEventListener("input", () => populateRecipes(search.value));
  recipeSelect.addEventListener("change", updatePreview);
  quantityInput.addEventListener("input", updatePreview);
  populateRecipes("", entry?.itemId ?? pendingRecipeDiaryId);

  const message = createFormMessage();
  const actions = createElement("div", { className: "form-actions" });
  const submit = createElement("button", { className: "button button--primary", text: entry ? "Save changes" : "Add to diary", attributes: { type: "submit" } });
  const cancel = createElement("button", { className: "button button--secondary", text: "Cancel", attributes: { type: "button" } });
  cancel.addEventListener("click", () => {
    showingDiaryForm = false;
    editingDiaryEntryId = undefined;
    pendingRecipeDiaryId = undefined;
    void renderCurrentRoute();
  });
  actions.append(submit, cancel);
  form.append(fields, preview, message, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const values = new FormData(form);
      const input = {
        userId: state.currentUser.id,
        date: selectedDiaryDate,
        meal: values.get("recipeDiaryMeal"),
        itemType: "recipe",
        recipeId: values.get("recipeId"),
        quantity: numberValue(values, "recipeDiaryQuantity")
      };
      await (entry ? updateDiaryEntry(entry.id, input) : createDiaryEntry(input));
      showingDiaryForm = false;
      editingDiaryEntryId = undefined;
      pendingRecipeDiaryId = undefined;
      diaryNotice = entry ? "Diary entry updated." : "Recipe added to diary.";
      await renderCurrentRoute();
    } catch (error) {
      console.error("Could not save recipe diary entry", error);
      showFormMessage(message, error.message);
      submit.disabled = false;
    }
  });
  card.append(form);
  return card;
}

function diaryQuantityText(entry) {
  if (entry.itemType === "recipe") {
    return `${entry.quantity} recipe serving${entry.quantity === 1 ? "" : "s"}`;
  }
  return entry.unit === "g"
    ? `${entry.grams} g`
    : `${entry.quantity} × ${entry.unit} · ${entry.grams} g`;
}

function createDiaryEntryCard(entry) {
  const item = createElement("li", { className: "diary-entry" });
  const details = createElement("div", { className: "diary-entry__details" });
  details.append(
    createElement("strong", { text: entry.description }),
    createElement("span", { text: diaryQuantityText(entry) })
  );
  item.append(details, createElement("strong", { className: "diary-entry__points", text: `${displayPoints(entry.rawPoints)} PP` }));

  const actions = createElement("div", { className: "diary-entry__actions" });
  const edit = createElement("button", { className: "button button--small button--secondary", text: "Edit", attributes: { type: "button" } });
  edit.addEventListener("click", () => {
    showingDiaryForm = true;
    editingDiaryEntryId = entry.id;
    pendingRecipeDiaryId = entry.itemType === "recipe" ? entry.itemId : undefined;
    pendingDeleteDiaryEntryId = undefined;
    void renderCurrentRoute();
  });
  const duplicate = createElement("button", { className: "button button--small button--secondary", text: "Duplicate", attributes: { type: "button" } });
  duplicate.addEventListener("click", async () => {
    duplicate.disabled = true;
    try {
      await duplicateDiaryEntry(entry.id);
      diaryNotice = "Diary entry duplicated.";
    } catch (error) {
      diaryNotice = error.message;
    }
    await renderCurrentRoute();
  });
  actions.append(edit, duplicate);

  if (pendingDeleteDiaryEntryId === entry.id) {
    actions.append(createElement("span", { className: "delete-question", text: "Delete this entry?" }));
    const confirm = createElement("button", { className: "button button--small button--danger", text: "Yes, delete", attributes: { type: "button" } });
    const cancel = createElement("button", { className: "button button--small button--secondary", text: "Cancel", attributes: { type: "button" } });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        await deleteDiaryEntry(entry.id);
        diaryNotice = "Diary entry deleted.";
      } catch (error) {
        diaryNotice = error.message;
      }
      pendingDeleteDiaryEntryId = undefined;
      await renderCurrentRoute();
    });
    cancel.addEventListener("click", () => {
      pendingDeleteDiaryEntryId = undefined;
      void renderCurrentRoute();
    });
    actions.append(confirm, cancel);
  } else {
    const remove = createElement("button", { className: "button button--small button--secondary", text: "Delete", attributes: { type: "button" } });
    remove.addEventListener("click", () => {
      pendingDeleteDiaryEntryId = entry.id;
      void renderCurrentRoute();
    });
    actions.append(remove);
  }
  item.append(actions);
  return item;
}

function renderDiaryScreen(state, summary, foods, recipes) {
  const screen = createElement("section", { className: "screen" });
  const header = createScreenHeader("Diary", `${state.currentUser.name}'s food entries by local calendar date.`);
  const headerActions = createElement("div", { className: "screen-header__actions" });
  const addEntry = createElement("button", { className: "button button--primary", text: "Add food", attributes: { type: "button", disabled: foods.length ? undefined : "" } });
  addEntry.addEventListener("click", () => {
    showingDiaryForm = true;
    editingDiaryEntryId = undefined;
    pendingRecipeDiaryId = undefined;
    pendingDeleteDiaryEntryId = undefined;
    void renderCurrentRoute();
  });
  const addRecipe = createElement("button", { className: "button button--secondary", text: "Add recipe", attributes: { type: "button", disabled: recipes.length ? undefined : "" } });
  addRecipe.addEventListener("click", () => {
    showingDiaryForm = true;
    editingDiaryEntryId = undefined;
    pendingRecipeDiaryId = recipes[0]?.id;
    pendingDeleteDiaryEntryId = undefined;
    void renderCurrentRoute();
  });
  headerActions.append(addEntry, addRecipe);
  header.append(headerActions);
  screen.append(header);

  const dateControls = createElement("div", { className: "diary-date-controls" });
  const dateLabel = createElement("label", { text: "Diary date", attributes: { for: "diary-date" } });
  const dateInput = createElement("input", {
    attributes: {
      id: "diary-date",
      type: "date",
      value: selectedDiaryDate,
      min: state.weighIns[0].date
    }
  });
  dateInput.addEventListener("change", () => {
    selectedDiaryDate = dateInput.value;
    showingDiaryForm = false;
    editingDiaryEntryId = undefined;
    pendingRecipeDiaryId = undefined;
    void renderCurrentRoute();
  });
  const today = createElement("button", { className: "button button--secondary", text: "Today", attributes: { type: "button" } });
  today.addEventListener("click", () => {
    selectedDiaryDate = localDateString();
    showingDiaryForm = false;
    editingDiaryEntryId = undefined;
    void renderCurrentRoute();
  });
  dateControls.append(dateLabel, dateInput, today);
  screen.append(dateControls);

  if (diaryNotice) {
    screen.append(createElement("p", { className: "notice", text: diaryNotice, attributes: { role: "status" } }));
    diaryNotice = undefined;
  }

  const totals = createElement("div", { className: "diary-totals" });
  totals.append(
    createMetric("Daily budget", `${summary.dailyBudget} PP`),
    createMetric("Used", `${displayPoints(summary.usedPoints)} PP`),
    createMetric(summary.remainingPoints >= 0 ? "Remaining" : "Daily excess", `${displayPoints(Math.abs(summary.remainingPoints))} PP`),
    createMetric("Weekly extras", `${displayPoints(summary.weeklyExtrasUsed)} / ${state.currentUser.weeklyAllowance} PP`, `${displayPoints(Math.max(0, summary.weeklyExtrasRemaining))} PP remaining`)
  );
  screen.append(totals);

  if (showingDiaryForm) {
    const entry = editingDiaryEntryId ? summary.entries.find((candidate) => candidate.id === editingDiaryEntryId) : undefined;
    const isRecipe = entry?.itemType === "recipe" || (!entry && pendingRecipeDiaryId);
    screen.append(isRecipe
      ? createRecipeDiaryEntryForm(state, recipes, entry)
      : createDiaryEntryForm(state, foods, entry));
    return screen;
  }

  if (!foods.length) {
    const emptyFoods = createElement("article", { className: "card empty-state" });
    emptyFoods.append(
      createElement("h3", { text: "Add a food first" }),
      createElement("p", { text: "Diary entries use foods from the shared household database." })
    );
    const goToFoods = createElement("button", { className: "button button--primary", text: "Go to Foods", attributes: { type: "button" } });
    goToFoods.addEventListener("click", () => {
      showingFoodForm = true;
      editingFoodId = undefined;
      window.location.hash = "foods";
    });
    emptyFoods.append(goToFoods);
    screen.append(emptyFoods);
  }

  const mealGroups = createElement("div", { className: "meal-groups" });
  MEALS.forEach((meal) => {
    const group = createElement("section", { className: "card meal-group" });
    const mealEntries = summary.entries.filter((entry) => entry.meal === meal);
    const mealTotal = summary.mealTotals[meal];
    const heading = createElement("div", { className: "meal-group__heading" });
    heading.append(
      createElement("h3", { text: mealLabel(meal) }),
      createElement("strong", { text: `${displayPoints(mealTotal)} PP` })
    );
    group.append(heading);
    if (!mealEntries.length) {
      group.append(createElement("p", { className: "meal-empty", text: "No entries" }));
    } else {
      const list = createElement("ul", { className: "diary-entry-list" });
      mealEntries.forEach((entry) => list.append(createDiaryEntryCard(entry)));
      group.append(list);
    }
    mealGroups.append(group);
  });
  screen.append(mealGroups);
  return screen;
}

function formatWeekdayDate(date) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00Z`));
}

function weeklyDayStatus(day, asOfDate) {
  if (!day.isActive) return "Before tracking began";
  if (day.date > asOfDate) return "Upcoming";
  if (day.budgetStatus === "over") {
    return `${displayPoints(day.weeklyExtrasConsumed)} PP from weekly extras`;
  }
  if (day.budgetStatus === "at") return "At daily budget";
  return `${displayPoints(day.remainingPoints)} PP remaining`;
}

function renderWeeklyScreen(state, summary) {
  const screen = createElement("section", { className: "screen weekly-screen" });
  const header = createScreenHeader("Weekly tracking", `${state.currentUser.name}'s Monday–Sunday summary.`);
  const headerActions = createElement("div", { className: "screen-header__actions" });
  const overview = createElement("button", { className: "button button--secondary", text: "Goal & weight overview", attributes: { type: "button" } });
  overview.addEventListener("click", () => {
    progressView = "overview";
    void renderCurrentRoute();
  });
  headerActions.append(overview);
  header.append(headerActions);
  screen.append(header);

  const navigation = createElement("div", { className: "week-navigation" });
  const previous = createElement("button", {
    className: "button button--secondary",
    text: "Previous week",
    attributes: { type: "button", disabled: summary.weekStart <= state.weighIns[0].date ? "" : undefined }
  });
  previous.addEventListener("click", () => {
    selectedWeekDate = shiftLocalDate(summary.weekStart, -7);
    void renderCurrentRoute();
  });
  const period = createElement("strong", { text: `${summary.weekStart} to ${summary.weekEnd}` });
  const current = createElement("button", { className: "button button--secondary", text: "Current week", attributes: { type: "button" } });
  current.addEventListener("click", () => {
    selectedWeekDate = localDateString();
    void renderCurrentRoute();
  });
  const next = createElement("button", {
    className: "button button--secondary",
    text: "Next week",
    attributes: { type: "button", disabled: summary.weekEnd >= localDateString() ? "" : undefined }
  });
  next.addEventListener("click", () => {
    selectedWeekDate = shiftLocalDate(summary.weekStart, 7);
    void renderCurrentRoute();
  });
  navigation.append(previous, period, current, next);
  screen.append(navigation);

  const metrics = createElement("div", { className: "weekly-metrics" });
  metrics.append(
    createMetric("Ordinary budget", `${displayPoints(summary.ordinaryBudgetAvailable)} PP`, "Available Monday–Sunday"),
    createMetric("Ordinary consumed", `${displayPoints(summary.ordinaryPointsConsumed)} PP`, "Capped at each day's budget"),
    createMetric("Weekly extras used", `${displayPoints(summary.weeklyExtrasConsumed)} PP`, `${state.currentUser.weeklyAllowance} PP allowance`),
    createMetric(
      summary.weeklyExtrasRemaining >= 0 ? "Weekly extras remaining" : "Beyond weekly extras",
      `${displayPoints(Math.abs(summary.weeklyExtrasRemaining))} PP`
    ),
    createMetric("Average per day", `${displayPoints(summary.averagePointsPerDay)} PP`, `Through ${summary.asOfDate}`),
    createMetric("Daily budget comparison", `${summary.daysUnderBudget} under · ${summary.daysOverBudget} over`, `${summary.daysAtBudget} at budget`)
  );
  screen.append(metrics);

  const explanation = createElement("article", { className: "card card--accent weekly-explanation" });
  explanation.append(
    createElement("h3", { text: "How weekly extras are counted" }),
    createElement("p", { text: "Only the amount above an individual day's ordinary budget uses weekly extras. Unused ordinary points do not carry into another day." })
  );
  screen.append(explanation);

  const days = createElement("div", { className: "weekly-days" });
  summary.days.forEach((day) => {
    const card = createElement("article", { className: "card weekly-day" });
    const heading = createElement("div", { className: "weekly-day__heading" });
    heading.append(
      createElement("h3", { text: formatWeekdayDate(day.date) }),
      createElement("strong", { text: `${displayPoints(day.usedPoints)} PP` })
    );
    const details = createElement("div", { className: "weekly-day__details" });
    details.append(
      createElement("span", { text: day.isActive ? `${day.dailyBudget} PP budget` : "No daily budget" }),
      createElement("span", { text: `${day.entryCount} entr${day.entryCount === 1 ? "y" : "ies"}` }),
      createElement("span", { text: weeklyDayStatus(day, summary.asOfDate) })
    );
    card.append(heading, details);
    if (day.isActive && day.date <= summary.asOfDate) {
      const diary = createElement("button", { className: "button button--small button--secondary", text: "Open diary", attributes: { type: "button" } });
      diary.addEventListener("click", () => {
        selectedDiaryDate = day.date;
        showingDiaryForm = false;
        editingDiaryEntryId = undefined;
        pendingRecipeDiaryId = undefined;
        window.location.hash = "diary";
      });
      card.append(diary);
    }
    days.append(card);
  });
  screen.append(days);
  return screen;
}

function formatWeight(value, { signed = false } = {}) {
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)} kg`;
}

function createWeightChart(weighIns, targetWeightKg) {
  const model = createWeightChartModel(weighIns, targetWeightKg);
  const width = 700;
  const height = 280;
  const left = 58;
  const right = 18;
  const top = 22;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (value) => left + value * plotWidth;
  const y = (value) => top + value * plotHeight;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "weight-chart");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Weight history from ${weighIns[0].date} to ${weighIns.at(-1).date}, with a ${targetWeightKg.toFixed(1)} kilogram target.`);

  const addSvg = (tagName, attributes = {}, text) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    if (text !== undefined) element.textContent = text;
    svg.append(element);
    return element;
  };

  addSvg("line", { class: "weight-chart__axis", x1: left, y1: top, x2: left, y2: height - bottom });
  addSvg("line", { class: "weight-chart__axis", x1: left, y1: height - bottom, x2: width - right, y2: height - bottom });
  addSvg("line", { class: "weight-chart__target", x1: left, y1: y(model.targetY), x2: width - right, y2: y(model.targetY) });
  addSvg("text", { class: "weight-chart__label", x: left + 6, y: y(model.targetY) - 7 }, `Target ${targetWeightKg.toFixed(1)} kg`);
  addSvg("text", { class: "weight-chart__label", x: 4, y: top + 5 }, model.maximumWeightKg.toFixed(1));
  addSvg("text", { class: "weight-chart__label", x: 4, y: height - bottom + 4 }, model.minimumWeightKg.toFixed(1));
  addSvg("polyline", { class: "weight-chart__line", points: model.points.map((point) => `${x(point.x)},${y(point.y)}`).join(" ") });
  model.points.forEach((point) => {
    const circle = addSvg("circle", { class: "weight-chart__point", cx: x(point.x), cy: y(point.y), r: 5 });
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${point.date}: ${point.weightKg.toFixed(1)} kg`;
    circle.append(title);
  });
  const first = model.points[0];
  const last = model.points.at(-1);
  addSvg("text", { class: "weight-chart__label", x: x(first.x), y: height - 16, "text-anchor": "start" }, first.date);
  if (last !== first) addSvg("text", { class: "weight-chart__label", x: x(last.x), y: height - 16, "text-anchor": "end" }, last.date);
  return svg;
}

function createPeriodCard(period) {
  const card = createElement("article", { className: "card progress-period" });
  card.append(
    createElement("h3", { text: `${period.startDate} to ${period.endDate}` }),
    createElement("p", { className: "progress-period__weight", text: `${formatWeight(period.startWeightKg)} → ${formatWeight(period.endWeightKg)}` })
  );
  const details = createElement("dl", { className: "progress-details" });
  [
    ["Weight change", formatWeight(period.weightChangeKg, { signed: true })],
    ["Average points/day", `${displayPoints(period.averagePointsPerDay)} PP`],
    ["Daily allowance", `${period.dailyAllowance} PP`],
    ["Weekly extras used", `${displayPoints(period.weeklyExtrasConsumed)} PP`]
  ].forEach(([term, value]) => details.append(createElement("dt", { text: term }), createElement("dd", { text: value })));
  card.append(details);
  return card;
}

function renderProgressScreen(state, summary) {
  const screen = createElement("section", { className: "screen progress-screen" });
  const header = createScreenHeader("Progress", `${state.currentUser.name}'s weight, goal, and weigh-in periods.`);
  const headerActions = createElement("div", { className: "screen-header__actions" });
  const weekly = createElement("button", { className: "button button--secondary", text: "Weekly point detail", attributes: { type: "button" } });
  weekly.addEventListener("click", () => {
    selectedWeekDate = localDateString();
    progressView = "weekly";
    void renderCurrentRoute();
  });
  headerActions.append(weekly);
  header.append(headerActions);
  screen.append(header);

  const goal = createElement("article", { className: "card progress-goal" });
  goal.append(createElement("h3", { text: "Goal progress" }));
  const goalMetrics = createElement("div", { className: "progress-goal__metrics" });
  goalMetrics.append(
    createMetric("Start", formatWeight(summary.goal.startWeightKg)),
    createMetric("Current", formatWeight(summary.goal.currentWeightKg)),
    createMetric("Goal", formatWeight(summary.goal.targetWeightKg)),
    createMetric("Lost", formatWeight(summary.goal.weightLostKg, { signed: true })),
    createMetric("Remaining", formatWeight(summary.goal.weightRemainingKg, { signed: true })),
    createMetric("Progress", `${Math.round(summary.goal.percentComplete)}%`, "Visual indicator is limited to 0–100%")
  );
  const progress = createElement("progress", { className: "goal-progress", attributes: { max: "100", value: String(summary.goal.visualPercentComplete), "aria-label": "Goal progress" } });
  goal.append(goalMetrics, progress);
  screen.append(goal);

  const chart = createElement("article", { className: "card progress-chart-card" });
  chart.append(createElement("h3", { text: "Weight history" }), createWeightChart(summary.weighIns, summary.goal.targetWeightKg));
  screen.append(chart);

  const milestones = createElement("article", { className: "card" });
  milestones.append(createElement("h3", { text: "Milestones" }));
  const milestoneList = createElement("ul", { className: "milestone-list" });
  const losingWeight = summary.goal.targetWeightKg < summary.goal.startWeightKg;
  summary.milestones.forEach((weight) => {
    const reached = losingWeight ? summary.goal.currentWeightKg <= weight : summary.goal.currentWeightKg >= weight;
    milestoneList.append(createElement("li", {
      className: reached ? "milestone milestone--reached" : "milestone",
      text: `${reached ? "Reached" : "Next"} · ${formatWeight(weight)}${weight === summary.goal.targetWeightKg ? " · Goal" : ""}`
    }));
  });
  milestones.append(milestoneList);
  screen.append(milestones);

  const current = summary.currentPeriod;
  const currentCard = createElement("article", { className: "card progress-current" });
  currentCard.append(createElement("h3", { text: "Current period" }), createElement("p", { text: `${current.startDate} to next weigh-in` }));
  const currentMetrics = createElement("div", { className: "progress-current__metrics" });
  currentMetrics.append(
    createMetric("Starting weight", formatWeight(current.startWeightKg)),
    createMetric("Daily allowance", `${current.dailyAllowance} PP`),
    createMetric("Points so far", `${displayPoints(current.pointsConsumed)} / ${displayPoints(current.pointsBudget)} PP`, `${current.dayCount} calendar day${current.dayCount === 1 ? "" : "s"}`),
    createMetric("Weekly extras", `${displayPoints(current.weeklyExtrasConsumed)} / ${state.currentUser.weeklyAllowance} PP`)
  );
  currentCard.append(currentMetrics);
  screen.append(currentCard);

  const history = createElement("section", { className: "progress-periods", attributes: { "aria-labelledby": "previous-periods-heading" } });
  history.append(createElement("h3", { text: "Previous periods", attributes: { id: "previous-periods-heading" } }));
  if (!summary.completedPeriods.length) {
    history.append(createElement("article", { className: "card empty-state", text: "A completed period will appear after the next weigh-in." }));
  } else {
    summary.completedPeriods.forEach((period) => history.append(createPeriodCard(period)));
  }
  screen.append(history);
  return screen;
}

function renderPlaceholder(route) {
  const screen = createElement("section", { className: "screen" });
  screen.append(createScreenHeader(route.title, route.description));
  const placeholder = createElement("article", { className: "card" });
  placeholder.append(
    createElement("h3", { text: `${route.title} is next` }),
    createElement("p", { text: "This navigation destination is in place. Its substantive workflow will arrive in the milestone assigned to it." })
  );
  screen.append(placeholder);
  return screen;
}

async function renderScreen(route) {
  const sequence = ++renderSequence;
  const state = await loadUserState();
  if (sequence !== renderSequence) return;

  updateProfileControls(state);
  let screen;
  if (!state.currentUser || showingUserForm) {
    screen = renderSetupScreen(state);
  } else if (route.name === "today") {
    const today = localDateString();
    const [summary, weekly] = await Promise.all([
      getDiarySummary(state.currentUser.id, today),
      getWeeklySummary(state.currentUser.id, today, { asOfDate: today })
    ]);
    if (sequence !== renderSequence) return;
    screen = renderTodayScreen(state, summary, weekly);
  } else if (route.name === "diary") {
    if (selectedDiaryDate < state.weighIns[0].date) selectedDiaryDate = state.weighIns[0].date;
    const [summary, foods, recipes] = await Promise.all([
      getDiarySummary(state.currentUser.id, selectedDiaryDate),
      searchFoods(""),
      listRecipes()
    ]);
    if (sequence !== renderSequence) return;
    screen = renderDiaryScreen(state, summary, foods, recipes);
  } else if (route.name === "settings") {
    screen = renderSettingsScreen(state);
  } else if (route.name === "foods") {
    const [foods, catalogueResult] = await Promise.all([
      searchFoods(jsonImportWorkflow?.expectedType === "food-import" ? "" : foodSearchQuery),
      loadReferenceCatalogue().then((catalogue) => ({ catalogue }), (error) => ({ error }))
    ]);
    if (sequence !== renderSequence) return;
    const referenceFoods = catalogueResult.catalogue && foodSearchQuery
      ? searchReferenceFoods(catalogueResult.catalogue, foodSearchQuery)
      : [];
    screen = renderFoodsScreen(foods, referenceFoods, catalogueResult.catalogue, catalogueResult.error);
  } else if (route.name === "recipes") {
    const [recipes, foods, aliases, catalogueResult] = await Promise.all([
      searchRecipes(recipeSearchQuery),
      searchFoods(""),
      listFoodAliases(),
      loadReferenceCatalogue().then((catalogue) => ({ catalogue }), (error) => ({ error }))
    ]);
    if (sequence !== renderSequence) return;
    screen = renderRecipesScreen(recipes, foods, aliases, catalogueResult.catalogue, catalogueResult.error);
  } else if (route.name === "progress") {
    if (progressView === "overview") {
      const progress = await getProgressSummary(state.currentUser.id, localDateString());
      if (sequence !== renderSequence) return;
      screen = renderProgressScreen(state, progress);
    } else {
      const firstWeekStart = weekRange(state.weighIns[0].date).start;
      if (selectedWeekDate < firstWeekStart) selectedWeekDate = state.weighIns[0].date;
      const selectedRange = weekRange(selectedWeekDate);
      const today = localDateString();
      const asOfDate = today < selectedRange.start
        ? selectedRange.start
        : today > selectedRange.end
          ? selectedRange.end
          : today;
      const weekly = await getWeeklySummary(state.currentUser.id, selectedWeekDate, { asOfDate });
      if (sequence !== renderSequence) return;
      screen = renderWeeklyScreen(state, weekly);
    }
  } else {
    screen = renderPlaceholder(route);
  }

  main.replaceChildren(screen);
  main.focus({ preventScroll: true });
}

function renderCurrentRoute() {
  return currentRoute ? renderScreen(currentRoute) : Promise.resolve();
}

async function startApplication() {
  await openDatabase();

  profileSwitcher.addEventListener("change", async () => {
    await setCurrentUser(profileSwitcher.value);
    showingUserForm = false;
    showingDiaryForm = false;
    editingDiaryEntryId = undefined;
    pendingRecipeDiaryId = undefined;
    pendingDeleteDiaryEntryId = undefined;
    jsonImportWorkflow = undefined;
    referenceFoodPreview = undefined;
    await renderCurrentRoute();
  });
  addProfileButton.addEventListener("click", () => {
    showingUserForm = true;
    void renderCurrentRoute();
  });

  const router = createRouter({
    onRouteChange(route) {
      currentRoute = route;
      void renderScreen(route);
    }
  });
  router.start();
}

startApplication().catch((error) => {
  console.error("Application startup failed", error);
  const message = createElement("p", {
    text: "Local storage could not be opened. Check this browser's storage permissions and reload."
  });
  main.replaceChildren(message);
});

void registerServiceWorker();
