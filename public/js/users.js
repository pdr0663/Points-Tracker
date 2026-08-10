import { get, getAll, put, queryIndex, runTransaction } from "./db.js";
import { calculateAgeOnDate, calculateDailyAllowance } from "./points.js";

const CURRENT_USER_SETTING = "currentUserId";
const SUPPORTED_SEX_VALUES = new Set(["male", "female"]);

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required.`);
  }

  return value.trim();
}

function requireNumber(value, name, { minimum = 0, exclusiveMinimum = false } = {}) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a number.`);
  }

  if (exclusiveMinimum ? value <= minimum : value < minimum) {
    const comparison = exclusiveMinimum ? "greater than" : "at least";
    throw new RangeError(`${name} must be ${comparison} ${minimum}.`);
  }

  return value;
}

function requireSex(value) {
  if (!SUPPORTED_SEX_VALUES.has(value)) {
    throw new RangeError("sex must be either male or female for the historical allowance formula.");
  }

  return value;
}

function createId(prefix) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

export function localDateString(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("date must be a valid Date.");
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validateProfile(input, weighInDate) {
  const profile = {
    name: requireText(input.name, "name"),
    sex: requireSex(input.sex),
    dateOfBirth: requireText(input.dateOfBirth, "dateOfBirth"),
    heightCm: requireNumber(input.heightCm, "heightCm", { exclusiveMinimum: true }),
    currentWeightKg: requireNumber(input.currentWeightKg, "currentWeightKg", { exclusiveMinimum: true }),
    targetWeightKg: requireNumber(input.targetWeightKg, "targetWeightKg", { exclusiveMinimum: true }),
    dailyMinimum: requireNumber(input.dailyMinimum ?? 26, "dailyMinimum"),
    weeklyAllowance: requireNumber(input.weeklyAllowance ?? 49, "weeklyAllowance")
  };

  calculateAgeOnDate(profile.dateOfBirth, weighInDate);
  return profile;
}

export async function createUserWithInitialWeighIn(input, options = {}) {
  const weighInDate = input.weighInDate ?? localDateString();
  const profile = validateProfile(input, weighInDate);
  const timestamp = options.timestamp ?? new Date().toISOString();
  const userId = options.userId ?? createId("user");
  const weighInId = options.weighInId ?? createId("weigh-in");
  const dailyBudget = calculateDailyAllowance({
    sex: profile.sex,
    dateOfBirth: profile.dateOfBirth,
    heightCm: profile.heightCm,
    weightKg: profile.currentWeightKg,
    date: weighInDate,
    minimum: profile.dailyMinimum
  });

  const user = {
    id: userId,
    name: profile.name,
    sex: profile.sex,
    dateOfBirth: profile.dateOfBirth,
    heightCm: profile.heightCm,
    targetWeightKg: profile.targetWeightKg,
    startWeightKg: profile.currentWeightKg,
    dailyMinimum: profile.dailyMinimum,
    weeklyAllowance: profile.weeklyAllowance,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const weighIn = {
    id: weighInId,
    userId,
    date: weighInDate,
    weightKg: profile.currentWeightKg,
    dailyBudget,
    createdAt: timestamp
  };

  await runTransaction(["users", "weighIns", "settings"], "readwrite", async (stores) => {
    const requests = [
      requestResult(stores.users.add(user)),
      requestResult(stores.weighIns.add(weighIn)),
      requestResult(stores.settings.put({ key: CURRENT_USER_SETTING, value: userId }))
    ];
    await Promise.all(requests);
  });

  return { user, weighIn };
}

export async function listUsers() {
  const users = await getAll("users");
  return users.sort((left, right) => left.name.localeCompare(right.name));
}

export async function setCurrentUser(userId) {
  const user = await get("users", userId);
  if (!user) {
    throw new RangeError("Cannot select a user that does not exist.");
  }

  await put("settings", { key: CURRENT_USER_SETTING, value: userId });
  return user;
}

export async function getCurrentUser() {
  const setting = await get("settings", CURRENT_USER_SETTING);
  if (setting?.value) {
    const selectedUser = await get("users", setting.value);
    if (selectedUser) return selectedUser;
  }

  const users = await listUsers();
  if (!users.length) return undefined;

  await put("settings", { key: CURRENT_USER_SETTING, value: users[0].id });
  return users[0];
}

export async function addWeighIn(input, options = {}) {
  const user = await get("users", input.userId);
  if (!user) {
    throw new RangeError("Cannot add a weigh-in for a user that does not exist.");
  }

  const date = requireText(input.date, "date");
  const weightKg = requireNumber(input.weightKg, "weightKg", { exclusiveMinimum: true });
  calculateAgeOnDate(user.dateOfBirth, date);

  const existing = await queryIndex("weighIns", "userIdDate", [user.id, date]);
  if (existing.length) {
    throw new RangeError("A weigh-in already exists for this user and date.");
  }

  const weighIn = {
    id: options.weighInId ?? createId("weigh-in"),
    userId: user.id,
    date,
    weightKg,
    dailyBudget: calculateDailyAllowance({
      sex: user.sex,
      dateOfBirth: user.dateOfBirth,
      heightCm: user.heightCm,
      weightKg,
      date,
      minimum: user.dailyMinimum
    }),
    createdAt: options.timestamp ?? new Date().toISOString()
  };

  await runTransaction("weighIns", "readwrite", ({ weighIns }) => requestResult(weighIns.add(weighIn)));
  return weighIn;
}

export async function listWeighIns(userId) {
  const weighIns = await queryIndex("weighIns", "userId", userId);
  return weighIns.sort((left, right) => left.date.localeCompare(right.date));
}

export async function updateTargetWeight(userId, targetWeightKg, options = {}) {
  const user = await get("users", userId);
  if (!user) {
    throw new RangeError("Cannot update a user that does not exist.");
  }

  const updatedUser = {
    ...user,
    targetWeightKg: requireNumber(targetWeightKg, "targetWeightKg", { exclusiveMinimum: true }),
    updatedAt: options.timestamp ?? new Date().toISOString()
  };
  await put("users", updatedUser);
  return updatedUser;
}
