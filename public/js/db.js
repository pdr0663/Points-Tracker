export const DATABASE_NAME = "points-tracker";
export const DATABASE_VERSION = 1;
const LEGACY_DATABASE_NAME = ["pro", "points"].join("");
const STORE_NAMES = ["users", "weighIns", "foods", "foodAliases", "recipes", "diaryEntries", "settings"];

const migrations = {
  1(database) {
    const users = database.createObjectStore("users", { keyPath: "id" });
    users.createIndex("name", "name", { unique: false });

    const weighIns = database.createObjectStore("weighIns", { keyPath: "id" });
    weighIns.createIndex("userId", "userId", { unique: false });
    weighIns.createIndex("date", "date", { unique: false });
    weighIns.createIndex("userIdDate", ["userId", "date"], { unique: true });

    const foods = database.createObjectStore("foods", { keyPath: "id" });
    foods.createIndex("normalizedName", "normalizedName", { unique: false });

    const foodAliases = database.createObjectStore("foodAliases", { keyPath: "id" });
    foodAliases.createIndex("normalizedAlias", "normalizedAlias", { unique: false });
    foodAliases.createIndex("foodId", "foodId", { unique: false });

    const recipes = database.createObjectStore("recipes", { keyPath: "id" });
    recipes.createIndex("name", "name", { unique: false });

    const diaryEntries = database.createObjectStore("diaryEntries", { keyPath: "id" });
    diaryEntries.createIndex("userId", "userId", { unique: false });
    diaryEntries.createIndex("date", "date", { unique: false });
    diaryEntries.createIndex("userIdDate", ["userId", "date"], { unique: false });
    diaryEntries.createIndex("itemId", "itemId", { unique: false });

    database.createObjectStore("settings", { keyPath: "key" });
  }
};

let databasePromise;

function requireIndexedDB() {
  if (!globalThis.indexedDB) {
    throw new Error("IndexedDB is not available in this environment.");
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionCompletion(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("Database transaction aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("Database transaction failed.")), { once: true });
  });
}

function openExistingDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(name);
    let missing = false;
    request.addEventListener("upgradeneeded", () => {
      missing = true;
      request.transaction.abort();
    }, { once: true });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", (event) => {
      if (missing) {
        event.preventDefault();
        resolve(undefined);
      } else {
        reject(request.error);
      }
    }, { once: true });
  });
}

async function readAllStores(database) {
  const transaction = database.transaction(STORE_NAMES, "readonly");
  const completion = transactionCompletion(transaction);
  const data = Object.fromEntries(await Promise.all(STORE_NAMES.map(async (storeName) => [
    storeName,
    await requestResult(transaction.objectStore(storeName).getAll())
  ])));
  await completion;
  return data;
}

async function migrateLegacyDatabase(database) {
  const currentData = await readAllStores(database);
  if (STORE_NAMES.some((storeName) => currentData[storeName].length)) return;

  const legacyDatabase = await openExistingDatabase(LEGACY_DATABASE_NAME);
  if (!legacyDatabase) return;
  try {
    if (!STORE_NAMES.every((storeName) => legacyDatabase.objectStoreNames.contains(storeName))) return;
    const legacyData = await readAllStores(legacyDatabase);
    if (!STORE_NAMES.some((storeName) => legacyData[storeName].length)) return;
    const transaction = database.transaction(STORE_NAMES, "readwrite");
    const completion = transactionCompletion(transaction);
    STORE_NAMES.forEach((storeName) => {
      legacyData[storeName].forEach((record) => transaction.objectStore(storeName).put(record));
    });
    await completion;
  } finally {
    legacyDatabase.close();
  }
}

export function openDatabase() {
  requireIndexedDB();

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.addEventListener("upgradeneeded", (event) => {
        const database = request.result;
        for (let version = event.oldVersion + 1; version <= event.newVersion; version += 1) {
          const migrate = migrations[version];
          if (!migrate) {
            request.transaction.abort();
            return;
          }
          migrate(database, request.transaction);
        }
      });

      request.addEventListener("success", async () => {
        const database = request.result;
        try {
          await migrateLegacyDatabase(database);
          database.addEventListener("versionchange", () => {
            database.close();
            databasePromise = undefined;
          });
          resolve(database);
        } catch (error) {
          database.close();
          databasePromise = undefined;
          reject(error);
        }
      }, { once: true });

      request.addEventListener("blocked", () => {
        console.warn("Close other Points Tracker tabs so the local database can be upgraded.");
      });

      request.addEventListener("error", () => {
        databasePromise = undefined;
        reject(request.error);
      }, { once: true });
    });
  }

  return databasePromise;
}

export async function runTransaction(storeNames, mode, callback) {
  const database = await openDatabase();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const transaction = database.transaction(names, mode);
  const completion = transactionCompletion(transaction);
  const stores = Object.fromEntries(names.map((name) => [name, transaction.objectStore(name)]));

  let result;
  try {
    result = await callback(stores, transaction);
  } catch (error) {
    transaction.abort();
    await completion.catch(() => {});
    throw error;
  }

  await completion;
  return result;
}

export async function get(storeName, key) {
  return runTransaction(storeName, "readonly", ({ [storeName]: store }) => requestResult(store.get(key)));
}

export async function getAll(storeName) {
  return runTransaction(storeName, "readonly", ({ [storeName]: store }) => requestResult(store.getAll()));
}

export async function add(storeName, object) {
  return runTransaction(storeName, "readwrite", ({ [storeName]: store }) => requestResult(store.add(object)));
}

export async function put(storeName, object) {
  return runTransaction(storeName, "readwrite", ({ [storeName]: store }) => requestResult(store.put(object)));
}

export async function remove(storeName, key) {
  return runTransaction(storeName, "readwrite", ({ [storeName]: store }) => requestResult(store.delete(key)));
}

export async function queryIndex(storeName, indexName, value) {
  return runTransaction(storeName, "readonly", ({ [storeName]: store }) => requestResult(store.index(indexName).getAll(value)));
}

export async function resetDatabase() {
  requireIndexedDB();
  const existingDatabase = await databasePromise?.catch(() => undefined);
  existingDatabase?.close();
  databasePromise = undefined;

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(DATABASE_NAME);
    request.addEventListener("success", () => resolve(), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
    request.addEventListener("blocked", () => reject(new Error("Close other application tabs before resetting the database.")), { once: true });
  });
}

export const db = Object.freeze({
  open: openDatabase,
  get,
  getAll,
  add,
  put,
  delete: remove,
  queryIndex,
  transaction: runTransaction,
  reset: resetDatabase
});
