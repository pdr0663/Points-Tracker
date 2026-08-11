import assert from "node:assert/strict";
import test from "node:test";
import { requiredFormNumber } from "../public/js/form-values.js";

test("required form numbers never convert blank values to zero", () => {
  assert.equal(requiredFormNumber("0", "fibre"), 0);
  assert.equal(requiredFormNumber(" 9.5 ", "protein"), 9.5);
  assert.throws(() => requiredFormNumber("", "fibre"), TypeError);
  assert.throws(() => requiredFormNumber("   ", "fibre"), TypeError);
  assert.throws(() => requiredFormNumber(null, "fibre"), TypeError);
});
