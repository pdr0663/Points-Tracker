import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";

import {
  add,
  get,
  getAll,
  openDatabase,
  put,
  queryIndex,
  remove,
  resetDatabase
} from "../public/js/db.js";

test("IndexedDB migration creates the complete initial schema", async () => {
  await resetDatabase();
  const database = await openDatabase();

  assert.deepEqual([...database.objectStoreNames], [
    "diaryEntries",
    "foodAliases",
    "foods",
    "recipes",
    "settings",
    "users",
    "weighIns"
  ]);
});

test("IndexedDB wrapper supports CRUD, index lookup, and repeat access", async () => {
  const user = {
    id: "user-test-1",
    name: "Test User",
    updatedAt: "2026-08-10T00:00:00Z"
  };

  await add("users", user);
  assert.deepEqual(await get("users", user.id), user);

  const updatedUser = { ...user, name: "Updated User" };
  await put("users", updatedUser);
  assert.deepEqual(await queryIndex("users", "name", "Updated User"), [updatedUser]);

  // Opening the database again reuses the persisted browser database rather than rebuilding it.
  await openDatabase();
  assert.deepEqual(await getAll("users"), [updatedUser]);

  await remove("users", user.id);
  assert.equal(await get("users", user.id), undefined);
});

test("the developer reset removes data and allows a clean recreation", async () => {
  await add("settings", { key: "test-setting", value: true });
  await resetDatabase();
  await openDatabase();

  assert.deepEqual(await getAll("settings"), []);
});

