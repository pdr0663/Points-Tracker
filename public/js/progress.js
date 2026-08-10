import { get, queryIndex } from "./db.js";
import { listWeighIns } from "./users.js";

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function requireDate(value, name = "date") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) throw new RangeError(`${name} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${name} must be a valid calendar date.`);
  }
  return date;
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function datesBetween(startDate, endDate, includeEnd = false) {
  const start = requireDate(startDate, "startDate");
  const end = requireDate(endDate, "endDate");
  const dates = [];
  for (let cursor = start.valueOf(); includeEnd ? cursor <= end.valueOf() : cursor < end.valueOf(); cursor += DAY_MILLISECONDS) {
    dates.push(dateString(new Date(cursor)));
  }
  return dates;
}

function budgetForDate(weighIns, date) {
  return [...weighIns]
    .filter((weighIn) => weighIn.date <= date)
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1)?.dailyBudget ?? 0;
}

function sumPoints(entries) {
  return entries.reduce((total, entry) => total + entry.rawPoints, 0);
}

export function calculateGoalProgress(user, weighIns) {
  if (!user || !weighIns.length) throw new RangeError("Goal progress requires a user and at least one weigh-in.");
  const currentWeightKg = [...weighIns].sort((left, right) => left.date.localeCompare(right.date)).at(-1).weightKg;
  const startWeightKg = user.startWeightKg;
  const targetWeightKg = user.targetWeightKg;
  const denominator = startWeightKg - targetWeightKg;
  const actualProgress = denominator === 0
    ? (currentWeightKg === targetWeightKg ? 1 : 0)
    : (startWeightKg - currentWeightKg) / denominator;

  return {
    startWeightKg,
    currentWeightKg,
    targetWeightKg,
    weightLostKg: startWeightKg - currentWeightKg,
    weightRemainingKg: currentWeightKg - targetWeightKg,
    percentComplete: actualProgress * 100,
    visualPercentComplete: Math.min(100, Math.max(0, actualProgress * 100))
  };
}

export function generateWeightMilestones(startWeightKg, targetWeightKg) {
  const distance = Math.abs(startWeightKg - targetWeightKg);
  if (!Number.isFinite(distance) || distance === 0) return [];
  const interval = distance > 25 ? 5 : 2.5;
  const direction = targetWeightKg < startWeightKg ? -1 : 1;
  const milestones = [];
  for (let offset = interval; offset < distance; offset += interval) {
    milestones.push(Number((startWeightKg + direction * offset).toFixed(1)));
  }
  if (milestones.at(-1) !== targetWeightKg) milestones.push(targetWeightKg);
  return milestones;
}

export function calculatePeriod({ startWeighIn, endWeighIn, entries, weighIns, asOfDate }) {
  const completed = Boolean(endWeighIn);
  const endDate = completed ? endWeighIn.date : asOfDate;
  const dates = datesBetween(startWeighIn.date, endDate, !completed);
  const periodEntries = entries.filter((entry) => dates.includes(entry.date));
  const dailyTotals = dates.map((date) => ({
    date,
    usedPoints: sumPoints(periodEntries.filter((entry) => entry.date === date)),
    dailyBudget: budgetForDate(weighIns, date)
  }));
  const pointsConsumed = sumPoints(periodEntries);

  return {
    startDate: startWeighIn.date,
    endDate: completed ? endWeighIn.date : undefined,
    asOfDate: completed ? endWeighIn.date : asOfDate,
    completed,
    startWeightKg: startWeighIn.weightKg,
    endWeightKg: endWeighIn?.weightKg,
    weightChangeKg: endWeighIn ? endWeighIn.weightKg - startWeighIn.weightKg : undefined,
    dailyAllowance: startWeighIn.dailyBudget,
    pointsConsumed,
    pointsBudget: dailyTotals.reduce((total, day) => total + day.dailyBudget, 0),
    averagePointsPerDay: dates.length ? pointsConsumed / dates.length : 0,
    weeklyExtrasConsumed: dailyTotals.reduce((total, day) => total + Math.max(0, day.usedPoints - day.dailyBudget), 0),
    dayCount: dates.length
  };
}

export function calculateProgressSummary({ user, weighIns, entries, asOfDate }) {
  requireDate(asOfDate, "asOfDate");
  const orderedWeighIns = [...weighIns]
    .filter((weighIn) => weighIn.date <= asOfDate)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (!orderedWeighIns.length) throw new RangeError("Progress requires at least one weigh-in.");
  const completedPeriods = orderedWeighIns.slice(0, -1).map((weighIn, index) => calculatePeriod({
    startWeighIn: weighIn,
    endWeighIn: orderedWeighIns[index + 1],
    entries,
    weighIns: orderedWeighIns,
    asOfDate
  })).reverse();
  const currentPeriod = calculatePeriod({
    startWeighIn: orderedWeighIns.at(-1),
    entries,
    weighIns: orderedWeighIns,
    asOfDate
  });

  return {
    goal: calculateGoalProgress(user, orderedWeighIns),
    milestones: generateWeightMilestones(user.startWeightKg, user.targetWeightKg),
    currentPeriod,
    completedPeriods,
    weighIns: orderedWeighIns
  };
}

export function createWeightChartModel(weighIns, targetWeightKg) {
  const ordered = [...weighIns].sort((left, right) => left.date.localeCompare(right.date));
  if (!ordered.length) throw new RangeError("A weight chart requires at least one weigh-in.");
  const weights = [...ordered.map((item) => item.weightKg), targetWeightKg];
  const minimum = Math.min(...weights);
  const maximum = Math.max(...weights);
  const padding = Math.max(1, (maximum - minimum) * 0.12);
  const chartMinimum = minimum - padding;
  const chartMaximum = maximum + padding;
  const normalizeY = (weight) => (chartMaximum - weight) / (chartMaximum - chartMinimum);

  return {
    minimumWeightKg: chartMinimum,
    maximumWeightKg: chartMaximum,
    targetY: normalizeY(targetWeightKg),
    points: ordered.map((item, index) => ({
      date: item.date,
      weightKg: item.weightKg,
      x: ordered.length === 1 ? 0.5 : index / (ordered.length - 1),
      y: normalizeY(item.weightKg)
    }))
  };
}

export async function getProgressSummary(userId, asOfDate) {
  const [user, weighIns, entries] = await Promise.all([
    get("users", userId),
    listWeighIns(userId),
    queryIndex("diaryEntries", "userId", userId)
  ]);
  if (!user) throw new RangeError("Cannot summarize a user that does not exist.");
  return calculateProgressSummary({ user, weighIns, entries, asOfDate });
}
