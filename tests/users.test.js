import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";

import { resetDatabase } from "../public/js/db.js";
import {
  addWeighIn,
  createUserWithInitialWeighIn,
  getCurrentUser,
  listUsers,
  listWeighIns,
  localDateString,
  setCurrentUser,
  updateTargetWeight
} from "../public/js/users.js";

const john = {
  name: "John",
  sex: "male",
  dateOfBirth: "1956-01-01",
  heightCm: 180,
  currentWeightKg: 91.8,
  targetWeightKg: 84,
  dailyMinimum: 26,
  weeklyAllowance: 49,
  weighInDate: "2026-08-10"
};

test("first-run setup atomically creates a user, initial weigh-in, and selection", async () => {
  await resetDatabase();
  const { user, weighIn } = await createUserWithInitialWeighIn(john, {
    userId: "user-john",
    weighInId: "weigh-in-john-1",
    timestamp: "2026-08-10T01:00:00Z"
  });

  assert.equal(user.startWeightKg, 91.8);
  assert.equal(weighIn.dailyBudget, 34);
  assert.deepEqual(await getCurrentUser(), user);
  assert.deepEqual(await listWeighIns(user.id), [weighIn]);
});

test("two users can exist and the selected user persists", async () => {
  await resetDatabase();
  const { user: firstUser } = await createUserWithInitialWeighIn(john, {
    userId: "user-john",
    weighInId: "weigh-in-john-1"
  });
  const { user: secondUser } = await createUserWithInitialWeighIn({
    ...john,
    name: "Jane",
    sex: "female",
    dateOfBirth: "1981-01-01",
    heightCm: 170,
    currentWeightKg: 100,
    targetWeightKg: 80
  }, {
    userId: "user-jane",
    weighInId: "weigh-in-jane-1"
  });

  assert.deepEqual((await listUsers()).map((user) => user.name), ["Jane", "John"]);
  assert.deepEqual(await getCurrentUser(), secondUser);

  await setCurrentUser(firstUser.id);
  assert.deepEqual(await getCurrentUser(), firstUser);
});

test("new weigh-ins snapshot their allowance and preserve historical budgets", async () => {
  await resetDatabase();
  const { user, weighIn: initialWeighIn } = await createUserWithInitialWeighIn(john, {
    userId: "user-john",
    weighInId: "weigh-in-john-1"
  });
  const nextWeighIn = await addWeighIn({
    userId: user.id,
    date: "2026-08-17",
    weightKg: 88
  }, {
    weighInId: "weigh-in-john-2",
    timestamp: "2026-08-17T01:00:00Z"
  });

  assert.equal(initialWeighIn.dailyBudget, 34);
  assert.equal(nextWeighIn.dailyBudget, 32);
  assert.deepEqual((await listWeighIns(user.id)).map((entry) => entry.dailyBudget), [34, 32]);
  await assert.rejects(
    addWeighIn({ userId: user.id, date: "2026-08-17", weightKg: 87 }),
    /already exists/
  );
});

test("target weight can be edited without changing weigh-in history", async () => {
  await resetDatabase();
  const { user } = await createUserWithInitialWeighIn(john, {
    userId: "user-john",
    weighInId: "weigh-in-john-1"
  });

  const updated = await updateTargetWeight(user.id, 82, {
    timestamp: "2026-08-11T01:00:00Z"
  });

  assert.equal(updated.targetWeightKg, 82);
  assert.equal((await listWeighIns(user.id))[0].dailyBudget, 34);
});

test("local dates are formatted without UTC conversion", () => {
  const date = new Date(2026, 7, 10, 23, 30);
  assert.equal(localDateString(date), "2026-08-10");
});
