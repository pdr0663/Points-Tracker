import { openDatabase } from "./db.js";
import { createRouter } from "./router.js";
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

function createField({ label, name, type = "text", value, min, max, step, options, attributes = {} }) {
  const wrapper = createElement("div", { className: "form-field" });
  const id = `field-${name}`;
  const labelElement = createElement("label", { text: label, attributes: { for: id } });
  let control;

  if (options) {
    control = createElement("select", { attributes: { ...attributes, id, name, required: "" } });
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
        required: ""
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
  const value = Number(formData.get(name));
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a number.`);
  return value;
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
      state.users.length ? "Add household profile" : "Set up ProPoints",
      state.users.length
        ? "Create another independent profile while keeping foods and recipes shared."
        : "Create the first household profile and initial weigh-in."
    ),
    createUserForm(state.users.length > 0)
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

function renderTodayScreen(state) {
  const { currentUser, weighIns } = state;
  const currentWeighIn = weighIns.at(-1);
  const screen = createElement("section", { className: "screen" });
  screen.append(createScreenHeader("Today", `${currentUser.name}'s current ProPoints profile.`));

  const metrics = createElement("div", { className: "metrics-grid" });
  metrics.append(
    createMetric("Current weight", `${currentWeighIn.weightKg.toFixed(1)} kg`, `Recorded ${currentWeighIn.date}`),
    createMetric("Target weight", `${currentUser.targetWeightKg.toFixed(1)} kg`, `${Math.max(0, currentWeighIn.weightKg - currentUser.targetWeightKg).toFixed(1)} kg remaining`),
    createMetric("Daily allowance", `${currentWeighIn.dailyBudget} PP`, `Minimum ${currentUser.dailyMinimum} PP`),
    createMetric("Weekly allowance", `${currentUser.weeklyAllowance} PP`, `${weighIns.length} weigh-in${weighIns.length === 1 ? "" : "s"} recorded`)
  );
  screen.append(metrics);

  const next = createElement("article", { className: "card card--accent" });
  next.append(
    createElement("h3", { text: "Profile tracking is ready" }),
    createElement("p", { text: "Use Settings to record another weigh-in or adjust the target weight. Food entry arrives in the next milestone." })
  );
  screen.append(next);
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

function renderSettingsScreen(state) {
  const screen = createElement("section", { className: "screen" });
  screen.append(createScreenHeader("Settings", `Profile and weigh-ins for ${state.currentUser.name}.`));
  const grid = createElement("div", { className: "card-grid card-grid--two" });
  grid.append(
    createWeighInForm(state),
    createTargetForm(state),
    createWeighInHistory(state.weighIns)
  );
  screen.append(grid);
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
    screen = renderTodayScreen(state);
  } else if (route.name === "settings") {
    screen = renderSettingsScreen(state);
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
