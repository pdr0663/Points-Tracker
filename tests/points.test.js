import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateRawProPoints,
  roundProPoints
} from "../public/js/points.js";

test("food ProPoints uses the documented formula without calculation rounding", () => {
  const nutrients = {
    protein: 9.5,
    carbohydrate: 6.2,
    fat: 2.8,
    fibre: 0
  };
  const expected = (16 * 9.5 + 19 * 6.2 + 45 * 2.8 + 5 * 0) / 175;

  assert.equal(calculateRawProPoints(nutrients), expected);
  assert.notEqual(calculateRawProPoints(nutrients), Math.round(expected));
});

test("confirmed zero-point foods return zero without using nutrients", () => {
  assert.equal(calculateRawProPoints({
    protein: null,
    carbohydrate: null,
    fat: null,
    fibre: null,
    isZeroPoint: true
  }), 0);
});

test("nearest display rounding returns an integer", () => {
  assert.equal(roundProPoints(4.49), 4);
  assert.equal(roundProPoints(4.5), 5);
});

test("decimal display rounding returns one decimal place", () => {
  assert.equal(roundProPoints(4.24, "decimal"), 4.2);
  assert.equal(roundProPoints(4.25, "decimal"), 4.3);
});

test("unknown display rounding methods are rejected", () => {
  assert.throws(() => roundProPoints(4.2, "ceiling"), /Unsupported/);
});

test("missing nutrients are not silently treated as zero", () => {
  assert.throws(() => calculateRawProPoints({
    protein: 1,
    carbohydrate: 2,
    fat: 3,
    fibre: null
  }), /fibre/);
});

