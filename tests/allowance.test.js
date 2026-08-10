import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAgeOnDate,
  calculateDailyAllowance
} from "../public/js/points.js";

test("age changes on the local calendar birthday boundary", () => {
  assert.equal(calculateAgeOnDate("1980-08-10", "2026-08-09"), 45);
  assert.equal(calculateAgeOnDate("1980-08-10", "2026-08-10"), 46);
});

test("male allowance applies metric conversions and the historical formula", () => {
  const input = {
    sex: "male",
    dateOfBirth: "1956-01-01",
    heightCm: 180,
    weightKg: 91.8,
    date: "2026-08-10",
    minimum: 26
  };
  const age = 70;
  const expected = Math.max(26, Math.round(
    (180 / 2.54 - 48) / 2.25 +
    (91.8 * 2.2046226218) * 0.1834 -
    (age - 17) / 4
  ));

  assert.equal(calculateDailyAllowance(input), expected);
  assert.equal(expected, 34);
});

test("female allowance applies metric conversions and the historical formula", () => {
  const input = {
    sex: "female",
    dateOfBirth: "1981-01-01",
    heightCm: 170,
    weightKg: 100,
    date: "2026-08-10",
    minimum: 26
  };
  const age = 45;
  const expected = Math.max(26, Math.round(
    (170 / 2.54 - 48) / 2 +
    (100 * 2.2046226218) * 0.1461 -
    (age - 21) / 5 -
    5
  ));

  assert.equal(calculateDailyAllowance(input), expected);
  assert.equal(expected, 32);
});

test("the default minimum daily allowance is 26", () => {
  assert.equal(calculateDailyAllowance({
    sex: "female",
    dateOfBirth: "1940-01-01",
    heightCm: 150,
    weightKg: 50,
    date: "2026-08-10"
  }), 26);
});

test("a configured minimum daily allowance of 29 is respected", () => {
  assert.equal(calculateDailyAllowance({
    sex: "female",
    dateOfBirth: "1940-01-01",
    heightCm: 150,
    weightKg: 50,
    date: "2026-08-10",
    minimum: 29
  }), 29);
});

test("calendar dates are validated without UTC date slicing", () => {
  assert.throws(() => calculateAgeOnDate("1980-02-30", "2026-08-10"), /valid calendar date/);
  assert.throws(() => calculateAgeOnDate("1980-08-10", "1979-08-10"), /before dateOfBirth/);
});

