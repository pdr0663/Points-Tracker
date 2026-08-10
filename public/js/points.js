const CENTIMETRES_PER_INCH = 2.54;
const POUNDS_PER_KILOGRAM = 2.2046226218;
const SUPPORTED_SEX_VALUES = new Set(["male", "female"]);

function requireFiniteNumber(value, name, { minimum = 0, exclusiveMinimum = false } = {}) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }

  if (exclusiveMinimum ? value <= minimum : value < minimum) {
    const comparison = exclusiveMinimum ? "greater than" : "at least";
    throw new RangeError(`${name} must be ${comparison} ${minimum}.`);
  }

  return value;
}

function parseLocalDate(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${name} must use YYYY-MM-DD format.`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`${name} must be a valid calendar date.`);
  }

  return { year, month, day, sortable: year * 10_000 + month * 100 + day };
}

export function calculateAgeOnDate(dateOfBirth, date) {
  const birth = parseLocalDate(dateOfBirth, "dateOfBirth");
  const onDate = parseLocalDate(date, "date");

  if (onDate.sortable < birth.sortable) {
    throw new RangeError("date cannot be before dateOfBirth.");
  }

  const birthdayHasOccurred =
    onDate.month > birth.month ||
    (onDate.month === birth.month && onDate.day >= birth.day);

  return onDate.year - birth.year - (birthdayHasOccurred ? 0 : 1);
}

export function calculateRawPoints({
  protein,
  carbohydrate,
  fat,
  fibre,
  isZeroPoint = false
}) {
  if (typeof isZeroPoint !== "boolean") {
    throw new TypeError("isZeroPoint must be a boolean.");
  }

  if (isZeroPoint) {
    return 0;
  }

  const nutrients = {
    protein: requireFiniteNumber(protein, "protein"),
    carbohydrate: requireFiniteNumber(carbohydrate, "carbohydrate"),
    fat: requireFiniteNumber(fat, "fat"),
    fibre: requireFiniteNumber(fibre, "fibre")
  };

  return (
    16 * nutrients.protein +
    19 * nutrients.carbohydrate +
    45 * nutrients.fat +
    5 * nutrients.fibre
  ) / 175;
}

export function roundPoints(rawPoints, method = "nearest") {
  requireFiniteNumber(rawPoints, "rawPoints");

  if (method === "nearest") {
    return Math.round(rawPoints);
  }

  if (method === "decimal") {
    return Math.round((rawPoints + Number.EPSILON) * 10) / 10;
  }

  throw new RangeError(`Unsupported point display rounding method: ${method}`);
}

export function calculateDailyAllowance({
  sex,
  dateOfBirth,
  heightCm,
  weightKg,
  date,
  minimum = 26
}) {
  if (!SUPPORTED_SEX_VALUES.has(sex)) {
    throw new RangeError("sex must be either male or female for the historical allowance formula.");
  }

  const heightInches = requireFiniteNumber(heightCm, "heightCm", { exclusiveMinimum: true }) / CENTIMETRES_PER_INCH;
  const weightPounds = requireFiniteNumber(weightKg, "weightKg", { exclusiveMinimum: true }) * POUNDS_PER_KILOGRAM;
  const allowanceMinimum = requireFiniteNumber(minimum, "minimum");
  const age = calculateAgeOnDate(dateOfBirth, date);

  const rawAllowance = sex === "male"
    ? (heightInches - 48) / 2.25 + weightPounds * 0.1834 - (age - 17) / 4
    : (heightInches - 48) / 2 + weightPounds * 0.1461 - (age - 21) / 5 - 5;

  return Math.max(allowanceMinimum, Math.round(rawAllowance));
}

