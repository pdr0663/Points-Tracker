import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateGoalProgress,
  calculateProgressSummary,
  createWeightChartModel,
  generateWeightMilestones
} from "../public/js/progress.js";

const user = { startWeightKg: 100, targetWeightKg: 80, weeklyAllowance: 49 };
const weighIns = [
  { date: "2026-08-03", weightKg: 100, dailyBudget: 31 },
  { date: "2026-08-10", weightKg: 90, dailyBudget: 30 }
];

test("goal progress reports the required 100 to 90 to 80 example as 50 percent", () => {
  assert.deepEqual(calculateGoalProgress(user, weighIns), {
    startWeightKg: 100,
    currentWeightKg: 90,
    targetWeightKg: 80,
    weightLostKg: 10,
    weightRemainingKg: 10,
    percentComplete: 50,
    visualPercentComplete: 50
  });
});

test("visual progress is clamped without changing actual numerical progress", () => {
  const beyond = calculateGoalProgress(user, [...weighIns, { date: "2026-08-17", weightKg: 75, dailyBudget: 29 }]);
  assert.equal(beyond.percentComplete, 125);
  assert.equal(beyond.visualPercentComplete, 100);
  const reversed = calculateGoalProgress(user, [...weighIns, { date: "2026-08-17", weightKg: 105, dailyBudget: 32 }]);
  assert.equal(reversed.percentComplete, -25);
  assert.equal(reversed.visualPercentComplete, 0);
});

test("milestones use sensible intervals and always include the exact target", () => {
  assert.deepEqual(generateWeightMilestones(96, 84), [93.5, 91, 88.5, 86, 84]);
  assert.deepEqual(generateWeightMilestones(80, 86), [82.5, 85, 86]);
});

test("completed periods exclude the next weigh-in day and remain date bounded", () => {
  const entries = [
    { date: "2026-08-03", rawPoints: 35 },
    { date: "2026-08-04", rawPoints: 20 },
    { date: "2026-08-10", rawPoints: 40 }
  ];
  const summary = calculateProgressSummary({ user, weighIns, entries, asOfDate: "2026-08-11" });
  const completed = summary.completedPeriods[0];
  assert.equal(completed.pointsConsumed, 55);
  assert.equal(completed.pointsBudget, 217);
  assert.equal(completed.weeklyExtrasConsumed, 4);
  assert.equal(completed.averagePointsPerDay, 55 / 7);
  assert.equal(completed.weightChangeKg, -10);
  assert.equal(summary.currentPeriod.pointsConsumed, 40);
  assert.equal(summary.currentPeriod.pointsBudget, 60);
});

test("chart coordinates are normalized and include the target reference", () => {
  const chart = createWeightChartModel(weighIns, 80);
  assert.deepEqual(chart.points.map(({ x }) => x), [0, 1]);
  assert.ok(chart.points.every(({ y }) => y >= 0 && y <= 1));
  assert.ok(chart.targetY >= 0 && chart.targetY <= 1);
});

test("future weigh-ins do not close the current period early", () => {
  const summary = calculateProgressSummary({
    user,
    weighIns: [...weighIns, { date: "2026-08-20", weightKg: 85, dailyBudget: 29 }],
    entries: [],
    asOfDate: "2026-08-11"
  });
  assert.equal(summary.goal.currentWeightKg, 90);
  assert.equal(summary.currentPeriod.startDate, "2026-08-10");
  assert.equal(summary.completedPeriods.length, 1);
  assert.equal(summary.weighIns.length, 2);
});
