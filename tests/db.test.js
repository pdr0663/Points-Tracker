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

const previousDatabaseName = ["pro", "points"].join("");

function deleteNamedDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.addEventListener("success", () => resolve(), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function createPreviousDatabase(user) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(previousDatabaseName, 1);
    request.addEventListener("upgradeneeded", () => {
      ["users", "weighIns", "foods", "foodAliases", "recipes", "diaryEntries"].forEach((name) => {
        request.result.createObjectStore(name, { keyPath: "id" });
      });
      request.result.createObjectStore("settings", { keyPath: "key" });
    }, { once: true });
    request.addEventListener("success", () => {
      const database = request.result;
      const transaction = database.transaction("users", "readwrite");
      transaction.objectStore("users").add(user);
      transaction.addEventListener("complete", () => {
        database.close();
        resolve();
      }, { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

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

test("the renamed database imports existing local records once", async () => {
  const existingUser = { id: "user-existing", name: "Existing User" };
  await resetDatabase();
  await deleteNamedDatabase(previousDatabaseName);
  await createPreviousDatabase(existingUser);

  await openDatabase();
  assert.deepEqual(await get("users", existingUser.id), existingUser);

  await resetDatabase();
  await deleteNamedDatabase(previousDatabaseName);
});
